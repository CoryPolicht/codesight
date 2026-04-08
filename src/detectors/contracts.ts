import { join } from "node:path";
import { readFileSafe } from "../scanner.js";
import type { RouteInfo, ProjectInfo } from "../types.js";

/**
 * Enhances route info with request/response type information
 * by scanning the route handler files for type annotations
 */
export async function enrichRouteContracts(
  routes: RouteInfo[],
  project: ProjectInfo
): Promise<RouteInfo[]> {
  // Group routes by file to avoid re-reading
  const fileCache = new Map<string, string>();

  for (const route of routes) {
    const absPath = join(project.root, route.file);
    let content = fileCache.get(route.file);
    if (!content) {
      content = await readFileSafe(absPath);
      fileCache.set(route.file, content);
    }

    // Extract URL params from path like :id, [id], {id}
    const params: string[] = [];
    const paramPatterns = [
      /:(\w+)/g,           // Express/Hono style :param
      /\[(\w+)\]/g,        // Next.js style [param]
      /\{(\w+)\}/g,        // FastAPI/Django style {param}
      /<(\w+)>/g,          // Flask style <param>
    ];
    for (const pattern of paramPatterns) {
      let match;
      while ((match = pattern.exec(route.path)) !== null) {
        params.push(match[1]);
      }
    }
    if (params.length > 0) route.params = params;

    // Try to extract response type based on framework
    switch (route.framework) {
      case "hono":
      case "express":
      case "fastify":
      case "koa":
      case "nestjs":
      case "elysia":
      case "adonis":
      case "raw-http":
        enrichTSRoute(route, content);
        break;
      case "next-app":
      case "sveltekit":
      case "remix":
      case "nuxt":
        enrichNextRoute(route, content);
        break;
      case "fastapi":
        enrichFastAPIRoute(route, content);
        break;
      case "flask":
        enrichFlaskRoute(route, content);
        break;
      case "aspnet-minimal":
      case "aspnet-webapi":
        enrichCSharpRoute(route, content);
        break;
    }
  }

  return routes;
}

function enrichTSRoute(route: RouteInfo, content: string) {
  // Look for c.json<Type>(...) or res.json({...}) patterns near the route method
  // Hono: return c.json<ResponseType>(data)
  const jsonTypeMatch = content.match(
    /c\.json\s*<\s*([^>]+)\s*>/
  );
  if (jsonTypeMatch) {
    route.responseType = jsonTypeMatch[1].trim();
    return;
  }

  // Look for zod validation schemas: .input(z.object({...})) or validate(schema)
  const zodInputMatch = content.match(
    /zValidator\s*\(\s*['"](?:json|form)['"],\s*(\w+)/
  );
  if (zodInputMatch) {
    route.requestType = zodInputMatch[1];
  }

  // Look for explicit return type annotations on handler
  const handlerReturnMatch = content.match(
    /:\s*Promise\s*<\s*Response\s*<\s*([^>]+)\s*>\s*>/
  );
  if (handlerReturnMatch) {
    route.responseType = handlerReturnMatch[1].trim();
  }
}

function enrichNextRoute(route: RouteInfo, content: string) {
  // NextResponse.json({ ... }) or Response.json({ ... })
  const responseMatch = content.match(
    /(?:NextResponse|Response)\.json\s*\(\s*\{([^}]{1,200})\}/
  );
  if (responseMatch) {
    // Extract key names from the response object
    const keys = responseMatch[1]
      .split(",")
      .map((s) => s.trim().split(/[:\s]/)[0])
      .filter(Boolean);
    if (keys.length > 0 && keys.length <= 8) {
      route.responseType = `{ ${keys.join(", ")} }`;
    }
  }
}

function enrichFastAPIRoute(route: RouteInfo, content: string) {
  // @app.get("/path", response_model=SchemaName)
  const responseModelMatch = content.match(
    new RegExp(`response_model\\s*=\\s*(\\w+)`)
  );
  if (responseModelMatch) {
    route.responseType = responseModelMatch[1];
  }

  // Find the handler function after the decorator and check for Pydantic param types
  // def handler(item: ItemCreate, db: Session = Depends(...))
  const funcPattern = new RegExp(
    `@\\w+\\.${route.method.toLowerCase()}\\s*\\([^)]*\\)\\s*\\n\\s*(?:async\\s+)?def\\s+\\w+\\s*\\(([^)]+)\\)`
  );
  const funcMatch = content.match(funcPattern);
  if (funcMatch) {
    const params = funcMatch[1];
    // Find non-dependency params with type hints (skip Depends, Query, etc.)
    const bodyParam = params.match(/(\w+)\s*:\s*(\w+)(?!\s*=\s*(?:Depends|Query|Path|Header))/);
    if (bodyParam && !["Session", "Request", "Response", "str", "int", "float", "bool"].includes(bodyParam[2])) {
      route.requestType = bodyParam[2];
    }
  }
}

function enrichFlaskRoute(route: RouteInfo, content: string) {
  // Look for jsonify({ ... }) or return {"key": ...}
  const jsonifyMatch = content.match(/jsonify\s*\(\s*\{([^}]{1,200})\}/);
  if (jsonifyMatch) {
    const keys = jsonifyMatch[1]
      .split(",")
      .map((s) => s.trim().split(/['":\s]/)[0].replace(/['"]/g, ""))
      .filter(Boolean);
    if (keys.length > 0 && keys.length <= 8) {
      route.responseType = `{ ${keys.join(", ")} }`;
    }
  }
}

function enrichCSharpRoute(route: RouteInfo, content: string) {
  // ActionResult<T> — return type annotation on method
  const actionResultMatch = content.match(/ActionResult\s*<\s*([^>]+)\s*>/);
  if (actionResultMatch) {
    route.responseType = actionResultMatch[1].trim();
    return;
  }

  // Results.Ok<T>(...) — Minimal API
  const resultsOkMatch = content.match(/Results\.Ok\s*<\s*([^>]+)\s*>/);
  if (resultsOkMatch) {
    route.responseType = resultsOkMatch[1].trim();
    return;
  }

  // TypedResults.Ok<T>(...) — .NET 7+ typed results
  const typedResultsMatch = content.match(/TypedResults\.Ok\s*<\s*([^>]+)\s*>/);
  if (typedResultsMatch) {
    route.responseType = typedResultsMatch[1].trim();
    return;
  }

  // [ProducesResponseType(typeof(T), 200)]
  const producesMatch = content.match(/\[ProducesResponseType\s*\(\s*typeof\s*\(\s*([^)]+)\s*\)/);
  if (producesMatch) {
    route.responseType = producesMatch[1].trim();
  }
}
