# open-assets-api agent notes

## Purpose

`open-assets-api` is the Cloudflare Worker query layer for the public `openassetsarchive/open-assets` catalog.

It is intentionally separate from:
- `/Users/me/dev/open-assets`

That sibling repo owns:
- ingestion
- schema generation
- GitHub Releases publishing
- static JSON catalog publishing

This repo owns:
- compact HTTP search/lookup endpoints
- MCP Streamable HTTP server
- caching and ranking behavior
- future Cloudflare-native deployment concerns

## Core constraints

- Do not make `all-assets.json` a request-time dependency for normal search.
- Prefer static shard lookups:
  - `search/tags/*`
  - `search/tokens/*`
  - `search/kinds/*`
  - `search/formats/*`
  - `search/pack-tags/*`
- Use pack-level compact bundles for asset hydration:
  - `packs/<packId>/assets.json`
  - `packs/<packId>/details.json`
- Keep responses compact by default.
- Only use expanded detail when explicitly requested.

## Storage strategy

- Current default upstream: public GitHub raw catalog
- Intended production origin: R2 via `CATALOG_BUCKET`
- The Worker should support both without changing API shape.

## MCP guidance

- Latest MCP transport direction is Streamable HTTP.
- This repo uses the current official MCP TypeScript server packages and Web Standard transport.
- Prefer stateless mode unless resumability/session state is actually required.

## Git / identity constraint

- The user is sensitive about git identity leakage.
- Do not assume global git config, `gh auth`, or the default local GitHub identity is safe to use.
- If publishing code, prefer either:
  - repo-local throwaway git identity plus PAT-only push
  - or user-driven web upload

## Current routes

- `GET /`
- `GET /llms.txt`
- `GET /openapi.json`
- `GET /health`
- `GET /api/catalog/manifest`
- `GET /api/search/assets`
- `GET /api/search/packs`
- `GET /api/assets/:assetId`
- `GET /api/packs/:packId`
- `POST /api/resolve-assets-for-intent`
- `POST /mcp`

## Current MCP tools

- `search_assets`
- `search_packs`
- `get_asset`
- `get_pack`
- `resolve_assets_for_intent`
- `get_catalog_stats`

## Production discovery

The production service is intended to be self-describing from:
- `https://api.openassetsarchive.com/`
- `https://api.openassetsarchive.com/llms.txt`
- `https://api.openassetsarchive.com/openapi.json`

Future changes should preserve those paths as stable discovery surfaces for external agents.