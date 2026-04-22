export const DEFAULT_CATALOG_BASE_URL = 'https://raw.githubusercontent.com/openassetsarchive/open-assets/main'

export function getCatalogBaseUrl(env: Env): string {
  return env.CATALOG_BASE_URL?.trim() || DEFAULT_CATALOG_BASE_URL
}

export function getNumberEnv(envValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(envValue ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getCatalogFetchTtlSeconds(env: Env): number {
  return getNumberEnv(env.CATALOG_FETCH_TTL_SECONDS, 3600)
}

export function getQueryCacheTtlSeconds(env: Env): number {
  return getNumberEnv(env.QUERY_CACHE_TTL_SECONDS, 300)
}

export function getDefaultSearchLimit(env: Env): number {
  return getNumberEnv(env.DEFAULT_SEARCH_LIMIT, 12)
}

export function getMaxSearchLimit(env: Env): number {
  return getNumberEnv(env.MAX_SEARCH_LIMIT, 50)
}

export function getMcpServerName(env: Env): string {
  return env.MCP_SERVER_NAME?.trim() || 'open-assets'
}

export function getMcpServerVersion(env: Env): string {
  return env.MCP_SERVER_VERSION?.trim() || '0.1.0'
}
