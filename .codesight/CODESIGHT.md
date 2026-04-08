# codesight — AI Context Map

> **Stack:** raw-http | none | unknown | typescript

> 4 routes | 0 models | 0 components | 25 lib files | 6 env vars | 5 middleware | 90 import links
> **Token savings:** this file is ~1,900 tokens. Without it, AI exploration would cost ~19,800 tokens. **Saves ~17,800 tokens per conversation.**

---

# Routes

- `ALL` `/path` [auth, db, cache, queue, email, payment, upload, ai]
- `ALL` `/api` [auth, db, cache, queue, email, payment, upload, ai]
- `ALL` `/health` [auth, db]
- `GET` `/api/users` [auth, db]

---

# Libraries

- `src/ast/extract-components.ts`
  - function extractReactComponentsAST: (ts, filePath, content, relPath) => ComponentInfo[]
  - function ComponentName: (...) => void
  - function ComponentName
- `src/ast/extract-go.ts` — function extractGoRoutesStructured: (filePath, content, framework, tags) => RouteInfo[], function extractGORMModelsStructured: (_filePath, content) => SchemaModel[]
- `src/ast/extract-python.ts`
  - function extractPythonRoutesAST: (filePath, content, framework, tags) => Promise<RouteInfo[] | null>
  - function extractSQLAlchemyAST: (filePath, content) => Promise<SchemaModel[] | null>
  - function isPythonAvailable: () => Promise<boolean>
- `src/ast/extract-routes.ts` — function extractRoutesAST: (ts, filePath, content, framework, tags) => RouteInfo[]
- `src/ast/extract-schema.ts` — function extractDrizzleSchemaAST: (ts, filePath, content) => SchemaModel[], function extractTypeORMSchemaAST: (ts, filePath, content) => SchemaModel[]
- `src/ast/loader.ts`
  - function loadTypeScript: (projectRoot) => any | null
  - function resetCache: () => void
  - function parseSourceFile: (ts, fileName, content) => any
  - function getDecorators: (ts, node) => any[]
  - function parseDecorator: (ts, sf, decorator) => void
  - function getText: (sf, node) => string
- `src/config.ts` — function loadConfig: (root) => Promise<CodesightConfig>, function mergeCliConfig: (config, cli) => CodesightConfig
- `src/detectors/blast-radius.ts` — function analyzeBlastRadius: (filePath, result, maxDepth) => BlastRadiusResult, function analyzeMultiFileBlastRadius: (files, result, maxDepth) => BlastRadiusResult
- `src/detectors/components.ts` — function detectComponents: (files, project) => Promise<ComponentInfo[]>, function ComponentName: (starts with uppercase) => void
- `src/detectors/config.ts` — function detectConfig: (files, project) => Promise<ConfigInfo>
- `src/detectors/contracts.ts` — function enrichRouteContracts: (routes, project) => Promise<RouteInfo[]>
- `src/detectors/graph.ts` — function detectDependencyGraph: (files, project) => Promise<DependencyGraph>
- `src/detectors/libs.ts`
  - function detectLibs: (files, project) => Promise<LibExport[]>
  - function name: (params) => returnType
  - function name
  - class Name
  - interface Name
  - type Name
  - _...2 more_
- `src/detectors/middleware.ts` — function detectMiddleware: (files, project) => Promise<MiddlewareInfo[]>
- `src/detectors/routes.ts` — function detectRoutes: (files, project) => Promise<RouteInfo[]>, const GET
- `src/detectors/schema.ts` — function detectSchemas: (files, project) => Promise<SchemaModel[]>, const users
- `src/detectors/tokens.ts` — function calculateTokenStats: (result, outputContent, fileCount) => TokenStats
- `src/eval.ts` — function runEval: () => Promise<void>
- `src/formatter.ts` — function writeOutput: (result, outputDir) => Promise<string>
- `src/generators/ai-config.ts` — function generateAIConfigs: (result, root) => Promise<string[]>, function generateProfileConfig: (result, root, profile) => Promise<string>
- `src/generators/html-report.ts` — function generateHtmlReport: (result, outputDir) => Promise<string>
- `src/generators/wiki.ts`
  - function generateWiki: (result, outputDir) => Promise<WikiResult>
  - function readWikiArticle: (outputDir, article) => Promise<string | null>
  - function listWikiArticles: (outputDir) => Promise<string[]>
  - function lintWiki: (result, outputDir) => Promise<string>
  - interface WikiResult
- `src/mcp-server.ts` — function startMCPServer: () => void
- `src/scanner.ts`
  - function collectFiles: (root, maxDepth) => Promise<string[]>
  - function readFileSafe: (path) => Promise<string>
  - function detectProject: (root) => Promise<ProjectInfo>
- `src/telemetry.ts`
  - function runTelemetry: (root, result, outputDir) => Promise<TelemetryReport>
  - interface TelemetryTask
  - interface TelemetryReport

---

# Config

## Environment Variables

- `DATABASE_URL` **required** — tests/fixtures/config-app/.env.example
- `JWT_SECRET` **required** — tests/fixtures/config-app/.env.example
- `PORT` (has default) — tests/fixtures/config-app/.env.example
- `VAR` **required** — src/detectors/config.ts
- `VAR_NAME` **required** — src/detectors/config.ts
- `VITE_VAR_NAME` **required** — src/detectors/config.ts

## Config Files

- `tests/fixtures/config-app/.env.example`
- `tsconfig.json`

---

# Middleware

## auth
- middleware — `src/detectors/middleware.ts`
- auth — `tests/fixtures/graph-app/src/auth.ts`
- middleware — `tests/fixtures/graph-app/src/middleware.ts`
- auth — `tests/fixtures/middleware-app/src/middleware/auth.ts`

## rate-limit
- rate-limit — `tests/fixtures/middleware-app/src/middleware/rate-limit.ts`

---

# Dependency Graph

## Most Imported Files (change these carefully)

- `src/types.ts` — imported by **24** files
- `src/scanner.ts` — imported by **11** files
- `src/ast/loader.ts` — imported by **6** files
- `src/detectors/routes.ts` — imported by **3** files
- `src/detectors/schema.ts` — imported by **3** files
- `src/detectors/components.ts` — imported by **3** files
- `src/detectors/config.ts` — imported by **3** files
- `src/detectors/middleware.ts` — imported by **3** files
- `tests/fixtures/graph-app/src/db.ts` — imported by **3** files
- `src/ast/extract-python.ts` — imported by **2** files
- `src/ast/extract-go.ts` — imported by **2** files
- `src/detectors/libs.ts` — imported by **2** files
- `src/detectors/graph.ts` — imported by **2** files
- `src/detectors/contracts.ts` — imported by **2** files
- `src/detectors/tokens.ts` — imported by **2** files
- `src/formatter.ts` — imported by **2** files
- `src/generators/ai-config.ts` — imported by **2** files
- `src/generators/wiki.ts` — imported by **2** files
- `src/detectors/blast-radius.ts` — imported by **2** files
- `tests/fixtures/graph-app/src/auth.ts` — imported by **2** files

## Import Map (who imports what)

- `src/types.ts` ← `src/ast/extract-components.ts`, `src/ast/extract-go.ts`, `src/ast/extract-python.ts`, `src/ast/extract-routes.ts`, `src/ast/extract-schema.ts` +19 more
- `src/scanner.ts` ← `src/detectors/components.ts`, `src/detectors/config.ts`, `src/detectors/contracts.ts`, `src/detectors/graph.ts`, `src/detectors/libs.ts` +6 more
- `src/ast/loader.ts` ← `src/ast/extract-components.ts`, `src/ast/extract-routes.ts`, `src/ast/extract-schema.ts`, `src/detectors/components.ts`, `src/detectors/routes.ts` +1 more
- `src/detectors/routes.ts` ← `src/eval.ts`, `src/index.ts`, `src/mcp-server.ts`
- `src/detectors/schema.ts` ← `src/eval.ts`, `src/index.ts`, `src/mcp-server.ts`
- `src/detectors/components.ts` ← `src/eval.ts`, `src/index.ts`, `src/mcp-server.ts`
- `src/detectors/config.ts` ← `src/eval.ts`, `src/index.ts`, `src/mcp-server.ts`
- `src/detectors/middleware.ts` ← `src/eval.ts`, `src/index.ts`, `src/mcp-server.ts`
- `tests/fixtures/graph-app/src/db.ts` ← `tests/fixtures/graph-app/src/auth.ts`, `tests/fixtures/graph-app/src/middleware.ts`, `tests/fixtures/graph-app/src/routes.ts`
- `src/ast/extract-python.ts` ← `src/detectors/routes.ts`, `src/detectors/schema.ts`

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_