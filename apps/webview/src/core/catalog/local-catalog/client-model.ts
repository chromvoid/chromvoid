import type {CatalogNodeClient} from './types'
import type {FileMediaInfo} from '../media-info'
import {joinPath, normalizePath, splitPath} from './path'

export class ClientCatalogNode {
  readonly nodeId: number
  readonly nodeType: number
  name: string
  size: number
  birthtime: number
  modtime: number
  readonly path: string
  readonly isDir: boolean
  readonly isFile: boolean
  readonly isSymlink: boolean
  readonly hasChildren: boolean
  readonly deferredChildren: boolean
  readonly sourceRevision?: number
  readonly mediaInspectedRevision?: number
  readonly mimeType?: string
  readonly mediaInfo?: FileMediaInfo | null

  constructor(data: CatalogNodeClient) {
    this.nodeId = data.nodeId
    this.nodeType = data.nodeType
    this.name = data.name
    this.size = data.size
    this.birthtime = data.birthtime ?? data.modtime
    this.modtime = data.modtime
    this.path = normalizePath(data.path)
    this.isDir = data.isDir
    this.isFile = data.isFile
    this.isSymlink = data.isSymlink
    this.hasChildren = data.hasChildren
    this.deferredChildren = data.deferredChildren ?? false
    this.sourceRevision = data.sourceRevision
    this.mediaInspectedRevision = data.mediaInspectedRevision
    this.mimeType = (data as unknown as {mimeType?: string}).mimeType
    this.mediaInfo = data.mediaInfo ?? null
  }

  get parentPath(): string | null {
    const parts = splitPath(this.path)
    if (parts.length === 0) return null
    return parts.length === 1 ? '/' : joinPath(...parts.slice(0, parts.length - 1))
  }
}
