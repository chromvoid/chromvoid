import type {ImportedEntry, ImportProgress, ExistingEntryInfo} from './types.js'

const UPLOAD_CHUNK_SIZE = 16000

/**
 * Abstraction over catalog storage for import operations.
 * All paths are relative to the passmanager namespace root (e.g. '/', '/Social', '/Social/Media').
 * The implementation is responsible for mapping these to actual catalog paths.
 */
export interface CatalogOperations {
  createDir(name: string, parentPath: string): Promise<{nodeId: number} | {nameExists: true}>
  upload(
    parentPath: string,
    name: string,
    size: number,
    data: Uint8Array,
    chunkSize: number,
    mimeType: string,
  ): Promise<{nodeId: number}>
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
  putIcon?(contentBase64: string, mimeType: string): Promise<{iconRef: string; backgroundColor?: string}>
  setGroupIcon?(path: string, iconRef: string | null): Promise<void>
}

function sanitizeName(name: string): string {
  const s = String(name ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
  return s || 'untitled'
}

function normalizeOTPEncoding(enc?: string): 'base32' | 'base64' | 'hex' {
  if (enc === 'base32' || enc === 'base64' || enc === 'hex') return enc
  if (enc === 'base16') return 'hex'
  return 'base32'
}

function joinPath(parent: string, child: string): string {
  if (parent === '/') return `/${child}`
  return `${parent}/${child}`
}

function buildNote(notes?: string, customFields?: Array<{key: string; value: string}>): string {
  const parts: string[] = []
  if (notes?.trim()) parts.push(notes.trim())
  if (customFields && customFields.length > 0) {
    parts.push('')
    parts.push('Imported Fields:')
    for (const f of customFields) parts.push(`- ${f.key}: ${f.value}`)
  }
  return parts.join('\n')
}

function normalizeCardDigits(value?: string): string | undefined {
  if (!value) return undefined
  const digits = value.replace(/\D+/g, '')
  return digits.length > 0 ? digits : undefined
}

async function ensureDir(
  catalog: CatalogOperations,
  parentPath: string,
  name: string,
): Promise<number | undefined> {
  const result = await catalog.createDir(sanitizeName(name), parentPath)
  if ('nameExists' in result) return undefined
  return result.nodeId
}

async function createDirWithAutoRename(
  catalog: CatalogOperations,
  parentPath: string,
  desiredName: string,
): Promise<{nodeId: number; name: string}> {
  const base = sanitizeName(desiredName)
  for (let i = 0; i < 50; i++) {
    const name = i === 0 ? base : `${base} (${i + 1})`
    const result = await catalog.createDir(name, parentPath)
    if ('nodeId' in result) return {nodeId: result.nodeId, name}
  }
  throw new Error('Too many name collisions')
}

async function writeTextFile(
  catalog: CatalogOperations,
  parentPath: string,
  name: string,
  text: string,
): Promise<void> {
  const bytes = new TextEncoder().encode(text)
  await catalog.upload(
    parentPath,
    name,
    bytes.byteLength,
    bytes,
    UPLOAD_CHUNK_SIZE,
    'text/plain',
  )
}

async function writeJsonFile(
  catalog: CatalogOperations,
  parentPath: string,
  name: string,
  data: unknown,
): Promise<void> {
  const text = JSON.stringify(data)
  const bytes = new TextEncoder().encode(text)
  await catalog.upload(
    parentPath,
    name,
    bytes.byteLength,
    bytes,
    UPLOAD_CHUNK_SIZE,
    'application/json',
  )
}

async function writeEntryFiles(
  catalog: CatalogOperations,
  entryPath: string,
  entryNodeId: number,
  entry: ImportedEntry,
  targetEntryId?: string,
): Promise<void> {
  const iconRef = await resolveEntryIconRef(catalog, entry)
  const otpId = entry.otp ? crypto.randomUUID() : undefined
  const otpLabel = entry.otp?.label ?? 'OTP'
  const resolvedEntryId = targetEntryId ?? entry.id
  const meta =
    entry.type === 'card' && entry.paymentCard
      ? {
          id: resolvedEntryId,
          title: entry.name,
          entryType: 'payment_card',
          paymentCard: {
            cardholderName: entry.paymentCard.cardholderName,
            expMonth: entry.paymentCard.expMonth,
            expYear: entry.paymentCard.expYear,
            ...(entry.paymentCard.brand ? {brand: entry.paymentCard.brand.toLowerCase()} : {}),
            ...(normalizeCardDigits(entry.paymentCard.number)
              ? {last4: normalizeCardDigits(entry.paymentCard.number)!.slice(-4)}
              : {}),
          },
          ...(entry.tags && entry.tags.length > 0 ? {tags: entry.tags} : {}),
          ...(iconRef ? {iconRef} : {}),
          import_source: {
            type: entry.type,
            imported_at: Date.now(),
            original_id: entry.id,
            folder_path: entry.folder ?? null,
          },
        }
      : {
          id: resolvedEntryId,
          title: entry.name,
          entryType: 'login',
          urls: entry.urls ?? [],
          username: entry.username ?? '',
          otps: entry.otp
            ? [
                {
                  id: otpId,
                  label: otpLabel,
                  algorithm: entry.otp.algorithm ?? 'SHA1',
                  digits: entry.otp.digits ?? 6,
                  period: entry.otp.period ?? 30,
                  encoding: normalizeOTPEncoding(entry.otp.encoding),
                },
              ]
            : [],
          ...(entry.tags && entry.tags.length > 0 ? {tags: entry.tags} : {}),
          ...(iconRef ? {iconRef} : {}),
          import_source: {
            type: entry.type,
            imported_at: Date.now(),
            original_id: entry.id,
            folder_path: entry.folder ?? null,
          },
        }
  await writeJsonFile(catalog, entryPath, 'meta.json', meta)

  if (entry.type === 'card' && entry.paymentCard) {
    const cardPan = normalizeCardDigits(entry.paymentCard.number)
    const cardCvv = normalizeCardDigits(entry.paymentCard.cvv)
    if (cardPan) {
      await writeTextFile(catalog, entryPath, '.card_pan', cardPan)
    }
    if (cardCvv) {
      await writeTextFile(catalog, entryPath, '.card_cvv', cardCvv)
    }
  } else if (entry.password) {
    await writeTextFile(catalog, entryPath, '.password', entry.password)
  }

  if (entry.customFields && entry.customFields.length > 0) {
    await writeJsonFile(catalog, entryPath, '.fields.json', {
      version: 1,
      fields: entry.customFields,
    })
  }

  const noteText = entry.type === 'card' ? '' : buildNote(entry.notes, entry.customFields)
  if (noteText) {
    await writeTextFile(catalog, entryPath, '.note', noteText)
  }

  if (entry.type !== 'card' && entry.otp?.secret && otpLabel) {
    await catalog.setOTPSecret({
      nodeId: entryNodeId,
      entryId: resolvedEntryId,
      label: otpLabel,
      secret: entry.otp.secret,
      encoding: normalizeOTPEncoding(entry.otp.encoding),
      algorithm: entry.otp.algorithm ?? 'SHA1',
      digits: entry.otp.digits ?? 6,
      period: entry.otp.period ?? 30,
    })
  }
}

async function resolveEntryIconRef(
  catalog: CatalogOperations,
  entry: ImportedEntry,
): Promise<string | undefined> {
  const icon = entry.icon
  if (!icon) return undefined
  if (icon.iconRef && icon.iconRef.trim()) return icon.iconRef.trim()
  if (!catalog.putIcon) return undefined

  const contentBase64 = icon.contentBase64?.trim()
  if (!contentBase64) return undefined
  const mimeType = icon.mimeType?.trim() || 'image/png'

  try {
    const result = await catalog.putIcon(contentBase64, mimeType)
    return result.iconRef
  } catch {
    return undefined
  }
}

export async function mapAndSaveEntry(
  catalog: CatalogOperations,
  entry: ImportedEntry,
): Promise<{entryNodeId: number}> {
  const folder = (entry.folder ?? '').trim()
  const folderParts = folder ? folder.split('/').filter(Boolean) : []

  let parentPath = '/'
  for (const part of folderParts) {
    const safe = sanitizeName(part)
    await ensureDir(catalog, parentPath, safe)
    parentPath = joinPath(parentPath, safe)
  }

  const desiredName = entry.name || entry.id
  const created = await createDirWithAutoRename(catalog, parentPath, desiredName)
  const entryNodeId = created.nodeId
  const entryPath = joinPath(parentPath, created.name)

  await writeEntryFiles(catalog, entryPath, entryNodeId, entry)

  return {entryNodeId}
}

export async function overwriteEntry(
  catalog: CatalogOperations,
  entry: ImportedEntry,
  existing: ExistingEntryInfo,
): Promise<{entryNodeId: number}> {
  for (const childNodeId of existing.childNodeIds) {
    await catalog.deleteNode(childNodeId)
  }
  const targetEntryId = existing.entryId ?? entry.id
  await writeEntryFiles(catalog, existing.path, existing.nodeId, entry, targetEntryId)
  return {entryNodeId: existing.nodeId}
}

export class ImportOrchestrator {
  private createdNodeIds: number[] = []
  private abortController = new AbortController()

  get signal(): AbortSignal {
    return this.abortController.signal
  }

  async execute(
    catalog: CatalogOperations,
    entries: ImportedEntry[],
    onProgress?: (progress: ImportProgress) => void,
    existingByOriginalId?: Map<string, ExistingEntryInfo>,
  ): Promise<{success: boolean; progress: ImportProgress; errors: string[]}> {
    const errors: string[] = []
    const progress: ImportProgress = {
      total: entries.length,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    }

    try {
      for (const entry of entries) {
        if (this.abortController.signal.aborted) {
          break
        }

        progress.currentItem = entry.name
        onProgress?.({...progress})

        try {
          const existing = existingByOriginalId?.get(entry.id)
          if (existing) {
            await overwriteEntry(catalog, entry, existing)
            progress.updated++
          } else {
            const {entryNodeId} = await mapAndSaveEntry(catalog, entry)
            this.createdNodeIds.push(entryNodeId)
            progress.imported++
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          errors.push(`${entry.name}: ${msg}`)
          progress.errors++
        }

        onProgress?.({...progress})
      }

      return {
        success: progress.errors === 0 && !this.abortController.signal.aborted,
        progress,
        errors,
      }
    } catch (e) {
      await this.rollback(catalog)
      const msg = e instanceof Error ? e.message : String(e)
      return {success: false, progress, errors: [...errors, msg]}
    }
  }

  abort(): void {
    this.abortController.abort()
  }

  private async rollback(catalog: CatalogOperations): Promise<void> {
    for (const nodeId of this.createdNodeIds.reverse()) {
      try {
        await catalog.deleteNode(nodeId)
      } catch {
        /* best-effort */
      }
    }
  }
}
