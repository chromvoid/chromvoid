import {atom} from '@reatom/core'
import {
  normalizeCredentialTagCatalog,
  normalizeCredentialTags,
} from '@project/passmanager/tags'

import type {TransportEventHandler, TransportLike} from '../transport'
import type {
  CatalogFileReplaceOptions,
  CatalogFileReplaceResult,
  CatalogSourceMetadata,
} from '../../catalog/catalog'
import {normalizeFileMediaInfo, toCompactFileMediaInfo} from '../../catalog/media-info'
import {
  CatalogEventType,
  type CatalogEvent,
  type CatalogFolderFilter,
  type CatalogFolderPageRequest,
  type CatalogFolderSort,
  type CatalogJSON,
  type CatalogNotesListItem,
  type NodeType,
} from '../../catalog/local-catalog/types'
import {normalizePath, splitPath} from '../../catalog/local-catalog/path'

import {
  MOCK_TRANSPORT_LOG_ENDPOINT,
  type HandlerSet,
  type MockNode,
  type MockPassmanagerFolderMeta,
  type MockPassmanagerIcon,
  type MockTransportLogChannel,
  type MockTransportLogEntry,
  type PersistedPassmanagerState,
  type PersistedState,
} from './mock-transport.types'
import {
  base64ToUint8,
  createMockSshKeyMaterial,
  err,
  nextSourceRevision,
  ok,
  readFileBytes,
  toBooleanValue,
  toNumberValue,
  toOptionalString,
  toStringValue,
  uint8ToArrayBuffer,
  uint8ToBase64,
} from './mock-transport.utils'
import type {FileMediaInfo} from '../../catalog/media-info'

function mockExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function mockParentPath(path: string): string {
  const normalized = normalizePath(path)
  if (normalized === '/') return '/'
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? '/' : `${normalized.slice(0, index)}/`
}

function inferMockMediaInfo(name: string, mimeType?: string | null): FileMediaInfo | null {
  const ext = mockExtension(name)
  const normalizedMime = (mimeType ?? '').split(';', 1)[0]!.trim().toLowerCase()
  const normalizedName = name.toLowerCase()

  if (ext === 'm4a' || normalizedMime === 'audio/mp4' || normalizedName.includes('audio-only')) {
    return {
      kind: 'audio',
      audioTracks: 1,
      videoTracks: 0,
      playbackMimeType: 'audio/mp4',
    }
  }

  if (
    (ext === 'mp4' || ext === 'mov') &&
    (normalizedMime === 'video/mp4' ||
      normalizedMime === 'video/quicktime' ||
      normalizedName.includes('video') ||
      normalizedName.includes('movie'))
  ) {
    return {
      kind: 'video',
      audioTracks: normalizedName.includes('audio-video') ? 1 : 0,
      videoTracks: 1,
      playbackMimeType: ext === 'mov' ? 'video/quicktime' : 'video/mp4',
    }
  }

  return null
}

export class MockTransport implements TransportLike {
  readonly kind = 'ws' as const

  connected = atom(false)
  connecting = atom(false)
  lastError = atom<string | undefined>(undefined)

  private handlers = new Map<string, HandlerSet>()

  private nodes = new Map<number, MockNode>()
  private files = new Map<number, Uint8Array>()
  private secrets = new Map<number, Uint8Array>()
  private otpSecrets = new Map<string, {secret: string; digits: number; period: number}>()

  private nextId = 1
  private passmanagerRevision = 0
  private passmanagerNextNodeId = 1
  private passmanagerFolders = new Set<string>()
  private passmanagerFolderMeta = new Map<string, MockPassmanagerFolderMeta>()
  private passmanagerTags: string[] = []
  private passmanagerEntries = new Map<string, {nodeId: number; meta: Record<string, unknown>}>()
  private passmanagerSecrets = new Map<string, string>()
  private passmanagerOtpSecrets = new Map<string, {secret: string; digits: number; period: number}>()
  private passmanagerIcons = new Map<string, MockPassmanagerIcon>()

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

  private serializePassmanager(): string {
    const data: PersistedPassmanagerState = {
      version: 1,
      revision: this.passmanagerRevision,
      nextNodeId: this.passmanagerNextNodeId,
      folders: Array.from(this.passmanagerFolders).sort(),
      foldersMeta: Array.from(this.passmanagerFolderMeta.entries())
        .map(([path, meta]) => ({
          path,
          ...('iconRef' in meta ? {iconRef: meta.iconRef ?? null} : {}),
          ...('description' in meta ? {description: meta.description ?? null} : {}),
        }))
        .sort((left, right) => left.path.localeCompare(right.path)),
      tags: this.effectivePassmanagerTags(),
      entries: Array.from(this.passmanagerEntries.entries())
        .map(([, value]) => ({
          nodeId: value.nodeId,
          meta: structuredClone(value.meta),
        }))
        .sort((left, right) => {
          const leftId = typeof left.meta['id'] === 'string' ? left.meta['id'] : ''
          const rightId = typeof right.meta['id'] === 'string' ? right.meta['id'] : ''
          return leftId.localeCompare(rightId)
        }),
      secrets: Array.from(this.passmanagerSecrets.entries()).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
      otpSecrets: Array.from(this.passmanagerOtpSecrets.entries()).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
      icons: Array.from(this.passmanagerIcons.entries()).sort(([left], [right]) => left.localeCompare(right)),
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

  private deserializePassmanager(json: PersistedPassmanagerState): void {
    this.passmanagerRevision = typeof json.revision === 'number' ? json.revision : 0
    this.passmanagerNextNodeId = typeof json.nextNodeId === 'number' ? json.nextNodeId : 1

    this.passmanagerFolders.clear()
    for (const folder of json.folders ?? []) {
      const normalized = this.normalizePassmanagerFolderPath(folder)
      if (!normalized) continue
      this.passmanagerFolders.add(normalized)
    }

    this.passmanagerFolderMeta.clear()
    for (const item of json.foldersMeta ?? []) {
      if (!item || typeof item !== 'object') continue
      const path = this.normalizePassmanagerFolderPath((item as {path?: string}).path)
      if (!path) continue
      const nextMeta: MockPassmanagerFolderMeta = {}
      if ('iconRef' in item) {
        const iconRef = typeof item.iconRef === 'string' && item.iconRef.trim() ? item.iconRef : null
        if (iconRef) nextMeta.iconRef = iconRef
      }
      if ('description' in item) {
        const description =
          typeof item.description === 'string' && item.description.trim() ? item.description.trim() : null
        if (description) nextMeta.description = description
      }
      if ('iconRef' in nextMeta || 'description' in nextMeta) {
        this.passmanagerFolderMeta.set(path, nextMeta)
      }
    }

    this.passmanagerTags = normalizeCredentialTagCatalog(json.tags ?? [])

    this.passmanagerEntries.clear()
    for (const item of json.entries ?? []) {
      if (!item || typeof item !== 'object') continue
      const metaRaw = item.meta && typeof item.meta === 'object' ? structuredClone(item.meta) : undefined
      if (!metaRaw) continue
      const meta = metaRaw as Record<string, unknown>
      const entryId = toOptionalString(meta['id'] ?? meta['entry_id'])
      if (!entryId) continue
      const nodeId =
        typeof item.nodeId === 'number' && Number.isFinite(item.nodeId)
          ? Math.trunc(item.nodeId)
          : this.passmanagerNextNodeId++
      const folderPath = this.normalizePassmanagerFolderPath(meta['folderPath'] ?? meta['groupPath'])
      if (folderPath) {
        meta['folderPath'] = folderPath
        this.ensurePassmanagerFolder(folderPath)
      } else {
        delete meta['folderPath']
      }
      this.passmanagerEntries.set(entryId, {nodeId, meta})
      this.passmanagerNextNodeId = Math.max(this.passmanagerNextNodeId, nodeId + 1)
    }

    this.passmanagerSecrets.clear()
    for (const [key, value] of json.secrets ?? []) {
      if (typeof key !== 'string' || typeof value !== 'string') continue
      this.passmanagerSecrets.set(key, value)
    }

    this.passmanagerOtpSecrets.clear()
    for (const [key, value] of json.otpSecrets ?? []) {
      if (typeof key !== 'string' || !value || typeof value !== 'object') continue
      const secret = toOptionalString((value as {secret?: unknown}).secret)
      if (!secret) continue
      this.passmanagerOtpSecrets.set(key, {
        secret,
        digits: toNumberValue((value as {digits?: unknown}).digits) ?? 6,
        period: toNumberValue((value as {period?: unknown}).period) ?? 30,
      })
    }

    this.passmanagerIcons.clear()
    for (const [key, value] of json.icons ?? []) {
      if (typeof key !== 'string' || !value || typeof value !== 'object') continue
      this.passmanagerIcons.set(key, structuredClone(value))
    }
  }

  private effectivePassmanagerTags(extraTags: readonly string[] = []): string[] {
    const assignedTags = Array.from(this.passmanagerEntries.values()).flatMap(({meta}) =>
      normalizeCredentialTags(meta['tags']),
    )
    return normalizeCredentialTagCatalog([...this.passmanagerTags, ...assignedTags, ...extraTags])
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
    const catalogBody = this.serialize()
    const passmanagerBody = this.serializePassmanager()
    await Promise.all([
      fetch('/api/mock-state', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: catalogBody,
      }),
      fetch('/api/mock-passmanager-state', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: passmanagerBody,
      }),
    ])
  }

  private async loadFromDisk(): Promise<boolean> {
    try {
      const [catalogResp, passmanagerResp] = await Promise.all([
        fetch('/api/mock-state').catch(() => undefined),
        fetch('/api/mock-passmanager-state').catch(() => undefined),
      ])

      let restored = false

      if (catalogResp?.ok) {
        const persisted = (await catalogResp.json()) as PersistedState
        if (persisted && persisted.version === 1 && Array.isArray(persisted.nodes)) {
          this.deserialize(persisted)
          restored = true
          console.info(
            '[MockTransport] Restored persisted catalog state (%d nodes, %d files)',
            this.nodes.size,
            this.files.size,
          )
        }
      }

      if (passmanagerResp?.ok) {
        const persistedPassmanager = (await passmanagerResp.json()) as PersistedPassmanagerState
        if (persistedPassmanager && persistedPassmanager.version === 1) {
          this.deserializePassmanager(persistedPassmanager)
          restored = true
          console.info(
            '[MockTransport] Restored persisted passmanager state (%d folders, %d entries)',
            this.passmanagerFolders.size,
            this.passmanagerEntries.size,
          )
        }
      }

      return restored
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

  private ensureFileSourceRevision(node: MockNode): number {
    if (node.type !== 1) return node.sourceRevision ?? 0
    if (node.sourceRevision === undefined || node.sourceRevision <= 0) {
      node.sourceRevision = nextSourceRevision(node.sourceRevision)
    }
    return node.sourceRevision
  }

  private emitFileUpdated(node: MockNode): void {
    const updateEvent: CatalogEvent = {
      type: CatalogEventType.NODE_UPDATED,
      nodeId: node.id,
      timestamp: node.modtime,
      version: 0,
      metadata: {
        size: node.size,
        mime: node.mimeType,
        modtime: node.modtime,
        sourceRevision: node.sourceRevision,
        mediaInspectedRevision: node.mediaInspectedRevision,
        mediaInfo: node.mediaInfo ?? null,
      },
    }
    this.emit('catalog:event', updateEvent)
  }

  private normalizePassmanagerFolderPath(value: unknown): string {
    if (typeof value !== 'string') return ''
    return value
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join('/')
  }

  private normalizeIconBackgroundColor(value: unknown): string | null {
    if (value === null) return null
    const color = toOptionalString(value)?.toLowerCase()
    if (!color || color.length !== 7 || color.charAt(0) !== String.fromCharCode(35)) return null
    for (let index = 1; index < color.length; index += 1) {
      const code = color.charCodeAt(index)
      if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 102))) return null
    }
    return color
  }

  private ensurePassmanagerFolder(folderPath: string): void {
    const normalized = this.normalizePassmanagerFolderPath(folderPath)
    if (!normalized) return

    let current = ''
    for (const segment of normalized.split('/')) {
      current = current ? `${current}/${segment}` : segment
      this.passmanagerFolders.add(current)
    }
  }

  private bumpPassmanagerRevision(): void {
    this.passmanagerRevision += 1
    this.emit('passmanager:changed', {revision: this.passmanagerRevision})
    this.scheduleSave()
  }

  private resolvePassmanagerOtpTarget(params: {
    otpId?: string
    entryId?: string
    label?: string
  }): {entryId: string; label: string; key: string} | undefined {
    const normalize = (value: unknown): string | undefined => {
      if (typeof value !== 'string') return undefined
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : undefined
    }

    const otpId = normalize(params.otpId)
    const entryId = normalize(params.entryId)
    const fallbackLabel = normalize(params.label)

    if (!otpId && !entryId) return undefined

    for (const [currentEntryId, entry] of this.passmanagerEntries.entries()) {
      if (entryId && currentEntryId !== entryId) continue
      const otps = Array.isArray(entry.meta['otps'])
        ? (entry.meta['otps'] as Array<{id?: unknown; label?: unknown}>)
        : []

      if (otpId) {
        const found = otps.find((otp) => normalize(otp?.id) === otpId)
        if (found) {
          const label = normalize(found.label) ?? normalize(found.id) ?? fallbackLabel ?? otpId
          return {entryId: currentEntryId, label, key: `${currentEntryId}:${label}`}
        }
      }

      if (entryId && currentEntryId === entryId) {
        const label =
          fallbackLabel ??
          (otps.length === 1 ? (normalize(otps[0]?.label) ?? normalize(otps[0]?.id)) : undefined)
        if (label) {
          return {entryId: currentEntryId, label, key: `${currentEntryId}:${label}`}
        }
      }
    }

    return undefined
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
      mediaInfo: normalizeFileMediaInfo((params as {mediaInfo?: unknown}).mediaInfo),
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
        sourceRevision: node.sourceRevision,
        mediaInfo: node.mediaInfo ?? null,
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
      r: node.sourceRevision,
      q: node.mediaInspectedRevision,
      u: node.mediaInfo ? toCompactFileMediaInfo(node.mediaInfo) : undefined,
      c: children,
    }

    return out
  }

  private toCatalogSummaryJSON(id: number): CatalogJSON {
    const full = this.toCatalogJSON(id)
    const node = this.nodes.get(id)
    return {
      ...full,
      c: undefined,
      h: Boolean(node && (node.type === 0 || node.type === 255) && node.children.length > 0),
    }
  }

  private toCatalogFolderItem(node: MockNode) {
    return {
      node_id: node.id,
      name: node.name,
      is_dir: node.type === 0 || node.type === 255,
      size: node.type === 1 ? node.size : null,
      mime_type: node.mimeType ?? null,
      media_info: node.mediaInfo ?? null,
      media_inspected_revision: node.mediaInspectedRevision ?? 0,
      created_at: node.modtime,
      updated_at: node.modtime,
    }
  }

  private mockNodeMatchesFilter(
    parentPath: string,
    node: MockNode,
    filter?: CatalogFolderFilter | null,
  ): boolean {
    if (!filter?.include_hidden && node.name.startsWith('.')) return false

    const query = filter?.query?.trim().toLowerCase()
    if (query) {
      const path = parentPath === '/' ? `/${node.name}` : `${parentPath}/${node.name}`
      if (!node.name.toLowerCase().includes(query) && !path.toLowerCase().includes(query)) return false
    }

    const fileTypes = filter?.file_types ?? []
    if (fileTypes.length > 0 && node.type === 1) {
      const mime = node.mimeType?.toLowerCase() ?? ''
      const ext = mockExtension(node.name)
      if (!fileTypes.some((type) => mime.includes(type.toLowerCase()) || ext === type.toLowerCase())) {
        return false
      }
    }

    return true
  }

  private compareMockNodes(sort?: CatalogFolderSort | null): (left: MockNode, right: MockNode) => number {
    return (left, right) => {
      const leftDir = left.type === 0 || left.type === 255
      const rightDir = right.type === 0 || right.type === 255
      if (leftDir !== rightDir) return leftDir ? -1 : 1

      const sortBy = sort?.by ?? 'name'
      let result = 0
      if (sortBy === 'size') result = left.size - right.size
      else if (sortBy === 'date') result = left.modtime - right.modtime
      else if (sortBy === 'type') result = mockExtension(left.name).localeCompare(mockExtension(right.name))
      else result = left.name.localeCompare(right.name)

      if (result === 0) result = left.name.localeCompare(right.name)
      return sort?.direction === 'desc' ? -result : result
    }
  }

  private getFolderPage(request: CatalogFolderPageRequest) {
    const path = normalizePath(request.path || '/')
    const id = this.findIdByPath(path)
    if (id === undefined) return err(`Path not found: ${path}`)

    const node = this.nodes.get(id)
    if (!node) return err(`Path not found: ${path}`)

    const limit = Math.max(1, Math.min(request.limit ?? 200, 500))
    const offset = Math.max(0, request.offset ?? 0)
    const children = node.children
      .map((cid) => this.nodes.get(cid))
      .filter((child): child is MockNode => Boolean(child))
      .filter((child) => this.mockNodeMatchesFilter(path, child, request.filter))
      .sort(this.compareMockNodes(request.sort))
    const items = children.slice(offset, offset + limit).map((child) => this.toCatalogFolderItem(child))

    return ok({
      current_path: path,
      version: 1,
      total_count: children.length,
      offset,
      limit,
      next_offset: offset + items.length < children.length ? offset + items.length : null,
      reload_required: false,
      items,
    })
  }

  private isMockMarkdownNote(node: MockNode): boolean {
    if (node.type !== 1) return false
    const ext = mockExtension(node.name)
    const mime = node.mimeType?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
    return ext === 'md' || ext === 'markdown' || mime === 'text/markdown'
  }

  private collectMockNotes(parentPath: string, id: number, out: CatalogNotesListItem[]): void {
    const node = this.nodes.get(id)
    if (!node) return

    for (const childId of node.children) {
      const child = this.nodes.get(childId)
      if (!child || child.name.startsWith('.')) continue

      const path = parentPath === '/' ? `/${child.name}` : `${parentPath}/${child.name}`
      if (child.type === 0 || child.type === 255) {
        this.collectMockNotes(path, child.id, out)
        continue
      }

      if (!this.isMockMarkdownNote(child)) continue

      out.push({
        node_id: child.id,
        name: child.name,
        path: normalizePath(path),
        parent_path: mockParentPath(path),
        size: child.size,
        mime_type: child.mimeType ?? null,
        source_revision: child.sourceRevision ?? 0,
        created_at: child.modtime,
        updated_at: child.modtime,
      })
    }
  }

  private getNotesList() {
    const items: CatalogNotesListItem[] = []
    this.collectMockNotes('/', 0, items)
    return ok({
      version: 1,
      items,
    })
  }

  async sendCatalog(command: string, data: Record<string, unknown>): Promise<unknown> {
    if (command.startsWith('passmanager:')) {
      return this.sendPassmanager(command, data)
    }

    const result = await (async () => {
      try {
        switch (command) {
          case 'catalog:sync:manifest': {
            const root = this.nodes.get(0)
            const children = root?.children ?? []
            const rootSummaries = children
              .map((id) => this.nodes.get(id))
              .filter((node): node is MockNode => Boolean(node))
              .filter((node) => !node.name.startsWith('.'))
              .map((node) => this.toCatalogSummaryJSON(node.id))
            return ok({
              root_version: 1,
              format: 'manifest',
              manifest_budget_bytes: 128 * 1024,
              shards: rootSummaries.map((node) => ({
                shard_id: node.n,
                version: 1,
                size: node.s,
                node_count: 1,
                strategy: 'lazy',
                has_deltas: false,
                loaded: false,
              })),
              root_summaries: rootSummaries,
              eager_data: {},
            })
          }

          case 'catalog:subscribe':
          case 'catalog:unsubscribe': {
            return ok(undefined)
          }

          case 'catalog:folder:list': {
            return this.getFolderPage({
              path: toStringValue(data['path']) ?? '/',
              offset: toNumberValue(data['offset']) ?? 0,
              limit: toNumberValue(data['limit']),
              expected_version: toNumberValue(data['expected_version'] ?? data['expectedVersion']),
              sort: (data['sort'] as CatalogFolderSort | undefined) ?? null,
              filter: (data['filter'] as CatalogFolderFilter | undefined) ?? null,
            })
          }

          case 'catalog:folder:batch': {
            const pages = Array.isArray(data['pages']) ? (data['pages'] as CatalogFolderPageRequest[]) : []
            const seen = new Set<string>()
            const out = []
            for (const page of pages.slice(0, 4)) {
              const key = JSON.stringify(page)
              if (seen.has(key)) continue
              seen.add(key)
              const response = this.getFolderPage(page)
              if (!response.ok) return response
              out.push(response.result)
            }
            return ok({pages: out, truncated: pages.length > 4, warnings: []})
          }

          case 'catalog:notes:list': {
            return this.getNotesList()
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
                  sourceRevision: n.sourceRevision,
                  mediaInspectedRevision: n.mediaInspectedRevision,
                  mediaInfo: n.mediaInfo ?? null,
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

          case 'catalog:source:metadata': {
            const nodeId = toNumberValue(data['nodeId'] ?? data['node_id'])
            if (nodeId === undefined) return err('nodeId is required')

            const node = this.nodes.get(nodeId)
            if (!node) return err(`NODE_NOT_FOUND:${nodeId}`)
            if (node.type !== 1) return err(`ERR_NOT_FILE:${nodeId}`)
            const sourceRevision = this.ensureFileSourceRevision(node)
            this.scheduleSave()

            return ok({
              nodeId: node.id,
              nodeType: node.type,
              name: node.name,
              mimeType: node.mimeType ?? null,
              size: node.size,
              sourceRevision,
              mediaInspectedRevision: node.mediaInspectedRevision ?? null,
              mediaInfo: node.mediaInfo ?? null,
            })
          }

          case 'catalog:media:inspect': {
            const nodeId = toNumberValue(data['nodeId'] ?? data['node_id'])
            if (nodeId === undefined) return err('nodeId is required')

            const node = this.nodes.get(nodeId)
            if (!node) return err(`NODE_NOT_FOUND:${nodeId}`)
            if (node.type !== 1) return err(`ERR_NOT_FILE:${nodeId}`)
            const sourceRevision = this.ensureFileSourceRevision(node)
            const mediaInfo = node.mediaInfo ?? inferMockMediaInfo(node.name, node.mimeType)
            node.mediaInfo = mediaInfo
            node.mediaInspectedRevision = sourceRevision
            this.emitFileUpdated(node)
            this.scheduleSave()

            return ok({
              nodeId: node.id,
              mediaInfo,
              sourceRevision,
              mediaInspectedRevision: node.mediaInspectedRevision,
            })
          }

          default:
            return err(`Unsupported command: ${command}`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        this.lastError.set(msg)
        return err(msg)
      }
    })()

    this.logTransportCall('catalog', command, data, result)
    return result
  }

  async sendPassmanager(command: string, data: Record<string, unknown>): Promise<unknown> {
    const result = await (async () => {
      try {
        switch (command) {
          case 'passmanager:subscribe':
          case 'passmanager:unsubscribe': {
            return ok(undefined)
          }

          case 'passmanager:entry:save': {
            const entryId = toOptionalString(data['entry_id'] ?? data['id']) ?? crypto.randomUUID()
            const title = toOptionalString(data['title'])
            const entryType = toOptionalString(data['entry_type'] ?? data['entryType']) ?? 'login'
            if (!title) return err('title is required')
            if (entryType !== 'login' && entryType !== 'payment_card') return err('invalid entry_type')
            const existing = this.passmanagerEntries.get(entryId)
            const folderPath = this.normalizePassmanagerFolderPath(
              data['group_path'] ?? data['groupPath'] ?? data['folderPath'],
            )
            if (folderPath) {
              this.ensurePassmanagerFolder(folderPath)
            }

            const nextMeta = structuredClone(existing?.meta ?? {})
            const now = Date.now()
            const createdTs =
              toNumberValue(data['createdTs'] ?? data['created_ts']) ??
              toNumberValue(existing?.meta['createdTs'] ?? existing?.meta['created_ts']) ??
              now
            const updatedTs = toNumberValue(data['updatedTs'] ?? data['updated_ts']) ?? now
            nextMeta['id'] = entryId
            nextMeta['title'] = title
            nextMeta['entry_type'] = entryType
            nextMeta['createdTs'] = createdTs
            nextMeta['updatedTs'] = updatedTs
            delete nextMeta['created_ts']
            delete nextMeta['updated_ts']
            if (folderPath) {
              nextMeta['folderPath'] = folderPath
            } else {
              delete nextMeta['folderPath']
            }
            if ('icon_ref' in data || 'iconRef' in data) {
              const iconRef = toOptionalString(data['icon_ref'] ?? data['iconRef'])
              if (iconRef) nextMeta['iconRef'] = iconRef
              else delete nextMeta['iconRef']
            }
            if ('tags' in data) {
              const tags = normalizeCredentialTags(data['tags'])
              if (tags.length > 0) nextMeta['tags'] = tags
              else delete nextMeta['tags']
            }
            if (entryType === 'payment_card') {
              const paymentCard =
                data['payment_card'] && typeof data['payment_card'] === 'object'
                  ? structuredClone(data['payment_card'])
                  : data['paymentCard'] && typeof data['paymentCard'] === 'object'
                    ? structuredClone(data['paymentCard'])
                    : undefined
              if (!paymentCard) return err('payment_card is required')
              nextMeta['payment_card'] = paymentCard
              delete nextMeta['username']
              delete nextMeta['urls']
              delete nextMeta['otps']
              delete nextMeta['sshKeys']
            } else {
              nextMeta['username'] = toOptionalString(data['username']) ?? ''
              nextMeta['urls'] = Array.isArray(data['urls']) ? structuredClone(data['urls']) : []
              if (Array.isArray(data['otps'])) nextMeta['otps'] = structuredClone(data['otps'])
              if (Array.isArray(data['sshKeys'])) nextMeta['sshKeys'] = structuredClone(data['sshKeys'])
              delete nextMeta['payment_card']
            }
            const importSource = data['import_source']
            if (importSource && typeof importSource === 'object') {
              nextMeta['import_source'] = structuredClone(importSource)
            }

            this.passmanagerEntries.set(entryId, {
              nodeId: existing?.nodeId ?? this.passmanagerNextNodeId++,
              meta: nextMeta,
            })
            this.bumpPassmanagerRevision()
            return ok({entry_id: entryId})
          }

          case 'passmanager:entry:read': {
            const entryId = toOptionalString(data['entry_id'])
            if (!entryId) return err('entry_id is required')
            const entry = this.passmanagerEntries.get(entryId)
            if (!entry) return err('entry_not_found')
            return ok({entry: structuredClone(entry.meta)})
          }

          case 'passmanager:entry:delete': {
            const entryId = toOptionalString(data['entry_id'])
            if (!entryId) return err('entry_id is required')
            if (!this.passmanagerEntries.has(entryId)) return err('entry_not_found')
            this.passmanagerEntries.delete(entryId)
            for (const key of [...this.passmanagerSecrets.keys()]) {
              if (key.startsWith(`${entryId}:`)) this.passmanagerSecrets.delete(key)
            }
            for (const key of [...this.passmanagerOtpSecrets.keys()]) {
              if (key.startsWith(`${entryId}:`)) this.passmanagerOtpSecrets.delete(key)
            }
            this.bumpPassmanagerRevision()
            return ok(undefined)
          }

          case 'passmanager:entry:move': {
            const entryId = toOptionalString(data['entry_id'])
            if (!entryId) return err('entry_id is required')
            const entry = this.passmanagerEntries.get(entryId)
            if (!entry) return err('entry_not_found')
            const targetGroupPath = this.normalizePassmanagerFolderPath(data['target_group_path'])
            if (targetGroupPath) this.ensurePassmanagerFolder(targetGroupPath)
            if (targetGroupPath) entry.meta['folderPath'] = targetGroupPath
            else delete entry.meta['folderPath']
            this.bumpPassmanagerRevision()
            return ok(undefined)
          }

          case 'passmanager:entry:rename': {
            const entryId = toOptionalString(data['entry_id'])
            const newTitle = toOptionalString(data['new_title'])
            if (!entryId) return err('entry_id is required')
            if (!newTitle) return err('new_title is required')
            const entry = this.passmanagerEntries.get(entryId)
            if (!entry) return err('entry_not_found')
            const now = Date.now()
            entry.meta['createdTs'] =
              toNumberValue(entry.meta['createdTs'] ?? entry.meta['created_ts']) ?? now
            entry.meta['updatedTs'] = now
            delete entry.meta['created_ts']
            delete entry.meta['updated_ts']
            entry.meta['title'] = newTitle
            this.bumpPassmanagerRevision()
            return ok(undefined)
          }

          case 'passmanager:entry:list': {
            const entries = Array.from(this.passmanagerEntries.values())
              .map(({meta}) => {
                const folderPath = this.normalizePassmanagerFolderPath(
                  meta['folderPath'] ?? meta['groupPath'],
                )
                const entry = structuredClone(meta) as Record<string, unknown>
                if (folderPath) entry['groupPath'] = folderPath
                return entry
              })
              .sort((left, right) => String(left['id'] ?? '').localeCompare(String(right['id'] ?? '')))
            const folders = Array.from(this.passmanagerFolders)
              .sort((left, right) => left.localeCompare(right))
              .map((path) => ({path, name: path.split('/').pop() ?? path}))
            return ok({entries, folders})
          }

          case 'passmanager:secret:save': {
            const entryId = toOptionalString(data['entry_id'] ?? data['entryId'])
            const secretType = toOptionalString(data['secret_type'] ?? data['secretType'] ?? data['type'])
            const hasValue = Object.prototype.hasOwnProperty.call(data, 'value')
            if (!entryId) return err('entry_id is required')
            if (!secretType) return err('secret_type is required')
            if (!hasValue) return err('value is required')
            const entry = this.passmanagerEntries.get(entryId)
            if (!entry) return err('entry_not_found')
            const entryType = toOptionalString(entry.meta['entry_type']) ?? 'login'
            if (
              (entryType === 'login' && (secretType === 'card_pan' || secretType === 'card_cvv')) ||
              (entryType === 'payment_card' && secretType === 'password')
            ) {
              return err('secret_type is incompatible with entry_type')
            }
            const key = `${entryId}:${secretType}`
            const value = data['value']
            if (value === null) {
              this.passmanagerSecrets.delete(key)
              if (secretType === 'card_pan') {
                const paymentCard =
                  entry.meta['payment_card'] && typeof entry.meta['payment_card'] === 'object'
                    ? (entry.meta['payment_card'] as Record<string, unknown>)
                    : undefined
                if (paymentCard) delete paymentCard['last4']
              }
              this.bumpPassmanagerRevision()
              return ok(undefined)
            }
            if (typeof value !== 'string') return err('value must be string')
            const normalizedValue =
              secretType === 'card_pan' || secretType === 'card_cvv' ? value.replace(/\D+/g, '') : value
            this.passmanagerSecrets.set(key, normalizedValue)
            if (secretType === 'card_pan') {
              const paymentCard =
                entry.meta['payment_card'] && typeof entry.meta['payment_card'] === 'object'
                  ? (entry.meta['payment_card'] as Record<string, unknown>)
                  : undefined
              if (paymentCard) paymentCard['last4'] = normalizedValue.slice(-4)
            }
            this.bumpPassmanagerRevision()
            return ok(undefined)
          }

          case 'passmanager:secret:read': {
            const entryId = toOptionalString(data['entry_id'] ?? data['entryId'])
            const secretType = toOptionalString(data['secret_type'] ?? data['secretType'] ?? data['type'])
            if (!entryId) return err('entry_id is required')
            if (!secretType) return err('secret_type is required')
            const value = this.passmanagerSecrets.get(`${entryId}:${secretType}`)
            if (value === undefined) return err('secret_not_found')
            return ok({value})
          }

          case 'passmanager:secret:delete': {
            const entryId = toOptionalString(data['entry_id'] ?? data['entryId'])
            const secretType = toOptionalString(data['secret_type'] ?? data['secretType'] ?? data['type'])
            if (!entryId) return err('entry_id is required')
            if (!secretType) return err('secret_type is required')
            this.passmanagerSecrets.delete(`${entryId}:${secretType}`)
            if (secretType === 'card_pan') {
              const entry = this.passmanagerEntries.get(entryId)
              const paymentCard =
                entry?.meta['payment_card'] && typeof entry.meta['payment_card'] === 'object'
                  ? (entry.meta['payment_card'] as Record<string, unknown>)
                  : undefined
              if (paymentCard) delete paymentCard['last4']
            }
            this.bumpPassmanagerRevision()
            return ok(undefined)
          }

          case 'passmanager:ssh:keygen': {
            const entryId = toOptionalString(data['entry_id'] ?? data['entryId'])
            const keyType = toOptionalString(data['key_type'] ?? data['keyType'])
            const comment = toStringValue(data['comment']) ?? ''
            if (!entryId) return err('entry_id is required')
            if (!keyType) return err('key_type is required')
            if (!this.passmanagerEntries.has(entryId)) return err('entry_not_found')
            if (keyType !== 'ed25519' && keyType !== 'rsa' && keyType !== 'ecdsa') {
              return err(`Unsupported SSH key type: ${keyType}`)
            }

            const generated = await createMockSshKeyMaterial(keyType, comment)
            this.passmanagerSecrets.set(
              `${entryId}:ssh_private_key:${generated.key_id}`,
              generated.private_key_openssh,
            )
            this.passmanagerSecrets.set(
              `${entryId}:ssh_public_key:${generated.key_id}`,
              generated.public_key_openssh,
            )
            this.bumpPassmanagerRevision()

            return ok({
              key_id: generated.key_id,
              public_key_openssh: generated.public_key_openssh,
              fingerprint: generated.fingerprint,
              key_type: generated.key_type,
            })
          }

          case 'passmanager:group:ensure': {
            const path = this.normalizePassmanagerFolderPath(data['path'])
            if (!path) return err('path is required')
            this.ensurePassmanagerFolder(path)
            this.bumpPassmanagerRevision()
            return ok(undefined)
          }

          case 'passmanager:group:list': {
            const groups = Array.from(this.passmanagerFolders)
              .sort((left, right) => left.localeCompare(right))
              .map((path) => ({path, name: path.split('/').pop() ?? path}))
            return ok({groups})
          }

          case 'passmanager:group:delete': {
            const path = this.normalizePassmanagerFolderPath(data['path'])
            if (!path) return err('path is required')
            const prefix = `${path}/`
            for (const [entryId, entry] of [...this.passmanagerEntries.entries()]) {
              const entryFolder = this.normalizePassmanagerFolderPath(
                entry.meta['folderPath'] ?? entry.meta['groupPath'],
              )
              if (entryFolder !== path && !entryFolder.startsWith(prefix)) continue
              this.passmanagerEntries.delete(entryId)
              for (const key of [...this.passmanagerSecrets.keys()]) {
                if (key.startsWith(`${entryId}:`)) this.passmanagerSecrets.delete(key)
              }
              for (const key of [...this.passmanagerOtpSecrets.keys()]) {
                if (key.startsWith(`${entryId}:`)) this.passmanagerOtpSecrets.delete(key)
              }
            }
            for (const folder of [...this.passmanagerFolders]) {
              if (folder === path || folder.startsWith(prefix)) this.passmanagerFolders.delete(folder)
            }
            for (const folder of [...this.passmanagerFolderMeta.keys()]) {
              if (folder === path || folder.startsWith(prefix)) this.passmanagerFolderMeta.delete(folder)
            }
            this.bumpPassmanagerRevision()
            return ok(undefined)
          }

          case 'passmanager:group:setMeta': {
            const path = this.normalizePassmanagerFolderPath(data['path'])
            if (!path) return err('path is required')
            this.ensurePassmanagerFolder(path)
            const nextMeta = {...(this.passmanagerFolderMeta.get(path) ?? {})}
            let touched = false

            if ('icon_ref' in data || 'iconRef' in data) {
              touched = true
              const iconRef = toOptionalString(data['icon_ref'] ?? data['iconRef'])
              if (iconRef) nextMeta.iconRef = iconRef
              else delete nextMeta.iconRef
            }

            if ('description' in data) {
              touched = true
              const description = toOptionalString(data['description'])
              if (description) nextMeta.description = description
              else delete nextMeta.description
            }

            if (!touched) return err('icon_ref or description is required')

            if (!('iconRef' in nextMeta) && !('description' in nextMeta)) {
              this.passmanagerFolderMeta.delete(path)
            } else {
              this.passmanagerFolderMeta.set(path, nextMeta)
            }
            this.bumpPassmanagerRevision()
            return ok(undefined)
          }

          case 'passmanager:root:import': {
            const mode = toStringValue(data['mode']) ?? 'merge'
            if (mode !== 'merge' && mode !== 'replace' && mode !== 'restore') {
              return err('mode must be one of: merge, replace, restore')
            }
            const allowDestructive = data['allow_destructive'] === true || data['allowDestructive'] === true
            const destructiveMode = mode === 'replace' || mode === 'restore'
            if (destructiveMode && !allowDestructive) {
              return err('destructive root import requires allow_destructive=true')
            }

            if (destructiveMode && allowDestructive) {
              this.passmanagerFolders.clear()
              this.passmanagerFolderMeta.clear()
              this.passmanagerTags = []
              this.passmanagerEntries.clear()
              this.passmanagerSecrets.clear()
              this.passmanagerOtpSecrets.clear()
            }

            const importFolders = Array.isArray(data['folders'])
              ? (data['folders'] as Array<string | Record<string, unknown>>)
              : []
            for (const folder of importFolders) {
              const path =
                typeof folder === 'string'
                  ? this.normalizePassmanagerFolderPath(folder)
                  : this.normalizePassmanagerFolderPath((folder as Record<string, unknown>)['path'])
              if (path) this.ensurePassmanagerFolder(path)
            }

            const importEntries = Array.isArray(data['entries'])
              ? (data['entries'] as Record<string, unknown>[])
              : []
            for (const rawEntry of importEntries) {
              const entryId = toOptionalString(rawEntry['id'] ?? rawEntry['entry_id']) ?? crypto.randomUUID()
              const folderPath = this.normalizePassmanagerFolderPath(
                rawEntry['folderPath'] ?? rawEntry['groupPath'],
              )
              if (folderPath) this.ensurePassmanagerFolder(folderPath)
              this.passmanagerEntries.set(entryId, {
                nodeId: this.passmanagerEntries.get(entryId)?.nodeId ?? this.passmanagerNextNodeId++,
                meta: {
                  ...structuredClone(rawEntry),
                  id: entryId,
                  ...(folderPath ? {folderPath} : {}),
                },
              })
            }

            const importedTags = Array.isArray(data['tags'])
              ? normalizeCredentialTagCatalog(data['tags'])
              : []
            this.passmanagerTags = destructiveMode
              ? this.effectivePassmanagerTags(importedTags)
              : normalizeCredentialTagCatalog([...this.passmanagerTags, ...this.effectivePassmanagerTags(importedTags)])

            const foldersMeta = Array.isArray(data['folders_meta'] ?? data['foldersMeta'])
              ? ((data['folders_meta'] ?? data['foldersMeta']) as Array<Record<string, unknown>>)
              : []
            for (const item of foldersMeta) {
              const path = this.normalizePassmanagerFolderPath(item['path'])
              if (!path) continue
              this.ensurePassmanagerFolder(path)
              const nextMeta: MockPassmanagerFolderMeta = {}
              const iconRef = toOptionalString(item['iconRef'] ?? item['icon_ref'])
              const description = toOptionalString(item['description'])
              if (iconRef) nextMeta.iconRef = iconRef
              if (description) nextMeta.description = description
              if ('iconRef' in nextMeta || 'description' in nextMeta) {
                this.passmanagerFolderMeta.set(path, nextMeta)
              } else {
                this.passmanagerFolderMeta.delete(path)
              }
            }

            this.bumpPassmanagerRevision()
            return ok(undefined)
          }

          case 'passmanager:tags:setCatalog': {
            if (!Array.isArray(data['tags'])) return err('tags must be string[]')
            this.passmanagerTags = normalizeCredentialTagCatalog(data['tags'])
            this.bumpPassmanagerRevision()
            return ok(undefined)
          }

          case 'passmanager:root:export': {
            const entries = Array.from(this.passmanagerEntries.values())
              .map(({meta}) => {
                const next = structuredClone(meta)
                const folderPath = this.normalizePassmanagerFolderPath(
                  next['folderPath'] ?? next['groupPath'],
                )
                if (folderPath) next['folderPath'] = folderPath
                else next['folderPath'] = null
                delete next['groupPath']
                const entryId = toOptionalString(next['id'])
                const entryType = toOptionalString(next['entry_type']) ?? 'login'
                if (entryId) {
                  if (entryType === 'payment_card') {
                    const cardPan = this.passmanagerSecrets.get(`${entryId}:card_pan`)
                    const cardCvv = this.passmanagerSecrets.get(`${entryId}:card_cvv`)
                    const note = this.passmanagerSecrets.get(`${entryId}:note`)
                    if (cardPan) next['card_pan'] = cardPan
                    if (cardCvv) next['card_cvv'] = cardCvv
                    if (note) next['note'] = note
                  } else {
                    const password = this.passmanagerSecrets.get(`${entryId}:password`)
                    const note = this.passmanagerSecrets.get(`${entryId}:note`)
                    if (password) next['password'] = password
                    if (note) next['note'] = note
                  }
                }
                return next
              })
              .sort((left, right) => String(left['id'] ?? '').localeCompare(String(right['id'] ?? '')))
            const folders = Array.from(this.passmanagerFolders).sort((left, right) =>
              left.localeCompare(right),
            )
            const foldersMeta = Array.from(this.passmanagerFolderMeta.entries())
              .map(([path, meta]) => ({
                path,
                ...('iconRef' in meta ? {iconRef: meta.iconRef ?? null} : {}),
                ...('description' in meta ? {description: meta.description ?? null} : {}),
              }))
              .sort((left, right) => left.path.localeCompare(right.path))
            return ok({
              root: {
                version: 1,
                entries,
                folders,
                foldersMeta,
                tags: this.effectivePassmanagerTags(),
              },
            })
          }

          case 'passmanager:otp:generate': {
            const otpId = toOptionalString(data['otp_id'] ?? data['otpId'])
            const entryId = toOptionalString(data['entry_id'] ?? data['entryId'])
            const label = toStringValue(data['label'])
            const resolved = this.resolvePassmanagerOtpTarget({otpId, entryId, label})
            if (!resolved) return err('otp_id or entry_id is required')
            const digits =
              toNumberValue(data['digits']) ?? this.passmanagerOtpSecrets.get(resolved.key)?.digits ?? 6
            const period =
              toNumberValue(data['period']) ?? this.passmanagerOtpSecrets.get(resolved.key)?.period ?? 30
            const ts = toNumberValue(data['ts']) ?? Date.now()
            const entryNodeId = this.passmanagerEntries.get(resolved.entryId)?.nodeId ?? 0
            const counter = Math.floor(ts / (period * 1000))
            const mod = Math.pow(10, digits)
            const value = (counter + entryNodeId) % mod
            const otp = String(value).padStart(digits, '0')
            return ok({otp})
          }

          case 'passmanager:otp:setSecret': {
            const otpId = toOptionalString(data['otp_id'] ?? data['otpId'])
            const entryId = toOptionalString(data['entry_id'] ?? data['entryId'])
            const label = toStringValue(data['label'])
            const resolved = this.resolvePassmanagerOtpTarget({otpId, entryId, label})
            if (!resolved) return err('otp_id or entry_id is required')
            const secret = toOptionalString(data['secret'])
            if (!secret) return err('non-empty secret is required')
            this.passmanagerOtpSecrets.set(resolved.key, {
              secret,
              digits: toNumberValue(data['digits']) ?? 6,
              period: toNumberValue(data['period']) ?? 30,
            })
            this.bumpPassmanagerRevision()
            return ok(undefined)
          }

          case 'passmanager:otp:removeSecret': {
            const otpId = toOptionalString(data['otp_id'] ?? data['otpId'])
            const entryId = toOptionalString(data['entry_id'] ?? data['entryId'])
            const label = toStringValue(data['label'])
            const resolved = this.resolvePassmanagerOtpTarget({otpId, entryId, label})
            if (!resolved) return err('otp_id or entry_id is required')
            this.passmanagerOtpSecrets.delete(resolved.key)
            this.bumpPassmanagerRevision()
            return ok(undefined)
          }

          case 'passmanager:icon:put': {
            const contentBase64 = toOptionalString(data['content_base64'])
            const mimeType = toOptionalString(data['mime_type']) ?? 'image/png'
            const backgroundColor = this.normalizeIconBackgroundColor(data['background_color'])
            if (!contentBase64) return err('content_base64 is required')
            const bytes = base64ToUint8(contentBase64)
            const digestInput = uint8ToArrayBuffer(bytes)
            const digest = await crypto.subtle.digest('SHA-256', digestInput)
            const hex = Array.from(new Uint8Array(digest))
              .map((value) => value.toString(16).padStart(2, '0'))
              .join('')
            const iconRef = `sha256:${hex}`
            const existing = this.passmanagerIcons.get(iconRef)
            const now = Date.now()
            this.passmanagerIcons.set(iconRef, {
              icon_ref: iconRef,
              mime_type: mimeType,
              background_color: backgroundColor ?? existing?.background_color ?? null,
              content_base64: contentBase64,
              width: existing?.width ?? 0,
              height: existing?.height ?? 0,
              bytes: bytes.byteLength,
              created_at: existing?.created_at ?? now,
              updated_at: now,
            })
            this.bumpPassmanagerRevision()
            return ok({
              icon_ref: iconRef,
              background_color: backgroundColor ?? existing?.background_color ?? null,
            })
          }

          case 'passmanager:icon:get': {
            const iconRef = toOptionalString(data['icon_ref'])
            if (!iconRef) return err('icon_ref is required')
            const icon = this.passmanagerIcons.get(iconRef)
            if (!icon) return err('icon_not_found')
            return ok(structuredClone(icon))
          }

          case 'passmanager:icon:list': {
            return ok({
              icons: Array.from(this.passmanagerIcons.values())
                .map((icon) => structuredClone(icon))
                .sort((left, right) => left.icon_ref.localeCompare(right.icon_ref)),
            })
          }

          case 'passmanager:icon:setMeta': {
            const iconRef = toOptionalString(data['icon_ref'])
            if (!iconRef) return err('icon_ref is required')
            const icon = this.passmanagerIcons.get(iconRef)
            if (!icon) return err('icon_not_found')
            icon.background_color = this.normalizeIconBackgroundColor(data['background_color'])
            this.bumpPassmanagerRevision()
            return ok(undefined)
          }

          case 'passmanager:icon:gc': {
            const used = new Set<string>()
            for (const {meta} of this.passmanagerEntries.values()) {
              const iconRef = toOptionalString(meta['iconRef'] ?? meta['icon_ref'])
              if (iconRef) used.add(iconRef)
            }
            for (const meta of this.passmanagerFolderMeta.values()) {
              const iconRef = toOptionalString(meta.iconRef)
              if (iconRef) used.add(iconRef)
            }

            let deleted = 0
            for (const iconRef of [...this.passmanagerIcons.keys()]) {
              if (used.has(iconRef)) continue
              this.passmanagerIcons.delete(iconRef)
              deleted += 1
            }
            if (deleted > 0) this.bumpPassmanagerRevision()
            return ok({deleted})
          }

          default:
            return err(`Unsupported command: ${command}`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        this.lastError.set(msg)
        return err(msg)
      }
    })()

    this.logTransportCall('passmanager', command, data, result)
    return result
  }

  async uploadFile(
    target: number | {parentPath?: string; name: string},
    file: File,
    opts?: {
      chunkSize?: number
      name?: string
      type?: string
      onProgress?: (c: number, t: number, p: number) => void
    },
  ): Promise<{nodeId: number}> {
    const nodeId =
      typeof target === 'number'
        ? target
        : (() => {
            const parentId = this.findIdByPath(target.parentPath ?? '/')
            if (parentId === undefined) throw new Error(`Parent path not found: ${target.parentPath ?? '/'}`)
            return this.createNode({
              parentId,
              name: target.name,
              type: 1,
              size: file.size,
              mimeType: opts?.type ?? file.type,
            }).id
          })()
    const node = this.nodes.get(nodeId)
    if (!node) throw new Error(`Node not found: ${nodeId}`)

    const cs = opts?.chunkSize && opts.chunkSize > 0 ? Math.floor(opts.chunkSize) : 64 * 1024
    const totalChunks = Math.max(1, Math.ceil(file.size / cs))

    const bytes = await readFileBytes(file)
    this.files.set(nodeId, bytes)

    node.size = bytes.byteLength
    node.mimeType = opts?.type ?? (file.type || node.mimeType)
    node.modtime = Date.now()
    node.sourceRevision = nextSourceRevision(node.sourceRevision)
    node.mediaInfo = null
    node.mediaInspectedRevision = 0
    this.emitFileUpdated(node)

    if (opts?.onProgress) {
      for (let chunk = 1; chunk <= totalChunks; chunk++) {
        const percent = Math.min(100, Math.round((chunk / totalChunks) * 100))
        opts.onProgress(chunk, totalChunks, percent)
        await new Promise((r) => setTimeout(r, 0))
      }
    }

    this.scheduleSave()
    return {nodeId}
  }

  async sourceMetadata(nodeId: number): Promise<CatalogSourceMetadata> {
    const node = this.nodes.get(nodeId)
    if (!node) throw new Error(`NODE_NOT_FOUND:${nodeId}`)
    if (node.type !== 1) throw new Error(`ERR_NOT_FILE:${nodeId}`)
    const sourceRevision = this.ensureFileSourceRevision(node)
    this.scheduleSave()

    return {
      nodeId: node.id,
      nodeType: node.type,
      name: node.name,
      mimeType: node.mimeType ?? null,
      size: node.size,
      sourceRevision,
      mediaInspectedRevision: node.mediaInspectedRevision ?? null,
      mediaInfo: node.mediaInfo ?? null,
    }
  }

  async replaceFile(
    nodeId: number,
    bytes: Uint8Array,
    options: CatalogFileReplaceOptions,
  ): Promise<CatalogFileReplaceResult> {
    const node = this.nodes.get(nodeId)
    if (!node) throw new Error(`NODE_NOT_FOUND:${nodeId}`)
    if (node.type !== 1) throw new Error(`ERR_NOT_FILE:${nodeId}`)

    const previousRevision = this.ensureFileSourceRevision(node)
    const conflictMode = options.conflictMode ?? 'fail_if_stale'
    if (
      conflictMode !== 'overwrite' &&
      options.expectedSourceRevision !== null &&
      options.expectedSourceRevision !== previousRevision
    ) {
      const error = new Error('ERR_STALE_SOURCE') as Error & {code?: string}
      error.code = 'ERR_STALE_SOURCE'
      throw error
    }

    const copy = new Uint8Array(bytes)
    this.files.set(nodeId, copy)

    node.size = copy.byteLength
    node.mimeType = options.mimeType ?? node.mimeType ?? 'application/octet-stream'
    node.modtime = Date.now()
    node.sourceRevision = nextSourceRevision(previousRevision)
    node.mediaInfo = null
    node.mediaInspectedRevision = 0
    this.emitFileUpdated(node)
    this.scheduleSave()

    return {
      nodeId,
      size: node.size,
      mimeType: node.mimeType,
      modtime: node.modtime,
      sourceRevision: node.sourceRevision,
      mediaInfo: node.mediaInfo,
      mediaInspectedRevision: node.mediaInspectedRevision,
    }
  }

  async downloadFile(nodeId: number): Promise<AsyncIterable<Uint8Array>> {
    const bytes = this.files.get(nodeId)
    if (!bytes) {
      const node = this.nodes.get(nodeId)
      if (node?.type === 1 && node.size === 0) {
        return (async function* (): AsyncIterable<Uint8Array> {})()
      }
      throw new Error(`File bytes not found: ${nodeId}`)
    }
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
    const res = (await this.sendPassmanager('passmanager:otp:generate', {
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
    const res = (await this.sendPassmanager('passmanager:otp:setSecret', {
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
    const res = (await this.sendPassmanager('passmanager:otp:removeSecret', {
      otp_id: params.otpId,
      entry_id: params.entryId ?? null,
    })) as {ok: boolean; error?: string}
    if (!res.ok) throw new Error(res.error ?? 'passmanager:otp:removeSecret failed')
  }

  private logTransportCall(
    channel: MockTransportLogChannel,
    command: string,
    data: Record<string, unknown>,
    result: unknown,
  ): void {
    if (typeof window === 'undefined' || window.env !== 'dev' || typeof fetch !== 'function') {
      return
    }

    const entry: MockTransportLogEntry = {
      channel,
      command,
      data: structuredClone(data),
      result: structuredClone(result),
      at: Date.now(),
    }

    void fetch(MOCK_TRANSPORT_LOG_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(entry),
    }).catch(() => {})
  }
}
