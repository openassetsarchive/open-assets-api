export function buildRootDocument(origin: string) {
  return {
    service: 'open-assets-api',
    status: 'ok',
    baseUrl: origin,
    docs: {
      human: `${origin}/llms.txt`,
      openapi: `${origin}/openapi.json`,
      health: `${origin}/health`,
      manifest: `${origin}/api/catalog/manifest`,
      mcp: `${origin}/mcp`,
    },
    rest: {
      searchAssets: `${origin}/api/search/assets`,
      searchPacks: `${origin}/api/search/packs`,
      assetById: `${origin}/api/assets/{assetId}`,
      packById: `${origin}/api/packs/{packId}`,
      resolveAssetsForIntent: `${origin}/api/resolve-assets-for-intent`,
    },
    mcp: {
      transport: 'streamable-http',
      endpoint: `${origin}/mcp`,
      toolNames: [
        'search_assets',
        'search_packs',
        'get_asset',
        'get_pack',
        'resolve_assets_for_intent',
        'get_catalog_stats',
      ],
    },
  }
}

export function buildLlmsTxt(origin: string): string {
  return [
    '# Open Assets API',
    '',
    `Base URL: ${origin}`,
    `MCP endpoint: ${origin}/mcp`,
    `OpenAPI: ${origin}/openapi.json`,
    '',
    'This service is a compact query layer over the public open assets catalog.',
    'It supports both plain HTTP JSON endpoints and MCP over Streamable HTTP.',
    '',
    'Recommended usage for agents:',
    `1. Search assets with ${origin}/api/search/assets`,
    `2. Inspect a selected asset with ${origin}/api/assets/{assetId}`,
    `3. Search packs with ${origin}/api/search/packs`,
    `4. Use ${origin}/mcp if your client supports MCP over HTTP`,
    '',
    'Useful endpoints:',
    `- GET ${origin}/health`,
    `- GET ${origin}/api/catalog/manifest`,
    `- GET ${origin}/api/search/assets?kind=model&tagsAll=pirate,stylized&limit=3`,
    `- GET ${origin}/api/search/packs?tagsAll=stylized&query=pirate&limit=3`,
    `- GET ${origin}/api/assets/quaternius-pirate-kit-weapon-cutlass`,
    `- GET ${origin}/api/packs/quaternius-pirate-kit?includeAssets=true&assetLimit=10`,
    `- POST ${origin}/api/resolve-assets-for-intent`,
    '',
    'MCP tools:',
    '- search_assets',
    '- search_packs',
    '- get_asset',
    '- get_pack',
    '- resolve_assets_for_intent',
    '- get_catalog_stats',
    '',
    'Notes:',
    '- Search uses shard indexes and pack bundles, not all-assets.json on the hot path.',
    '- Assets are currently hosted on public release URLs from the catalog source.',
    '- The API is read-only.',
    '',
  ].join('\n')
}

export function buildOpenApiDocument(origin: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Open Assets API',
      version: '0.1.0',
      description:
        'Compact HTTP API for searching and resolving assets from the openassetsarchive catalog. MCP is available separately at /mcp.',
    },
    servers: [{ url: origin }],
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          responses: {
            '200': {
              description: 'Service is healthy',
            },
          },
        },
      },
      '/api/catalog/manifest': {
        get: {
          summary: 'Get catalog manifest',
          responses: {
            '200': {
              description: 'Catalog counts and file layout metadata',
            },
          },
        },
      },
      '/api/search/assets': {
        get: {
          summary: 'Search assets',
          parameters: [
            { name: 'query', in: 'query', schema: { type: 'string' } },
            { name: 'kind', in: 'query', schema: { type: 'string' } },
            { name: 'format', in: 'query', schema: { type: 'string' } },
            { name: 'tagsAll', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
            { name: 'tagsAny', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
            { name: 'tagsNot', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
            { name: 'packIds', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
            { name: 'animated', in: 'query', schema: { type: 'boolean' } },
            { name: 'rigged', in: 'query', schema: { type: 'boolean' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50 } },
          ],
          responses: {
            '200': {
              description: 'Ranked asset results',
            },
          },
        },
      },
      '/api/search/packs': {
        get: {
          summary: 'Search packs',
          parameters: [
            { name: 'query', in: 'query', schema: { type: 'string' } },
            { name: 'creator', in: 'query', schema: { type: 'string' } },
            { name: 'tagsAll', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
            { name: 'tagsAny', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
            { name: 'tagsNot', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50 } },
          ],
          responses: {
            '200': {
              description: 'Ranked pack results',
            },
          },
        },
      },
      '/api/assets/{assetId}': {
        get: {
          summary: 'Get asset by ID',
          parameters: [
            { name: 'assetId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'expanded', in: 'query', schema: { type: 'boolean' } },
          ],
          responses: {
            '200': { description: 'Asset detail' },
            '404': { description: 'Asset not found' },
          },
        },
      },
      '/api/packs/{packId}': {
        get: {
          summary: 'Get pack by ID',
          parameters: [
            { name: 'packId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'includeAssets', in: 'query', schema: { type: 'boolean' } },
            { name: 'expanded', in: 'query', schema: { type: 'boolean' } },
            { name: 'assetLimit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
          ],
          responses: {
            '200': { description: 'Pack detail' },
            '404': { description: 'Pack not found' },
          },
        },
      },
      '/api/resolve-assets-for-intent': {
        post: {
          summary: 'Resolve asset candidates for a gameplay or art intent',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['intent'],
                  properties: {
                    intent: { type: 'string' },
                    query: { type: 'string' },
                    kind: { type: 'string' },
                    format: { type: 'string' },
                    tagsAll: { type: 'array', items: { type: 'string' } },
                    tagsAny: { type: 'array', items: { type: 'string' } },
                    tagsNot: { type: 'array', items: { type: 'string' } },
                    packIds: { type: 'array', items: { type: 'string' } },
                    animated: { type: 'boolean' },
                    rigged: { type: 'boolean' },
                    limit: { type: 'integer', minimum: 1, maximum: 50 },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Ranked intent resolution result',
            },
          },
        },
      },
      '/mcp': {
        post: {
          summary: 'MCP Streamable HTTP endpoint',
          description:
            'Use this if your client supports MCP over HTTP. Initialize first, then use tools/list and tools/call.',
          responses: {
            '200': {
              description: 'MCP response stream',
            },
          },
        },
      },
    },
  }
}
