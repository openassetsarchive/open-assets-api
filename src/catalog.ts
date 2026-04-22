import {
  type AssetIdIndexFile,
  type AssetLocationsFile,
  type AssetSummary,
  type CatalogManifest,
  type PackDetailsFile,
  type PackIdIndexFile,
  type PackSummary,
} from './types'
import { getCatalogBaseUrl, getCatalogFetchTtlSeconds } from './config'

type MemoryEntry = {
  expiresAt: number
  value: unknown
}

const memoryCache = new Map<string, MemoryEntry>()
const inflightCache = new Map<string, Promise<unknown>>()

function now() {
  return Date.now()
}

function getFromMemory<T>(key: string): T | null {
  const entry = memoryCache.get(key)
  if (!entry) {
    return null
  }
  if (entry.expiresAt < now()) {
    memoryCache.delete(key)
    return null
  }
  return entry.value as T
}

function setInMemory<T>(key: string, value: T, ttlSeconds: number) {
  memoryCache.set(key, {
    value,
    expiresAt: now() + ttlSeconds * 1000,
  })
}

async function readJsonFromR2<T>(bucket: R2Bucket, path: string): Promise<T> {
  const object = await bucket.get(path)
  if (!object) {
    throw new Error(`Catalog object not found in R2: ${path}`)
  }
  return JSON.parse(await object.text()) as T
}

async function readJsonFromHttp<T>(env: Env, path: string): Promise<T> {
  const baseUrl = getCatalogBaseUrl(env).replace(/\/+$/u, '')
  const url = `${baseUrl}/${path.replace(/^\/+/u, '')}`
  const response = await fetch(url, {
    cf: {
      cacheEverything: true,
      cacheTtl: getCatalogFetchTtlSeconds(env),
    },
  })

  if (!response.ok) {
    throw new Error(`Catalog fetch failed (${response.status}) for ${url}`)
  }

  return (await response.json()) as T
}

export async function getCatalogJson<T>(env: Env, path: string): Promise<T> {
  const cacheKey = `catalog:${path}`
  const cached = getFromMemory<T>(cacheKey)
  if (cached) {
    return cached
  }

  const inflight = inflightCache.get(cacheKey)
  if (inflight) {
    return (await inflight) as T
  }

  const promise = (async () => {
    const value = env.CATALOG_BUCKET
      ? await readJsonFromR2<T>(env.CATALOG_BUCKET, path)
      : await readJsonFromHttp<T>(env, path)

    setInMemory(cacheKey, value, getCatalogFetchTtlSeconds(env))
    return value
  })()

  inflightCache.set(cacheKey, promise)

  try {
    return (await promise) as T
  } finally {
    inflightCache.delete(cacheKey)
  }
}

export function derivePackPath(filePattern: string, packId: string): string {
  return filePattern.replace('<packId>', packId)
}

export async function getManifest(env: Env): Promise<CatalogManifest> {
  return getCatalogJson<CatalogManifest>(env, 'manifest.json')
}

export async function getPacks(env: Env): Promise<PackSummary[]> {
  const manifest = await getManifest(env)
  return getCatalogJson<PackSummary[]>(env, manifest.files.packs)
}

export async function getAssetLocations(env: Env): Promise<AssetLocationsFile> {
  const manifest = await getManifest(env)
  return getCatalogJson<AssetLocationsFile>(env, manifest.files.assetLocations)
}

export async function getPackDetails(env: Env, packId: string, expanded = false): Promise<PackDetailsFile> {
  const manifest = await getManifest(env)
  const path = expanded
    ? derivePackPath(manifest.files.packExpandedDetailsFile, packId)
    : derivePackPath(manifest.files.packDetailsFile, packId)

  return getCatalogJson<PackDetailsFile>(env, path)
}

export async function getPackAssetSummaries(env: Env, packId: string, expanded = false): Promise<AssetSummary[]> {
  const manifest = await getManifest(env)
  const path = expanded
    ? derivePackPath(manifest.files.packExpandedAssetsDir, packId)
    : derivePackPath(manifest.files.packAssetsDir, packId)

  return getCatalogJson<AssetSummary[]>(env, path)
}

export async function getTagIndex(env: Env, tag: string): Promise<AssetIdIndexFile> {
  return getCatalogJson<AssetIdIndexFile>(env, `search/tags/${tag}.json`)
}

export async function getTokenIndex(env: Env, token: string): Promise<AssetIdIndexFile> {
  return getCatalogJson<AssetIdIndexFile>(env, `search/tokens/${token}.json`)
}

export async function getKindIndex(env: Env, kind: string): Promise<AssetIdIndexFile> {
  return getCatalogJson<AssetIdIndexFile>(env, `search/kinds/${kind}.json`)
}

export async function getFormatIndex(env: Env, format: string): Promise<AssetIdIndexFile> {
  return getCatalogJson<AssetIdIndexFile>(env, `search/formats/${format}.json`)
}

export async function getPackTagIndex(env: Env, tag: string): Promise<PackIdIndexFile> {
  return getCatalogJson<PackIdIndexFile>(env, `search/pack-tags/${tag}.json`)
}
