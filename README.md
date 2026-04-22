# open-assets-api

Cloudflare Worker API + MCP server for the public `openassetsarchive/open-assets` catalog.

This project is intentionally separate from the source/build repo:
- `open-assets`: catalog generation, release publishing, static JSON mirror
- `open-assets-api`: query layer, ranking, compact API responses, MCP tools

## MCP spec note

This repo is using the current official TypeScript MCP server packages:
- `@modelcontextprotocol/server`
- `@modelcontextprotocol/hono`

That currently means the `2.0.0-alpha.2` line, because the official SDK’s v2 packages are what expose the modern Web Standard Streamable HTTP server path used here.

## Current architecture

- Canonical catalog source: static JSON shards from `openassetsarchive/open-assets`
- Primary hot-path lookup: tag/kind/format/token/pack-tag indexes
- Detail lookup: pack-level compact bundles
- Transport surfaces:
  - HTTP JSON API for web/app consumers
  - MCP Streamable HTTP endpoint for agent clients

This server does **not** fetch `all-assets.json` on every request. It works from the smaller shard files plus pack detail bundles.

## Endpoints

- `GET /health`
- `GET /api/catalog/manifest`
- `GET /api/search/assets`
- `GET /api/search/packs`
- `GET /api/assets/:assetId`
- `GET /api/packs/:packId`
- `POST /api/resolve-assets-for-intent`
- `POST /mcp`

## MCP examples

Initialize:

```bash
curl -X POST http://127.0.0.1:8788/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-11-25' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.1"}}}'
```

Call `search_assets`:

```bash
curl -X POST http://127.0.0.1:8788/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-11-25' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_assets","arguments":{"kind":"model","tagsAll":["pirate","stylized"],"limit":3}}}'
```

## Query examples

```bash
curl "http://127.0.0.1:8787/api/search/assets?kind=model&tagsAll=pirate,stylized&limit=5"
curl "http://127.0.0.1:8787/api/search/packs?tagsAll=stylized&query=pirate"
curl "http://127.0.0.1:8787/api/assets/quaternius-pirate-kit-weapon-cutlass"
curl "http://127.0.0.1:8787/api/packs/quaternius-pirate-kit?includeAssets=true&assetLimit=10"
```

## Local development

```bash
pnpm install
pnpm types
pnpm dev
```

## Deploy

1. Create the Worker in Cloudflare.
2. Keep `CATALOG_BASE_URL` pointed at the public GitHub catalog at first.
3. Later, bind `CATALOG_BUCKET` to R2 and upload the same catalog tree there.
4. Deploy with `pnpm deploy`.

## R2 migration path

This Worker already supports:
- `CATALOG_BUCKET` R2 binding
- `CATALOG_BASE_URL` HTTP fallback

So the rollout can be:
1. ship using GitHub raw as the upstream
2. upload the same catalog tree to R2
3. bind `CATALOG_BUCKET`
4. keep the API shape unchanged

## Why this exists

The public static repo is ideal for open access and mirroring, but agents and apps need:
- compact ranked results
- multi-tag filtering in one call
- pack lookup without manual shard orchestration
- MCP tool access

That is what this Worker provides.
