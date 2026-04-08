# Auth

The Auth subsystem handles **4 routes** and touches: auth, db, cache, queue, email, payment, ai.

## Routes

- `ALL` `/path` [auth, db, cache, queue, email, payment, upload, ai]
  `src/detectors/routes.ts`
- `ALL` `/api` [auth, db, cache, queue, email, payment, upload, ai]
  `src/detectors/routes.ts`
- `ALL` `/health` [auth, db]
  `tests/detectors.test.ts`
- `GET` `/api/users` [auth, db]
  `tests/detectors.test.ts`

## Middleware

- **middleware** (auth) — `src/detectors/middleware.ts`
- **auth** (auth) — `tests/fixtures/graph-app/src/auth.ts`
- **middleware** (auth) — `tests/fixtures/graph-app/src/middleware.ts`
- **auth** (auth) — `tests/fixtures/middleware-app/src/middleware/auth.ts`

## High-Impact Files

- `src/detectors/routes.ts` — imported by 3 files

---
_Back to [overview.md](./overview.md)_