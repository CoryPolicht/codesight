/**
 * Go structured parser for routes and models.
 * Uses brace-tracking + regex for near-AST accuracy on Go's regular syntax.
 *
 * Go's syntax is regular enough that structured parsing (tracking braces,
 * extracting struct bodies, parsing field tags) achieves AST-level accuracy
 * without needing the Go compiler.
 *
 * Extracts:
 * - Gin/Fiber/Echo/Chi/net-http routes with group prefixes
 * - GORM model structs with field types, tags (primaryKey, unique, etc.)
 */

import type { RouteInfo, SchemaModel, SchemaField, Framework } from "../types.js";

// ─── Route Extraction ───

interface GoRouteGroup {
  prefix: string;
  body: string;
  varName?: string;
}

/**
 * Extract routes from a Go file with group/prefix tracking.
 * Works for Gin, Fiber, Echo, Chi, and net/http.
 */
export function extractGoRoutesStructured(
  filePath: string,
  content: string,
  framework: Framework,
  tags: string[]
): RouteInfo[] {
  const routes: RouteInfo[] = [];

  // Step 1: Find route groups with prefixes
  // Gin: r.Group("/api") / g := r.Group("/v1")
  // Echo: g := e.Group("/api")
  // Fiber: api := app.Group("/api")
  // Chi: r.Route("/api", func(r chi.Router) { ... })
  const groups = extractRouteGroups(content, framework);

  // Collect group variable names to exclude from top-level scan
  const groupVarNames = new Set<string>();

  // Step 2: Extract routes from each group with prefix resolution
  for (const group of groups) {
    // Track which variable this group belongs to
    if (group.varName) groupVarNames.add(group.varName);

    const groupRoutes = extractRoutesFromBlock(group.body, framework, filePath, tags);
    for (const route of groupRoutes) {
      route.path = normalizePath(group.prefix + "/" + route.path);
      routes.push(route);
    }
  }

  // Step 3: Extract top-level routes (only from lines NOT belonging to group vars)
  // Filter out lines that reference group variables to avoid duplicates
  if (groupVarNames.size > 0) {
    const lines = content.split("\n");
    const topLines = lines.filter((line) => {
      for (const v of groupVarNames) {
        if (line.includes(v + ".")) return false;
      }
      return true;
    });
    const topContent = topLines.join("\n");
    const topLevelRoutes = extractRoutesFromBlock(topContent, framework, filePath, tags);
    routes.push(...topLevelRoutes);
  } else {
    const topLevelRoutes = extractRoutesFromBlock(content, framework, filePath, tags);
    routes.push(...topLevelRoutes);
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

function extractRouteGroups(content: string, framework: Framework): GoRouteGroup[] {
  const groups: GoRouteGroup[] = [];

  if (framework === "chi") {
    // Chi: r.Route("/prefix", func(r chi.Router) { ... })
    const chiRoutePattern = /\.Route\s*\(\s*"([^"]+)"\s*,\s*func\s*\([^)]*\)\s*\{/g;
    let match;
    while ((match = chiRoutePattern.exec(content)) !== null) {
      const prefix = match[1];
      const bodyStart = match.index + match[0].length;
      const body = extractBraceBlock(content, bodyStart);
      if (body) groups.push({ prefix, body });
    }
  } else {
    // Gin/Echo/Fiber: varName := receiver.Group("/prefix")
    // Build a prefix map to resolve chained groups: api := r.Group("/api"), users := api.Group("/users")
    const prefixMap = new Map<string, string>(); // varName -> resolved full prefix
    const groupPattern = /(\w+)\s*:?=\s*(\w+)\.Group\s*\(\s*"([^"]*)"/g;
    let match;

    // First pass: build prefix chain
    while ((match = groupPattern.exec(content)) !== null) {
      const varName = match[1];
      const receiver = match[2];
      const prefix = match[3];

      // Resolve receiver prefix (if receiver is itself a group)
      const receiverPrefix = prefixMap.get(receiver) || "";
      const fullPrefix = normalizePath(receiverPrefix + "/" + prefix);
      prefixMap.set(varName, fullPrefix);
    }

    // Second pass: extract routes for each group variable
    for (const [varName, fullPrefix] of prefixMap) {
      const varRoutes: string[] = [];
      // Match routes — allow empty path strings with ([^"]*)
      const varPattern = new RegExp(
        `${escapeRegex(varName)}\\.\\s*(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Get|Post|Put|Patch|Delete|Options|Head)\\s*\\(\\s*"([^"]*)"`,
        "g"
      );
      let routeMatch;
      while ((routeMatch = varPattern.exec(content)) !== null) {
        varRoutes.push(`${routeMatch[1]}:${routeMatch[2]}`);
      }

      // Also handle HandleFunc for mixed patterns
      const handlePattern = new RegExp(
        `${escapeRegex(varName)}\\.\\s*HandleFunc\\s*\\(\\s*"([^"]*)"`,
        "g"
      );
      while ((routeMatch = handlePattern.exec(content)) !== null) {
        varRoutes.push(`ALL:${routeMatch[1]}`);
      }

      if (varRoutes.length > 0) {
        groups.push({
          prefix: fullPrefix,
          varName,
          body: varRoutes
            .map((r) => {
              const colonIdx = r.indexOf(":");
              const m = r.slice(0, colonIdx);
              const p = r.slice(colonIdx + 1);
              return `FAKE.${m}("${p}")`;
            })
            .join("\n"),
        });
      }
    }
  }

  return groups;
}

function extractRoutesFromBlock(
  block: string,
  framework: Framework,
  filePath: string,
  tags: string[]
): RouteInfo[] {
  const routes: RouteInfo[] = [];

  if (framework === "gin" || framework === "echo") {
    // .GET("/path", handler) — uppercase methods (allow empty path)
    const pattern = /\.(?:FAKE\.)?(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*\(\s*"([^"]*)"/g;
    let match;
    while ((match = pattern.exec(block)) !== null) {
      routes.push({
        method: match[1],
        path: match[2],
        file: filePath,
        tags,
        framework,
        params: extractPathParams(match[2]),
        confidence: "ast",
      });
    }
  } else if (framework === "fiber" || framework === "chi") {
    // .Get("/path", handler) — PascalCase methods (allow empty path)
    const pattern = /\.(?:FAKE\.)?(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*"([^"]*)"/g;
    let match;
    while ((match = pattern.exec(block)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: filePath,
        tags,
        framework,
        params: extractPathParams(match[2]),
        confidence: "ast",
      });
    }
  }

  // net/http: HandleFunc or Handle
  if (framework === "go-net-http" || framework === "chi") {
    const pattern = /\.(?:HandleFunc|Handle)\s*\(\s*"([^"]+)"/g;
    let match;
    while ((match = pattern.exec(block)) !== null) {
      // Go 1.22+: "GET /path" patterns
      const pathStr = match[1];
      let method = "ALL";
      let path = pathStr;

      const methodMatch = pathStr.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\/.*)/);
      if (methodMatch) {
        method = methodMatch[1];
        path = methodMatch[2];
      }

      routes.push({
        method,
        path,
        file: filePath,
        tags,
        framework,
        params: extractPathParams(path),
        confidence: "ast",
      });
    }
  }

  // Chi: r.Get, r.Post etc. (also catch Method pattern)
  if (framework === "chi") {
    const methodPattern = /\.Method\s*\(\s*"(\w+)"\s*,\s*"([^"]+)"/g;
    let match;
    while ((match = methodPattern.exec(block)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: filePath,
        tags,
        framework,
        params: extractPathParams(match[2]),
        confidence: "ast",
      });
    }
  }

  return routes;
}

// ─── GORM Model Extraction ───

/**
 * Extract GORM model structs from a Go file.
 * Parses struct bodies, field types, and gorm tags.
 */
export function extractGORMModelsStructured(
  _filePath: string,
  content: string
): SchemaModel[] {
  const models: SchemaModel[] = [];

  // Find structs that embed gorm.Model or have gorm tags
  const structPattern = /type\s+(\w+)\s+struct\s*\{/g;
  let match;

  while ((match = structPattern.exec(content)) !== null) {
    const name = match[1];
    const bodyStart = match.index + match[0].length;
    const body = extractBraceBlock(content, bodyStart);
    if (!body) continue;

    // Check if this is a GORM model — require gorm.Model embed or gorm: tag.
    // json: tags alone are too broad; every Go struct with JSON serialization would match.
    const isGormModel =
      body.includes("gorm.Model") ||
      body.includes("gorm.DeletedAt") ||
      body.includes("`gorm:");

    if (!isGormModel) continue;

    const fields: SchemaField[] = [];
    const relations: string[] = [];

    const lines = body.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed === "}" || trimmed === "{") continue;

      // Embedded model: gorm.Model
      if (trimmed === "gorm.Model") {
        fields.push({ name: "ID", type: "uint", flags: ["pk"] });
        fields.push({ name: "CreatedAt", type: "time.Time", flags: [] });
        fields.push({ name: "UpdatedAt", type: "time.Time", flags: [] });
        fields.push({ name: "DeletedAt", type: "gorm.DeletedAt", flags: ["nullable"] });
        continue;
      }

      // Parse field: Name Type `gorm:"..." json:"..."`
      const fieldMatch = trimmed.match(/^(\w+)\s+([\w.*\[\]]+)\s*(?:`(.+)`)?/);
      if (!fieldMatch) continue;

      const fieldName = fieldMatch[1];
      const fieldType = fieldMatch[2];
      const tagStr = fieldMatch[3] || "";

      // Skip embedded structs that aren't fields
      if (fieldType.startsWith("*") || fieldType.includes(".")) {
        // Check if it's a relation
        if (trimmed.includes("gorm:\"foreignKey") || trimmed.includes("gorm:\"many2many")) {
          relations.push(`${fieldName}: ${fieldType.replace("*", "").replace("[]", "")}`);
          continue;
        }
        // Check for belongs_to / has_many by type
        if (fieldType.startsWith("[]") || fieldType.startsWith("*")) {
          const relType = fieldType.replace("*", "").replace("[]", "");
          if (relType[0] === relType[0]?.toUpperCase() && !relType.includes(".")) {
            relations.push(`${fieldName}: ${relType}`);
            continue;
          }
        }
      }

      const flags: string[] = [];

      // Parse gorm tag
      const gormTag = tagStr.match(/gorm:"([^"]+)"/)?.[1] || "";
      if (gormTag) {
        if (gormTag.includes("primaryKey") || gormTag.includes("primarykey")) flags.push("pk");
        if (gormTag.includes("unique")) flags.push("unique");
        if (gormTag.includes("not null")) flags.push("required");
        if (gormTag.includes("default:")) flags.push("default");
        if (gormTag.includes("index")) flags.push("index");
        if (gormTag.includes("foreignKey") || gormTag.includes("foreignkey")) flags.push("fk");
      }

      fields.push({ name: fieldName, type: fieldType, flags });
    }

    if (fields.length > 0) {
      models.push({
        name,
        fields,
        relations,
        orm: "gorm",
        confidence: "ast",
      });
    }
  }

  return models;
}

// ─── Helpers ───

/**
 * Extract the content between matched braces starting at position.
 * Returns the content inside the braces (not including the opening brace).
 */
function extractBraceBlock(content: string, startAfterOpenBrace: number): string | null {
  let depth = 1;
  let i = startAfterOpenBrace;

  while (i < content.length && depth > 0) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") depth--;
    i++;
  }

  if (depth !== 0) return null;
  return content.slice(startAfterOpenBrace, i - 1);
}

function extractPathParams(path: string): string[] {
  const params: string[] = [];
  // Gin/Echo: :param, Chi: {param}, Go 1.22: {param}
  const regex = /[:{}](\w+)/g;
  let m;
  while ((m = regex.exec(path)) !== null) params.push(m[1]);
  return params;
}

function normalizePath(path: string): string {
  return path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
