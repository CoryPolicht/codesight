/**
 * C# structured parser for routes and EF Core models.
 *
 * Two-tier strategy:
 *   1. Roslyn subprocess (dotnet-script / csi) — true AST, marks confidence "ast"
 *   2. Brace-tracking regex — like extract-go.ts, marks confidence "regex"
 *
 * Supports:
 *   - ASP.NET Core Minimal APIs: app.MapGet/Post/Put/Patch/Delete + MapGroup prefix chaining
 *   - Web API Controllers: [ApiController] / ControllerBase with [HttpGet/Post/…] + [Route] prefix
 *   - EF Core DbContext/DbSet → entity class properties + data annotations
 */

import { spawn } from "node:child_process";
import { join, relative } from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { readFileSafe } from "../scanner.js";
import type { RouteInfo, SchemaModel, SchemaField, Framework } from "../types.js";

// ─── Roslyn subprocess ────────────────────────────────────────────────────────

/**
 * Inline C# script that uses Roslyn (Microsoft.CodeAnalysis.CSharp) to parse
 * C# files and emit route/schema JSON. Only executed when dotnet-script or csi
 * is available. Falls back to regex transparently.
 */
const ROSLYN_ROUTE_SCRIPT = `
#r "nuget: Microsoft.CodeAnalysis.CSharp, 4.8.0"
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.Text.Json;

var files = JsonSerializer.Deserialize<string[]>(Console.In.ReadToEnd())!;
var routes = new List<object>();

foreach (var filePath in files)
{
    var source = File.ReadAllText(filePath);
    var tree = CSharpSyntaxTree.ParseText(source);
    var root = tree.GetRoot();

    // Minimal API: app.MapGet/Post/Put/Patch/Delete/MapGroup
    foreach (var invocation in root.DescendantNodes().OfType<InvocationExpressionSyntax>())
    {
        if (invocation.Expression is MemberAccessExpressionSyntax ma)
        {
            var method = ma.Name.Identifier.Text;
            if (method is "MapGet" or "MapPost" or "MapPut" or "MapPatch" or "MapDelete")
            {
                var args = invocation.ArgumentList.Arguments;
                if (args.Count >= 1 && args[0].Expression is LiteralExpressionSyntax lit)
                {
                    routes.Add(new {
                        method = method.Substring(3).ToUpperInvariant(),
                        path = lit.Token.ValueText,
                        file = filePath,
                        framework = "aspnet-minimal"
                    });
                }
            }
        }
    }

    // Controller methods
    foreach (var cls in root.DescendantNodes().OfType<ClassDeclarationSyntax>())
    {
        var isController = cls.AttributeLists
            .SelectMany(al => al.Attributes)
            .Any(a => a.Name.ToString().Contains("ApiController") || a.Name.ToString().Contains("Controller"));
        var inheritsController = cls.BaseList?.Types
            .Any(t => t.ToString().Contains("ControllerBase") || t.ToString().Contains("Controller")) ?? false;
        if (!isController && !inheritsController) continue;

        // Class-level [Route("api/[controller]")]
        var classRoute = cls.AttributeLists
            .SelectMany(al => al.Attributes)
            .FirstOrDefault(a => a.Name.ToString() == "Route");
        var classPrefix = classRoute?.ArgumentList?.Arguments.FirstOrDefault()?.ToString().Trim('"', '\'') ?? "";
        classPrefix = classPrefix.Replace("[controller]", cls.Identifier.Text.Replace("Controller", "").ToLowerInvariant());

        foreach (var method in cls.Members.OfType<MethodDeclarationSyntax>())
        {
            foreach (var attr in method.AttributeLists.SelectMany(al => al.Attributes))
            {
                var attrName = attr.Name.ToString();
                string? httpMethod = attrName switch
                {
                    "HttpGet" => "GET",
                    "HttpPost" => "POST",
                    "HttpPut" => "PUT",
                    "HttpPatch" => "PATCH",
                    "HttpDelete" => "DELETE",
                    _ => null
                };
                if (httpMethod == null) continue;

                var subPath = attr.ArgumentList?.Arguments.FirstOrDefault()?.ToString().Trim('"', '\'') ?? "";
                var fullPath = classPrefix.Length > 0
                    ? "/" + classPrefix.TrimStart('/') + (subPath.Length > 0 ? "/" + subPath.TrimStart('/') : "")
                    : "/" + subPath.TrimStart('/');
                routes.Add(new {
                    method = httpMethod,
                    path = fullPath,
                    file = filePath,
                    framework = "aspnet-webapi"
                });
            }
        }
    }
}

Console.WriteLine(JsonSerializer.Serialize(routes));
`;

const ROSLYN_SCHEMA_SCRIPT = `
#r "nuget: Microsoft.CodeAnalysis.CSharp, 4.8.0"
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.Text.Json;

var files = JsonSerializer.Deserialize<string[]>(Console.In.ReadToEnd())!;
var models = new List<object>();

// Collect all class names for navigation property detection
var allClassNames = new HashSet<string>();
foreach (var filePath in files)
{
    var src = File.ReadAllText(filePath);
    var tree = CSharpSyntaxTree.ParseText(src);
    foreach (var cls in tree.GetRoot().DescendantNodes().OfType<ClassDeclarationSyntax>())
        allClassNames.Add(cls.Identifier.Text);
}

foreach (var filePath in files)
{
    var source = File.ReadAllText(filePath);
    var tree = CSharpSyntaxTree.ParseText(source);

    foreach (var cls in tree.GetRoot().DescendantNodes().OfType<ClassDeclarationSyntax>())
    {
        var props = cls.Members.OfType<PropertyDeclarationSyntax>()
            .Where(p => p.Modifiers.Any(m => m.Text == "public"))
            .ToList();
        if (props.Count == 0) continue;

        var fields = new List<object>();
        var relations = new List<string>();

        foreach (var prop in props)
        {
            var propName = prop.Identifier.Text;
            var typeName = prop.Type.ToString();
            var attrs = prop.AttributeLists.SelectMany(al => al.Attributes).Select(a => a.Name.ToString()).ToList();

            // Navigation properties
            var isCollection = typeName.StartsWith("ICollection") || typeName.StartsWith("List") || typeName.StartsWith("IEnumerable");
            var innerType = isCollection
                ? (typeName.Contains("<") ? typeName.Split('<')[1].TrimEnd('>') : typeName)
                : typeName.TrimEnd('?');
            if (allClassNames.Contains(innerType) && innerType != cls.Identifier.Text)
            {
                relations.Add(propName + ": " + typeName);
                continue;
            }

            var flags = new List<string>();
            if (attrs.Contains("Key")) flags.Add("pk");
            if (attrs.Contains("Required")) flags.Add("required");
            if (attrs.Any(a => a.StartsWith("ForeignKey"))) flags.Add("fk");
            if (attrs.Any(a => a.StartsWith("MaxLength") || a.StartsWith("StringLength"))) {}
            if (propName.EndsWith("Id") || propName.EndsWith("_id")) { if (!flags.Contains("fk")) flags.Add("fk"); }

            fields.Add(new { name = propName, type = typeName.TrimEnd('?'), flags });
        }

        if (fields.Count > 0)
        {
            // Determine table name from [Table] attribute
            var tableAttr = cls.AttributeLists.SelectMany(al => al.Attributes)
                .FirstOrDefault(a => a.Name.ToString() == "Table");
            var tableName = tableAttr?.ArgumentList?.Arguments.FirstOrDefault()?.ToString().Trim('"', '\'') ?? cls.Identifier.Text;

            models.Add(new { name = tableName, fields, relations, orm = "efcore" });
        }
    }
}

Console.WriteLine(JsonSerializer.Serialize(models));
`;

let roslynAvailable: boolean | null = null;
const ROSLYN_CMDS = ["dotnet-script", "csi"];

async function tryRoslynCommand(cmd: string, scriptPath: string, input: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, [scriptPath], {
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0 || !stdout.trim()) resolve(null);
      else resolve(stdout.trim());
    });
    proc.on("error", () => resolve(null));
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

async function runRoslyn(script: string, input: string): Promise<string | null> {
  if (roslynAvailable === false) return null;

  const tmpFile = join(tmpdir(), `codesight-${Date.now()}.csx`);
  try {
    await writeFile(tmpFile, script, "utf-8");
    for (const cmd of ROSLYN_CMDS) {
      const result = await tryRoslynCommand(cmd, tmpFile, input);
      if (result !== null) {
        roslynAvailable = true;
        return result;
      }
    }
    roslynAvailable = false;
    return null;
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

// ─── Route Extraction ─────────────────────────────────────────────────────────

export interface CSharpRouteGroup {
  varName: string;
  prefix: string;
}

/**
 * Extract all MapGroup("/prefix") chains from content.
 * Supports: var group = app.MapGroup("/api"); var v1 = group.MapGroup("/v1");
 */
function extractMapGroups(content: string): CSharpRouteGroup[] {
  const groups: CSharpRouteGroup[] = [];
  // var name = <expr>.MapGroup("prefix")
  const groupPattern = /\bvar\s+(\w+)\s*=\s*(\w+)\.MapGroup\s*\(\s*["']([^"']+)["']\s*\)/g;
  let match;
  while ((match = groupPattern.exec(content)) !== null) {
    const varName = match[1];
    const parentVar = match[2];
    const prefix = match[3];
    // Resolve parent prefix
    const parent = groups.find((g) => g.varName === parentVar);
    const resolvedPrefix = parent ? normalizePath(parent.prefix + "/" + prefix) : prefix;
    groups.push({ varName, prefix: resolvedPrefix });
  }
  return groups;
}

function normalizePath(path: string): string {
  return ("/" + path.replace(/\/+/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")).replace(/\/+/g, "/") || "/";
}

/**
 * Extract Minimal API routes from a .cs file using regex/brace-tracking.
 * Handles: app.MapGet, mapGroup.MapPost, etc.
 * Also resolves MapGroup prefix chaining.
 */
function extractMinimalApiRoutes(filePath: string, content: string, tags: string[]): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const groups = extractMapGroups(content);

  // Match: <varName>.Map(Get|Post|Put|Patch|Delete)("path", ...)
  const mapPattern = /(\w+)\s*\.\s*Map(Get|Post|Put|Patch|Delete)\s*\(\s*["']([^"']+)["']/g;
  let match;
  while ((match = mapPattern.exec(content)) !== null) {
    const receiverVar = match[1];
    const httpMethod = match[2].toUpperCase();
    const rawPath = match[3];

    // Resolve prefix from groups
    const group = groups.find((g) => g.varName === receiverVar);
    const path = group ? normalizePath(group.prefix + "/" + rawPath) : normalizePath(rawPath);

    routes.push({
      method: httpMethod,
      path,
      file: filePath,
      tags,
      framework: "aspnet-minimal",
      confidence: "regex",
    });
  }

  // Deduplicate
  const seen = new Set<string>();
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract the body of a class using brace tracking.
 * Returns the content between the first `{` after `classStart` and its matching `}`.
 */
function extractClassBody(content: string, classStart: number): string {
  let depth = 0;
  let start = -1;
  for (let i = classStart; i < content.length; i++) {
    if (content[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (content[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        return content.slice(start + 1, i);
      }
    }
  }
  return "";
}

/**
 * Resolve the [controller] token in route templates.
 * E.g. "UsersController" → "users"
 */
function resolveControllerToken(template: string, className: string): string {
  const controllerName = className.replace(/Controller$/i, "").toLowerCase();
  return template.replace(/\[controller\]/gi, controllerName);
}

/**
 * Extract Web API Controller routes from a .cs file using brace-tracking regex.
 */
function extractControllerRoutes(filePath: string, content: string, tags: string[]): RouteInfo[] {
  const routes: RouteInfo[] = [];

  // Find class declarations that are controllers
  // Match: [ApiController] / [Controller] OR : ControllerBase / : Controller
  const classPattern =
    /(?:\[(?:ApiController|Controller)\][^{]*?)?class\s+(\w+)\s*(?::\s*[^\n{]+)?(?=\s*\{)/g;

  let classMatch;
  while ((classMatch = classPattern.exec(content)) !== null) {
    const className = classMatch[1];
    const classBodyStart = classMatch.index + classMatch[0].length;
    const classBody = extractClassBody(content, classBodyStart);

    // Only process controllers (class name ends in Controller OR has [ApiController]/[Controller] attribute)
    const contextBefore = content.slice(Math.max(0, classMatch.index - 200), classMatch.index);
    const isControllerByAttr =
      contextBefore.includes("[ApiController]") || contextBefore.includes("[Controller]");
    const isControllerByName = className.endsWith("Controller");
    const isControllerByBase =
      classMatch[0].includes("ControllerBase") || classMatch[0].includes(": Controller");

    if (!isControllerByAttr && !isControllerByName && !isControllerByBase) continue;

    // Class-level [Route("api/[controller]")]
    const routeAttrMatch = contextBefore.match(/\[Route\s*\(\s*["']([^"']+)["']\s*\)\]/);
    const rawClassPrefix = routeAttrMatch
      ? resolveControllerToken(routeAttrMatch[1], className)
      : "";
    const classPrefix = rawClassPrefix ? normalizePath(rawClassPrefix) : "";

    // Method-level HTTP verb attributes
    const httpAttrPattern =
      /\[Http(Get|Post|Put|Patch|Delete)\s*(?:\(\s*["']([^"']*?)["']\s*\))?\]/gi;
    let attrMatch;
    while ((attrMatch = httpAttrPattern.exec(classBody)) !== null) {
      const httpMethod = attrMatch[1].toUpperCase();
      const subPath = attrMatch[2] || "";
      const path = classPrefix
        ? subPath
          ? normalizePath(classPrefix + "/" + subPath)
          : classPrefix
        : normalizePath(subPath || "/");

      routes.push({
        method: httpMethod,
        path,
        file: filePath,
        tags,
        framework: "aspnet-webapi",
        confidence: "regex",
      });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract C# routes from a list of .cs files.
 * Tries Roslyn subprocess first, falls back to structured regex.
 */
export async function extractCSharpRoutes(
  files: string[],
  projectRoot: string,
  _framework: Framework,
  tags: string[]
): Promise<RouteInfo[]> {
  const csFiles = files.filter(
    (f) =>
      f.endsWith(".cs") &&
      !f.includes(`\\Migrations\\`) &&
      !f.includes("/Migrations/") &&
      !f.endsWith(".Designer.cs") &&
      !f.endsWith(".g.cs")
  );
  if (csFiles.length === 0) return [];

  // --- Roslyn path ---
  const roslynInput = JSON.stringify(csFiles);
  const roslynOutput = await runRoslyn(ROSLYN_ROUTE_SCRIPT, roslynInput);
  if (roslynOutput) {
    try {
      const raw: Array<{ method: string; path: string; file: string; framework: string }> =
        JSON.parse(roslynOutput);
      return raw.map((r) => ({
        method: r.method,
        path: r.path,
        file: relative(projectRoot, r.file).replace(/\\/g, "/"),
        tags,
        framework: r.framework as Framework,
        confidence: "ast" as const,
      }));
    } catch {}
  }

  // --- Regex fallback ---
  const routes: RouteInfo[] = [];
  for (const file of csFiles) {
    const content = await readFileSafe(file);
    if (!content) continue;
    const rel = relative(projectRoot, file).replace(/\\/g, "/");
    const fileTags = tags; // tags already computed per-file by the caller

    // Minimal API patterns
    if (
      content.includes("MapGet") ||
      content.includes("MapPost") ||
      content.includes("MapPut") ||
      content.includes("MapPatch") ||
      content.includes("MapDelete")
    ) {
      routes.push(...extractMinimalApiRoutes(rel, content, fileTags));
    }

    // Controller patterns
    if (
      content.includes("[HttpGet") ||
      content.includes("[HttpPost") ||
      content.includes("[HttpPut") ||
      content.includes("[HttpPatch") ||
      content.includes("[HttpDelete") ||
      (content.includes("Controller") && content.includes("[Route"))
    ) {
      routes.push(...extractControllerRoutes(rel, content, fileTags));
    }
  }

  // Deduplicate across files
  const seen = new Set<string>();
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}:${r.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Schema Extraction ────────────────────────────────────────────────────────

const AUDIT_FIELDS = new Set([
  "CreatedAt", "UpdatedAt", "DeletedAt",
  "created_at", "updated_at", "deleted_at",
  "CreatedDate", "UpdatedDate", "DeletedDate",
]);

/**
 * Extract the attributes (content inside []) before a C# member.
 * Searches backward from `pos` to collect attribute lines.
 */
function getAttributesBefore(content: string, pos: number): string[] {
  const before = content.slice(Math.max(0, pos - 400), pos);
  const attrs: string[] = [];
  const attrPattern = /\[([^\]]+)\]/g;
  let m;
  while ((m = attrPattern.exec(before)) !== null) {
    attrs.push(m[1]);
  }
  return attrs;
}

/**
 * Extract EF Core models from .cs files using regex/brace-tracking.
 * Finds DbContext → DbSet<T> → entity class properties.
 */
export async function extractEFCoreModels(
  files: string[],
  projectRoot: string
): Promise<SchemaModel[]> {
  const csFiles = files.filter(
    (f) =>
      f.endsWith(".cs") &&
      !f.includes(`\\Migrations\\`) &&
      !f.includes("/Migrations/") &&
      !f.endsWith(".Designer.cs") &&
      !f.endsWith(".g.cs")
  );
  if (csFiles.length === 0) return [];

  // --- Roslyn path ---
  const roslynInput = JSON.stringify(csFiles);
  const roslynOutput = await runRoslyn(ROSLYN_SCHEMA_SCRIPT, roslynInput);
  if (roslynOutput) {
    try {
      const raw: Array<{
        name: string;
        fields: Array<{ name: string; type: string; flags: string[] }>;
        relations: string[];
      }> = JSON.parse(roslynOutput);
      return raw.map((m) => ({
        name: m.name,
        fields: m.fields,
        relations: m.relations,
        orm: "efcore" as const,
        confidence: "ast" as const,
      }));
    } catch {}
  }

  // --- Regex fallback ---
  // Step 1: Find DbContext subclass and collect DbSet<T> model names
  const modelNames = new Set<string>();
  const dbsetPattern = /DbSet\s*<\s*(\w+)\s*>/g;

  for (const file of csFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("DbContext") && !content.includes("DbSet")) continue;
    let m;
    while ((m = dbsetPattern.exec(content)) !== null) {
      modelNames.add(m[1]);
    }
  }

  // Step 2: Build name→content map for all entity files
  const entityContent = new Map<string, string>();
  for (const file of csFiles) {
    const content = await readFileSafe(file);
    if (!content) continue;
    // Quick check: is there a public class that matches a model name?
    const classNameMatch = content.match(/public\s+(?:partial\s+)?class\s+(\w+)/g);
    if (!classNameMatch) continue;
    for (const decl of classNameMatch) {
      const nameMatch = decl.match(/class\s+(\w+)/);
      if (nameMatch && modelNames.has(nameMatch[1])) {
        entityContent.set(nameMatch[1], content);
      }
    }
  }

  // If no DbSet found (no explicit DbContext), try heuristic: all non-controller/non-context
  // public classes that have public properties with [Key] or Id property
  if (modelNames.size === 0) {
    for (const file of csFiles) {
      const content = await readFileSafe(file);
      if (!content) continue;
      const classPattern2 = /public\s+(?:partial\s+)?class\s+(\w+)(?![^{]*Controller)(?![^{]*Context)/g;
      let m2;
      while ((m2 = classPattern2.exec(content)) !== null) {
        const cn = m2[1];
        if (cn.endsWith("Controller") || cn.endsWith("Context") || cn.endsWith("Middleware")) continue;
        // Has at least one public property
        const bodyStart = content.indexOf("{", m2.index);
        if (bodyStart === -1) continue;
        const body = extractClassBody(content, bodyStart);
        if (!body.includes("public") || !body.includes("{ get;")) continue;
        // Has an Id or [Key] property — likely an entity
        if (body.includes("public int Id") || body.includes("public Guid Id") || body.includes("[Key]")) {
          modelNames.add(cn);
          entityContent.set(cn, content);
        }
      }
    }
  }

  // Step 3: Parse each entity class
  const models: SchemaModel[] = [];
  // Collect all class names for navigation property detection
  const allClassNames = new Set<string>(modelNames);
  for (const file of csFiles) {
    const content = await readFileSafe(file);
    if (!content) continue;
    const classNameMatch = content.matchAll(/public\s+(?:partial\s+)?class\s+(\w+)/g);
    for (const m of classNameMatch) allClassNames.add(m[1]);
  }

  for (const [modelName, content] of entityContent) {
    const classPattern3 = new RegExp(
      `public\\s+(?:partial\\s+)?class\\s+${modelName}\\b[^{]*\\{`
    );
    const classStart = content.search(classPattern3);
    if (classStart === -1) continue;

    const braceStart = content.indexOf("{", classStart);
    const body = extractClassBody(content, braceStart);

    const fields: SchemaField[] = [];
    const relations: string[] = [];

    // Match public properties: public <type> <Name> { get; ... }
    const propPattern =
      /public\s+([\w<>[\]?,\s]+?)\s+(\w+)\s*\{\s*get\s*[;{]/g;
    let propMatch;

    while ((propMatch = propPattern.exec(body)) !== null) {
      const rawType = propMatch[1].trim();
      const propName = propMatch[2];

      if (AUDIT_FIELDS.has(propName)) continue;
      // Skip override/virtual/static members (they won't appear here but defensive)
      if (propName === "get" || propName === "set") continue;

      // Detect navigation properties: ICollection<T>, List<T>, or a class name
      const isCollection = /^(?:ICollection|List|IEnumerable|HashSet)</.test(rawType);
      const innerType = isCollection
        ? (rawType.match(/<([^>]+)>/) || [])[1] || rawType
        : rawType.replace("?", "");

      if (allClassNames.has(innerType) && innerType !== modelName) {
        relations.push(`${propName}: ${rawType}`);
        continue;
      }

      // Get attributes from the 400 chars before this property in body
      const propPos = propMatch.index;
      const attrBefore = body.slice(Math.max(0, propPos - 200), propPos);
      const attrMatches = [...attrBefore.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);

      const flags: string[] = [];
      if (
        attrMatches.some((a) => a === "Key") ||
        propName === "Id" ||
        propName === `${modelName}Id`
      ) {
        flags.push("pk");
      }
      if (attrMatches.some((a) => a === "Required")) flags.push("required");
      if (attrMatches.some((a) => a.startsWith("ForeignKey"))) flags.push("fk");
      if ((propName.endsWith("Id") || propName.endsWith("_id")) && propName !== "Id") {
        if (!flags.includes("fk")) flags.push("fk");
      }

      // Normalize type
      const normalizedType = rawType.replace("?", "");
      fields.push({ name: propName, type: normalizedType, flags });
    }

    if (fields.length > 0 || relations.length > 0) {
      models.push({ name: modelName, fields, relations, orm: "efcore", confidence: "regex" });
    }
  }

  return models;
}
