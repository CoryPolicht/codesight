/**
 * Configuration loader: reads codesight.config.(ts|js|json) from project root.
 */

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { CodesightConfig } from "./types.js";

const CONFIG_FILES = [
  "codesight.config.ts",
  "codesight.config.js",
  "codesight.config.mjs",
  "codesight.config.json",
];

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load config from project root. Returns empty config if no config file found.
 */
export async function loadConfig(root: string): Promise<CodesightConfig> {
  for (const filename of CONFIG_FILES) {
    const configPath = join(root, filename);
    if (!(await fileExists(configPath))) continue;

    try {
      if (filename.endsWith(".json")) {
        const content = await readFile(configPath, "utf-8");
        return JSON.parse(content) as CodesightConfig;
      }

      if (filename.endsWith(".ts")) {
        // Try loading with tsx or ts-node if available
        return await loadTsConfig(configPath, root);
      }

      // JS/MJS — dynamic import
      const module = await import(pathToFileURL(configPath).href);
      return (module.default || module) as CodesightConfig;
    } catch (err: any) {
      console.warn(`  Warning: failed to load ${filename}: ${err.message}`);
      return {};
    }
  }

  // Also check package.json "codesight" field
  try {
    const pkgPath = join(root, "package.json");
    if (await fileExists(pkgPath)) {
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
      if (pkg.codesight && typeof pkg.codesight === "object") {
        return pkg.codesight as CodesightConfig;
      }
    }
  } catch {}

  return {};
}

async function loadTsConfig(configPath: string, _root: string): Promise<CodesightConfig> {
  // Strategy 1: try tsx via dynamic import of the .ts file directly
  // (works if tsx or ts-node is installed)
  try {
    const module = await import(pathToFileURL(configPath).href);
    return (module.default || module) as CodesightConfig;
  } catch {}

  // Strategy 2: read as text and extract JSON-like config
  // (fallback for when no TS loader is available)
  const content = await readFile(configPath, "utf-8");

  // Try to extract the config object from simple export default { ... }
  const match = content.match(/export\s+default\s+({[\s\S]*})\s*;?\s*$/m);
  if (match) {
    try {
      // Use Function constructor to evaluate the object literal
      // Safe here since this is user's own config file in their project
      const fn = new Function(`return (${match[1]})`);
      return fn() as CodesightConfig;
    } catch {}
  }

  console.warn(`  Warning: cannot load codesight.config.ts (install tsx for TS config support)`);
  return {};
}

/**
 * Merges CLI args with config file values (CLI takes precedence).
 */
export function mergeCliConfig(
  config: CodesightConfig,
  cli: { maxDepth?: number; outputDir?: string; profile?: string; maxTokens?: number }
): CodesightConfig {
  return {
    ...config,
    maxDepth: cli.maxDepth ?? config.maxDepth,
    outputDir: cli.outputDir ?? config.outputDir,
    profile: (cli.profile as CodesightConfig["profile"]) ?? config.profile,
    maxTokens: cli.maxTokens ?? config.maxTokens,
  };
}
