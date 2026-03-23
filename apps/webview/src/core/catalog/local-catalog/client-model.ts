import type {CatalogNodeClient} from './types'
import {joinPath, normalizePath, splitPath} from './path'

export class ClientCatalogNode {
  readonly nodeId: number
  readonly nodeType: number
  name: string
  size: number
  modtime: number
  readonly path: string
  readonly isDir: boolean
  readonly isFile: boolean
  readonly isSymlink: boolean
  readonly hasChildren: boolean
  readonly mimeType?: string

  constructor(data: CatalogNodeClient) {
    this.nodeId = data.nodeId
    this.nodeType = data.nodeType
    this.name = data.name
    this.size = data.size
    this.modtime = data.modtime
    this.path = normalizePath(data.path)
    this.isDir = data.isDir
    this.isFile = data.isFile
    this.isSymlink = data.isSymlink
    this.hasChildren = data.hasChildren
    this.mimeType = (data as unknown as {mimeType?: string}).mimeType
  }

  get parentPath(): string | null {
    const parts = splitPath(this.path)
    if (parts.length === 0) return null
    return parts.length === 1 ? '/' : joinPath(...parts.slice(0, parts.length - 1))
  }
}
