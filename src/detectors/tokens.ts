import type { ScanResult } from "../types.js";

/**
 * Token counting heuristic.
 *
 * Claude / GPT tokenization averages ~3.5 chars/token for English prose, but
 * code is denser (~2.8 chars/token for identifiers/symbols, ~5 for whitespace).
 * We use a blended estimate that weights code sections differently from prose.
 *
 * Still zero external dependencies — this is an estimate, not tiktoken.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Split into lines for classification
  let prose = 0;
  let code = 0;
  let whitespace = 0;

  for (const line of text.split("\n")) {
    const trimmed = line.trimStart();
    // Blank lines
    if (!trimmed) { whitespace += 1; continue; }
    // Markdown headers, list items, prose
    if (trimmed.startsWith("#") || trimmed.startsWith(">") || trimmed.startsWith("_")) {
      prose += trimmed.length;
    } else if (
      trimmed.startsWith("- `") ||
      trimmed.startsWith("  - ") ||
      trimmed.includes(": ") ||
      trimmed.startsWith("| ")
    ) {
      // Mixed — route/schema lines have identifiers + prose
      code += Math.floor(trimmed.length * 0.5);
      prose += Math.floor(trimmed.length * 0.5);
    } else {
      code += trimmed.length;
    }
  }

  // Prose: ~4 chars/token, Code: ~3 chars/token, whitespace negligible
  const proseTokens = Math.ceil(prose / 4);
  const codeTokens = Math.ceil(code / 3);
  const wsTokens = Math.ceil(whitespace / 8);

  return proseTokens + codeTokens + wsTokens;
}

/**
 * Cost model for manual AI exploration — how many tokens an AI would spend
 * discovering the same information without codesight.
 *
 * Based on empirical observation of Claude Code tool call patterns:
 *  - Each route discovered: ~400 tokens (read handler file + grep pattern)
 *  - Each schema model: ~300 tokens (read schema/migration file)
 *  - Each component: ~250 tokens (read component file + search for usage)
 *  - Each lib file: ~200 tokens (read exports)
 *  - Each env var: ~100 tokens (grep across .env files)
 *  - Each middleware: ~200 tokens (read middleware registration)
 *  - Each hot file: ~150 tokens (read file to understand dependencies)
 *  - File search overhead: ~80 tokens per file (glob + stat), capped at 50 files
 *  - GraphQL/gRPC operations: ~350 tokens each (read resolver + schema)
 *  - Event/queue entry: ~150 tokens (read queue registration)
 *  - 1.3x revisit multiplier (AI re-reads files across multi-turn conversation)
 */
export function calculateTokenStats(
  result: ScanResult,
  outputText: string,
  fileCount: number
): import("../types.js").TokenStats {
  const outputTokens = estimateTokens(outputText);

  // Separate HTTP routes from GraphQL/gRPC/WS operations
  const httpRoutes = result.routes.filter(
    (r) => !["QUERY", "MUTATION", "SUBSCRIPTION", "RPC", "WS", "WS-ROOM"].includes(r.method)
  );
  const specialRoutes = result.routes.filter(
    (r) => ["QUERY", "MUTATION", "SUBSCRIPTION", "RPC"].includes(r.method)
  );
  const wsRoutes = result.routes.filter((r) => r.method === "WS" || r.method === "WS-ROOM");

  const routeCost = httpRoutes.length * 400;
  const specialRouteCost = specialRoutes.length * 350;
  const wsCost = wsRoutes.length * 150;
  const schemaCost = result.schemas.filter((s) => !s.name.startsWith("enum:")).length * 300;
  const componentCost = result.components.length * 250;
  const libCost = result.libs.length * 200;
  const envVarCost = result.config.envVars.length * 100;
  const middlewareCost = result.middleware.length * 200;
  const hotFileCost = result.graph.hotFiles.length * 150;
  const searchOverhead = Math.min(fileCount, 50) * 80;
  const eventCost = (result.events?.length ?? 0) * 150;

  const rawExploration =
    routeCost + specialRouteCost + wsCost +
    schemaCost + componentCost + libCost +
    envVarCost + middlewareCost + hotFileCost +
    searchOverhead + eventCost;

  const estimatedExplorationTokens = Math.round(rawExploration * 1.3);
  const saved = Math.max(0, estimatedExplorationTokens - outputTokens);

  return { outputTokens, estimatedExplorationTokens, saved, fileCount };
}
