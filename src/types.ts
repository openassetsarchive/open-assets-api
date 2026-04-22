export type JsonObject = Record<string, unknown>

export interface CatalogManifest {
  counts: {
    packs: number
    assets: number
    tokens: number
    tags: number
    packTags: number
    kinds: number
    formats: number
  }
  files: {
    packs: string
    allAssets: string
    allAssetsExpanded: string
    assetLocations: string
    packByIdDir: string
    packAssetsDir: string
    packExpandedAssetsDir: string
    packDetailsFile: string
    packExpandedDetailsFile: string
    tokenIndexDir: string
    tokenList: string
    tagIndexDir: string
    tagList: string
    packTagIndexDir: string
    packTagList: string
    kindIndexDir: string
    kindList: string
    formatIndexDir: string
    formatList: string
  }
}

export interface PackSummary {
  id: string
  name: string
  description: string | null
  creator: string | null
  license: string | null
  licenseUrl: string | null
  sourceUrl: string | null
  publicBaseUrl: string | null
  tags: string[]
  generatedAt: string | null
  assetCount: number
  discoveredCount: number | null
  failedCount: number
  sourceRoot?: string | null
}

export interface AssetSummary {
  id: string
  packId: string
  packName: string
  license: string | null
  sourceUrl: string | null
  name: string
  description: string | null
  kind: string | null
  format: string | null
  publicUrl: string | null
  bounds?: {
    size?: [number, number, number]
    diagonal?: number
  } | null
  triangleCount: number | null
  drawCallCount: number | null
  renderVertexCount?: number | null
  materialCount?: number | null
  textureCount?: number | null
  imageWidth?: number | null
  imageHeight?: number | null
  animated?: boolean
  animationCount?: number
  animations?: Array<{ name: string; durationSec: number | null }>
  frameCount?: number | null
  atlasFormat?: string | null
  rigged?: boolean
  skinCount?: number
  jointCountTotal?: number
  requiredExtensions?: string[]
  dependencyMode?: string | null
  tags: string[]
  aliases: string[]
  warningCount?: number
  errorCount?: number
}

export interface AssetLocationEntry {
  packId: string
  detailPath: string
  expandedDetailPath: string
}

export interface AssetLocationsFile {
  version: number
  generatedAt: string
  count: number
  assetsById: Record<string, AssetLocationEntry>
}

export interface PackDetailsFile {
  version: number
  generatedAt: string
  pack: {
    id: string
    name: string
    license: string | null
    licenseUrl: string | null
    sourceUrl: string | null
    tags: string[]
  }
  assetIds: string[]
  assetsById: Record<string, AssetSummary | JsonObject>
}

export interface AssetIdIndexFile {
  version: number
  count: number
  assetIds: string[]
}

export interface PackIdIndexFile {
  version: number
  count: number
  packIds: string[]
}

export interface SearchAssetsInput {
  query?: string
  kind?: string | null
  format?: string | null
  tagsAll?: string[]
  tagsAny?: string[]
  tagsNot?: string[]
  packIds?: string[]
  animated?: boolean | null
  rigged?: boolean | null
  limit?: number | null
  includeReason?: boolean
}

export interface SearchPacksInput {
  query?: string
  tagsAll?: string[]
  tagsAny?: string[]
  tagsNot?: string[]
  creator?: string | null
  limit?: number | null
}

export interface ResolveIntentInput extends SearchAssetsInput {
  intent: string
}

export interface RankedAssetResult {
  asset: AssetSummary
  score: number
  reasons: string[]
}

export interface RankedPackResult {
  pack: PackSummary
  score: number
  reasons: string[]
}
