import type {ImportResult, ImportedEntry, ImportedFolder, UrlRule, UrlMatch} from '../types.js'

const MAX_FILE_SIZE = 50 * 1024 * 1024
const MAX_ENTRIES = 10_000

interface BitwardenExport {
  encrypted: boolean
  folders?: Array<{id: string; name: string}>
  collections?: Array<{id?: string; name?: string}>
  items?: Array<BitwardenItem>
}

interface BitwardenItem {
  id: string
  folderId?: string | null
  collectionIds?: string[] | null
  type: number
  name: string
  login?: {
    username?: string | null
    password?: string | null
    totp?: string | null
    uris?: Array<{match?: number | null; uri?: string | null}> | null
  }
  notes?: string | null
  fields?: Array<{name?: string; value?: string; type?: number}> | null
  card?: Record<string, string | null> | null
  identity?: Record<string, string | null> | null
}

export async function parseBitwardenJson(file: File): Promise<ImportResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
    )
  }

  const text = await file.text()
  let data: BitwardenExport

  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON file')
  }

  if (data.encrypted) {
    throw new Error('Encrypted Bitwarden exports are not supported. Please export as unencrypted JSON.')
  }

  const entries: ImportedEntry[] = []
  const warnings: string[] = []

  const folderMap = new Map<string, string>()
  const collectionMap = new Map<string, string>()
  const folders: ImportedFolder[] = []

  if (data.folders) {
    for (const folder of data.folders) {
      folderMap.set(folder.id, folder.name)
      folders.push({
        id: folder.id,
        name: folder.name,
        path: folder.name,
      })
    }
  }
  for (const collection of data.collections ?? []) {
    if (collection.id && collection.name) {
      collectionMap.set(collection.id, collection.name)
    }
  }

  if (!data.items) {
    return {entries, folders, conflicts: [], warnings}
  }

  for (const item of data.items) {
    if (entries.length >= MAX_ENTRIES) {
      warnings.push(`Entry limit reached (${MAX_ENTRIES}). Remaining items skipped.`)
      break
    }

    const folderName = item.folderId ? folderMap.get(item.folderId) : undefined
    const entryType = mapEntryType(item.type)

    const urls: UrlRule[] = []
    if (item.login?.uris) {
      for (const uriObj of item.login.uris) {
        if (uriObj.uri) {
          urls.push({
            value: uriObj.uri,
            match: mapUriMatch(uriObj.match),
          })
        }
      }
    }

    const customFields: Array<{key: string; value: string}> = []
    if (item.fields) {
      for (const field of item.fields) {
        if (field.name && field.value) {
          customFields.push({key: field.name, value: field.value})
        }
      }
    }

    let notes = item.notes || undefined
    if (item.type === 4 && item.identity) {
      const identityNotes = `--- Identity Details ---\n${formatIdentityAsNotes(item.identity)}`
      notes = notes ? `${notes}\n\n${identityNotes}` : identityNotes
    }

    const otp = item.login?.totp
      ? {
          secret: item.login.totp,
          label: item.name || 'OTP',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          encoding: 'base32' as const,
          type: 'TOTP' as const,
        }
      : undefined

    const paymentCard = item.type === 3 ? parsePaymentCard(item.card) : undefined

    entries.push({
      id: item.id,
      type: entryType,
      name: item.name || 'Untitled',
      username: item.login?.username || undefined,
      password: item.login?.password || undefined,
      paymentCard,
      urls: urls.length > 0 ? urls : undefined,
      notes,
      folder: folderName,
      customFields: customFields.length > 0 ? customFields : undefined,
      tags: collectCollectionTags(item.collectionIds, collectionMap),
      otp,
    })
  }

  return {entries, folders, conflicts: [], warnings}
}

function collectCollectionTags(
  collectionIds: string[] | null | undefined,
  collectionMap: Map<string, string>,
): string[] | undefined {
  if (!collectionIds || collectionMap.size === 0) return undefined

  const tags: string[] = []
  const seen = new Set<string>()
  for (const collectionId of collectionIds) {
    const tag = collectionMap.get(collectionId)?.trim()
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }

  return tags.length > 0 ? tags : undefined
}

function mapEntryType(type: number): ImportedEntry['type'] {
  switch (type) {
    case 1:
      return 'login'
    case 2:
      return 'secure_note'
    case 3:
      return 'card'
    case 4:
      return 'identity'
    default:
      return 'unknown'
  }
}

function mapUriMatch(match: number | null | undefined): UrlMatch {
  switch (match) {
    case null:
    case undefined:
    case 0:
      return 'base_domain'
    case 1:
      return 'host'
    case 2:
      return 'starts_with'
    case 3:
      return 'exact'
    case 4:
      return 'regex'
    case 5:
      return 'never'
    default:
      return 'base_domain'
  }
}

function normalizeCardDigits(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const digits = value.replace(/\D+/g, '')
  return digits.length > 0 ? digits : undefined
}

function parsePaymentCard(card: Record<string, string | null> | null | undefined) {
  if (!card) return undefined

  const cardholderName = card['cardholderName']?.trim()
  const expMonth = Number(card['expMonth'] ?? '')
  const expYear = Number(card['expYear'] ?? '')
  if (!cardholderName || !Number.isInteger(expMonth) || !Number.isInteger(expYear)) {
    return undefined
  }

  return {
    cardholderName,
    expMonth,
    expYear,
    ...(card['brand']?.trim() ? {brand: card['brand'].trim()} : {}),
    ...(normalizeCardDigits(card['number']) ? {number: normalizeCardDigits(card['number'])} : {}),
    ...(normalizeCardDigits(card['code']) ? {cvv: normalizeCardDigits(card['code'])} : {}),
  }
}

function formatIdentityAsNotes(identity: Record<string, string | null>): string {
  const lines: string[] = []
  const fields = [
    'firstName',
    'lastName',
    'email',
    'phone',
    'company',
    'address1',
    'city',
    'state',
    'postalCode',
    'country',
  ]
  for (const field of fields) {
    if (identity[field]) lines.push(`${field}: ${identity[field]}`)
  }
  return lines.join('\n')
}
