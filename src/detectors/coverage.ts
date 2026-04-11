/**
 * Test coverage mapper.
 * Identifies which routes and schema models have corresponding test files.
 * Uses heuristics: file path matching and string pattern searching in test files.
 */

import { relative, basename } from "node:path";
import { readFileSafe } from "../scanner.js";
import type { RouteInfo, SchemaModel, TestCoverage } from "../types.js";

const TEST_FILE_PATTERNS = [
  /\.test\.(ts|tsx|js|jsx)$/,
  /\.spec\.(ts|tsx|js|jsx)$/,
  /_test\.(py|rb|go|rs|ex|exs|java|kt)$/,
  /test_.*\.(py)$/,
  /_spec\.(rb)$/,
  /_test\.(go)$/,
];

export function isTestFile(file: string): boolean {
  return TEST_FILE_PATTERNS.some((p) => p.test(file)) ||
    file.includes("/__tests__/") ||
    file.includes("/test/") ||
    file.includes("/tests/") ||
    file.includes("/spec/");
}

export async function detectTestCoverage(
  files: string[],
  routes: RouteInfo[],
  schemas: SchemaModel[],
  projectRoot: string
): Promise<TestCoverage> {
  const testFiles = files.filter(isTestFile);
  const testedRoutes = new Set<string>();
  const testedModels = new Set<string>();

  // Read all test file contents for pattern matching
  const testContents: string[] = [];
  for (const tf of testFiles) {
    const content = await readFileSafe(tf);
    if (content) testContents.push(content.toLowerCase());
  }

  const allTestContent = testContents.join("\n");

  // Match routes: look for path strings or route keys in test files
  for (const route of routes) {
    // Check path appears in test files (quoted path string)
    const escapedPath = route.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pathRegex = new RegExp(`["'\`]${escapedPath}["'\`]`);
    if (pathRegex.test(allTestContent)) {
      testedRoutes.add(`${route.method}:${route.path}`);
      continue;
    }

    // Check by base filename — if route file is users.ts and users.test.ts exists
    const routeBase = basename(route.file).replace(/\.(ts|tsx|js|jsx|py|rb|go|ex)$/, "");
    if (testFiles.some((tf) => {
      const testBase = basename(tf).replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, "").replace(/_(test|spec)$/, "").replace(/^test_/, "");
      return testBase === routeBase;
    })) {
      testedRoutes.add(`${route.method}:${route.path}`);
    }
  }

  // Match schema models: model name appears in test files
  for (const model of schemas) {
    const modelNameLower = model.name.toLowerCase();
    if (allTestContent.includes(modelNameLower)) {
      testedModels.add(model.name);
    }
  }

  const totalRoutes = routes.filter(r => r.method !== "WS" && r.method !== "WS-ROOM").length;
  const totalModels = schemas.filter(s => !s.name.startsWith("enum:")).length;
  const totalCoverable = totalRoutes + totalModels;
  const totalCovered = testedRoutes.size + testedModels.size;
  const coveragePercent = totalCoverable > 0
    ? Math.round((totalCovered / totalCoverable) * 100)
    : 0;

  return {
    testedRoutes: Array.from(testedRoutes),
    testedModels: Array.from(testedModels),
    testFiles: testFiles.map(f => relative(projectRoot, f).replace(/\\/g, "/")),
    coveragePercent,
  };
}
