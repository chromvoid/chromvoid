/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error kdbxweb has no type declarations
import * as kdbxweb from 'kdbxweb'
import type {ImportResult, ImportedEntry, ImportedFolder, ImportedIcon} from '../types.js'

const IMPORT_LIMITS_MAX_FILE_SIZE = 50 * 1024 * 1024
const IMPORT_LIMITS_MAX_ENTRIES = 10_000

const STANDARD_FIELDS = new Set(['Title', 'UserName', 'Password', 'URL', 'Notes'])
const OTP_FIELDS = new Set([
  'otp',
  'OTP',
  'TOTP Seed',
  'totp-secret',
  'TimeOtp-Secret-Base32',
  'TimeOtp-Secret-Base64',
])

export type KeePassErrorCode =
  | 'IMPORT_INVALID_PASSWORD'
  | 'IMPORT_CORRUPT_FILE'
  | 'IMPORT_UNSUPPORTED_FORMAT'
  | 'IMPORT_FILE_TOO_LARGE'
  | 'IMPORT_TOO_MANY_ENTRIES'
  | 'IMPORT_PARSE_ERROR'

export class KeePassParseError extends Error {
  constructor(
    message: string,
    public readonly code: KeePassErrorCode,
  ) {
    super(message)
    this.name = 'KeePassParseError'
  }
}

function isProtectedValue(val: unknown): val is {getText(): string} {
  return typeof val === 'object' && val !== null && typeof (val as any).getText === 'function'
}

function getEntryFields(entry: any): Map<string, unknown> | Record<string, unknown> {
  if (entry?.fields && typeof entry.fields === 'object') {
    return entry.fields
  }
  return {}
}

function getRawFieldValue(entry: any, fieldName: string): unknown {
  const fields = getEntryFields(entry)
  if (typeof (fields as any).get === 'function') {
    return (fields as Map<string, unknown>).get(fieldName)
  }
  return (fields as Record<string, unknown>)[fieldName]
}

function getFieldEntries(entry: any): Array<[string, unknown]> {
  const fields = getEntryFields(entry)
  if (typeof (fields as any)[Symbol.iterator] === 'function') {
    return Array.from(fields as Iterable<[string, unknown]>)
  }
  return Object.entries(fields as Record<string, unknown>)
}

function getFieldValue(entry: any, fieldName: string): string {
  const field = getRawFieldValue(entry, fieldName)
  if (field == null) return ''
  if (isProtectedValue(field)) {
    return field.getText()
  }
  return String(field)
}

function extractCustomFields(entry: any): Array<{key: string; value: string}> | undefined {
  const custom: Array<{key: string; value: string}> = []
  for (const [key, val] of getFieldEntries(entry)) {
    if (STANDARD_FIELDS.has(key) || OTP_FIELDS.has(key)) continue
    const value = isProtectedValue(val) ? val.getText() : String(val ?? '')
    if (key && value) {
      custom.push({key, value})
    }
  }
  return custom.length > 0 ? custom : undefined
}

function extractOtpSecret(entry: any, warnings: string[]): ImportedEntry['otp'] | undefined {
  // 1. Check 'otp' / 'OTP' fields
  for (const fieldName of ['otp', 'OTP']) {
    const raw = getFieldValue(entry, fieldName)
    if (!raw) continue

    if (raw.startsWith('otpauth://')) {
      try {
        const url = new URL(raw)
        const secret = url.searchParams.get('secret')
        if (secret) {
          return {
            secret: secret.toUpperCase(),
            label: 'OTP',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            encoding: 'base32' as const,
            type: 'TOTP' as const,
          }
        }
      } catch {
        warnings.push(`Failed to parse OTP URI for entry "${getFieldValue(entry, 'Title')}"`)
      }
      continue
    }

    if (/^[A-Z2-7]+=*$/i.test(raw)) {
      return {
        secret: raw.toUpperCase(),
        label: 'OTP',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        encoding: 'base32' as const,
        type: 'TOTP' as const,
      }
    }
  }

  // 2. Check 'TOTP Seed' / 'totp-secret'
  for (const fieldName of ['TOTP Seed', 'totp-secret']) {
    const raw = getFieldValue(entry, fieldName)
    if (raw) {
      return {
        secret: raw,
        label: 'OTP',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        encoding: 'base32' as const,
        type: 'TOTP' as const,
      }
    }
  }

  // 3. Check 'TimeOtp-Secret-Base32'
  const base32Secret = getFieldValue(entry, 'TimeOtp-Secret-Base32')
  if (base32Secret) {
    return {
      secret: base32Secret,
      label: 'OTP',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      encoding: 'base32' as const,
      type: 'TOTP' as const,
    }
  }

  return undefined
}

function classifyLoadError(err: unknown): KeePassErrorCode {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  if (lower.includes('invalid credentials') || lower.includes('key')) {
    return 'IMPORT_INVALID_PASSWORD'
  }
  if (lower.includes('not a keepass') || lower.includes('signature')) {
    return 'IMPORT_CORRUPT_FILE'
  }
  if (lower.includes('unsupported') || lower.includes('version')) {
    return 'IMPORT_UNSUPPORTED_FORMAT'
  }
  return 'IMPORT_PARSE_ERROR'
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0)
  }
  return btoa(binary)
}

function guessImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 8) {
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return 'image/png'
    }
  }
  if (bytes.length >= 12) {
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return 'image/webp'
    }
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return 'image/jpeg'
  }
  if (bytes.length >= 4) {
    if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) {
      return 'image/x-icon'
    }
  }
  return 'image/png'
}

function toUint8Array(value: unknown): Uint8Array | undefined {
  if (!value) return undefined
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  if (Array.isArray(value)) {
    const bytes = value.filter((item): item is number => typeof item === 'number')
    return bytes.length > 0 ? new Uint8Array(bytes) : undefined
  }
  return undefined
}

function normalizeIconKey(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value))
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    return trimmed || undefined
  }
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>
    const fromUuid = rec['uuid']
    if (typeof fromUuid === 'string' && fromUuid.trim()) return fromUuid.trim().toLowerCase()
    if (typeof rec['toString'] === 'function') {
      const asString = String(value).trim().toLowerCase()
      return asString || undefined
    }
  }
  return undefined
}

function extractCustomIconsMap(db: any, warnings: string[]): Map<string, ImportedIcon> {
  const out = new Map<string, ImportedIcon>()
  const maybeMeta = db?.meta
  const maybeCustomIcons = maybeMeta?.customIcons
  if (!maybeCustomIcons) return out

  const addIcon = (rawId: unknown, rawData: unknown) => {
    const key = normalizeIconKey(rawId)
    const bytes = toUint8Array(rawData)
    if (!key || !bytes || bytes.length === 0) return
    out.set(key, {
      contentBase64: bytesToBase64(bytes),
      mimeType: guessImageMime(bytes),
      source: 'keepass-custom',
      sourceId: key,
    })
  }

  if (typeof maybeCustomIcons[Symbol.iterator] === 'function') {
    for (const item of maybeCustomIcons as Iterable<unknown>) {
      if (Array.isArray(item) && item.length >= 2) {
        addIcon(item[0], item[1])
        continue
      }
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>
        addIcon(rec['id'] ?? rec['uuid'], rec['data'])
      }
    }
    return out
  }

  if (maybeCustomIcons && typeof maybeCustomIcons === 'object') {
    for (const [key, val] of Object.entries(maybeCustomIcons as Record<string, unknown>)) {
      if (val && typeof val === 'object') {
        const rec = val as Record<string, unknown>
        addIcon(rec['id'] ?? rec['uuid'] ?? key, rec['data'] ?? val)
      } else {
        addIcon(key, val)
      }
    }
    return out
  }

  warnings.push('KeePass custom icons format is not recognized; skipping icon import')
  return out
}

function resolveItemIcon(
  item: any,
  customIcons: Map<string, ImportedIcon>,
  warnings: string[],
): ImportedIcon | undefined {
  const customKey = normalizeIconKey(item?.customIcon ?? item?.customIconUuid)
  if (customKey) {
    const found = customIcons.get(customKey)
    if (found) return found
    warnings.push(`KeePass custom icon payload not found for icon id "${customKey}"`)
  }

  const standard = item?.icon
  if (typeof standard === 'number' && Number.isFinite(standard) && standard > 0) {
    return {
      source: 'keepass-standard',
      sourceId: String(Math.trunc(standard)),
    }
  }

  return undefined
}

export async function parseKeePass(
  file: File,
  password: string,
  keyFile?: ArrayBuffer,
): Promise<ImportResult> {
  // Validate file size
  if (file.size > IMPORT_LIMITS_MAX_FILE_SIZE) {
    throw new KeePassParseError(
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${IMPORT_LIMITS_MAX_FILE_SIZE / 1024 / 1024}MB)`,
      'IMPORT_FILE_TOO_LARGE',
    )
  }

  const arrayBuffer = await file.arrayBuffer()
  const credentials = new kdbxweb.Credentials(
    kdbxweb.ProtectedValue.fromString(password),
    keyFile ? new Uint8Array(keyFile) : undefined,
  )

  let db: any
  try {
    db = await kdbxweb.Kdbx.load(arrayBuffer, credentials)
  } catch (err) {
    if (err instanceof KeePassParseError) throw err
    const code = classifyLoadError(err)
    throw new KeePassParseError(err instanceof Error ? err.message : 'Failed to open KeePass database', code)
  }

  const entries: ImportedEntry[] = []
  const folders: ImportedFolder[] = []
  const warnings: string[] = []
  const customIcons = extractCustomIconsMap(db, warnings)
  let entryLimitReached = false

  function processEntries(groupEntries: any[] | undefined, path: string): void {
    if (!groupEntries || entryLimitReached) return
    for (const entry of groupEntries) {
      if (entries.length >= IMPORT_LIMITS_MAX_ENTRIES) {
        if (!entryLimitReached) {
          warnings.push(`Import limit reached: only first ${IMPORT_LIMITS_MAX_ENTRIES} entries were imported`)
          entryLimitReached = true
        }
        return
      }

      const title = getFieldValue(entry, 'Title')
      const username = getFieldValue(entry, 'UserName')
      const passwordVal = getFieldValue(entry, 'Password')
      const url = getFieldValue(entry, 'URL')
      const notes = getFieldValue(entry, 'Notes')

      // Skip entries without title AND password
      if (!title && !passwordVal) {
        warnings.push(`Skipped entry without title or password${username ? ` (username: ${username})` : ''}`)
        continue
      }

      const otp = extractOtpSecret(entry, warnings)
      const customFields = extractCustomFields(entry)
      const icon = resolveItemIcon(entry, customIcons, warnings)

      const importedEntry: ImportedEntry = {
        id: entry.uuid ? entry.uuid.toString() : crypto.randomUUID(),
        type: passwordVal ? 'login' : 'secure_note',
        name: title || 'Untitled',
        ...(username && {username}),
        ...(passwordVal && {password: passwordVal}),
        ...(url && {urls: [{value: url, match: 'base_domain' as const}]}),
        ...(notes && {notes}),
        ...(path && {folder: path}),
        ...(customFields && {customFields}),
        ...(icon && {icon}),
        ...(otp && {otp}),
      }

      entries.push(importedEntry)
    }
  }

  function processGroup(group: any, parentPath: string): void {
    if (entryLimitReached) return

    const name: string = (group.name ?? '').replace(/\//g, '\u2215')

    // Skip Recycle Bin and non-searchable groups
    if (name === 'Recycle Bin' || group.enableSearching === false) {
      return
    }

    const path = parentPath ? `${parentPath}/${name}` : name

    if (name) {
      const icon = resolveItemIcon(group, customIcons, warnings)
      folders.push({
        id: group.uuid ? group.uuid.toString() : crypto.randomUUID(),
        name,
        path,
        ...(icon && {icon}),
      })
    }

    processEntries(group.entries, path)

    // Recursively process subgroups
    if (group.groups) {
      for (const subGroup of group.groups) {
        if (entryLimitReached) return
        processGroup(subGroup, path)
      }
    }
  }

  const root = db.groups?.[0] ?? db.getDefaultGroup?.()
  if (root) {
    processEntries(root.entries, '')
    if (root.groups) {
      for (const subGroup of root.groups) {
        if (entryLimitReached) break
        processGroup(subGroup, '')
      }
    }
  }

  return {
    entries,
    folders,
    conflicts: [],
    warnings,
  }
}
