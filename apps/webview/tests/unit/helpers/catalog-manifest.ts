import type {
  CatalogJSON,
  CatalogShardSummary,
  CatalogSyncManifestResponse,
} from '../../../src/core/catalog/local-catalog/types'
import type {CatalogMirror} from '../../../src/core/catalog/local-catalog/catalog-mirror'

export function catalogDir(input: {
  id: number
  name: string
  children?: CatalogJSON[]
  hasChildren?: boolean
  birthtime?: number
  modtime?: number
}): CatalogJSON {
  return {
    i: input.id,
    t: 0,
    n: input.name,
    s: 0,
    z: 0,
    b: input.birthtime ?? 0,
    m: input.modtime ?? 0,
    ...(input.children !== undefined ? {c: input.children} : {}),
    ...(input.hasChildren ? {h: true} : {}),
  }
}

export function catalogFile(input: {
  id: number
  name: string
  size?: number
  mimeType?: string
  sourceRevision?: number
  mediaInspectedRevision?: number
  mediaInfo?: CatalogJSON['u']
  birthtime?: number
  modtime?: number
}): CatalogJSON {
  return {
    i: input.id,
    t: 1,
    n: input.name,
    s: input.size ?? 0,
    z: 0,
    b: input.birthtime ?? 0,
    m: input.modtime ?? 0,
    ...(input.sourceRevision !== undefined ? {r: input.sourceRevision} : {}),
    ...(input.mediaInspectedRevision !== undefined ? {q: input.mediaInspectedRevision} : {}),
    ...(input.mimeType !== undefined ? {y: input.mimeType} : {}),
    ...(input.mediaInfo !== undefined ? {u: input.mediaInfo} : {}),
  }
}

export function catalogManifest(
  rootSummaries: CatalogJSON[],
  options: {
    rootVersion?: number
    manifestBudgetBytes?: number
    shards?: CatalogShardSummary[]
    eagerData?: CatalogSyncManifestResponse['eager_data']
  } = {},
): CatalogSyncManifestResponse {
  return {
    root_version: options.rootVersion ?? 1,
    format: 'manifest',
    manifest_budget_bytes: options.manifestBudgetBytes ?? 128 * 1024,
    shards: options.shards ?? [],
    root_summaries: rootSummaries,
    eager_data: options.eagerData ?? {},
  }
}

export function applyManifestFixture(
  mirror: CatalogMirror,
  rootSummaries: CatalogJSON[],
  options?: Parameters<typeof catalogManifest>[1],
): void {
  mirror.applyManifest(catalogManifest(rootSummaries, options))
}
