import type {CatalogService} from '../../../core/catalog/catalog'
import type {ExistingEntryInfo} from '@chromvoid/password-import'
import {PASS_DIR} from '../../../core/pass-utils'
import {normalizeIconFromBase64} from './icon-normalizer'

type CatalogOperations = {
  createDir(name: string, parentPath: string): Promise<{nodeId: number} | {nameExists: true}>
  prepareUpload(
    parentPath: string,
    name: string,
    size: number,
    chunkSize: number,
    mimeType: string,
  ): Promise<{nodeId: number}>
  upload(nodeId: number, size: number, data: Uint8Array): Promise<void>
  setOTPSecret(params: {
    nodeId: number
    entryId?: string
    label: string
    secret: string
    encoding: string
    algorithm: string
    digits: number
    period: number
  }): Promise<void>
  deleteNode(nodeId: number): Promise<void>
  putIcon(contentBase64: string, mimeType: string): Promise<{iconRef: string}>
  setGroupIcon(path: string, iconRef: string | null): Promise<void>
}

type DomainEnvelope<T> = {
  ok?: boolean
  result?: T
  error?: unknown
}

type UploadTarget = {
  parentPath: string
  name: string
}

type MetaShape = {
  id?: unknown
  title?: unknown
  username?: unknown
  urls?: unknown
  otps?: unknown
  iconRef?: unknown
  import_source?: unknown
  importSource?: unknown
}

function normalizeRelativePath(path: string): string {
  const normalized = String(path ?? '').startsWith('/') ? String(path ?? '') : `/${String(path ?? '')}`
  return normalized
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')
}

function parentPathOf(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath)
  const idx = normalized.lastIndexOf('/')
  if (idx <= 0) return ''
  return normalized.slice(0, idx)
}

function basename(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath)
  const idx = normalized.lastIndexOf('/')
  if (idx < 0) return normalized
  return normalized.slice(idx + 1)
}

function isPassmanagerPath(path: string): boolean {
  return path === `/${PASS_DIR}` || path.startsWith(`/${PASS_DIR}/`)
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function toUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      out.push(item)
      continue
    }
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const url = rec['value']
    if (typeof url === 'string' && url.trim()) out.push(url)
  }
  return out
}

function normalizeGroupPathForDomain(groupPath: string): string {
  return groupPath === '' ? '/' : groupPath
}

export function createCatalogOperationsAdapter(catalog: CatalogService): CatalogOperations {
  let nextVirtualNodeId = 2_000_000_000
  let nextUploadNodeId = 2_100_000_000
  let existingLoaded = false

  const uploadTargets = new Map<number, UploadTarget>()
  const virtualPathToNodeId = new Map<string, number>()
  const virtualNodeIdToPath = new Map<number, string>()
  const reservedNames = new Set<string>()
  const entryIdByPath = new Map<string, string>()
  const entryIdByNodeId = new Map<number, string>()

  const collisionKey = (parentPath: string, name: string) =>
    `${normalizeRelativePath(parentPath)}\u0000${name}`

  const domainCall = async <T>(command: string, data: Record<string, unknown>): Promise<T> => {
    const raw = (await catalog.transport.sendCatalog(command, data)) as DomainEnvelope<T> | T
    if (raw && typeof raw === 'object' && 'ok' in (raw as Record<string, unknown>)) {
      const envelope = raw as DomainEnvelope<T>
      if (envelope.ok === false) {
        const message =
          envelope.error instanceof Error
            ? envelope.error.message
            : String(envelope.error ?? `${command} failed`)
        throw new Error(message)
      }
      return (envelope.result ?? (undefined as T)) as T
    }
    return raw as T
  }

  const ensureExistingEntriesLoaded = async (): Promise<void> => {
    if (existingLoaded) return
    existingLoaded = true
    const listed = await domainCall<{entries?: unknown[]}>('passmanager:entry:list', {})
    const entries = Array.isArray(listed?.entries) ? listed.entries : []
    for (const item of entries) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      const title = toStringValue(rec['title'])
      if (!title) continue
      const rawGroupPath = toStringValue(rec['groupPath']) ?? toStringValue(rec['group_path']) ?? '/'
      const relativeGroupPath = normalizeRelativePath(rawGroupPath)
      reservedNames.add(collisionKey(relativeGroupPath, title))
    }
  }

  const ensureGroup = async (relativeGroupPath: string): Promise<void> => {
    if (!relativeGroupPath) return
    await domainCall<void>('passmanager:group:ensure', {path: relativeGroupPath})
  }

  return {
    async createDir(name: string, parentPath: string) {
      await ensureExistingEntriesLoaded()

      const dirName = String(name ?? '').trim()
      if (!dirName) return {nameExists: true as const}

      const relativeParentPath = normalizeRelativePath(parentPath)
      const relativePath = relativeParentPath ? `${relativeParentPath}/${dirName}` : dirName
      const key = collisionKey(relativeParentPath, dirName)

      if (virtualPathToNodeId.has(relativePath) || reservedNames.has(key)) {
        return {nameExists: true as const}
      }

      const nodeId = nextVirtualNodeId++
      virtualPathToNodeId.set(relativePath, nodeId)
      virtualNodeIdToPath.set(nodeId, relativePath)
      reservedNames.add(key)
      return {nodeId}
    },

    async prepareUpload(parentPath: string, name: string, size: number, chunkSize: number, mimeType: string) {
      void size
      void chunkSize
      void mimeType
      const nodeId = nextUploadNodeId++
      uploadTargets.set(nodeId, {
        parentPath: normalizeRelativePath(parentPath),
        name,
      })
      return {nodeId}
    },

    async upload(nodeId: number, size: number, data: Uint8Array) {
      void size
      const target = uploadTargets.get(nodeId)
      if (!target) {
        throw new Error(`Unknown upload target: ${nodeId}`)
      }

      const text = new TextDecoder().decode(data)

      if (target.name === 'meta.json') {
        const meta = JSON.parse(text) as MetaShape
        const entryPath = target.parentPath
        const relativeGroupPath = parentPathOf(entryPath)
        await ensureGroup(relativeGroupPath)

        const fallbackTitle = basename(entryPath) || 'Untitled'
        const title = toStringValue(meta.title) ?? fallbackTitle
        const entryId = toStringValue(meta.id) ?? entryIdByPath.get(entryPath) ?? crypto.randomUUID()
        const username = toStringValue(meta.username) ?? ''
        const urls = toUrlList(meta.urls)
        const groupPath = normalizeGroupPathForDomain(relativeGroupPath)

        const payload: Record<string, unknown> = {
          entry_id: entryId,
          title,
          urls,
          username,
          group_path: groupPath,
        }

        const iconRef = toStringValue(meta.iconRef)
        if (iconRef) {
          payload['icon_ref'] = iconRef
        }

        if (Array.isArray(meta.otps)) {
          payload['otps'] = meta.otps
        }
        const importSourceRaw = meta.import_source ?? meta.importSource
        if (importSourceRaw && typeof importSourceRaw === 'object') {
          payload['import_source'] = importSourceRaw
        }

        const saveResult = await domainCall<{entry_id?: string}>('passmanager:entry:save', payload)
        const resolvedEntryId = toStringValue(saveResult?.entry_id) ?? entryId

        entryIdByPath.set(entryPath, resolvedEntryId)
        const virtualNodeId = virtualPathToNodeId.get(entryPath)
        if (virtualNodeId !== undefined) {
          entryIdByNodeId.set(virtualNodeId, resolvedEntryId)
        }
        return
      }

      if (target.name === '.password' || target.name === '.note') {
        const entryId = entryIdByPath.get(target.parentPath)
        if (!entryId) {
          throw new Error(`Entry id not resolved for ${target.parentPath}`)
        }
        const secretType = target.name === '.password' ? 'password' : 'note'
        await domainCall<void>('passmanager:secret:save', {
          entry_id: entryId,
          secret_type: secretType,
          value: text,
        })
      }
    },

    async setOTPSecret(params: {
      nodeId: number
      entryId?: string
      label: string
      secret: string
      encoding: string
      algorithm: string
      digits: number
      period: number
    }) {
      const entryId = toStringValue(params.entryId) ?? entryIdByNodeId.get(params.nodeId)
      if (!entryId) {
        throw new Error(`Entry id not resolved for OTP node ${params.nodeId}`)
      }
      await domainCall<void>('passmanager:otp:setSecret', {
        entry_id: entryId,
        label: params.label,
        secret: params.secret,
        encoding: params.encoding,
        algorithm: params.algorithm,
        digits: params.digits,
        period: params.period,
      })
    },

    async deleteNode(nodeId: number) {
      const virtualPath = virtualNodeIdToPath.get(nodeId)
      if (virtualPath) {
        const entryId = entryIdByNodeId.get(nodeId) ?? entryIdByPath.get(virtualPath)
        if (entryId) {
          await domainCall<void>('passmanager:entry:delete', {entry_id: entryId})
        }
        return
      }

      const nodePath = catalog.catalog.getPath(nodeId)
      if (!isPassmanagerPath(nodePath)) {
        throw new Error('Access denied')
      }

      const fileName = nodePath.split('/').pop() ?? ''
      if (fileName !== '.password' && fileName !== '.note') {
        return
      }

      const parentPath = nodePath.slice(0, nodePath.lastIndexOf('/')) || '/'
      const parentNode = catalog.catalog.findByPath(parentPath)
      if (!parentNode) return

      await catalog.ensureEntryMeta(parentNode.nodeId)
      const meta = catalog.getEntryMeta(parentNode.nodeId) as {id?: unknown} | undefined
      const entryId = toStringValue(meta?.id)
      if (!entryId) return

      await domainCall<void>('passmanager:secret:delete', {
        entry_id: entryId,
        secret_type: fileName === '.password' ? 'password' : 'note',
      })
    },

    async putIcon(contentBase64: string, mimeType: string) {
      const normalized = await normalizeIconFromBase64(contentBase64, mimeType)
      const result = await domainCall<{icon_ref?: unknown}>('passmanager:icon:put', {
        content_base64: normalized.contentBase64,
        mime_type: normalized.mimeType,
      })
      const iconRef = toStringValue(result?.icon_ref)
      if (!iconRef) throw new Error('passmanager:icon:put did not return icon_ref')
      return {iconRef}
    },

    async setGroupIcon(path: string, iconRef: string | null) {
      const normalizedPath = normalizeRelativePath(path)
      await domainCall<void>('passmanager:group:ensure', {path: normalizedPath})
      await domainCall<void>('passmanager:group:setMeta', {
        path: normalizedPath,
        icon_ref: iconRef,
      })
    },
  }
}

export async function buildExistingEntriesByOriginalId(
  catalog: CatalogService,
): Promise<Map<string, ExistingEntryInfo>> {
  const result = new Map<string, ExistingEntryInfo>()
  const rootPath = `/${PASS_DIR}`
  let nextSyntheticNodeId = 2_200_000_000

  const root = catalog.catalog.findByPath(rootPath)
  if (!root) {
    try {
      const raw = (await catalog.transport.sendCatalog('passmanager:entry:list', {})) as
        | DomainEnvelope<{entries?: unknown[]}>
        | {entries?: unknown[]}
      const listPayload =
        raw && typeof raw === 'object' && 'ok' in (raw as Record<string, unknown>)
          ? ((raw as DomainEnvelope<{entries?: unknown[]}>).result ?? {})
          : raw
      const listPayloadRec =
        listPayload && typeof listPayload === 'object'
          ? (listPayload as Record<string, unknown>)
          : {}
      const entriesRaw = listPayloadRec['entries']
      const entries = Array.isArray(entriesRaw) ? entriesRaw : []
      for (const item of entries) {
        if (!item || typeof item !== 'object') continue
        const rec = item as Record<string, unknown>
        const entryId = toStringValue(rec['id']) ?? toStringValue(rec['entry_id'])
        const title = toStringValue(rec['title']) ?? entryId
        if (!title) continue

        const importSourceRaw = rec['import_source'] ?? rec['importSource']
        const importSource =
          importSourceRaw && typeof importSourceRaw === 'object'
            ? (importSourceRaw as Record<string, unknown>)
            : undefined
        const originalId =
          toStringValue(importSource?.['original_id']) ?? toStringValue(importSource?.['originalId'])
        if (!entryId && !originalId) continue

        const rawGroupPath = toStringValue(rec['groupPath']) ?? toStringValue(rec['group_path']) ?? '/'
        const relativeGroupPath = normalizeRelativePath(rawGroupPath)
        const relativePath = normalizeRelativePath(
          relativeGroupPath ? `${relativeGroupPath}/${title}` : title,
        )
        const info: ExistingEntryInfo = {
          nodeId: nextSyntheticNodeId++,
          path: relativePath ? `/${relativePath}` : '/',
          childNodeIds: [],
          ...(entryId ? {entryId} : {}),
        }

        if (originalId) {
          result.set(originalId, info)
        }
        if (entryId) {
          result.set(entryId, info)
        }
      }
    } catch {
      // Keep an empty map as best-effort fallback.
    }
    return result
  }

  async function traverse(path: string): Promise<void> {
    const children = catalog.catalog.getChildren(path)
    for (const child of children) {
      if (!child.isDir) continue

      await catalog.ensureEntryMeta(child.nodeId)
      const meta = catalog.getEntryMeta(child.nodeId)

      if (meta) {
        const metaRec = meta as Record<string, unknown>
        const importSourceRaw = metaRec['import_source'] ?? metaRec['importSource']
        const importSource =
          importSourceRaw && typeof importSourceRaw === 'object'
            ? (importSourceRaw as Record<string, unknown>)
            : undefined

        const originalId =
          toStringValue(importSource?.['original_id']) ?? toStringValue(importSource?.['originalId'])
        const entryId = toStringValue(metaRec['id']) ?? toStringValue(metaRec['entry_id'])
        if (originalId || entryId) {
          const childNodes = catalog.catalog.getChildren(child.path)
          const childNodeIds = childNodes.filter((c) => c.isFile).map((c) => c.nodeId)
          const relativePath = child.path.slice(rootPath.length) || '/'
          const info: ExistingEntryInfo = {
            nodeId: child.nodeId,
            path: relativePath,
            childNodeIds,
            ...(entryId ? {entryId} : {}),
          }

          if (originalId) {
            result.set(originalId, info)
          }
          if (entryId) {
            result.set(entryId, info)
          }
        }
      } else {
        await traverse(child.path)
      }
    }
  }
  await traverse(rootPath)

  return result
}
