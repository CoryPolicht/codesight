import { relative, basename } from "node:path";
import { readFileSafe } from "../scanner.js";
import type { MiddlewareInfo, ProjectInfo } from "../types.js";

const MIDDLEWARE_PATTERNS: [MiddlewareInfo["type"], RegExp[]][] = [
  ["auth", [
    /auth/i, /jwt/i, /bearer/i, /passport/i, /clerk/i, /better-?auth/i,
    /session/i, /requireAuth/i, /isAuthenticated/i, /verifyToken/i, /protect/i,
    /UseAuthentication/i, /UseAuthorization/i,
  ]],
  ["rate-limit", [/rate.?limit/i, /throttle/i, /rateLimit/i, /rateLimiter/i, /slowDown/i, /UseRateLimiting/i]],
  ["cors", [/cors/i, /cross.?origin/i, /Access-Control/i, /UseCors/i]],
  [
    "validation",
    [
      /zod/i,
      /joi/i,
      /yup/i,
      /validator/i,
      /validate/i,
      /pydantic/i,
      /valibot/i,
    ],
  ],
  [
    "logging",
    [
      /logger/i,
      /morgan/i,
      /pino/i,
      /winston/i,
      /requestLogger/i,
      /httpLogger/i,
    ],
  ],
  [
    "error-handler",
    [
      /errorHandler/i,
      /error.?middleware/i,
      /onError/i,
      /exception.?handler/i,
      /UseExceptionHandler/i,
    ],
  ],
];

function classifyMiddleware(
  name: string,
  content: string
): MiddlewareInfo["type"] {
  const combined = name + " " + content.slice(0, 500);
  for (const [type, patterns] of MIDDLEWARE_PATTERNS) {
    if (patterns.some((p) => p.test(combined))) {
      return type;
    }
  }
  return "custom";
}

export async function detectMiddleware(
  files: string[],
  project: ProjectInfo
): Promise<MiddlewareInfo[]> {
  const middleware: MiddlewareInfo[] = [];

  // Look for middleware files
  const middlewareFiles = files.filter(
    (f) =>
      f.includes("middleware") ||
      f.includes("guard") ||
      f.includes("interceptor") ||
      basename(f).startsWith("auth") ||
      basename(f).includes("rate") ||
      basename(f).includes("cors")
  );

  for (const file of middlewareFiles) {
    const content = await readFileSafe(file);
    if (!content) continue;

    const rel = relative(project.root, file);
    const name = basename(file).replace(/\.[^.]+$/, "");

    middleware.push({
      name,
      file: rel,
      type: classifyMiddleware(name, content),
    });
  }

  // Scan for inline middleware usage in route files
  const routeFiles = files.filter(
    (f) =>
      (f.match(/\.(ts|js|mjs|py|go|cs)$/) &&
        !f.includes("node_modules") &&
        !middlewareFiles.includes(f))
  );

  for (const file of routeFiles) {
    const content = await readFileSafe(file);
    const rel = relative(project.root, file);

    // JS/TS: app.use(cors()) or app.use(rateLimit(...))
    const usePattern = /\.use\s*\(\s*(\w+)\s*\(/g;
    let match;
    while ((match = usePattern.exec(content)) !== null) {
      const fnName = match[1];
      const type = classifyMiddleware(fnName, "");
      if (type !== "custom") {
        if (!middleware.some((m) => m.name === fnName)) {
          middleware.push({ name: fnName, file: rel, type });
        }
      }
    }

    // C#: app.UseAuthentication(), app.UseAuthorization(), app.UseCors(), etc.
    const aspNetUsePattern = /app\.Use(Authentication|Authorization|Cors|RateLimiting|ExceptionHandler|HttpsRedirection|Routing|Swagger|StaticFiles)\s*\(/g;
    while ((match = aspNetUsePattern.exec(content)) !== null) {
      const methodName = `Use${match[1]}`;
      const type = classifyMiddleware(methodName, "");
      if (!middleware.some((m) => m.name === methodName)) {
        middleware.push({ name: methodName, file: rel, type });
      }
    }
  }

  return middleware;
}
