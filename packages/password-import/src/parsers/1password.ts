import {unzipSync} from 'fflate'

import type {ImportedEntry, ImportedFolder, ImportedIcon, ImportResult, UrlMatch, UrlRule} from '../types.js'

const MAX_FILE_SIZE = 50 * 1024 * 1024
const MAX_ENTRIES = 10_000

type OnePasswordExport = {
  accounts?: OnePasswordAccount[]
}

type OnePasswordAccount = {
  vaults?: OnePasswordVault[]
}

type OnePasswordVault = {
  attrs?: {
    uuid?: string
    name?: string
    avatar?: string
  }
  items?: OnePasswordItem[]
}

type OnePasswordItem = {
  uuid?: string
  categoryUuid?: string
  state?: string
  details?: OnePasswordItemDetails
  overview?: OnePasswordOverview
}

type OnePasswordItemDetails = {
  loginFields?: OnePasswordField[]
  notesPlain?: string
  sections?: OnePasswordSection[]
  password?: string
  documentAttributes?: OnePasswordDocumentAttributes | OnePasswordDocumentAttributes[]
}

type OnePasswordDocumentAttributes = {
  fileName?: string
  documentId?: string
  decryptedSize?: number
}

type OnePasswordSection = {
  title?: string
  name?: string
  fields?: OnePasswordField[]
}

type OnePasswordField = {
  id?: string
  title?: string
  name?: string
  designation?: string
  fieldType?: string
  value?: unknown
}

type OnePasswordOverview = {
  title?: string
  subtitle?: string
  url?: string
  urls?: Array<{label?: string; url?: string; mode?: string}>
  tags?: unknown[]
  icons?: unknown
}

type ParsedItem = {
  entry?: ImportedEntry
  warnings: string[]
}

type ArchiveFile = {
  path: string
  name: string
  documentId?: string
  bytes: Uint8Array
}

type ArchiveIndex = {
  byDocumentId: Map<string, ArchiveFile>
  byName: Map<string, ArchiveFile>
  byPath: Map<string, ArchiveFile>
}

const CATEGORY_LABELS: Record<string, string> = {
  '001': 'Login',
  '002': 'Credit Card',
  '003': 'Secure Note',
  '004': 'Identity',
  '005': 'Password',
  '006': 'Document',
}

export async function parse1Password1PUX(file: File): Promise<ImportResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
    )
  }

  const archive = openArchive(await readFileBytes(file))
  const exportData = archive['export.data']
  if (!exportData) {
    throw new Error('Invalid 1PUX archive: missing export.data')
  }

  const data = parseExportData(exportData)
  const filesIndex = buildArchiveIndex(archive)
  const entries: ImportedEntry[] = []
  const folders = new Map<string, ImportedFolder>()
  const warnings: string[] = []

  let limitReached = false

  for (const account of data.accounts ?? []) {
    for (const vault of account.vaults ?? []) {
      const folder = ensureVaultFolder(vault, filesIndex, folders, warnings)

      for (const item of vault.items ?? []) {
        if (entries.length >= MAX_ENTRIES) {
          limitReached = true
          break
        }

        const parsed = parseItem(item, folder.path, filesIndex)
        warnings.push(...parsed.warnings)
        if (parsed.entry) {
          entries.push(parsed.entry)
        }
      }

      if (limitReached) break
    }

    if (limitReached) break
  }

  if (limitReached) {
    warnings.push(`Entry limit reached (${MAX_ENTRIES}). Remaining items skipped.`)
  }

  return {
    entries,
    folders: Array.from(folders.values()),
    conflicts: [],
    warnings,
  }
}

function openArchive(bytes: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes)
  } catch {
    throw new Error('Invalid 1PUX archive')
  }
}

function parseExportData(bytes: Uint8Array): OnePasswordExport {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as OnePasswordExport
  } catch {
    throw new Error('Invalid export.data JSON')
  }
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer())
  }

  throw new Error('Unable to read file bytes')
}

function ensureVaultFolder(
  vault: OnePasswordVault,
  filesIndex: ArchiveIndex,
  folders: Map<string, ImportedFolder>,
  warnings: string[],
): ImportedFolder {
  const vaultId = vault.attrs?.uuid?.trim() || crypto.randomUUID()
  const path = (vault.attrs?.name?.trim() || vaultId).replace(/^\/+|\/+$/g, '')

  const existing = folders.get(path)
  if (existing) return existing

  const icon = resolveIcon(
    [vault.attrs?.avatar],
    filesIndex,
    `folder "${path}"`,
    warnings,
  )

  const folder: ImportedFolder = {
    id: vaultId,
    name: path.split('/').at(-1) ?? path,
    path,
    ...(icon ? {icon} : {}),
  }
  folders.set(path, folder)
  return folder
}

function parseItem(item: OnePasswordItem, folderPath: string, filesIndex: ArchiveIndex): ParsedItem {
  const title = resolveTitle(item)
  const warnings: string[] = []
  const categoryUuid = item.categoryUuid ?? ''
  const categoryLabel = CATEGORY_LABELS[categoryUuid]
  const details = item.details ?? {}
  const overview = item.overview ?? {}
  const treatsCredentialsAsPrimary = categoryUuid === '001' || categoryUuid === '005'

  if (categoryUuid === '006') {
    warnings.push(`Skipped Document item "${title}"`)
    return {warnings}
  }

  if (!categoryLabel && categoryUuid) {
    warnings.push(`Imported "${title}" as secure note from unsupported 1Password category ${categoryUuid}`)
  }

  const systemFields = new Set<OnePasswordField>()
  const loginFields = details.loginFields ?? []
  const sectionFields = (details.sections ?? []).flatMap((section) => section.fields ?? [])
  const searchableFields = [...loginFields, ...sectionFields]

  const username = treatsCredentialsAsPrimary
    ? pickFieldValue(searchableFields, isUsernameField, systemFields)
    : undefined
  const password = treatsCredentialsAsPrimary
    ? pickFieldValue(loginFields, isPasswordField, systemFields) ??
      pickFieldValue(sectionFields, isPasswordField, systemFields) ??
      trimString(details.password)
    : undefined

  const otpFieldValue = treatsCredentialsAsPrimary
    ? pickFieldValue(searchableFields, isOtpField, systemFields) ??
      findOtpUriInFields(searchableFields, systemFields)
    : undefined
  const otpResult = parseOtpValue(otpFieldValue, title)
  if (otpResult.warning) warnings.push(`"${title}": ${otpResult.warning}`)

  const customFields = collectCustomFields(details.sections ?? [], systemFields)
  const tags = collectTags(item)
  const urls = collectUrls(overview)
  const notes = trimString(details.notesPlain)
  const subtitle = trimString(overview.subtitle)
  const icon = resolveIcon(
    [overview.icons],
    filesIndex,
    `item "${title}"`,
    warnings,
  )

  if (details.documentAttributes) {
    warnings.push(`Skipped attachments for "${title}"`)
  }

  const kind = resolveEntryKind(categoryUuid, password)
  const baseNotes = mergeNotes(notes, subtitle)
  const entryNotes = buildEntryNotes(kind, baseNotes, categoryLabel, customFields)

  const entry: ImportedEntry = {
    id: item.uuid?.trim() || crypto.randomUUID(),
    type: kind,
    name: title,
    ...(username ? {username} : {}),
    ...(password && kind === 'login' ? {password} : {}),
    ...(urls.length > 0 ? {urls} : {}),
    ...(entryNotes ? {notes: entryNotes} : {}),
    folder: folderPath || undefined,
    ...(customFields.length > 0 ? {customFields} : {}),
    ...(tags.length > 0 ? {tags} : {}),
    ...(otpResult.otp ? {otp: otpResult.otp} : {}),
    ...(icon ? {icon} : {}),
  }

  return {entry, warnings}
}

function resolveEntryKind(categoryUuid: string, password?: string): ImportedEntry['type'] {
  switch (categoryUuid) {
    case '001':
      return 'login'
    case '005':
      return password ? 'login' : 'secure_note'
    default:
      return 'secure_note'
  }
}

function resolveTitle(item: OnePasswordItem): string {
  return trimString(item.overview?.title) || trimString(item.uuid) || 'Untitled'
}

function collectUrls(overview: OnePasswordOverview): UrlRule[] {
  const urls: UrlRule[] = []
  const seen = new Set<string>()
  const primary = trimString(overview.url)

  for (const spec of overview.urls ?? []) {
    const value = trimString(spec.url)
    if (!value) continue
    const match = mapUrlMatch(spec.mode)
    const key = `${value}\u0000${match}`
    if (seen.has(key)) continue
    seen.add(key)
    urls.push({value, match})
  }

  if (primary) {
    const alreadyPresent = urls.some((url) => url.value === primary)
    if (!alreadyPresent) {
      urls.unshift({value: primary, match: 'base_domain'})
    }
  }

  return urls
}

function mapUrlMatch(mode?: string): UrlMatch {
  switch (mode?.toLowerCase()) {
    case 'host':
      return 'host'
    case 'startswith':
      return 'starts_with'
    case 'exact':
      return 'exact'
    case 'regex':
      return 'regex'
    case 'never':
      return 'never'
    default:
      return 'base_domain'
  }
}

function pickFieldValue(
  fields: OnePasswordField[],
  predicate: (field: OnePasswordField) => boolean,
  used: Set<OnePasswordField>,
): string | undefined {
  for (const field of fields) {
    if (!predicate(field)) continue
    const value = extractFieldValue(field.value)
    if (!value) continue
    used.add(field)
    return value
  }

  return undefined
}

function findOtpUriInFields(fields: OnePasswordField[], used: Set<OnePasswordField>): string | undefined {
  for (const field of fields) {
    const value = extractFieldValue(field.value)
    if (!value || !value.startsWith('otpauth://')) continue
    used.add(field)
    return value
  }

  return undefined
}

function isUsernameField(field: OnePasswordField): boolean {
  const signature = fieldSignature(field)
  return (
    signature.includes('designation:username') ||
    signature.includes('username') ||
    signature.includes('email')
  )
}

function isPasswordField(field: OnePasswordField): boolean {
  const signature = fieldSignature(field)
  return (
    signature.includes('designation:password') ||
    signature.includes('fieldtype:p') ||
    /\bpassword\b/u.test(signature)
  )
}

function isOtpField(field: OnePasswordField): boolean {
  const signature = fieldSignature(field)
  return (
    signature.includes('otp') ||
    signature.includes('totp') ||
    signature.includes('one-time password')
  )
}

function fieldSignature(field: OnePasswordField): string {
  return [
    field.designation ? `designation:${field.designation}` : '',
    field.fieldType ? `fieldtype:${field.fieldType}` : '',
    field.id ?? '',
    field.name ?? '',
    field.title ?? '',
  ]
    .join(' ')
    .toLowerCase()
}

function collectCustomFields(
  sections: OnePasswordSection[],
  used: Set<OnePasswordField>,
): Array<{key: string; value: string}> {
  const fields: Array<{key: string; value: string}> = []

  for (const section of sections) {
    const sectionTitle = trimString(section.title)
    for (const field of section.fields ?? []) {
      if (used.has(field)) continue
      const value = extractFieldValue(field.value)
      if (!value) continue
      const label = trimString(field.title) || trimString(field.name) || trimString(field.id) || 'Field'
      fields.push({
        key: sectionTitle ? `${sectionTitle}: ${label}` : label,
        value,
      })
    }
  }

  return fields
}

function collectTags(item: OnePasswordItem): string[] {
  const tags = new Set<string>()

  for (const tag of item.overview?.tags ?? []) {
    if (typeof tag !== 'string') continue
    const label = trimString(tag)
    if (label) tags.add(label)
  }

  return Array.from(tags)
}

function buildEntryNotes(
  kind: ImportedEntry['type'],
  notes: string | undefined,
  categoryLabel: string | undefined,
  customFields: Array<{key: string; value: string}>,
): string | undefined {
  if (kind === 'login' || customFields.length === 0) {
    return notes
  }

  const heading = categoryLabel ? `${categoryLabel} Details` : 'Imported 1Password Fields'
  const detailBlock = `--- ${heading} ---\n${customFields.map((field) => `${field.key}: ${field.value}`).join('\n')}`
  return notes ? `${notes}\n\n${detailBlock}` : detailBlock
}

function mergeNotes(notes?: string, subtitle?: string): string | undefined {
  if (notes && subtitle) return `${notes}\n\n${subtitle}`
  return notes || subtitle
}

function parseOtpValue(
  value: string | undefined,
  title: string,
): {otp?: ImportedEntry['otp']; warning?: string} {
  const trimmed = trimString(value)
  if (!trimmed) return {}

  if (!trimmed.startsWith('otpauth://')) {
    return {
      otp: {
        secret: trimmed,
        label: title,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        encoding: 'base32',
        type: 'TOTP',
      },
    }
  }

  try {
    const uri = new URL(trimmed)
    const secret = trimString(uri.searchParams.get('secret'))
    if (!secret) {
      return {warning: 'Failed to parse OTP secret from otpauth URI'}
    }

    const type = uri.hostname.toUpperCase() === 'HOTP' ? 'HOTP' : 'TOTP'
    const digits = Number.parseInt(uri.searchParams.get('digits') || '6', 10)
    const period = Number.parseInt(uri.searchParams.get('period') || '30', 10)
    const counter = Number.parseInt(uri.searchParams.get('counter') || '0', 10)
    const label =
      trimString(decodeURIComponent(uri.pathname.replace(/^\/+/u, ''))) ||
      trimString(uri.searchParams.get('issuer')) ||
      title

    return {
      otp: {
        secret,
        label,
        algorithm: trimString(uri.searchParams.get('algorithm')) || 'SHA1',
        digits: Number.isFinite(digits) ? digits : 6,
        period: Number.isFinite(period) ? period : 30,
        encoding: 'base32',
        type,
        ...(type === 'HOTP' && Number.isFinite(counter) ? {counter} : {}),
      },
    }
  } catch {
    return {warning: 'Failed to parse OTP URI'}
  }
}

function resolveIcon(
  sources: unknown[],
  filesIndex: ArchiveIndex,
  label: string,
  warnings: string[],
): ImportedIcon | undefined {
  const refs = sources.flatMap((source) => collectIconRefs(source))
  if (refs.length === 0) return undefined

  for (const ref of refs) {
    const file = findArchiveFile(filesIndex, ref)
    if (!file) continue
    return {
      contentBase64: toBase64(file.bytes),
      mimeType: guessMimeType(file.name),
    }
  }

  warnings.push(`Failed to import icon for ${label}`)
  return undefined
}

function collectIconRefs(source: unknown): string[] {
  if (!source) return []
  if (typeof source === 'string') {
    const trimmed = source.trim()
    return trimmed ? [trimmed] : []
  }
  if (Array.isArray(source)) {
    return source.flatMap((item) => collectIconRefs(item))
  }
  if (typeof source !== 'object') return []

  const record = source as Record<string, unknown>
  const refs: string[] = []
  for (const key of ['documentId', 'fileName', 'name', 'path', 'avatar', 'url', 'value']) {
    refs.push(...collectIconRefs(record[key]))
  }
  return refs
}

function buildArchiveIndex(archive: Record<string, Uint8Array>): ArchiveIndex {
  const byDocumentId = new Map<string, ArchiveFile>()
  const byName = new Map<string, ArchiveFile>()
  const byPath = new Map<string, ArchiveFile>()

  for (const [rawPath, bytes] of Object.entries(archive)) {
    const path = normalizeArchivePath(rawPath)
    if (!path.startsWith('files/')) continue

    const name = path.split('/').at(-1) ?? path
    const separatorIndex = name.indexOf('___')
    const documentId = separatorIndex > 0 ? name.slice(0, separatorIndex) : undefined
    const file: ArchiveFile = {path, name, documentId, bytes}

    byPath.set(path.toLowerCase(), file)
    byName.set(name.toLowerCase(), file)
    if (documentId) byDocumentId.set(documentId.toLowerCase(), file)
  }

  return {byDocumentId, byName, byPath}
}

function findArchiveFile(index: ArchiveIndex, ref: string): ArchiveFile | undefined {
  const trimmed = ref.trim()
  if (!trimmed) return undefined

  const normalizedPath = normalizeArchivePath(trimmed).toLowerCase()
  const basename = normalizedPath.split('/').at(-1) ?? normalizedPath
  const documentId = basename.split('___', 1)[0] ?? basename

  return (
    index.byPath.get(normalizedPath) ||
    index.byPath.get(`files/${basename}`) ||
    index.byName.get(basename) ||
    index.byDocumentId.get(documentId) ||
    undefined
  )
}

function normalizeArchivePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.?\/*/u, '')
}

function extractFieldValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return trimString(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const record = value as Record<string, unknown>
  return (
    trimString(record['concealed']) ||
    trimString(record['text']) ||
    trimString(record['value']) ||
    trimString(record['totp']) ||
    undefined
  )
}

function trimString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function guessMimeType(name: string): string {
  const ext = name.split('.').at(-1)?.toLowerCase()
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'svg':
      return 'image/svg+xml'
    case 'webp':
      return 'image/webp'
    case 'bmp':
      return 'image/bmp'
    case 'ico':
      return 'image/x-icon'
    default:
      return 'application/octet-stream'
  }
}
