import Papa from 'papaparse'
import type {ImportResult, ImportedEntry, ImportedFolder} from '../types.js'

const MAX_FILE_SIZE = 50 * 1024 * 1024
const MAX_ENTRIES = 10_000
const MAX_TITLE_LENGTH = 300
const MAX_USERNAME_LENGTH = 300
const MAX_PASSWORD_LENGTH = 10_000
const MAX_URL_LENGTH = 2000
const MAX_NOTE_LENGTH = 50_000

export async function parseCSV(file: File): Promise<ImportResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
    )
  }

  const text = await file.text()
  const results = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  if (results.errors.length > 0 && results.data.length === 0) {
    throw new Error(`Failed to parse CSV: ${results.errors[0]?.message ?? 'Unknown error'}`)
  }

  const entries: ImportedEntry[] = []
  const folders = new Set<string>()
  const warnings: string[] = []
  let invalidRows = 0
  let abortedByLimit = false

  for (const row of results.data) {
    if (entries.length >= MAX_ENTRIES) {
      abortedByLimit = true
      break
    }

    const title = pick(row, ['title', 'name', 'Title', 'Name'])
    const username = pick(row, [
      'username',
      'Username',
      'user',
      'User',
      'login_username',
      'loginUsername',
    ])
    const password = pick(row, [
      'password',
      'Password',
      'pass',
      'Pass',
      'login_password',
      'loginPassword',
    ])
    const url = pick(row, ['url', 'URL', 'uri', 'URI', 'login_uri', 'loginUri'])
    const notes = pick(row, ['notes', 'Notes', 'extra', 'Extra'])
    const folderRaw = pick(row, ['folder', 'Folder', 'grouping', 'Grouping']) || '/'
    const folder = normalizeFolder(folderRaw)

    if (!title || !password) {
      invalidRows++
      continue
    }

    try {
      assertMaxLen(title, MAX_TITLE_LENGTH, 'title')
      if (username) assertMaxLen(username, MAX_USERNAME_LENGTH, 'username')
      assertMaxLen(password, MAX_PASSWORD_LENGTH, 'password')
      if (url) assertMaxLen(url, MAX_URL_LENGTH, 'url')
      if (notes) assertMaxLen(notes, MAX_NOTE_LENGTH, 'notes')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      warnings.push(`Skipped row: ${msg}`)
      invalidRows++
      continue
    }

    folders.add(folder)
    entries.push({
      id: crypto.randomUUID(),
      type: 'login',
      name: title,
      username,
      password,
      urls: url ? [{value: url, match: 'base_domain'}] : [],
      notes,
      folder: folder === '/' ? undefined : folder,
    })
  }

  if (abortedByLimit) {
    warnings.push(`Entry limit reached (${MAX_ENTRIES}). Remaining rows skipped.`)
  }
  if (invalidRows > 0) {
    warnings.push(`Skipped ${invalidRows} rows without title/password`)
  }

  const folderList: ImportedFolder[] = Array.from(folders).map((path) => ({
    id: crypto.randomUUID(),
    name: path === '/' ? '/' : (path.split('/').at(-1) ?? path),
    path: path === '/' ? '' : path,
  }))

  return {entries, folders: folderList, conflicts: [], warnings}
}

function pick(row: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'string') {
      const t = v.trim()
      if (t) return t
    }
  }
  return undefined
}

function normalizeFolder(folder: string): string {
  const raw = String(folder ?? '').trim()
  if (!raw || raw === '/' || raw === '\\') return '/'
  const parts = raw
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
  return parts.length === 0 ? '/' : parts.join('/')
}

function assertMaxLen(value: string, max: number, field: string): void {
  if (value.length > max) {
    throw new Error(`Field too long: ${field} (${value.length} > ${max})`)
  }
}
