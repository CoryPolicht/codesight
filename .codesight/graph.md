# Dependency Graph

## Most Imported Files (change these carefully)

- `src\types.ts` — imported by **24** files
- `src\scanner.ts` — imported by **11** files
- `src\ast\loader.ts` — imported by **6** files
- `src\detectors\routes.ts` — imported by **3** files
- `src\detectors\schema.ts` — imported by **3** files
- `src\detectors\components.ts` — imported by **3** files
- `src\detectors\config.ts` — imported by **3** files
- `src\detectors\middleware.ts` — imported by **3** files
- `src\ast\extract-python.ts` — imported by **2** files
- `src\ast\extract-go.ts` — imported by **2** files
- `src\detectors\libs.ts` — imported by **2** files
- `src\detectors\graph.ts` — imported by **2** files
- `src\detectors\contracts.ts` — imported by **2** files
- `src\detectors\tokens.ts` — imported by **2** files
- `src\formatter.ts` — imported by **2** files
- `src\generators\ai-config.ts` — imported by **2** files
- `src\generators\wiki.ts` — imported by **2** files
- `src\detectors\blast-radius.ts` — imported by **2** files
- `src\ast\extract-components.ts` — imported by **1** files
- `src\ast\extract-routes.ts` — imported by **1** files

## Import Map (who imports what)

- `src\types.ts` ← `src\ast\extract-components.ts`, `src\ast\extract-go.ts`, `src\ast\extract-python.ts`, `src\ast\extract-routes.ts`, `src\ast\extract-schema.ts` +19 more
- `src\scanner.ts` ← `src\detectors\components.ts`, `src\detectors\config.ts`, `src\detectors\contracts.ts`, `src\detectors\graph.ts`, `src\detectors\libs.ts` +6 more
- `src\ast\loader.ts` ← `src\ast\extract-components.ts`, `src\ast\extract-routes.ts`, `src\ast\extract-schema.ts`, `src\detectors\components.ts`, `src\detectors\routes.ts` +1 more
- `src\detectors\routes.ts` ← `src\eval.ts`, `src\index.ts`, `src\mcp-server.ts`
- `src\detectors\schema.ts` ← `src\eval.ts`, `src\index.ts`, `src\mcp-server.ts`
- `src\detectors\components.ts` ← `src\eval.ts`, `src\index.ts`, `src\mcp-server.ts`
- `src\detectors\config.ts` ← `src\eval.ts`, `src\index.ts`, `src\mcp-server.ts`
- `src\detectors\middleware.ts` ← `src\eval.ts`, `src\index.ts`, `src\mcp-server.ts`
- `src\ast\extract-python.ts` ← `src\detectors\routes.ts`, `src\detectors\schema.ts`
- `src\ast\extract-go.ts` ← `src\detectors\routes.ts`, `src\detectors\schema.ts`
