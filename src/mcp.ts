import { createMcpHonoApp } from '@modelcontextprotocol/hono'
import { McpServer, ResourceTemplate, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server'
import { Hono } from 'hono'
import * as z from 'zod'
import { getManifest, getPacks } from './catalog'
import { getMcpServerName, getMcpServerVersion } from './config'
import { getAsset, getCatalogStats, getPack, resolveAssetsForIntent, searchAssets, searchPacks } from './search'

function buildTextSummary(lines: string[]): string {
  return lines.join('\n')
}

function createAssetMcpServer(env: Env) {
  const server = new McpServer(
    {
      name: getMcpServerName(env),
      version: getMcpServerVersion(env),
    },
    {
      instructions:
        'Use search_assets for candidate discovery, search_packs for pack discovery, get_asset for detail on a selected asset, and get_pack for pack summaries or compact asset lists. Prefer compact searches first and only request full detail for finalists.',
    },
  )

  server.registerTool(
    'search_assets',
    {
      title: 'Search Assets',
      description:
        'Search the open assets catalog using multi-tag filters, kind/format constraints, and free-text query tokens. Returns compact ranked results.',
      inputSchema: z.object({
        query: z.string().optional(),
        kind: z.string().optional(),
        format: z.string().optional(),
        tagsAll: z.array(z.string()).optional(),
        tagsAny: z.array(z.string()).optional(),
        tagsNot: z.array(z.string()).optional(),
        packIds: z.array(z.string()).optional(),
        animated: z.boolean().optional(),
        rigged: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
    async (input) => {
      const results = await searchAssets(env, input)
      return {
        content: [
          {
            type: 'text',
            text: buildTextSummary(
              results.map(
                ({ asset, score }) =>
                  `${asset.id} | ${asset.name} | kind=${asset.kind} | tags=${asset.tags.join(', ')} | score=${score} | publicUrl=${asset.publicUrl ?? 'null'}`,
              ),
            ),
          },
        ],
        structuredContent: {
          resultCount: results.length,
          results,
        },
      }
    },
  )

  server.registerTool(
    'search_packs',
    {
      title: 'Search Packs',
      description: 'Search packs by style/category tags and optional free-text query.',
      inputSchema: z.object({
        query: z.string().optional(),
        tagsAll: z.array(z.string()).optional(),
        tagsAny: z.array(z.string()).optional(),
        tagsNot: z.array(z.string()).optional(),
        creator: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
    async (input) => {
      const results = await searchPacks(env, input)
      return {
        content: [
          {
            type: 'text',
            text: buildTextSummary(
              results.map(({ pack, score }) => `${pack.id} | ${pack.name} | tags=${pack.tags.join(', ')} | score=${score}`),
            ),
          },
        ],
        structuredContent: {
          resultCount: results.length,
          results,
        },
      }
    },
  )

  server.registerTool(
    'get_asset',
    {
      title: 'Get Asset',
      description: 'Get one asset by ID. Use expanded=true only when you need richer raw metadata.',
      inputSchema: z.object({
        assetId: z.string(),
        expanded: z.boolean().optional(),
      }),
    },
    async ({ assetId, expanded }) => {
      const asset = await getAsset(env, assetId, expanded)
      if (!asset) {
        return {
          content: [{ type: 'text', text: `Asset not found: ${assetId}` }],
          structuredContent: { asset: null },
          isError: true,
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(asset, null, 2) }],
        structuredContent: { asset },
      }
    },
  )

  server.registerTool(
    'get_pack',
    {
      title: 'Get Pack',
      description: 'Get one pack by ID, optionally with a compact or expanded asset subset.',
      inputSchema: z.object({
        packId: z.string(),
        includeAssets: z.boolean().optional(),
        expanded: z.boolean().optional(),
        assetLimit: z.number().int().min(1).max(200).optional(),
      }),
    },
    async ({ packId, includeAssets, expanded, assetLimit }) => {
      const pack = await getPack(env, packId, includeAssets, expanded, assetLimit)
      if (!pack) {
        return {
          content: [{ type: 'text', text: `Pack not found: ${packId}` }],
          structuredContent: { pack: null },
          isError: true,
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(pack, null, 2) }],
        structuredContent: pack,
      }
    },
  )

  server.registerTool(
    'resolve_assets_for_intent',
    {
      title: 'Resolve Assets For Intent',
      description:
        'Resolve a gameplay or art intent into ranked catalog candidates. This is a convenience wrapper over search_assets.',
      inputSchema: z.object({
        intent: z.string(),
        query: z.string().optional(),
        kind: z.string().optional(),
        format: z.string().optional(),
        tagsAll: z.array(z.string()).optional(),
        tagsAny: z.array(z.string()).optional(),
        tagsNot: z.array(z.string()).optional(),
        packIds: z.array(z.string()).optional(),
        animated: z.boolean().optional(),
        rigged: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
    async (input) => {
      const result = await resolveAssetsForIntent(env, input)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    },
  )

  server.registerTool(
    'get_catalog_stats',
    {
      title: 'Get Catalog Stats',
      description: 'Return high-level catalog counts.',
      inputSchema: z.object({}),
    },
    async () => {
      const stats = await getCatalogStats(env)
      return {
        content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
        structuredContent: stats,
      }
    },
  )

  server.registerResource(
    'catalog-manifest',
    'open-assets://manifest',
    {
      title: 'Catalog Manifest',
      description: 'Catalog counts and file layout metadata.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(await getManifest(env), null, 2),
        },
      ],
    }),
  )

  server.registerResource(
    'pack-summary',
    new ResourceTemplate('open-assets://packs/{packId}', { list: undefined }),
    {
      title: 'Pack Summary',
      description: 'One pack summary by pack ID.',
      mimeType: 'application/json',
    },
    async (uri, { packId }) => {
      const packs = await getPacks(env)
      const pack = packs.find((entry) => entry.id === packId) ?? null
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(pack, null, 2),
          },
        ],
      }
    },
  )

  return server
}

let runtimePromise: Promise<{
  app: Hono
  transport: WebStandardStreamableHTTPServerTransport
}> | null = null

async function getRuntime(env: Env) {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const server = createAssetMcpServer(env)
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })
      await server.connect(transport)

      const app = createMcpHonoApp({ host: '0.0.0.0' })
      app.all('/mcp', async (c) => {
        const parsedBody = (c as { get(key: string): unknown }).get('parsedBody')
        return transport.handleRequest(c.req.raw, { parsedBody })
      })

      return { app, transport }
    })()
  }

  return runtimePromise
}

export async function createMcpApp(env: Env) {
  const runtime = await getRuntime(env)
  return runtime.app
}
