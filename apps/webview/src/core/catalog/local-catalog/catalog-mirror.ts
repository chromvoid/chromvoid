import {ClientCatalogNode} from './client-model'
import type {CatalogEvent, CatalogJSON, CatalogNodeClient, NodeType} from './types'
import {CatalogEventType} from './types'
import {joinPath, normalizePath} from './path'

export interface CatalogMirrorApi {
  applySnapshot(snapshot: {header?: unknown; data: CatalogJSON} | {root: ClientCatalogNode; nodes: ClientCatalogNode[]}): void
  applyEvent(event: CatalogEvent): void
  getNode(id: number): ClientCatalogNode | undefined
  getChildren(pathOrId: string | number | null): ClientCatalogNode[]
  getPath(id: number): string
  findByPath(path: string): ClientCatalogNode | undefined
  subscribe(listener: () => void): () => void
}

export class CatalogMirror implements CatalogMirrorApi {
  private byId = new Map<number, ClientCatalogNode>()
  private idsByPath = new Map<string, number>()
  private childrenByPath = new Map<string, number[]>()
  private listeners = new Set<() => void>()

  private deleteSubtree(nodeId: number): void {
    const node = this.byId.get(nodeId)
    if (!node) return

    const path = node.path

    // Delete descendants first.
    const childIds = this.childrenByPath.get(path) ?? []
    for (const id of [...childIds]) {
      this.deleteSubtree(id)
    }
    this.childrenByPath.delete(path)

    // Detach from parent.
    const parent = node.parentPath ?? '/'
    const siblings = this.childrenByPath.get(parent) ?? []
    this.childrenByPath.set(
      parent,
      siblings.filter((id) => id !== nodeId),
    )

    // Remove node itself.
    this.byId.delete(nodeId)
    this.idsByPath.delete(path)
  }

  applySnapshot(snapshot: {header?: unknown; data: CatalogJSON} | {root: ClientCatalogNode; nodes: ClientCatalogNode[]}): void {
    this.byId.clear()
    this.idsByPath.clear()
    this.childrenByPath.clear()

    if ('data' in snapshot) {
      this.buildFromCatalogJSON(snapshot.data, '')
    } else {
      const rootPath = snapshot.root.path
      this.upsert(snapshot.root)
      this.childrenByPath.set(normalizePath(rootPath), [])
      for (const n of snapshot.nodes) this.upsert(n)
    }

    this.emit()
  }

  applyEvent(event: CatalogEvent): void {
    const type = event.type
    const md = (event.metadata ?? {}) as Record<string, unknown>
    switch (type) {
      case CatalogEventType.NODE_CREATED: {
        const parentId = md['parentId'] as number | null | undefined
        const name = String(md['name'] ?? '')
        const explicitParentPath = (md['parentPath'] as string | undefined) || undefined
        const parentPath = explicitParentPath ?? (parentId ? this.getPath(parentId) : '/')
        const path = normalizePath(joinPath(parentPath, name))
        const t = (md['type'] as NodeType | number | undefined) ?? 0
        const node: CatalogNodeClient = {
          nodeId: event.nodeId,
          nodeType: (typeof t === 'number' ? (t as NodeType) : (t as NodeType)) ?? (0 as NodeType),
          name,
          size: (md['size'] as number) ?? 0,
          modtime: Date.now(),
          isDir: t === 0 || t === 255,
          isFile: t === 1,
          isSymlink: t === 2,
          path,
          hasChildren: Boolean(md['deferredContent']) || false,
          mimeType: (md['mimeType'] as string) || undefined,
        }
        this.upsert(new ClientCatalogNode(node))
        this.emit()
        break
      }
      case CatalogEventType.NODE_MOVED: {
        const oldParentId = md['oldParentId'] as number | null
        const newParentId = md['newParentId'] as number | null
        const newName = md['newName'] as string | undefined
        const node = this.byId.get(event.nodeId)
        if (!node) break
        const oldParentPath = oldParentId ? this.getPath(oldParentId) : (node.parentPath ?? '/')
        const newParentPath = newParentId ? this.getPath(newParentId) : '/'
        const nextName = newName ?? node.name
        const newPath = normalizePath(joinPath(newParentPath, nextName))
        this.idsByPath.delete(node.path)
        ;(node as unknown as {name: string}).name = nextName
        ;(node as unknown as {path: string}).path = newPath
        this.idsByPath.set((node as unknown as {path: string}).path, node.nodeId)
        const oldChildren = this.childrenByPath.get(oldParentPath) ?? []
        this.childrenByPath.set(
          oldParentPath,
          oldChildren.filter((id) => id !== node.nodeId),
        )
        const newChildren = this.childrenByPath.get(newParentPath) ?? []
        if (!newChildren.includes(node.nodeId)) newChildren.push(node.nodeId)
        this.childrenByPath.set(newParentPath, newChildren)
        this.emit()
        break
      }
      case CatalogEventType.NODE_RENAMED: {
        const newName = String(md['newName'] ?? '')
        const node = this.byId.get(event.nodeId)
        if (!node) break
        const parent = node.parentPath ?? '/'
        const newPath = normalizePath(joinPath(parent, newName))
        this.idsByPath.delete(node.path)
        ;(node as unknown as {name: string}).name = newName
        ;(node as unknown as {path: string}).path = newPath
        this.idsByPath.set(newPath, node.nodeId)
        this.emit()
        break
      }
      case CatalogEventType.NODE_UPDATED: {
        const node = this.byId.get(event.nodeId)
        if (!node) break
        const size = md['size'] as number | undefined
        const mime = md['mime'] as string | undefined
        const modtime = md['modtime'] as number | undefined
        if (size !== undefined) (node as unknown as {size: number}).size = size
        if (mime !== undefined) (node as unknown as {mimeType?: string}).mimeType = mime
        if (modtime !== undefined) (node as unknown as {modtime: number}).modtime = modtime
        this.emit()
        break
      }
      case CatalogEventType.NODE_DELETED: {
        this.deleteSubtree(event.nodeId)
        this.emit()
        break
      }
    }
  }

  getNode(id: number): ClientCatalogNode | undefined {
    return this.byId.get(id)
  }

  getChildren(pathOrId: string | number | null): ClientCatalogNode[] {
    const path = typeof pathOrId === 'number' ? this.getPath(pathOrId) : (pathOrId ?? '/')
    const ids = this.childrenByPath.get(normalizePath(path)) ?? []
    return ids.map((id) => this.byId.get(id)!).filter(Boolean)
  }

  getPath(id: number): string {
    const n = this.byId.get(id)
    if (!n) return '/'
    return n.path
  }

  findByPath(path: string): ClientCatalogNode | undefined {
    const normalized = normalizePath(path)
    const id = this.idsByPath.get(normalized)
    return id !== undefined ? this.byId.get(id) : undefined
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const l of this.listeners) l()
  }

  private upsert(nodeLike: ClientCatalogNode | CatalogNodeClient): ClientCatalogNode {
    const node = nodeLike instanceof ClientCatalogNode ? nodeLike : new ClientCatalogNode(nodeLike)
    this.byId.set(node.nodeId, node)
    this.idsByPath.set(node.path, node.nodeId)
    const parent = node.parentPath ?? '/'
    if (!this.childrenByPath.has(parent)) this.childrenByPath.set(parent, [])
    const list = this.childrenByPath.get(parent)!
    if (!list.includes(node.nodeId)) list.push(node.nodeId)
    return node
  }

  private buildFromCatalogJSON(node: CatalogJSON, parentPath: string): void {
    const isDir = node.t === 0 || node.t === 255
    const name = node.n
    const path = parentPath === '' ? '/' : normalizePath(joinPath(parentPath, name))
    const client: CatalogNodeClient = {
      nodeId: node.i,
      nodeType: node.t,
      name,
      size: node.s,
      modtime: node.m,
      isDir,
      isFile: node.t === 1,
      isSymlink: node.t === 2,
      path,
      hasChildren: Array.isArray(node.c) && node.c.length > 0,
      mimeType: node.y,
    }
    this.upsert(client)
    if (node.c && isDir) {
      for (const child of node.c) this.buildFromCatalogJSON(child, path)
    }
  }
}
