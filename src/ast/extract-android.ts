/**
 * Android / Kotlin extraction.
 * Regex-based — no Kotlin compiler needed.
 *
 * Supports:
 * - Retrofit: @GET/@POST/@PUT/@DELETE on interface methods -> RouteInfo[]
 * - Room: @Entity classes with @PrimaryKey, @ColumnInfo -> SchemaModel[]
 * - Jetpack Compose: @Composable fun Name(params) -> ComponentInfo[]
 * - Navigation: res/navigation/*.xml destinations -> RouteInfo[]
 * - AndroidManifest: activity declarations -> RouteInfo[]
 */

import type { RouteInfo, SchemaModel, SchemaField, ComponentInfo } from "../types.js";

// ─── Retrofit Route Extraction ───

function extractRetrofitParams(path: string): string[] {
  const params: string[] = [];
  const regex = /\{(\w+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(path)) !== null) params.push(m[1]);
  return params;
}

export function extractRetrofitRoutes(
  filePath: string,
  content: string,
  tags: string[]
): RouteInfo[] {
  if (
    !content.includes("@GET") &&
    !content.includes("@POST") &&
    !content.includes("@PUT") &&
    !content.includes("@DELETE") &&
    !content.includes("@PATCH") &&
    !content.includes("@HTTP")
  )
    return [];

  const routes: RouteInfo[] = [];

  // @GET("path"), @POST("path"), etc.
  const retrofitPat =
    /@(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(\s*"([^"]*)"\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = retrofitPat.exec(content)) !== null) {
    routes.push({
      method: m[1],
      path: m[2].startsWith("/") ? m[2] : "/" + m[2],
      file: filePath,
      tags,
      framework: "android",
      params: extractRetrofitParams(m[2]),
      confidence: "regex",
    });
  }

  // @HTTP(method = "PATCH", path = "users/{id}")
  const httpPat =
    /@HTTP\s*\([^)]*method\s*=\s*"(\w+)"[^)]*path\s*=\s*"([^"]+)"/g;
  while ((m = httpPat.exec(content)) !== null) {
    routes.push({
      method: m[1].toUpperCase(),
      path: m[2].startsWith("/") ? m[2] : "/" + m[2],
      file: filePath,
      tags,
      framework: "android",
      params: extractRetrofitParams(m[2]),
      confidence: "regex",
    });
  }

  return routes;
}

// ─── Room Entity Extraction ───

export function extractRoomEntities(
  _filePath: string,
  content: string
): SchemaModel[] {
  if (!content.includes("@Entity")) return [];

  const models: SchemaModel[] = [];

  // Match @Entity annotation + class declaration + constructor params
  // Use a two-step approach: find @Entity, then extract the class
  const entityStartPat =
    /@Entity\s*(?:\([^)]*\))?\s*(?:data\s+)?class\s+(\w+)\s*\(/g;
  let m: RegExpExecArray | null;

  while ((m = entityStartPat.exec(content)) !== null) {
    const name = m[1];
    const paramsStart = m.index + m[0].length;

    // Extract constructor body by tracking parentheses
    const paramsBody = extractParenBlock(content, paramsStart);
    if (!paramsBody) continue;

    // Extract tableName if specified
    const entityAnnotation = content.slice(
      content.lastIndexOf("@Entity", m.index),
      m.index + m[0].length
    );
    const tableMatch = entityAnnotation.match(/tableName\s*=\s*"([^"]+)"/);

    const fields: SchemaField[] = [];
    const relations: string[] = [];

    // Parse each line of the constructor
    for (const line of paramsBody.split(",")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Extract field: val/var name: Type
      const fieldMatch = trimmed.match(
        /(?:val|var)\s+(\w+)\s*:\s*([\w<>?.]+)/
      );
      if (!fieldMatch) continue;

      const fieldName = fieldMatch[1];
      const fieldType = fieldMatch[2];
      const flags: string[] = [];

      if (/@PrimaryKey/.test(trimmed)) {
        flags.push("pk");
        if (/autoGenerate\s*=\s*true/.test(trimmed)) flags.push("auto");
      }
      if (fieldType.endsWith("?")) flags.push("nullable");
      if (/=\s*\S/.test(trimmed) && !/@PrimaryKey/.test(trimmed))
        flags.push("default");
      if (/@Ignore/.test(trimmed)) continue;

      // Check for relations
      if (/@Relation/.test(trimmed) || /@Embedded/.test(trimmed)) {
        relations.push(`${fieldName}: ${fieldType.replace("?", "")}`);
        continue;
      }

      fields.push({
        name: fieldName,
        type: fieldType.replace("?", ""),
        flags,
      });
    }

    if (fields.length > 0) {
      models.push({
        name: tableMatch ? `${name} (${tableMatch[1]})` : name,
        fields,
        relations,
        orm: "room",
        confidence: "regex",
      });
    }
  }

  return models;
}

function extractParenBlock(
  content: string,
  startAfterOpenParen: number
): string | null {
  let depth = 1;
  let i = startAfterOpenParen;

  while (i < content.length && depth > 0) {
    if (content[i] === "(") depth++;
    else if (content[i] === ")") depth--;
    i++;
  }

  if (depth !== 0) return null;
  return content.slice(startAfterOpenParen, i - 1);
}

// ─── Jetpack Compose Component Extraction ───

export function extractComposeComponents(
  filePath: string,
  content: string
): ComponentInfo[] {
  if (!content.includes("@Composable")) return [];

  const components: ComponentInfo[] = [];
  const seen = new Set<string>();

  // Match @Composable fun ComponentName(params)
  const composablePat =
    /@Composable\s+(?:(?:private|internal|public)\s+)?fun\s+([A-Z]\w*)\s*\(([^)]*)\)/gs;
  let m: RegExpExecArray | null;

  while ((m = composablePat.exec(content)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);

    const paramsStr = m[2];
    const props: string[] = [];

    // Parse params, skip Modifier
    const paramPat = /(\w+)\s*:\s*([\w<>().,?\s*]+?)(?:\s*=\s*[^,)]+)?(?:,|$)/g;
    let pm: RegExpExecArray | null;
    while ((pm = paramPat.exec(paramsStr)) !== null) {
      const paramName = pm[1].trim();
      const paramType = pm[2].trim();
      if (paramName === "modifier" || paramType === "Modifier") continue;
      if (paramName) props.push(paramName);
    }

    components.push({
      name,
      file: filePath,
      props,
      isClient: true,
      isServer: false,
      confidence: "regex",
    });
  }

  return components;
}

// ─── Navigation XML Route Extraction ───

export function extractNavigationRoutes(
  filePath: string,
  content: string
): RouteInfo[] {
  const routes: RouteInfo[] = [];

  // Match <fragment or <activity with android:name
  const destPat =
    /<(fragment|activity)\s+[^>]*android:name\s*=\s*"([^"]+)"[^>]*/g;
  let m: RegExpExecArray | null;

  while ((m = destPat.exec(content)) !== null) {
    const type = m[1];
    const fullName = m[2];
    const segment = m[0];

    // Extract label if present
    const labelMatch = segment.match(/android:label\s*=\s*"([^"]+)"/);
    const label = labelMatch ? labelMatch[1] : null;

    // Use short class name for path
    const shortName = fullName.split(".").pop() || fullName;
    const path = "/" + shortName;

    routes.push({
      method: type === "activity" ? "ACTIVITY" : "SCREEN",
      path,
      file: filePath,
      tags: label ? [label] : [],
      framework: "android",
      confidence: "regex",
    });
  }

  return routes;
}

// ─── AndroidManifest Activity Extraction ───

export function extractActivitiesFromManifest(
  filePath: string,
  content: string
): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const seen = new Set<string>();

  // Match <activity android:name=".ClassName" or "com.pkg.ClassName"
  const activityPat =
    /<activity\s+[^>]*android:name\s*=\s*"([^"]+)"[^]*?(?:\/>|<\/activity>)/g;
  let m: RegExpExecArray | null;

  while ((m = activityPat.exec(content)) !== null) {
    const fullName = m[1];
    const segment = m[0];

    const shortName = fullName.startsWith(".")
      ? fullName.slice(1)
      : fullName.split(".").pop() || fullName;

    if (seen.has(shortName)) continue;
    seen.add(shortName);

    const isLauncher = segment.includes(
      "android.intent.category.LAUNCHER"
    );

    const tags: string[] = [];
    if (isLauncher) tags.push("launcher");

    routes.push({
      method: "ACTIVITY",
      path: "/" + shortName,
      file: filePath,
      tags,
      framework: "android",
      confidence: "regex",
    });
  }

  return routes;
}
