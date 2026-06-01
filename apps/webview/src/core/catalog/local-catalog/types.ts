import type {UrlRule} from '@project/passmanager/types'
import type {CompactFileMediaInfo, FileMediaInfo} from '../media-info'

export type NodeType = 0 | 1 | 2 | 255

export type CatalogJSON = {
  // Compact serialization used by Rust core: i/t/n/s/z/b/m + optional y/u/l/c
  readonly i: number
  readonly t: NodeType
  readonly n: string
  readonly s: number
  readonly z: number
  readonly b: number
  readonly m: number
  readonly r?: number
  readonly q?: number
  readonly y?: string
  readonly u?: CompactFileMediaInfo | null
  readonly l?: string
  readonly c?: CatalogJSON[]
  readonly h?: boolean
}

export const CATALOG_MANIFEST_BUDGET_BYTES = 128 * 1024
export const CATALOG_FOLDER_PAGE_DEFAULT_ITEMS = 200
export const CATALOG_FOLDER_PAGE_MAX_ITEMS = 500
export const CATALOG_FOLDER_BATCH_MAX_PAGES = 4
export const CATALOG_FOLDER_BATCH_MAX_ITEMS = 1000
export const CATALOG_FOLDER_BATCH_SOFT_BYTES = 512 * 1024

export type CatalogShardSummary = {
  readonly shard_id: string
  readonly version: number
  readonly size: number
  readonly node_count: number
  readonly strategy: string
  readonly has_deltas: boolean
  readonly loaded: boolean
}

export type CatalogSyncManifestResponse = {
  readonly root_version: number
  readonly format: 'manifest' | string
  readonly manifest_budget_bytes: number
  readonly shards: CatalogShardSummary[]
  readonly root_summaries: CatalogJSON[]
  readonly eager_data: Record<string, {version: number; root: CatalogJSON}>
}

export type CatalogFolderSort = {
  readonly by: 'name' | 'size' | 'date' | 'type' | string
  readonly direction: 'asc' | 'desc' | string
}

export type CatalogFolderFilter = {
  readonly query?: string | null
  readonly include_hidden?: boolean | null
  readonly file_types?: string[]
}

export type CatalogFolderPageRequest = {
  readonly path: string
  readonly offset: number
  readonly limit?: number | null
  readonly expected_version?: number | null
  readonly sort?: CatalogFolderSort | null
  readonly filter?: CatalogFolderFilter | null
}

export type CatalogFolderListItem = {
  readonly node_id: number
  readonly name: string
  readonly is_dir: boolean
  readonly size?: number | null
  readonly mime_type?: string | null
  readonly media_info?: FileMediaInfo | null
  readonly media_inspected_revision: number
  readonly created_at: number
  readonly updated_at: number
}

export type CatalogFolderPageResponse = {
  readonly current_path: string
  readonly version: number
  readonly total_count: number
  readonly offset: number
  readonly limit: number
  readonly next_offset?: number | null
  readonly reload_required: boolean
  readonly items: CatalogFolderListItem[]
}

export type CatalogFolderBatchResponse = {
  readonly pages: CatalogFolderPageResponse[]
  readonly truncated: boolean
  readonly warnings?: unknown[]
}

export type CatalogNotesListItem = {
  readonly node_id: number
  readonly name: string
  readonly path: string
  readonly parent_path: string
  readonly size: number
  readonly mime_type?: string | null
  readonly source_revision: number
  readonly created_at: number
  readonly updated_at: number
}

export type CatalogNotesListResponse = {
  readonly version: number
  readonly items: CatalogNotesListItem[]
}

export type CatalogFolderLoadedRange = {
  readonly offset: number
  readonly limit: number
}

export type CatalogFolderState = {
  readonly path: string
  readonly version: number
  readonly totalCount: number
  readonly queryKey: string
  readonly loadedRanges: CatalogFolderLoadedRange[]
  readonly loadingRanges: CatalogFolderLoadedRange[]
  readonly error?: string | null
}

export enum CatalogEventType {
  NODE_CREATED = 'node_created',
  NODE_UPDATED = 'node_updated',
  NODE_DELETED = 'node_deleted',
  NODE_MOVED = 'node_moved',
  NODE_RENAMED = 'node_renamed',
  BATCH_OPERATION_START = 'batch_operation_start',
  BATCH_OPERATION_END = 'batch_operation_end',
  CATALOG_SAVED = 'catalog_saved',
  CATALOG_LOADED = 'catalog_loaded',
}

export type CatalogEvent = {
  readonly type: CatalogEventType
  readonly nodeId: number
  readonly timestamp: number
  readonly version: number
  readonly metadata?: Record<string, unknown>
}

export type CatalogEventBatch = {
  readonly events: CatalogEvent[]
}

export type CatalogNodeClient = {
  readonly nodeId: number
  readonly nodeType: NodeType
  readonly name: string
  readonly size: number
  readonly birthtime?: number
  readonly modtime: number
  readonly isDir: boolean
  readonly isFile: boolean
  readonly isSymlink: boolean
  readonly path: string
  readonly hasChildren: boolean
  readonly deferredChildren?: boolean
  readonly sourceRevision?: number
  readonly mediaInspectedRevision?: number
  readonly mimeType?: string
  readonly mediaInfo?: FileMediaInfo | null
}

export type SerializationResult = {
  readonly header: {
    readonly version: number
    readonly compression: 'none' | 'gzip' | 'brotli'
    readonly checksum: string
    readonly timestamp: number
  }
  readonly data:
    | CatalogJSON
    | {
        readonly changed: CatalogJSON[]
        readonly deleted: number[]
      }
  readonly isIncremental: boolean
}

export type PassMeta = {
  id?: string
  title?: string
  urls?: UrlRule[]
  username?: string
  otps?: Array<{
    id?: string
    label?: string
    algorithm?: string
    digits?: number
    period?: number
    encoding?: 'base32' | 'base64' | 'hex'
  }>
  attachments?: string[]
  [key: string]: unknown
}
