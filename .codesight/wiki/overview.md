# codesight — Overview

**codesight** is a typescript project built with raw-http.

## Scale

4 API routes · 5 middleware layers · 6 environment variables

## Subsystems

- **[Auth](./auth.md)** — 4 routes — touches: auth, db, cache, queue, email

## High-Impact Files

Changes to these files have the widest blast radius across the codebase:

- `src/types.ts` — imported by **24** files
- `src/scanner.ts` — imported by **11** files
- `src/ast/loader.ts` — imported by **6** files
- `src/detectors/routes.ts` — imported by **3** files
- `src/detectors/schema.ts` — imported by **3** files
- `src/detectors/components.ts` — imported by **3** files

## Required Environment Variables

- `DATABASE_URL` — `tests/fixtures/config-app/.env.example`
- `JWT_SECRET` — `tests/fixtures/config-app/.env.example`
- `VAR` — `src/detectors/config.ts`
- `VAR_NAME` — `src/detectors/config.ts`
- `VITE_VAR_NAME` — `src/detectors/config.ts`

---
_Back to [index.md](./index.md) · Generated 2026-04-07_