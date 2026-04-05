import type { ScanResult, BlastRadiusResult } from "../types.js";

/**
 * Blast radius analysis: given a file, find all transitively affected
 * files, routes, models, and middleware using BFS through the import graph.
 */
export function analyzeBlastRadius(
  filePath: string,
  result: ScanResult,
  maxDepth = 3
): BlastRadiusResult {
  const { graph, routes, schemas, middleware } = result;

  // Normalize path separators to match whatever convention graph edges use
  const sep = graph.edges.length > 0 && graph.edges[0].from.includes("\\") ? "\\" : "/";
  const normPath = (p: string) => sep === "\\" ? p.replace(/\//g, "\\") : p.replace(/\\/g, "/");
  filePath = normPath(filePath);

  // Build reverse adjacency map: file -> files that import it
  const importedBy = new Map<string, Set<string>>();
  // Build forward adjacency map: file -> files it imports
  const imports = new Map<string, Set<string>>();

  for (const edge of graph.edges) {
    if (!importedBy.has(edge.to)) importedBy.set(edge.to, new Set());
    importedBy.get(edge.to)!.add(edge.from);
    if (!imports.has(edge.from)) imports.set(edge.from, new Set());
    imports.get(edge.from)!.add(edge.to);
  }

  // BFS: find all files affected by changing this file
  // "affected" = files that directly or transitively import this file
  const affected = new Set<string>();
  const queue: { file: string; depth: number }[] = [{ file: filePath, depth: 0 }];

  while (queue.length > 0) {
    const { file, depth } = queue.shift()!;
    if (depth > maxDepth) continue;

    const dependents = importedBy.get(file);
    if (!dependents) continue;

    for (const dep of dependents) {
      if (!affected.has(dep)) {
        affected.add(dep);
        queue.push({ file: dep, depth: depth + 1 });
      }
    }
  }

  // Also include the file itself
  affected.add(filePath);

  // Find affected routes (routes whose handler file is in the affected set)
  const affectedRoutes = routes.filter((r) => affected.has(r.file));

  // Find affected models (schemas referenced in affected files)
  const affectedModels: string[] = [];
  for (const schema of schemas) {
    for (const file of affected) {
      // Check if any route/lib in this file touches this model
      const routesInFile = routes.filter((r) => r.file === file);
      if (routesInFile.some((r) => r.tags.includes("db"))) {
        if (!affectedModels.includes(schema.name)) {
          affectedModels.push(schema.name);
        }
        break;
      }
    }
  }

  // Find affected middleware
  const affectedMiddleware = middleware
    .filter((m) => affected.has(m.file))
    .map((m) => m.name);

  return {
    file: filePath,
    affectedFiles: Array.from(affected).filter((f) => f !== filePath),
    affectedRoutes,
    affectedModels,
    affectedMiddleware,
    depth: maxDepth,
  };
}

/**
 * Multi-file blast radius: given a list of changed files (e.g., from git diff),
 * find the combined blast radius.
 */
export function analyzeMultiFileBlastRadius(
  files: string[],
  result: ScanResult,
  maxDepth = 3
): BlastRadiusResult {
  const combined = new Set<string>();
  const combinedRoutes: ScanResult["routes"] = [];
  const combinedModels = new Set<string>();
  const combinedMiddleware = new Set<string>();

  const sep = result.graph.edges.length > 0 && result.graph.edges[0].from.includes("\\") ? "\\" : "/";
  const normPath = (p: string) => sep === "\\" ? p.replace(/\//g, "\\") : p.replace(/\\/g, "/");
  files = files.map(normPath);

  for (const file of files) {
    const br = analyzeBlastRadius(file, result, maxDepth);
    for (const f of br.affectedFiles) combined.add(f);
    for (const r of br.affectedRoutes) {
      if (!combinedRoutes.some((cr) => cr.path === r.path && cr.method === r.method)) {
        combinedRoutes.push(r);
      }
    }
    for (const m of br.affectedModels) combinedModels.add(m);
    for (const mw of br.affectedMiddleware) combinedMiddleware.add(mw);
  }

  // Remove the input files from affected
  for (const file of files) combined.delete(file);

  return {
    file: files.join(", "),
    affectedFiles: Array.from(combined),
    affectedRoutes: combinedRoutes,
    affectedModels: Array.from(combinedModels),
    affectedMiddleware: Array.from(combinedMiddleware),
    depth: maxDepth,
  };
}
