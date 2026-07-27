# Routes

- `ALL` `/path` `[inferred]`
- `ALL` `/api` `[inferred]`
- `ALL` `/health` [auth, db, cache, payment] `[inferred]` ✓
- `GET` `/api/users` [auth, db, cache, payment] `[inferred]` ✓

## GraphQL

### QUERY
- `name`

## WebSocket Events

- `WS` `eventName` — `src/detectors/graphql.ts`
- `WS-ROOM` `room` — `src/detectors/graphql.ts`
- `WS` `room:*` — `src/detectors/graphql.ts`
