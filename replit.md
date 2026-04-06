# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── proxy-dashboard/    # React + Vite proxy management dashboard
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Proxy Gateway Management System

### Features
- **Proxy Gateway Dashboard** (React + Vite at `/`): Upload, view, search, filter, and delete proxies; view live stats; copy gateway address
- **Proxy table** with IP, Port, Status (working/failed/unchecked), Latency, Last Checked columns — **paginated** (20 per page with Back/Next buttons)
- **Request Statistics**: Tracks total requests, successful/failed counts, unique target domains, avg latency, top domains bar chart
- **Background health checker**: Runs every 1 hour, checks only **working + unchecked** proxies (not failed). Failed proxies are re-checked manually via button. Batch size 200, 20s timeout, all targets checked in parallel (race)
- **Proxy rotation**: Gateway picks a random working proxy from the pool for each request
- **Gateway info**: Exposes single `host:port:user:pass` address for rotating proxy clients
- **REST API Proxy**: `/api/gateway/fetch` endpoint for routing requests through the proxy pool
- **TCP Proxy Server**: Standalone TCP proxy on port 1080 (env: `TCP_PROXY_PORT`) — supports HTTP CONNECT tunneling and HTTP proxy with Proxy-Authorization

### Gateway Credentials
- Username: `admin` (env: `GATEWAY_USER`)
- Password: `proxypass123` (env: `GATEWAY_PASSWORD`)

### API Endpoints
- `GET /api/proxies` — list proxies (supports `?status=`, `?search=`, `?page=`, `?limit=` filters). Returns paginated response with `{ data, pagination }`.
- `POST /api/proxies` — upload proxies (body: `{ proxies: "ip:port\nip:port" }`)
- `DELETE /api/proxies/:id` — delete proxy
- `DELETE /api/proxies?filter=all|working|failed|unchecked` — bulk delete proxies
- `PUT /api/proxies/:id` — update proxy
- `GET /api/stats` — get proxy pool statistics
- `GET /api/stats/requests` — get gateway request statistics (total, successful, failed, unique domains, top domains, recent requests)
- `GET /api/gateway/info` — get gateway connection string in `host:port:user:pass` format
- `POST /api/gateway/fetch` — REST proxy: route a request through a random working proxy (body: `{ url, method?, headers?, body? }`)
- `POST /api/gateway/test` — test the gateway by fetching httpbin.org/ip through a random proxy
- `POST /api/gateway/test-rotate` — test the TCP proxy server by connecting through it using the proxy protocol
- `POST /api/proxies/check-all` — trigger immediate health check
- `POST /api/proxies/scrape` — scrape free proxies from 10+ online sources, deduplicate, insert new, trigger health check
- `GET /api/healthz` — health check

### REST Proxy API (gateway/fetch)
The rotating proxy works as a REST API endpoint, not a traditional HTTP proxy. Send POST requests to `/api/gateway/fetch` with a JSON body containing the target URL. The server picks a random working proxy from the pool, makes the request through it, and returns the response including status, headers, body, which proxy was used, and latency.

### Database Schema
- `proxies` table: `id`, `ip`, `port`, `status` (working/failed/unchecked), `latency`, `last_checked`, `created_at`

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server with proxy management routes and background health checking.

- Entry: `src/index.ts` — reads `PORT`, starts Express, starts background checker
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers
  - `src/routes/proxies.ts` — CRUD + upload + check-all
  - `src/routes/stats.ts` — statistics
  - `src/routes/gateway.ts` — gateway info
  - `src/routes/health.ts` — health check
- Lib: `src/lib/proxyChecker.ts` — concurrent proxy checking (batch 2000, 3s timeout, parallel target race), background scheduler
- Lib: `src/lib/tcpProxyServer.ts` — standalone TCP proxy server (port 1080) with CONNECT tunneling and HTTP proxy support
- Depends on: `@workspace/db`, `@workspace/api-zod`

### `artifacts/proxy-dashboard` (`@workspace/proxy-dashboard`)

React + Vite frontend dashboard. Dark theme. Features:
- Stats grid (total/working/failed/unchecked proxies, avg latency)
- Request statistics grid (total requests, successful, failed, unique domains, avg latency) + top domains bar chart
- Proxy table with search + status filter tabs, **paginated** (20 per page with Back/Next/page number buttons)
- Upload proxies modal (paste ip:port list)
- "Fetch Free Proxies" button — scrapes proxies from 10+ free online sources
- Gateway info card with REST API endpoint (recommended), TCP proxy server connection string (`host:port:user:pass`), Test Rotate Proxy and Test REST API buttons
- Auto-refresh every 30s

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

- Schema: `src/schema/proxies.ts` — proxies table

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec + Orval codegen config.

Run codegen: `pnpm --filter @workspace/api-spec run codegen`
