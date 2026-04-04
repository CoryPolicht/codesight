<div align="center">

### Your AI assistant wastes thousands of tokens every conversation just figuring out your project. codesight fixes that in one command.

**Zero dependencies. 25+ framework detectors. 4 ORM parsers. MCP server. One `npx` call.**

[![npm version](https://img.shields.io/npm/v/codesight?style=for-the-badge&logo=npm&color=CB3837)](https://www.npmjs.com/package/codesight)
[![npm downloads](https://img.shields.io/npm/dm/codesight?style=for-the-badge&logo=npm&color=blue&label=Monthly%20Downloads)](https://www.npmjs.com/package/codesight)
[![npm total](https://img.shields.io/npm/dt/codesight?style=for-the-badge&logo=npm&color=cyan&label=Total%20Downloads)](https://www.npmjs.com/package/codesight)
[![GitHub stars](https://img.shields.io/github/stars/Houseofmvps/codesight?style=for-the-badge&logo=github&color=gold)](https://github.com/Houseofmvps/codesight/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge&logo=opensourceinitiative)](LICENSE)
[![Sponsor](https://img.shields.io/badge/Sponsor-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/Houseofmvps)

---

[![Follow @kaileskkhumar](https://img.shields.io/badge/Follow%20%40kaileskkhumar-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/kaileskkhumar)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0A66C2?style=for-the-badge&logo=linkedin)](https://www.linkedin.com/in/kailesk-khumar)
[![houseofmvps.com](https://img.shields.io/badge/houseofmvps.com-Website-green?style=for-the-badge&logo=google-chrome&logoColor=white)](https://houseofmvps.com)

**Built by [Kailesk Khumar](https://www.linkedin.com/in/kailesk-khumar), solo founder of [houseofmvps.com](https://houseofmvps.com)**

*Also: [ultraship](https://github.com/Houseofmvps/ultraship) (39 expert skills for Claude Code) · [claude-rank](https://github.com/Houseofmvps/claude-rank) (SEO/GEO/AEO plugin for Claude Code)*

</div>

---

```
0 dependencies · Node.js >= 18 · 27 tests · MIT
```

## Works With

**Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Windsurf, Cline, Aider**, and anything that reads markdown.

## Install

```bash
npx codesight
```

That's it. Run it in any project root. No config, no setup, no API keys.

```bash
npx codesight --init       # Also generate CLAUDE.md, .cursorrules, codex.md, AGENTS.md
npx codesight --open       # Also open interactive HTML report in browser
npx codesight --mcp        # Start as MCP server for Claude Code / Cursor
npx codesight --benchmark  # Show detailed token savings breakdown
```

## What It Does

Every AI coding conversation starts the same way. Your assistant reads files, greps for patterns, opens configs, just to understand the project. That exploration costs tens of thousands of tokens before it writes a single line of code.

codesight scans your codebase once and generates a structured context map. Routes, database schema, components, dependencies, environment variables, middleware, all condensed into ~3,000 to 5,000 tokens of structured markdown. Your AI reads one file and knows the entire project.

```
Output size:      ~3,200 tokens
Exploration cost: ~52,000 tokens (without codesight)
Saved:            ~48,800 tokens per conversation
```

## What It Generates

```
.codesight/
  CODESIGHT.md     Combined context map (one file, full project understanding)
  routes.md        Every API route with method, path, params, and what it touches
  schema.md        Every database model with fields, types, keys, and relations
  components.md    Every UI component with its props
  libs.md          Every library export with function signatures
  config.md        Every env var (required vs default), config files, key deps
  middleware.md    Auth, rate limiting, CORS, validation, logging, error handlers
  graph.md         Which files import what and which break the most things if changed
  report.html      Interactive visual dashboard (with --html or --open)
```

## Routes

Not just paths. Methods, URL parameters, what each route touches (auth, database, cache, payments, AI, email, queues), and where the handler lives. Detects routes across 25+ frameworks automatically.

```markdown
- `POST` `/auth/login` [auth, db, email]
- `GET` `/api/projects/:id/analytics` params(id) [auth, db, cache]
- `POST` `/api/billing/checkout` [auth, db, payment]
- `QUERY` `getUsers` [db]             # tRPC procedures
- `MUTATION` `createProject` [db, ai]  # tRPC mutations
```

## Schema

Models, fields, types, primary keys, foreign keys, unique constraints, relations. Parsed directly from your ORM definitions. No need to open migration files.

```markdown
### users
- id: uuid (pk, default)
- email: text (unique, required)
- plan: text (required, default)
- stripeCustomerId: text (fk)

### projects
- id: uuid (pk, default)
- userId: uuid (fk)
- name: text (required)
- domain: text (unique)
- _relations_: userId -> users.id
```

## Dependency Graph

The files imported the most are the ones that break the most things when changed. codesight finds them and tells your AI to be careful.

```markdown
## Most Imported Files (change these carefully)
- `packages/shared/src/index.ts` — imported by **14** files
- `apps/api/src/lib/db.ts` — imported by **9** files
- `apps/api/src/lib/auth.ts` — imported by **7** files
```

## Environment Audit

Every env var across your codebase, flagged as required or has default, with the exact file where it is referenced.

```markdown
- `DATABASE_URL` **required** — apps/api/src/lib/db.ts
- `JWT_SECRET` **required** — apps/api/src/lib/auth.ts
- `PORT` (has default) — apps/api/src/index.ts
```

## Token Benchmark

See exactly where your token savings come from:

```bash
npx codesight --benchmark
```

```
  Token Savings Breakdown:
  ┌──────────────────────────────────────────────────┐
  │ What codesight found         │ Exploration cost   │
  ├──────────────────────────────┼────────────────────┤
  │  65 routes                   │ ~26,000 tokens     │
  │  18 schema models            │ ~ 5,400 tokens     │
  │  16 components               │ ~ 4,000 tokens     │
  │  36 library files            │ ~ 7,200 tokens     │
  │  22 env vars                 │ ~ 2,200 tokens     │
  │  92 files (search overhead)  │ ~ 4,000 tokens     │
  ├──────────────────────────────┼────────────────────┤
  │ codesight output             │ ~ 4,041 tokens     │
  │ SAVED PER CONVERSATION       │ ~64,599 tokens     │
  └──────────────────────────────┴────────────────────┘
```

## Supported Stacks

| Category | Supported |
|---|---|
| **Routes** | Hono, Express, Fastify, Next.js (App + Pages), Koa, NestJS, tRPC, Elysia, AdonisJS, SvelteKit, Remix, Nuxt, FastAPI, Flask, Django, Go (net/http, Gin, Fiber, Echo, Chi), Rails, Phoenix, Spring Boot, Actix, Axum, raw http.createServer |
| **Schema** | Drizzle, Prisma, TypeORM, Mongoose, Sequelize, SQLAlchemy, ActiveRecord, Ecto |
| **Components** | React, Vue, Svelte (auto-filters shadcn/ui and Radix primitives) |
| **Libraries** | TypeScript, JavaScript, Python, Go, Ruby, Elixir, Java, Kotlin, Rust (exports with function signatures) |
| **Middleware** | Auth, rate limiting, CORS, validation, logging, error handlers |
| **Dependencies** | Import graph with hot file detection (most imported = highest blast radius) |
| **Contracts** | URL params, request types, response types from route handlers |
| **Monorepos** | pnpm, npm, yarn workspaces (cross-workspace detection) |
| **Languages** | TypeScript, JavaScript, Python, Go, Ruby, Elixir, Java, Kotlin, Rust, PHP |

## AI Config Generation

```bash
npx codesight --init
```

Generates ready-to-use instruction files for every major AI coding tool at once:

| File | Tool |
|---|---|
| `CLAUDE.md` | Claude Code |
| `.cursorrules` | Cursor |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `codex.md` | OpenAI Codex CLI |
| `AGENTS.md` | OpenAI Codex agents |

Each file is pre-filled with your project's stack, architecture, high-impact files, and required env vars. Your AI reads it on startup and starts with full context from the first message.

## MCP Server

```bash
npx codesight --mcp
```

Runs as a Model Context Protocol server. Claude Code and Cursor call it directly to get project context on demand.

```json
{
  "mcpServers": {
    "codesight": {
      "command": "npx",
      "args": ["codesight", "--mcp"]
    }
  }
}
```

Exposes one tool: `codesight_scan`. Your AI calls it whenever it needs to understand the project.

## Visual Report

```bash
npx codesight --open
```

Opens an interactive HTML dashboard in your browser. Routes table with method badges and tags. Schema cards with fields and relations. Dependency hot files with impact bars. Env var audit. Token savings breakdown. Useful for onboarding or just seeing your project from above.

## GitHub Action

Add to your CI pipeline to keep context fresh on every push:

```yaml
name: codesight
on: [push]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx -y codesight
      - uses: actions/upload-artifact@v4
        with:
          name: codesight
          path: .codesight/
```

## Watch Mode and Git Hook

**Watch mode** re-scans when files change:

```bash
npx codesight --watch
```

**Git hook** regenerates context on every commit:

```bash
npx codesight --hook
```

Context stays fresh without thinking about it.

## All Options

```bash
npx codesight                       # Scan current directory
npx codesight ./my-project          # Scan specific directory
npx codesight --init                # Generate AI config files
npx codesight --open                # Open visual HTML report
npx codesight --html                # Generate HTML report without opening
npx codesight --mcp                 # Start MCP server
npx codesight --watch               # Watch mode
npx codesight --hook                # Install git pre-commit hook
npx codesight --benchmark           # Detailed token savings breakdown
npx codesight --json                # Output as JSON
npx codesight -o .ai-context        # Custom output directory
npx codesight -d 5                  # Limit directory depth
```

## How It Compares

Most AI context tools dump your entire codebase into one file. codesight takes a different approach: it **parses** your code to extract structured information.

| | codesight | File concatenation tools |
|---|---|---|
| **Output** | Structured routes, schema, components, deps | Raw file contents |
| **Token cost** | ~3,000-5,000 tokens | 50,000-500,000+ tokens |
| **Route detection** | 25+ frameworks auto-detected | None |
| **Schema parsing** | ORM-aware with relations | None |
| **Dependency graph** | Hot file detection | None |
| **AI config generation** | CLAUDE.md, .cursorrules, etc. | None |
| **MCP server** | Built-in | Varies |
| **Dependencies** | Zero | Varies |

## Contributing

```bash
git clone https://github.com/Houseofmvps/codesight.git
cd codesight
pnpm install
pnpm dev              # Run locally
pnpm build            # Compile TypeScript
pnpm test             # Run 27 tests
```

PRs welcome. Open an issue first for large changes.

## License

MIT

---

<div align="center">

If codesight saves you tokens, [star it on GitHub](https://github.com/Houseofmvps/codesight) so others find it too.

[![GitHub stars](https://img.shields.io/github/stars/Houseofmvps/codesight?style=for-the-badge&logo=github&color=gold)](https://github.com/Houseofmvps/codesight/stargazers)
[![Sponsor](https://img.shields.io/badge/Sponsor-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/Houseofmvps)

</div>
