# Routes

- `ALL` `/path` [auth, db, cache, queue, email, payment, upload, ai]
- `ALL` `/api` [auth, db, cache, queue, email, payment, upload, ai]
- `ALL` `/health` [auth, db] ✓
- `GET` `/api/users` [auth, db] ✓

## GraphQL

### QUERY
- `name`

## WebSocket Events

- `WS` `eventName` — `src/detectors/graphql.ts`
- `WS-ROOM` `room` — `src/detectors/graphql.ts`
- `WS` `room:*` — `src/detectors/graphql.ts`
