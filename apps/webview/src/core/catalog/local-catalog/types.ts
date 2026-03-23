import type {UrlRule} from '@project/passmanager'

export type NodeType = 0 | 1 | 2 | 255

export type CatalogJSON = {
  // Compact serialization used by Rust core: i/t/n/s/z/b/m + optional y/l/c
  readonly i: number
  readonly t: NodeType
  readonly n: string
  readonly s: number
  readonly z: number
  readonly b: number
  readonly m: number
  readonly y?: string
  readonly l?: string
  readonly c?: CatalogJSON[]
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

export type CatalogNodeClient = {
  readonly nodeId: number
  readonly nodeType: NodeType
  readonly name: string
  readonly size: number
  readonly modtime: number
  readonly isDir: boolean
  readonly isFile: boolean
  readonly isSymlink: boolean
  readonly path: string
  readonly hasChildren: boolean
  readonly mimeType?: string
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
