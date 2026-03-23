import {state} from '@statx/core'

import type {TransportEventHandler, TransportLike} from '../transport'
import {
  CatalogEventType,
  type CatalogEvent,
  type CatalogJSON,
  type NodeType,
} from '../../catalog/local-catalog/types'
import {normalizePath, splitPath} from '../../catalog/local-catalog/path'

type HandlerSet = Set<TransportEventHandler>

type Ok<T> = {ok: true; result: T}

type Err = {ok: false; error: string}

type MockNode = {
  id: number
  type: NodeType
  name: string
  size: number
  modtime: number
  parentId: number | null
  children: number[]
  mimeType?: string
}

function ok<T>(result: T): Ok<T> {
  return {ok: true, result}
}

function err(message: string): Err {
  return {ok: false, error: message}
}

function toStringValue(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function toBooleanValue(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

function toNumberValue(v: unknown): number | undefined {
  if (typeof v !== 'number') return undefined
  if (!Number.isFinite(v)) return undefined
  return v
}

function toOptionalString(v: unknown): string | undefined {
  const s = toStringValue(v)
  return s && s.length > 0 ? s : undefined
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

type PersistedState = {
  version: 1
  nextId: number
  nodes: [number, MockNode][]
  files: [number, string][]
  secrets: [number, string][]
  otpSecrets: [string, {secret: string; digits: number; period: number}][]
}

export class MockTransport implements TransportLike {
  readonly kind = 'ws' as const

  connected = state(false)
  connecting = state(false)
  lastError = state<string | undefined>(undefined)

  private handlers = new Map<string, HandlerSet>()

  private nodes = new Map<number, MockNode>()
  private files = new Map<number, Uint8Array>()
  private secrets = new Map<number, Uint8Array>()
  private otpSecrets = new Map<string, {secret: string; digits: number; period: number}>()

  private nextId = 1

  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly SAVE_DEBOUNCE_MS = 500

  constructor() {
    this.initRoot()
  }

  private initRoot(): void {
    const now = Date.now()
    this.nodes.set(0, {
      id: 0,
      type: 0,
      name: '/',
      size: 0,
      modtime: now,
      parentId: null,
      children: [],
    })
  }

  // ── Persistence ──────────────────────────────────────────

  private serialize(): string {
    const data: PersistedState = {
      version: 1,
      nextId: this.nextId,
      nodes: Array.from(this.nodes.entries()),
      files: Array.from(this.files.entries()).map(([id, bytes]) => [id, uint8ToBase64(bytes)]),
      secrets: Array.from(this.secrets.entries()).map(([id, bytes]) => [id, uint8ToBase64(bytes)]),
      otpSecrets: Array.from(this.otpSecrets.entries()),
    }
    return JSON.stringify(data)
  }

  private deserialize(json: PersistedState): void {
    this.nodes.clear()
    for (const [id, node] of json.nodes) {
      this.nodes.set(id, node)
    }

    this.files.clear()
    for (const [id, b64] of json.files) {
      this.files.set(id, base64ToUint8(b64))
    }

    this.secrets.clear()
    for (const [id, b64] of json.secrets) {
      this.secrets.set(id, base64ToUint8(b64))
    }

    this.otpSecrets.clear()
    for (const [key, value] of json.otpSecrets) {
      this.otpSecrets.set(key, value)
    }

    this.nextId = json.nextId
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer)
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.persistToDisk().catch((e) => console.warn('[MockTransport] save failed:', e))
    }, MockTransport.SAVE_DEBOUNCE_MS)
  }

  private async persistToDisk(): Promise<void> {
    const body = this.serialize()
    await fetch('/api/mock-state', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body,
    })
  }

  private async loadFromDisk(): Promise<boolean> {
    try {
      const resp = await fetch('/api/mock-state')
      if (!resp.ok) return false
      const json = (await resp.json()) as PersistedState
      if (!json || json.version !== 1 || !Array.isArray(json.nodes)) return false
      this.deserialize(json)
      console.info(
        '[MockTransport] Restored persisted state (%d nodes, %d files)',
        this.nodes.size,
        this.files.size,
      )
      return true
    } catch {
      return false
    }
  }

  // ── Connection ───────────────────────────────────────────

  connect(): void {
    if (this.connected() || this.connecting()) return

    this.connecting.set(true)
    this.lastError.set(undefined)

    this.loadFromDisk()
      .catch(() => false)
      .then(() => {
        // Ensure root exists after restore (in case of empty/corrupt state)
        if (!this.nodes.has(0)) {
          this.initRoot()
        }
        this.connected.set(true)
        this.connecting.set(false)
        this.emit('update:state', {StorageOpened: true, NeedUserInitialization: false})
      })
  }

  disconnect(): void {
    this.connected.set(false)
    this.connecting.set(false)
  }

  on(event: string, handler: TransportEventHandler): void {
    const set = this.handlers.get(event) ?? new Set()
    set.add(handler)
    this.handlers.set(event, set)
  }

  off(event: string, handler: TransportEventHandler): void {
    const set = this.handlers.get(event)
    if (!set) return
    set.delete(handler)
    if (set.size === 0) this.handlers.delete(event)
  }

  private emit(event: string, payload: unknown): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const h of set) {
      try {
        h(undefined, payload)
      } catch (e) {
        this.lastError.set(e instanceof Error ? e.message : String(e))
      }
    }
  }

  private root(): MockNode {
    const root = this.nodes.get(0)
    if (!root) throw new Error('MockTransport root node missing')
    return root
  }

  private getNode(id: number): MockNode | undefined {
    return this.nodes.get(id)
  }

  private getPath(id: number): string {
    if (id === 0) return '/'
    const parts: string[] = []
    let cur = id
    while (cur !== 0) {
      const node = this.nodes.get(cur)
      if (!node) break
      parts.push(node.name)
      if (node.parentId === null) break
      cur = node.parentId
    }
    return normalizePath('/' + parts.reverse().join('/'))
  }

  private findIdByPath(path: string): number | undefined {
    const parts = splitPath(path)
    let cur = 0
    for (const p of parts) {
      const node = this.nodes.get(cur)
      if (!node) return undefined
      const next = node.children.find((id) => this.nodes.get(id)?.name === p)
      if (next === undefined) return undefined
      cur = next
    }
    return cur
  }

  private readJsonFile(nodeId: number): unknown | undefined {
    const bytes = this.files.get(nodeId)
    if (!bytes) return undefined
    try {
      return JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      return undefined
    }
  }

  private resolvePassmanagerOtpTarget(params: {
    otpId?: string
    entryId?: string
    label?: string
  }): {nodeId: number; label: string} | undefined {
    const normalize = (value: unknown): string | undefined => {
      if (typeof value !== 'string') return undefined
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : undefined
    }

    const otpId = normalize(params.otpId)
    const entryId = normalize(params.entryId)
    const fallbackLabel = normalize(params.label)

    if (!otpId && !entryId) return undefined

    const rootId = this.findIdByPath('/.passmanager')
    if (rootId === undefined) return undefined

    const walk = (dirId: number): {nodeId: number; label: string} | undefined => {
      const dir = this.nodes.get(dirId)
      if (!dir) return undefined

      for (const childId of dir.children) {
        const child = this.nodes.get(childId)
        if (!child || (child.type !== 0 && child.type !== 255)) continue

        const metaNodeId = child.children.find((id) => {
          const node = this.nodes.get(id)
          return node?.type === 1 && node.name === 'meta.json'
        })
        if (metaNodeId !== undefined) {
          const meta = this.readJsonFile(metaNodeId) as
            | {id?: string; otps?: Array<{id?: string; label?: string}>}
            | undefined
          if (!meta) continue

          const otps = Array.isArray(meta.otps) ? meta.otps : []
          if (otpId) {
            const found = otps.find((otp) => normalize(otp?.id) === otpId)
            if (found) {
              const label = normalize(found.label) ?? normalize(found.id) ?? fallbackLabel ?? otpId
              return {nodeId: child.id, label}
            }
          }

          if (entryId && normalize(meta.id) === entryId) {
            const label =
              fallbackLabel ??
              (otps.length === 1 ? (normalize(otps[0]?.label) ?? normalize(otps[0]?.id)) : undefined)
            if (label) {
              return {nodeId: child.id, label}
            }
          }
          continue
        }

        const nested = walk(child.id)
        if (nested) return nested
      }
      return undefined
    }

    return walk(rootId)
  }

  private createNode(params: {
    parentId: number
    name: string
    type: NodeType
    size?: number
    mimeType?: string
  }): MockNode {
    const parent = this.nodes.get(params.parentId)
    if (!parent) throw new Error(`Parent node not found: ${params.parentId}`)

    const now = Date.now()
    const node: MockNode = {
      id: this.nextId++,
      type: params.type,
      name: params.name,
      size: params.size ?? 0,
      modtime: now,
      parentId: params.parentId,
      children: [],
      mimeType: params.mimeType,
    }

    this.nodes.set(node.id, node)
    parent.children.push(node.id)

    const event: CatalogEvent = {
      type: CatalogEventType.NODE_CREATED,
      nodeId: node.id,
      timestamp: now,
      version: 0,
      metadata: {
        parentId: params.parentId,
        name: node.name,
        type: node.type,
        size: node.size,
        mimeType: node.mimeType,
      },
    }
    this.emit('catalog:event', event)
    this.scheduleSave()

    return node
  }

  private deleteNodeRecursive(id: number): void {
    const node = this.nodes.get(id)
    if (!node) return

    for (const childId of [...node.children]) {
      this.deleteNodeRecursive(childId)
    }

    const parent = node.parentId !== null ? this.nodes.get(node.parentId) : undefined
    if (parent) {
      parent.children = parent.children.filter((cid) => cid !== id)
      parent.modtime = Date.now()
    }

    this.nodes.delete(id)
    this.files.delete(id)
    this.secrets.delete(id)

    const event: CatalogEvent = {
      type: CatalogEventType.NODE_DELETED,
      nodeId: id,
      timestamp: Date.now(),
      version: 0,
    }
    this.emit('catalog:event', event)
    this.scheduleSave()
  }

  private renameNode(id: number, newName: string): void {
    const node = this.nodes.get(id)
    if (!node) throw new Error(`Node not found: ${id}`)
    if (id === 0) throw new Error('Cannot rename root')

    node.name = newName
    node.modtime = Date.now()

    const event: CatalogEvent = {
      type: CatalogEventType.NODE_RENAMED,
      nodeId: id,
      timestamp: node.modtime,
      version: 0,
      metadata: {newName},
    }
    this.emit('catalog:event', event)
    this.scheduleSave()
  }

  private moveNode(params: {nodeId: number; newParentId: number; newName?: string}): void {
    const node = this.nodes.get(params.nodeId)
    if (!node) throw new Error(`Node not found: ${params.nodeId}`)
    if (params.nodeId === 0) throw new Error('Cannot move root')

    const oldParentId = node.parentId
    const newParent = this.nodes.get(params.newParentId)
    if (!newParent) throw new Error(`New parent not found: ${params.newParentId}`)

    if (oldParentId !== null) {
      const oldParent = this.nodes.get(oldParentId)
      if (oldParent) {
        oldParent.children = oldParent.children.filter((id) => id !== node.id)
        oldParent.modtime = Date.now()
      }
    }

    node.parentId = newParent.id
    if (params.newName) node.name = params.newName
    node.modtime = Date.now()

    newParent.children.push(node.id)
    newParent.modtime = Date.now()

    const event: CatalogEvent = {
      type: CatalogEventType.NODE_MOVED,
      nodeId: node.id,
      timestamp: node.modtime,
      version: 0,
      metadata: {
        oldParentId: oldParentId ?? null,
        newParentId: newParent.id,
        newName: params.newName,
      },
    }
    this.emit('catalog:event', event)
    this.scheduleSave()
  }

  private toCatalogJSON(id: number): CatalogJSON {
    const node = this.nodes.get(id)
    if (!node) {
      throw new Error(`Node not found: ${id}`)
    }

    const isDir = node.type === 0 || node.type === 255
    const children = isDir ? node.children.map((cid) => this.toCatalogJSON(cid)) : undefined

    const out: CatalogJSON = {
      i: node.id,
      t: node.type,
      n: node.name,
      s: node.size,
      z: 0,
      b: 0,
      m: node.modtime,
      y: node.mimeType,
      c: children,
    }

    return out
  }

  // ── Passmanager domain helpers ─────────────────────────────

  private ensurePassmanagerRoot(): number {
    let rootId = this.findIdByPath('/.passmanager')
    if (rootId === undefined) {
      const node = this.createNode({parentId: 0, name: '.passmanager', type: 0})
      rootId = node.id
    }
    return rootId
  }

  private ensureGroupPathChain(groupPath: string): number {
    const pmRoot = this.ensurePassmanagerRoot()
    if (!groupPath || groupPath === '/') return pmRoot

    const parts = groupPath.split('/').filter(Boolean)
    let currentId = pmRoot
    for (const part of parts) {
      const node = this.nodes.get(currentId)
      if (!node) throw new Error(`Node missing during group ensure: ${currentId}`)
      const childId = node.children.find((id) => this.nodes.get(id)?.name === part)
      if (childId !== undefined) {
        currentId = childId
      } else {
        const newNode = this.createNode({parentId: currentId, name: part, type: 0})
        currentId = newNode.id
      }
    }
    return currentId
  }

  private findEntryDirById(entryId: string): number | undefined {
    const pmRoot = this.findIdByPath('/.passmanager')
    if (pmRoot === undefined) return undefined

    const walk = (dirId: number): number | undefined => {
      const dir = this.nodes.get(dirId)
      if (!dir) return undefined
      for (const childId of dir.children) {
        const child = this.nodes.get(childId)
        if (!child || (child.type !== 0 && child.type !== 255)) continue
        const metaFileId = child.children.find((id) => {
          const n = this.nodes.get(id)
          return n?.type === 1 && n.name === 'meta.json'
        })
        if (metaFileId !== undefined) {
          const meta = this.readJsonFile(metaFileId) as {id?: string} | undefined
          if (meta?.id === entryId) return child.id
        } else {
          const found = walk(child.id)
          if (found !== undefined) return found
        }
      }
      return undefined
    }
    return walk(pmRoot)
  }

  private getMetaFileId(entryDirId: number): number | undefined {
    const dir = this.nodes.get(entryDirId)
    if (!dir) return undefined
    return dir.children.find((id) => {
      const n = this.nodes.get(id)
      return n?.type === 1 && n.name === 'meta.json'
    })
  }

  private getSecretFileId(entryDirId: number, secretType: string): number | undefined {
    const dir = this.nodes.get(entryDirId)
    if (!dir) return undefined
    const fileName = `.${secretType}`
    return dir.children.find((id) => {
      const n = this.nodes.get(id)
      return n?.type === 1 && n.name === fileName
    })
  }

  private writeJsonToFile(nodeId: number, data: unknown): void {
    const bytes = new TextEncoder().encode(JSON.stringify(data))
    this.files.set(nodeId, bytes)
    const node = this.nodes.get(nodeId)
    if (node) {
      node.size = bytes.byteLength
      node.modtime = Date.now()
    }
    this.scheduleSave()
  }

  async sendCatalog(command: string, data: Record<string, unknown>): Promise<unknown> {
    try {
      switch (command) {
        case 'catalog:syncInit': {
          return ok({header: {version: 1, timestamp: Date.now()}, data: this.toCatalogJSON(0)})
        }

        case 'catalog:subscribe':
        case 'catalog:unsubscribe': {
          return ok(undefined)
        }

        case 'catalog:list': {
          const path = toStringValue(data['path']) ?? '/'
          const includeHidden = toBooleanValue(data['includeHidden'] ?? data['include_hidden']) ?? false
          const id = this.findIdByPath(path)
          if (id === undefined) return err(`Path not found: ${path}`)

          const node = this.nodes.get(id)
          if (!node) return err(`Path not found: ${path}`)

          const items = node.children
            .map((cid) => this.nodes.get(cid))
            .filter((n): n is MockNode => Boolean(n))
            .filter((n) => includeHidden || !n.name.startsWith('.'))
            .map((n) => {
              const nodePath = this.getPath(n.id)
              return {
                nodeId: n.id,
                nodeType: n.type,
                name: n.name,
                size: n.size,
                modtime: n.modtime,
                isDir: n.type === 0 || n.type === 255,
                isFile: n.type === 1,
                isSymlink: n.type === 2,
                path: nodePath,
                hasChildren: n.children.length > 0,
                mimeType: n.mimeType,
              }
            })

          return ok({currentPath: normalizePath(path), items})
        }

        case 'catalog:createDir': {
          const name = toOptionalString(data['name'])
          if (!name) return err('name is required')

          const parentPath = toStringValue(data['parentPath'] ?? data['parent_path']) ?? '/'
          const parentId = this.findIdByPath(parentPath)
          if (parentId === undefined) return err(`Parent path not found: ${parentPath}`)

          const parent = this.getNode(parentId)
          if (!parent || (parent.type !== 0 && parent.type !== 255)) return err('Parent is not a directory')

          const node = this.createNode({parentId, name, type: 0})
          return ok({nodeId: node.id})
        }

        case 'catalog:rename': {
          const nodeId = toNumberValue(data['nodeId'] ?? data['node_id'])
          const newName = toOptionalString(data['newName'] ?? data['new_name'])
          if (nodeId === undefined) return err('nodeId is required')
          if (!newName) return err('newName is required')

          this.renameNode(nodeId, newName)
          return ok(undefined)
        }

        case 'catalog:delete': {
          const nodeId = toNumberValue(data['nodeId'] ?? data['node_id'])
          if (nodeId === undefined) return err('nodeId is required')

          this.deleteNodeRecursive(nodeId)
          return ok(undefined)
        }

        case 'catalog:move': {
          const nodeId = toNumberValue(data['nodeId'] ?? data['node_id'])
          const newParentPath = toStringValue(data['newParentPath'] ?? data['new_parent_path'])
          const newName = toOptionalString(data['newName'] ?? data['new_name'])

          if (nodeId === undefined) return err('nodeId is required')
          if (!newParentPath) return err('newParentPath is required')

          const newParentId = this.findIdByPath(newParentPath)
          if (newParentId === undefined) return err(`New parent path not found: ${newParentPath}`)

          this.moveNode({nodeId, newParentId, newName})
          return ok(undefined)
        }

        case 'catalog:prepareUpload': {
          const parentPath = toStringValue(data['parentPath'] ?? data['parent_path']) ?? '/'
          const name = toOptionalString(data['name'])
          const size = toNumberValue(data['size']) ?? 0
          const chunkSize = toNumberValue(data['chunkSize'] ?? data['chunk_size'])
          const mimeType = toOptionalString(data['mimeType'] ?? data['mime_type'])

          if (!name) return err('name is required')

          const parentId = this.findIdByPath(parentPath)
          if (parentId === undefined) return err(`Parent path not found: ${parentPath}`)

          const parent = this.getNode(parentId)
          if (!parent || (parent.type !== 0 && parent.type !== 255)) return err('Parent is not a directory')

          const node = this.createNode({parentId, name, type: 1, size, mimeType})

          return ok({
            nodeId: node.id,
            meta: {
              name: node.name,
              type: node.mimeType ?? 'application/octet-stream',
              chunkSize: chunkSize ?? 64 * 1024,
            },
          })
        }

        case 'passmanager:subscribe':
        case 'passmanager:unsubscribe': {
          return ok(undefined)
        }

        case 'passmanager:entry:save': {
          const entryId = toOptionalString(data['entry_id']) ?? crypto.randomUUID()
          const title = toOptionalString(data['title'])
          if (!title) return err('title is required')
          const urls = Array.isArray(data['urls']) ? (data['urls'] as string[]) : []
          const username = toOptionalString(data['username'])
          const groupPath = toOptionalString(data['group_path'])
          const importSource = data['import_source']

          const existingDirId = this.findEntryDirById(entryId)
          if (existingDirId !== undefined) {
            const metaFileId = this.getMetaFileId(existingDirId)
            if (metaFileId !== undefined) {
              const oldMeta = (this.readJsonFile(metaFileId) as Record<string, unknown>) ?? {}
              this.writeJsonToFile(metaFileId, {
                ...oldMeta,
                id: entryId,
                ...(importSource && typeof importSource === 'object' ? {import_source: importSource} : {}),
                title,
                urls,
                username,
                ...(Array.isArray(data['otps']) ? {otps: data['otps']} : {}),
              })
            }
            return ok({entry_id: entryId})
          }

          const parentId = groupPath ? this.ensureGroupPathChain(groupPath) : this.ensurePassmanagerRoot()
          const entryDir = this.createNode({parentId, name: entryId, type: 0})
          const metaFile = this.createNode({parentId: entryDir.id, name: 'meta.json', type: 1})
          this.writeJsonToFile(metaFile.id, {
            id: entryId,
            ...(importSource && typeof importSource === 'object' ? {import_source: importSource} : {}),
            title,
            urls,
            username,
            ...(Array.isArray(data['otps']) ? {otps: data['otps']} : {}),
          })
          return ok({entry_id: entryId})
        }

        case 'passmanager:entry:read': {
          const entryId = toOptionalString(data['entry_id'])
          if (!entryId) return err('entry_id is required')
          const dirId = this.findEntryDirById(entryId)
          if (dirId === undefined) return err('entry_not_found')
          const metaFileId = this.getMetaFileId(dirId)
          if (metaFileId === undefined) return err('entry_not_found')
          const meta = this.readJsonFile(metaFileId)
          return ok({entry: meta})
        }

        case 'passmanager:entry:delete': {
          const entryId = toOptionalString(data['entry_id'])
          if (!entryId) return err('entry_id is required')
          const dirId = this.findEntryDirById(entryId)
          if (dirId === undefined) return err('entry_not_found')
          this.deleteNodeRecursive(dirId)
          return ok(undefined)
        }

        case 'passmanager:entry:move': {
          const entryId = toOptionalString(data['entry_id'])
          const targetGroupPath = toStringValue(data['target_group_path'])
          if (!entryId) return err('entry_id is required')
          if (targetGroupPath === undefined) return err('target_group_path is required')

          const dirId = this.findEntryDirById(entryId)
          if (dirId === undefined) return err('entry_not_found')

          const newParentId = targetGroupPath
            ? this.ensureGroupPathChain(targetGroupPath)
            : this.ensurePassmanagerRoot()
          this.moveNode({nodeId: dirId, newParentId})
          return ok(undefined)
        }

        case 'passmanager:entry:rename': {
          const entryId = toOptionalString(data['entry_id'])
          const newTitle = toOptionalString(data['new_title'])
          if (!entryId) return err('entry_id is required')
          if (!newTitle) return err('new_title is required')

          const dirId = this.findEntryDirById(entryId)
          if (dirId === undefined) return err('entry_not_found')
          const metaFileId = this.getMetaFileId(dirId)
          if (metaFileId === undefined) return err('entry_not_found')

          const meta = (this.readJsonFile(metaFileId) as Record<string, unknown>) ?? {}
          meta['title'] = newTitle
          this.writeJsonToFile(metaFileId, meta)
          return ok(undefined)
        }

        case 'passmanager:entry:list': {
          const pmRootId = this.findIdByPath('/.passmanager')
          if (pmRootId === undefined) return ok({entries: [], folders: []})

          const entries: Record<string, unknown>[] = []
          const folders: Record<string, unknown>[] = []

          const walk = (dirId: number, gPath: string) => {
            const dir = this.nodes.get(dirId)
            if (!dir) return
            for (const childId of dir.children) {
              const child = this.nodes.get(childId)
              if (!child || (child.type !== 0 && child.type !== 255)) continue
              const mfId = child.children.find((id) => {
                const n = this.nodes.get(id)
                return n?.type === 1 && n.name === 'meta.json'
              })
              if (mfId !== undefined) {
                const meta = this.readJsonFile(mfId) as Record<string, unknown> | undefined
                if (meta) entries.push({...meta, groupPath: gPath || undefined})
              } else {
                const childPath = gPath ? `${gPath}/${child.name}` : child.name
                folders.push({path: childPath, name: child.name})
                walk(child.id, childPath)
              }
            }
          }

          walk(pmRootId, '')
          return ok({entries, folders})
        }

        case 'passmanager:secret:save': {
          const entryId = toOptionalString(data['entry_id'] ?? data['entryId'])
          const secretType = toOptionalString(data['secret_type'] ?? data['secretType'] ?? data['type'])
          const hasValue = Object.prototype.hasOwnProperty.call(data, 'value')
          const value = data['value']
          if (!entryId) return err('entry_id is required')
          if (!secretType) return err('secret_type is required')
          if (!hasValue) return err('value is required')
          const dirId = this.findEntryDirById(entryId)
          if (dirId === undefined) return err('entry_not_found')

          if (value === null) {
            const fileId = this.getSecretFileId(dirId, secretType)
            if (fileId !== undefined) this.deleteNodeRecursive(fileId)
            return ok(undefined)
          }

          if (typeof value !== 'string') {
            return err('value must be string; use passmanager:secret:delete for null')
          }

          const fileId = this.getSecretFileId(dirId, secretType)
          let targetFileId = fileId
          if (targetFileId === undefined) {
            const node = this.createNode({parentId: dirId, name: `.${secretType}`, type: 1})
            targetFileId = node.id
          }

          const bytes = new TextEncoder().encode(value)
          this.files.set(targetFileId, bytes)
          const fileNode = this.nodes.get(targetFileId)
          if (fileNode) {
            fileNode.size = bytes.byteLength
            fileNode.modtime = Date.now()
          }
          this.scheduleSave()
          return ok(undefined)
        }

        case 'passmanager:secret:read': {
          const entryId = toOptionalString(data['entry_id'] ?? data['entryId'])
          const secretType = toOptionalString(data['secret_type'] ?? data['secretType'] ?? data['type'])
          if (!entryId) return err('entry_id is required')
          if (!secretType) return err('secret_type is required')

          const dirId = this.findEntryDirById(entryId)
          if (dirId === undefined) return err('entry_not_found')

          const fileId = this.getSecretFileId(dirId, secretType)
          if (fileId === undefined) return err('secret_not_found')

          const bytes = this.files.get(fileId)
          if (!bytes) return err('secret_not_found')
          return ok({value: new TextDecoder().decode(bytes)})
        }

        case 'passmanager:secret:delete': {
          const entryId = toOptionalString(data['entry_id'] ?? data['entryId'])
          const secretType = toOptionalString(data['secret_type'] ?? data['secretType'] ?? data['type'])
          if (!entryId) return err('entry_id is required')
          if (!secretType) return err('secret_type is required')

          const dirId = this.findEntryDirById(entryId)
          if (dirId === undefined) return err('entry_not_found')

          const fileId = this.getSecretFileId(dirId, secretType)
          if (fileId !== undefined) this.deleteNodeRecursive(fileId)
          return ok(undefined)
        }

        case 'passmanager:group:ensure': {
          const path = toOptionalString(data['path'])
          if (!path) return err('path is required')
          this.ensureGroupPathChain(path)
          return ok(undefined)
        }

        case 'passmanager:group:list': {
          const pmRootId = this.findIdByPath('/.passmanager')
          if (pmRootId === undefined) return ok({groups: []})

          const groups: Record<string, unknown>[] = []
          const walkGroups = (dirId: number, gPath: string) => {
            const dir = this.nodes.get(dirId)
            if (!dir) return
            for (const childId of dir.children) {
              const child = this.nodes.get(childId)
              if (!child || (child.type !== 0 && child.type !== 255)) continue
              const hasMeta = child.children.some((id) => {
                const n = this.nodes.get(id)
                return n?.type === 1 && n.name === 'meta.json'
              })
              if (hasMeta) continue
              const childPath = gPath ? `${gPath}/${child.name}` : child.name
              groups.push({path: childPath, name: child.name})
              walkGroups(child.id, childPath)
            }
          }

          walkGroups(pmRootId, '')
          return ok({groups})
        }

        case 'passmanager:root:import': {
          const importFolders = Array.isArray(data['folders'])
            ? (data['folders'] as (string | Record<string, unknown>)[])
            : []
          const importEntries = Array.isArray(data['entries'])
            ? (data['entries'] as Record<string, unknown>[])
            : []

          const mode = toStringValue(data['mode']) ?? 'merge'
          if (mode !== 'merge' && mode !== 'replace' && mode !== 'restore') {
            return err('mode must be one of: merge, replace, restore')
          }
          const allowDestructive = data['allow_destructive'] === true || data['allowDestructive'] === true
          const destructiveMode = mode === 'replace' || mode === 'restore'
          if (destructiveMode && !allowDestructive) {
            return err('destructive root import requires allow_destructive=true')
          }
          const shouldClearExisting = destructiveMode && allowDestructive

          if (shouldClearExisting) {
            const pmRootId = this.findIdByPath('/.passmanager')
            if (pmRootId !== undefined) {
              const pmRoot = this.nodes.get(pmRootId)
              if (pmRoot) {
                for (const childId of [...pmRoot.children]) {
                  this.deleteNodeRecursive(childId)
                }
              }
            }
          }

          for (const folder of importFolders) {
            // Handle both string[] (Rust contract) and {path: string}[] formats
            const fPath =
              typeof folder === 'string'
                ? folder
                : toOptionalString((folder as Record<string, unknown>)['path'])
            if (fPath) this.ensureGroupPathChain(fPath)
          }

          for (const entry of importEntries) {
            const id = toOptionalString(entry['id']) ?? crypto.randomUUID()
            const title = toOptionalString(entry['title']) ?? 'Untitled'
            // Handle both 'folderPath' (Rust export contract) and 'groupPath' (legacy)
            const gp = toOptionalString(entry['folderPath'] ?? entry['groupPath'])
            const parentId = gp ? this.ensureGroupPathChain(gp) : this.ensurePassmanagerRoot()
            const entryDir = this.createNode({parentId, name: id, type: 0})
            const metaFile = this.createNode({parentId: entryDir.id, name: 'meta.json', type: 1})
            this.writeJsonToFile(metaFile.id, {...entry, id, title})
          }
          return ok(undefined)
        }

        case 'passmanager:root:export': {
          const pmRootId = this.findIdByPath('/.passmanager')
          if (pmRootId === undefined) return ok({root: {entries: [], folders: []}})

          const entries: Record<string, unknown>[] = []
          const folders: string[] = []

          const walkExport = (dirId: number, gPath: string) => {
            const dir = this.nodes.get(dirId)
            if (!dir) return
            for (const childId of dir.children) {
              const child = this.nodes.get(childId)
              if (!child || (child.type !== 0 && child.type !== 255)) continue
              // Skip hidden system dirs (e.g. .icons)
              if (child.name.startsWith('.')) continue
              const mfId = child.children.find((id) => {
                const n = this.nodes.get(id)
                return n?.type === 1 && n.name === 'meta.json'
              })
              if (mfId !== undefined) {
                const meta = this.readJsonFile(mfId) as Record<string, unknown> | undefined
                if (meta) {
                  const {groupPath: _gp, ...rest} = meta
                  // Use folderPath (Rust export contract), null for root-level entries
                  entries.push({...rest, folderPath: gPath || null})
                }
              } else {
                const childPath = gPath ? `${gPath}/${child.name}` : child.name
                folders.push(childPath)
                walkExport(child.id, childPath)
              }
            }
          }

          walkExport(pmRootId, '')
          folders.sort()
          return ok({root: {entries, folders}})
        }

        case 'passmanager:otp:generate': {
          const otpId = toOptionalString(data['otp_id'] ?? data['otpId'])
          const entryId = toOptionalString(data['entry_id'] ?? data['entryId'])
          const label = toStringValue(data['label'])
          const resolved = this.resolvePassmanagerOtpTarget({otpId, entryId, label})
          if (!resolved) return err('otp_id or entry_id is required')
          const digits = toNumberValue(data['digits']) ?? 6
          const period = toNumberValue(data['period']) ?? 30
          const ts = toNumberValue(data['ts']) ?? Date.now()
          const counter = Math.floor(ts / (period * 1000))
          const mod = Math.pow(10, digits)
          const value = (counter + resolved.nodeId) % mod
          const otp = String(value).padStart(digits, '0')
          return ok({otp})
        }
        case 'passmanager:otp:setSecret': {
          const otpId = toOptionalString(data['otp_id'] ?? data['otpId'])
          const entryId = toOptionalString(data['entry_id'] ?? data['entryId'])
          const labelRaw = toStringValue(data['label'])
          const label = labelRaw?.trim() || undefined
          const resolved = this.resolvePassmanagerOtpTarget({otpId, entryId, label})
          if (!resolved) return err('otp_id or entry_id is required')
          const secretRaw = toStringValue(data['secret'])
          const secret = secretRaw?.trim()
          if (!secret) return err('non-empty secret is required')
          const key = `${resolved.nodeId}:${resolved.label}`
          this.otpSecrets.set(key, {
            secret,
            digits: toNumberValue(data['digits']) ?? 6,
            period: toNumberValue(data['period']) ?? 30,
          })
          this.scheduleSave()
          return ok(undefined)
        }
        case 'passmanager:otp:removeSecret': {
          const otpId = toOptionalString(data['otp_id'] ?? data['otpId'])
          const entryId = toOptionalString(data['entry_id'] ?? data['entryId'])
          const resolved = this.resolvePassmanagerOtpTarget({otpId, entryId})
          if (!resolved) return err('otp_id or entry_id is required')
          const key = `${resolved.nodeId}:${resolved.label}`
          this.otpSecrets.delete(key)
          this.scheduleSave()
          return ok(undefined)
        }

        default:
          return err(`Unsupported command: ${command}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.lastError.set(msg)
      return err(msg)
    }
  }

  async uploadFile(
    nodeId: number,
    file: File,
    opts?: {
      chunkSize?: number
      name?: string
      type?: string
      onProgress?: (c: number, t: number, p: number) => void
    },
  ): Promise<void> {
    const node = this.nodes.get(nodeId)
    if (!node) throw new Error(`Node not found: ${nodeId}`)

    const cs = opts?.chunkSize && opts.chunkSize > 0 ? Math.floor(opts.chunkSize) : 64 * 1024
    const totalChunks = Math.max(1, Math.ceil(file.size / cs))

    const bytes = new Uint8Array(await file.arrayBuffer())
    this.files.set(nodeId, bytes)

    node.size = bytes.byteLength
    node.mimeType = opts?.type ?? (file.type || node.mimeType)
    node.modtime = Date.now()

    const updateEvent: CatalogEvent = {
      type: CatalogEventType.NODE_UPDATED,
      nodeId,
      timestamp: node.modtime,
      version: 0,
      metadata: {
        size: node.size,
        mime: node.mimeType,
        modtime: node.modtime,
      },
    }
    this.emit('catalog:event', updateEvent)

    if (opts?.onProgress) {
      for (let chunk = 1; chunk <= totalChunks; chunk++) {
        const percent = Math.min(100, Math.round((chunk / totalChunks) * 100))
        opts.onProgress(chunk, totalChunks, percent)
        await new Promise((r) => setTimeout(r, 0))
      }
    }

    this.scheduleSave()
  }

  async downloadFile(nodeId: number): Promise<AsyncIterable<Uint8Array>> {
    const bytes = this.files.get(nodeId)
    if (!bytes) throw new Error(`File bytes not found: ${nodeId}`)
    const data = bytes

    const cs = 64 * 1024
    async function* gen(): AsyncIterable<Uint8Array> {
      for (let i = 0; i < data.length; i += cs) {
        yield data.subarray(i, Math.min(data.length, i + cs))
      }
    }

    return gen()
  }

  async readSecret(nodeId: number): Promise<AsyncIterable<Uint8Array>> {
    const bytes = this.secrets.get(nodeId)
    if (!bytes) throw new Error(`Secret not found: ${nodeId}`)
    const data = bytes

    const cs = 64 * 1024
    async function* gen(): AsyncIterable<Uint8Array> {
      for (let i = 0; i < data.length; i += cs) {
        yield data.subarray(i, Math.min(data.length, i + cs))
      }
    }

    return gen()
  }

  async writeSecret(nodeId: number, data: ArrayBuffer): Promise<void> {
    this.secrets.set(nodeId, new Uint8Array(data))
    this.scheduleSave()
  }

  async eraseSecret(nodeId: number): Promise<void> {
    this.secrets.delete(nodeId)
    this.scheduleSave()
  }

  async generateOTP(params: {
    otpId?: string
    entryId?: string
    ts?: number
    digits?: number
    period?: number
    ha?: string
  }): Promise<string> {
    const otp_id = params.otpId?.trim() || null
    const entry_id = params.entryId?.trim() || null
    if (!otp_id && !entry_id) {
      throw new Error('generateOTP requires otpId or entryId')
    }
    const res = (await this.sendCatalog('passmanager:otp:generate', {
      otp_id,
      entry_id,
      ts: params.ts ?? null,
      digits: params.digits ?? null,
      period: params.period ?? null,
      ha: params.ha ?? null,
    })) as {ok: boolean; result?: {otp?: string}}
    if (!res.ok || !res.result?.otp) throw new Error('passmanager:otp:generate failed')
    return res.result.otp
  }
  async setOTPSecret(params: {
    otpId: string
    entryId?: string
    secret: string
    encoding?: string
    algorithm?: string
    digits?: number
    period?: number
  }): Promise<void> {
    const res = (await this.sendCatalog('passmanager:otp:setSecret', {
      otp_id: params.otpId,
      entry_id: params.entryId ?? null,
      secret: params.secret,
      encoding: params.encoding ?? null,
      algorithm: params.algorithm ?? null,
      digits: params.digits ?? null,
      period: params.period ?? null,
    })) as {ok: boolean; error?: string}
    if (!res.ok) throw new Error(res.error ?? 'passmanager:otp:setSecret failed')
  }

  async removeOTPSecret(params: {otpId: string; entryId?: string}): Promise<void> {
    const res = (await this.sendCatalog('passmanager:otp:removeSecret', {
      otp_id: params.otpId,
      entry_id: params.entryId ?? null,
    })) as {ok: boolean; error?: string}
    if (!res.ok) throw new Error(res.error ?? 'passmanager:otp:removeSecret failed')
  }
}
