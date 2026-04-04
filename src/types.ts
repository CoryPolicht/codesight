export type Framework =
  | "next-app"
  | "next-pages"
  | "hono"
  | "express"
  | "fastify"
  | "koa"
  | "nestjs"
  | "elysia"
  | "adonis"
  | "trpc"
  | "sveltekit"
  | "remix"
  | "nuxt"
  | "flask"
  | "fastapi"
  | "django"
  | "go-net-http"
  | "gin"
  | "fiber"
  | "echo"
  | "chi"
  | "rails"
  | "phoenix"
  | "spring"
  | "actix"
  | "axum"
  | "raw-http"
  | "unknown";

export type ORM = "drizzle" | "prisma" | "typeorm" | "sqlalchemy" | "gorm" | "mongoose" | "sequelize" | "activerecord" | "ecto" | "unknown";

export type ComponentFramework = "react" | "vue" | "svelte" | "unknown";

export interface ProjectInfo {
  root: string;
  name: string;
  frameworks: Framework[];
  orms: ORM[];
  componentFramework: ComponentFramework;
  isMonorepo: boolean;
  workspaces: WorkspaceInfo[];
  language: "typescript" | "javascript" | "python" | "go" | "ruby" | "elixir" | "java" | "kotlin" | "rust" | "php" | "mixed";
}

export interface WorkspaceInfo {
  name: string;
  path: string;
  frameworks: Framework[];
  orms: ORM[];
}

export interface RouteInfo {
  method: string;
  path: string;
  file: string;
  tags: string[];
  framework: Framework;
  requestType?: string;
  responseType?: string;
  params?: string[];
}

export interface SchemaModel {
  name: string;
  fields: SchemaField[];
  relations: string[];
  orm: ORM;
}

export interface SchemaField {
  name: string;
  type: string;
  flags: string[]; // pk, fk, unique, nullable, default
}

export interface ComponentInfo {
  name: string;
  file: string;
  props: string[];
  isClient: boolean;
  isServer: boolean;
}

export interface LibExport {
  file: string;
  exports: ExportItem[];
}

export interface ExportItem {
  name: string;
  kind: "function" | "class" | "const" | "type" | "interface" | "enum";
  signature?: string;
}

export interface ConfigInfo {
  envVars: EnvVar[];
  configFiles: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface EnvVar {
  name: string;
  source: string;
  hasDefault: boolean;
}

export interface MiddlewareInfo {
  name: string;
  file: string;
  type: "auth" | "rate-limit" | "cors" | "validation" | "logging" | "error-handler" | "custom";
}

export interface ImportEdge {
  from: string; // file that imports
  to: string;   // file being imported
}

export interface DependencyGraph {
  edges: ImportEdge[];
  hotFiles: { file: string; importedBy: number }[]; // most-imported files
}

export interface BlastRadiusResult {
  file: string;
  affectedFiles: string[];
  affectedRoutes: RouteInfo[];
  affectedModels: string[];
  affectedMiddleware: string[];
  depth: number;
}

export interface CodesightConfig {
  disableDetectors?: string[];
  customTags?: Record<string, string[]>;
  maxDepth?: number;
  outputDir?: string;
  profile?: "claude-code" | "cursor" | "codex" | "copilot" | "windsurf" | "generic";
  ignorePatterns?: string[];
}

export interface ScanResult {
  project: ProjectInfo;
  routes: RouteInfo[];
  schemas: SchemaModel[];
  components: ComponentInfo[];
  libs: LibExport[];
  config: ConfigInfo;
  middleware: MiddlewareInfo[];
  graph: DependencyGraph;
  tokenStats: TokenStats;
}

export interface TokenStats {
  outputTokens: number;
  estimatedExplorationTokens: number;
  saved: number;
  fileCount: number;
}
