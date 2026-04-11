# Dependency Graph

## Most Imported Files (change these carefully)

- `src/types.ts` — imported by **37** files
- `src/scanner.ts` — imported by **15** files
- `src/ast/loader.ts` — imported by **6** files
- `src/ast/extract-dart.ts` — imported by **3** files
- `src/ast/extract-swift.ts` — imported by **3** files
- `src/ast/extract-android.ts` — imported by **3** files
- `src/ast/extract-csharp.ts` — imported by **3** files
- `src/ast/extract-php.ts` — imported by **3** files
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

## Import Map (who imports what)

- `src/types.ts` ← `src/ast/extract-android.ts`, `src/ast/extract-components.ts`, `src/ast/extract-csharp.ts`, `src/ast/extract-dart.ts`, `src/ast/extract-go.ts` +32 more
- `src/scanner.ts` ← `src/detectors/components.ts`, `src/detectors/config.ts`, `src/detectors/contracts.ts`, `src/detectors/coverage.ts`, `src/detectors/events.ts` +10 more
- `src/ast/loader.ts` ← `src/ast/extract-components.ts`, `src/ast/extract-routes.ts`, `src/ast/extract-schema.ts`, `src/detectors/components.ts`, `src/detectors/routes.ts` +1 more
- `src/ast/extract-dart.ts` ← `src/detectors/components.ts`, `src/detectors/libs.ts`, `src/detectors/routes.ts`
- `src/ast/extract-swift.ts` ← `src/detectors/components.ts`, `src/detectors/libs.ts`, `src/detectors/routes.ts`
- `src/ast/extract-android.ts` ← `src/detectors/components.ts`, `src/detectors/routes.ts`, `src/detectors/schema.ts`
- `src/ast/extract-csharp.ts` ← `src/detectors/libs.ts`, `src/detectors/routes.ts`, `src/detectors/schema.ts`
- `src/ast/extract-php.ts` ← `src/detectors/libs.ts`, `src/detectors/routes.ts`, `src/detectors/schema.ts`
- `src/detectors/routes.ts` ← `src/eval.ts`, `src/index.ts`, `src/mcp-server.ts`
- `src/detectors/schema.ts` ← `src/eval.ts`, `src/index.ts`, `src/mcp-server.ts`
