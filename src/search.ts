import {
  getAssetLocations,
  getFormatIndex,
  getKindIndex,
  getManifest,
  getPackAssetSummaries,
  getPackDetails,
  getPackTagIndex,
  getPacks,
  getTagIndex,
  getTokenIndex,
} from './catalog'
import {
  type AssetSummary,
  type PackSummary,
  type RankedAssetResult,
  type RankedPackResult,
  type ResolveIntentInput,
  type SearchAssetsInput,
  type SearchPacksInput,
} from './types'
import { compareStrings, normalizeToken, tokenizeQuery, uniq } from './utils'

function intersectSets(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) {
    return new Set()
  }

  const [first, ...rest] = sets.sort((a, b) => a.size - b.size)
  const result = new Set<string>()

  for (const value of first) {
    if (rest.every((set) => set.has(value))) {
      result.add(value)
    }
  }

  return result
}

function unionSets(sets: Set<string>[]): Set<string> {
  const result = new Set<string>()
  for (const set of sets) {
    for (const value of set) {
      result.add(value)
    }
  }
  return result
}

function subtractSet(source: Set<string>, blocked: Set<string>): Set<string> {
  const result = new Set<string>()
  for (const value of source) {
    if (!blocked.has(value)) {
      result.add(value)
    }
  }
  return result
}

function scoreAsset(
  asset: AssetSummary,
  input: SearchAssetsInput,
  queryTokens: string[],
  packHaystack = '',
): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []
  const haystack = `${packHaystack} ${asset.packName} ${asset.name} ${asset.description ?? ''} ${(asset.tags ?? []).join(' ')} ${(asset.aliases ?? []).join(' ')}`.toLowerCase()

  for (const tag of input.tagsAll ?? []) {
    if (asset.tags.includes(tag)) {
      score += 5
      reasons.push(`matched required tag "${tag}"`)
    }
  }

  for (const tag of input.tagsAny ?? []) {
    if (asset.tags.includes(tag)) {
      score += 3
      reasons.push(`matched optional tag "${tag}"`)
    }
  }

  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += 2
      reasons.push(`matched query token "${token}"`)
    }
  }

  if (input.kind && asset.kind === input.kind) {
    score += 2
    reasons.push(`kind "${input.kind}"`)
  }

  if (input.format && asset.format === input.format) {
    score += 1
    reasons.push(`format "${input.format}"`)
  }

  if (input.animated === true && asset.animated) {
    score += 1
    reasons.push('animated')
  }

  if (input.rigged === true && asset.rigged) {
    score += 1
    reasons.push('rigged')
  }

  return { score, reasons: uniq(reasons) }
}

function scorePack(pack: PackSummary, input: SearchPacksInput, queryTokens: string[]): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []
  const haystack = `${pack.name} ${pack.description ?? ''} ${pack.tags.join(' ')}`.toLowerCase()

  for (const tag of input.tagsAll ?? []) {
    if (pack.tags.includes(tag)) {
      score += 5
      reasons.push(`matched required tag "${tag}"`)
    }
  }

  for (const tag of input.tagsAny ?? []) {
    if (pack.tags.includes(tag)) {
      score += 3
      reasons.push(`matched optional tag "${tag}"`)
    }
  }

  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += 2
      reasons.push(`matched query token "${token}"`)
    }
  }

  if (input.creator && pack.creator?.toLowerCase() === input.creator.toLowerCase()) {
    score += 2
    reasons.push(`creator "${input.creator}"`)
  }

  return { score, reasons: uniq(reasons) }
}

function assetMatchesPostFilters(asset: AssetSummary, input: SearchAssetsInput): boolean {
  if (input.packIds && input.packIds.length > 0 && !input.packIds.includes(asset.packId)) {
    return false
  }

  if (input.tagsNot && input.tagsNot.some((tag) => asset.tags.includes(tag))) {
    return false
  }

  if (input.animated != null && Boolean(asset.animated) !== input.animated) {
    return false
  }

  if (input.rigged != null && Boolean(asset.rigged) !== input.rigged) {
    return false
  }

  return true
}

export async function searchAssets(env: Env, input: SearchAssetsInput): Promise<RankedAssetResult[]> {
  const queryTokens = tokenizeQuery(input.query)
  const tagsAll = (input.tagsAll ?? []).map(normalizeToken)
  const tagsAny = (input.tagsAny ?? []).map(normalizeToken)
  const tagsNot = (input.tagsNot ?? []).map(normalizeToken)
  const packIds = (input.packIds ?? []).map(normalizeToken)
  const limit = input.limit ?? 12
  let locations: Awaited<ReturnType<typeof getAssetLocations>> | null = null
  let packHaystacksById: Map<string, string> | null = null

  const requiredSets: Set<string>[] = []

  for (const tag of tagsAll) {
    const row = await getTagIndex(env, tag).catch(() => null)
    if (!row) {
      return []
    }
    requiredSets.push(new Set(row.assetIds))
  }

  if (queryTokens.length > 0) {
    const tokenSets: Set<string>[] = []

    for (const token of queryTokens) {
      const row = await getTokenIndex(env, token).catch(() => null)
      if (row) {
        tokenSets.push(new Set(row.assetIds))
      }
    }

    const packs = await getPacks(env)
    packHaystacksById = new Map<string, string>()
    const matchingPackIds = new Set<string>()
    for (const pack of packs) {
      const haystack = `${pack.name} ${pack.description ?? ''} ${pack.tags.join(' ')}`.toLowerCase()
      packHaystacksById.set(pack.id, haystack)
      if (queryTokens.some((token) => haystack.includes(token))) {
        matchingPackIds.add(pack.id)
      }
    }

    if (matchingPackIds.size > 0) {
      locations = locations ?? await getAssetLocations(env)
      tokenSets.push(
        new Set(
          Object.entries(locations.assetsById)
            .filter(([, location]) => matchingPackIds.has(location.packId))
            .map(([assetId]) => assetId),
        ),
      )
    }

    const queryCandidateIds = unionSets(tokenSets)
    if (queryCandidateIds.size === 0) {
      return []
    }
    requiredSets.push(queryCandidateIds)
  }

  if (input.kind) {
    const row = await getKindIndex(env, normalizeToken(input.kind)).catch(() => null)
    if (!row) {
      return []
    }
    requiredSets.push(new Set(row.assetIds))
  }

  if (input.format) {
    const row = await getFormatIndex(env, normalizeToken(input.format)).catch(() => null)
    if (!row) {
      return []
    }
    requiredSets.push(new Set(row.assetIds))
  }

  if (packIds.length > 0) {
    locations = await getAssetLocations(env)
    requiredSets.push(
      new Set(
        Object.entries(locations.assetsById)
          .filter(([, location]) => packIds.includes(location.packId))
          .map(([assetId]) => assetId),
      ),
    )
  }

  let candidateIds = requiredSets.length > 0 ? intersectSets(requiredSets) : new Set<string>()

  if (tagsAny.length > 0) {
    const optionalSets = (
      await Promise.all(tagsAny.map((tag) => getTagIndex(env, tag).catch(() => null)))
    )
      .filter(Boolean)
      .map((row) => new Set(row!.assetIds))

    const optionalUnion = unionSets(optionalSets)
    candidateIds = requiredSets.length > 0 ? intersectSets([candidateIds, optionalUnion]) : optionalUnion
  }

  if (candidateIds.size === 0) {
    if (requiredSets.length === 0 && tagsAny.length === 0) {
      throw new Error('At least one search constraint is required.')
    }
    return []
  }

  if (tagsNot.length > 0) {
    const blockedSets = (
      await Promise.all(tagsNot.map((tag) => getTagIndex(env, tag).catch(() => null)))
    )
      .filter(Boolean)
      .map((row) => new Set(row!.assetIds))

    candidateIds = subtractSet(candidateIds, unionSets(blockedSets))
  }

  locations = locations ?? await getAssetLocations(env)
  const packToAssetIds = new Map<string, string[]>()

  for (const assetId of candidateIds) {
    const location = locations.assetsById[assetId]
    if (!location) {
      continue
    }
    const ids = packToAssetIds.get(location.packId) ?? []
    ids.push(assetId)
    packToAssetIds.set(location.packId, ids)
  }

  const candidatePackIds = Array.from(packToAssetIds.keys()).sort(compareStrings)
  const assetBundles = await Promise.all(candidatePackIds.map((packId) => getPackAssetSummaries(env, packId)))

  const summariesById = new Map<string, AssetSummary>()
  for (const bundle of assetBundles) {
    for (const asset of bundle) {
      summariesById.set(asset.id, asset)
    }
  }

  const ranked: RankedAssetResult[] = []
  for (const assetId of candidateIds) {
    const asset = summariesById.get(assetId)
    if (!asset) {
      continue
    }
    if (!assetMatchesPostFilters(asset, { ...input, tagsNot, packIds })) {
      continue
    }
    const { score, reasons } = scoreAsset(
      asset,
      { ...input, tagsAll, tagsAny, tagsNot, packIds },
      queryTokens,
      packHaystacksById?.get(asset.packId),
    )
    ranked.push({ asset, score, reasons })
  }

  ranked.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }
    return compareStrings(left.asset.id, right.asset.id)
  })

  return ranked.slice(0, limit)
}

export async function searchPacks(env: Env, input: SearchPacksInput): Promise<RankedPackResult[]> {
  const queryTokens = tokenizeQuery(input.query)
  const tagsAll = (input.tagsAll ?? []).map(normalizeToken)
  const tagsAny = (input.tagsAny ?? []).map(normalizeToken)
  const tagsNot = (input.tagsNot ?? []).map(normalizeToken)
  const limit = input.limit ?? 12

  const requiredSets: Set<string>[] = []

  for (const tag of tagsAll) {
    const row = await getPackTagIndex(env, tag).catch(() => null)
    if (!row) {
      return []
    }
    requiredSets.push(new Set(row.packIds))
  }

  let candidateIds = requiredSets.length > 0 ? intersectSets(requiredSets) : new Set<string>()

  if (tagsAny.length > 0) {
    const optionalSets = (
      await Promise.all(tagsAny.map((tag) => getPackTagIndex(env, tag).catch(() => null)))
    )
      .filter(Boolean)
      .map((row) => new Set(row!.packIds))

    const optionalUnion = unionSets(optionalSets)
    candidateIds = candidateIds.size > 0 ? intersectSets([candidateIds, optionalUnion]) : optionalUnion
  }

  const packs = await getPacks(env)

  const pool =
    candidateIds.size > 0
      ? packs.filter((pack) => candidateIds.has(pack.id))
      : packs

  const ranked = pool
    .filter((pack) => {
      if (queryTokens.length === 0) {
        return true
      }
      const haystack = `${pack.name} ${pack.description ?? ''} ${pack.tags.join(' ')}`.toLowerCase()
      return queryTokens.some((token) => haystack.includes(token))
    })
    .filter((pack) => !tagsNot.some((tag) => pack.tags.includes(tag)))
    .filter((pack) => !input.creator || pack.creator?.toLowerCase() === input.creator.toLowerCase())
    .map((pack) => {
      const { score, reasons } = scorePack(pack, { ...input, tagsAll, tagsAny, tagsNot }, queryTokens)
      return { pack, score, reasons }
    })
    .filter((row) => {
      if (queryTokens.length === 0 && tagsAll.length === 0 && tagsAny.length === 0 && !input.creator) {
        return true
      }
      return row.score > 0
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return compareStrings(left.pack.id, right.pack.id)
    })

  return ranked.slice(0, limit)
}

export async function getAsset(env: Env, assetId: string, expanded = false): Promise<unknown | null> {
  const locations = await getAssetLocations(env)
  const location = locations.assetsById[assetId]
  if (!location) {
    return null
  }

  const details = await getPackDetails(env, location.packId, expanded)
  return details.assetsById[assetId] ?? null
}

export async function getPack(env: Env, packId: string, includeAssets = false, expanded = false, assetLimit?: number) {
  const packs = await getPacks(env)
  const pack = packs.find((entry) => entry.id === packId) ?? null
  if (!pack) {
    return null
  }

  if (!includeAssets) {
    return { pack }
  }

  const bundle = expanded ? await getPackDetails(env, packId, true) : await getPackAssetSummaries(env, packId, false)
  if (Array.isArray(bundle)) {
    return {
      pack,
      assets: typeof assetLimit === 'number' ? bundle.slice(0, assetLimit) : bundle,
    }
  }

  const ids = typeof assetLimit === 'number' ? bundle.assetIds.slice(0, assetLimit) : bundle.assetIds
  const assets = ids.map((id) => bundle.assetsById[id]).filter(Boolean)
  return { pack, assets }
}

export async function resolveAssetsForIntent(env: Env, input: ResolveIntentInput) {
  const query = [input.intent, input.query].filter(Boolean).join(' ').trim()
  const results = await searchAssets(env, {
    ...input,
    query,
    includeReason: true,
  })

  return {
    intent: input.intent,
    query,
    resultCount: results.length,
    results,
  }
}

export async function getCatalogStats(env: Env) {
  const manifest = await getManifest(env)
  return manifest.counts
}
