import { cors } from 'hono/cors'
import { etag } from 'hono/etag'
import { Hono } from 'hono'
import { getManifest } from './catalog'
import { getMaxSearchLimit, getQueryCacheTtlSeconds } from './config'
import { buildLlmsTxt, buildOpenApiDocument, buildRootDocument } from './discovery'
import { createMcpApp } from './mcp'
import { getAsset, getPack, resolveAssetsForIntent, searchAssets, searchPacks } from './search'
import { jsonResponse, parseLimit, splitCsvOrRepeated, textResponse, truthyParam } from './utils'

type Bindings = { Bindings: Env }

function makeCacheHeaders(ttlSeconds: number): HeadersInit {
  return {
    'cache-control': `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`,
  }
}

async function getQueryCache() {
  return caches.open('open-assets-api-query-cache')
}

function withCacheKey(request: Request, normalizedQuery: URLSearchParams): Request {
  const url = new URL(request.url)
  url.search = normalizedQuery.toString()
  return new Request(url.toString(), { method: 'GET' })
}

async function maybeCachedJson(
  request: Request,
  ttlSeconds: number,
  normalizedQuery: URLSearchParams,
  producer: () => Promise<unknown>,
  ctx: ExecutionContext,
): Promise<Response> {
  const cacheKey = withCacheKey(request, normalizedQuery)
  const cache = await getQueryCache()
  const cached = await cache.match(cacheKey)
  if (cached) {
    return cached
  }

  const response = jsonResponse(await producer(), {
    headers: makeCacheHeaders(ttlSeconds),
  })

  ctx.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}

function createApiApp(env: Env) {
  const app = new Hono<Bindings>()

  app.use(
    '*',
    cors({
      origin: '*',
      allowHeaders: [
        'Content-Type',
        'Accept',
        'Mcp-Session-Id',
        'Mcp-Protocol-Version',
        'Last-Event-ID',
      ],
      exposeHeaders: ['Content-Type', 'Cache-Control', 'ETag', 'Mcp-Session-Id'],
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    }),
  )
  app.use('*', etag())

  app.get('/', async (c) => {
    const origin = new URL(c.req.url).origin
    const manifest = await getManifest(env)
    return jsonResponse({
      ...buildRootDocument(origin),
      counts: manifest.counts,
    })
  })

  app.get('/llms.txt', async (c) => {
    const origin = new URL(c.req.url).origin
    return textResponse(buildLlmsTxt(origin), {
      headers: makeCacheHeaders(getQueryCacheTtlSeconds(env)),
    })
  })

  app.get('/openapi.json', async (c) => {
    const origin = new URL(c.req.url).origin
    return jsonResponse(buildOpenApiDocument(origin), {
      headers: makeCacheHeaders(getQueryCacheTtlSeconds(env)),
    })
  })

  app.get('/health', async () => {
    const manifest = await getManifest(env)
    return jsonResponse({
      ok: true,
      counts: manifest.counts,
    })
  })

  app.get('/api/catalog/manifest', async () => {
    return jsonResponse(await getManifest(env), {
      headers: makeCacheHeaders(getQueryCacheTtlSeconds(env)),
    })
  })

  app.get('/api/search/assets', async (c) => {
    const limit = parseLimit(c.req.query('limit') ?? null, 12, getMaxSearchLimit(env))
    const normalized = new URLSearchParams()
    const query = c.req.query('query') ?? c.req.query('q') ?? ''
    const kind = c.req.query('kind') ?? ''
    const format = c.req.query('format') ?? ''
    const tagsAll = splitCsvOrRepeated(c.req.queries('tagsAll'))
    const tagsAny = splitCsvOrRepeated(c.req.queries('tagsAny'))
    const tagsNot = splitCsvOrRepeated(c.req.queries('tagsNot'))
    const packIds = splitCsvOrRepeated(c.req.queries('packIds'))
    const animated = truthyParam(c.req.query('animated'))
    const rigged = truthyParam(c.req.query('rigged'))

    for (const [key, values] of [
      ['query', query ? [query] : []],
      ['kind', kind ? [kind] : []],
      ['format', format ? [format] : []],
      ['tagsAll', tagsAll],
      ['tagsAny', tagsAny],
      ['tagsNot', tagsNot],
      ['packIds', packIds],
      ['animated', animated == null ? [] : [String(animated)]],
      ['rigged', rigged == null ? [] : [String(rigged)]],
      ['limit', [String(limit)]],
    ] as Array<[string, string[]]>) {
      for (const value of values) {
        normalized.append(key, value)
      }
    }

    return maybeCachedJson(
      c.req.raw,
      getQueryCacheTtlSeconds(env),
      normalized,
      async () => {
        const results = await searchAssets(env, {
          query,
          kind: kind || undefined,
          format: format || undefined,
          tagsAll,
          tagsAny,
          tagsNot,
          packIds,
          animated,
          rigged,
          limit,
        })

        return {
          resultCount: results.length,
          results,
        }
      },
      c.executionCtx,
    )
  })

  app.get('/api/search/packs', async (c) => {
    const limit = parseLimit(c.req.query('limit') ?? null, 12, getMaxSearchLimit(env))
    const normalized = new URLSearchParams()
    const query = c.req.query('query') ?? c.req.query('q') ?? ''
    const creator = c.req.query('creator') ?? ''
    const tagsAll = splitCsvOrRepeated(c.req.queries('tagsAll'))
    const tagsAny = splitCsvOrRepeated(c.req.queries('tagsAny'))
    const tagsNot = splitCsvOrRepeated(c.req.queries('tagsNot'))

    for (const [key, values] of [
      ['query', query ? [query] : []],
      ['creator', creator ? [creator] : []],
      ['tagsAll', tagsAll],
      ['tagsAny', tagsAny],
      ['tagsNot', tagsNot],
      ['limit', [String(limit)]],
    ] as Array<[string, string[]]>) {
      for (const value of values) {
        normalized.append(key, value)
      }
    }

    return maybeCachedJson(
      c.req.raw,
      getQueryCacheTtlSeconds(env),
      normalized,
      async () => {
        const results = await searchPacks(env, {
          query,
          creator: creator || undefined,
          tagsAll,
          tagsAny,
          tagsNot,
          limit,
        })
        return {
          resultCount: results.length,
          results,
        }
      },
      c.executionCtx,
    )
  })

  app.get('/api/assets/:assetId', async (c) => {
    const expanded = truthyParam(c.req.query('expanded')) === true
    const asset = await getAsset(env, c.req.param('assetId'), expanded)
    if (!asset) {
      return jsonResponse({ error: 'Asset not found' }, { status: 404 })
    }
    return jsonResponse({ asset }, { headers: makeCacheHeaders(getQueryCacheTtlSeconds(env)) })
  })

  app.get('/api/packs/:packId', async (c) => {
    const includeAssets = truthyParam(c.req.query('includeAssets')) === true
    const expanded = truthyParam(c.req.query('expanded')) === true
    const assetLimitRaw = c.req.query('assetLimit')
    const assetLimit = assetLimitRaw ? Number.parseInt(assetLimitRaw, 10) : undefined
    const pack = await getPack(env, c.req.param('packId'), includeAssets, expanded, assetLimit)
    if (!pack) {
      return jsonResponse({ error: 'Pack not found' }, { status: 404 })
    }
    return jsonResponse(pack, { headers: makeCacheHeaders(getQueryCacheTtlSeconds(env)) })
  })

  app.post('/api/resolve-assets-for-intent', async (c) => {
    const body = await c.req.json<Record<string, unknown>>()
    const result = await resolveAssetsForIntent(env, {
      intent: String(body.intent ?? ''),
      query: typeof body.query === 'string' ? body.query : undefined,
      kind: typeof body.kind === 'string' ? body.kind : undefined,
      format: typeof body.format === 'string' ? body.format : undefined,
      tagsAll: splitCsvOrRepeated(body.tagsAll as string | string[] | undefined),
      tagsAny: splitCsvOrRepeated(body.tagsAny as string | string[] | undefined),
      tagsNot: splitCsvOrRepeated(body.tagsNot as string | string[] | undefined),
      packIds: splitCsvOrRepeated(body.packIds as string | string[] | undefined),
      animated: typeof body.animated === 'boolean' ? body.animated : null,
      rigged: typeof body.rigged === 'boolean' ? body.rigged : null,
      limit: typeof body.limit === 'number' ? body.limit : undefined,
    })

    return jsonResponse(result)
  })

  app.onError((error) => {
    console.error(error)
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  })

  app.notFound(() => textResponse('Not found', { status: 404 }))

  return app
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const app = createApiApp(env)
    const mcpApp = await createMcpApp(env)
    app.route('/', mcpApp)
    return app.fetch(request, env, ctx)
  },
}