import type {ImportResult, ImportedEntry, ImportedFolder, UrlRule, UrlMatch} from '../types.js'

const MAX_FILE_SIZE = 50 * 1024 * 1024
const MAX_ENTRIES = 10_000

interface BitwardenExport {
  encrypted: boolean
  folders?: Array<{id: string; name: string}>
  items?: Array<BitwardenItem>
}

interface BitwardenItem {
  id: string
  folderId?: string | null
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
    if (item.type === 3 && item.card) {
      const cardNotes = `--- Card Details ---\n${formatCardAsNotes(item.card)}`
      notes = notes ? `${notes}\n\n${cardNotes}` : cardNotes
    }
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

    entries.push({
      id: item.id,
      type: entryType,
      name: item.name || 'Untitled',
      username: item.login?.username || undefined,
      password: item.login?.password || undefined,
      urls: urls.length > 0 ? urls : undefined,
      notes,
      folder: folderName,
      customFields: customFields.length > 0 ? customFields : undefined,
      otp,
    })
  }

  return {entries, folders, conflicts: [], warnings}
}

function mapEntryType(type: number): ImportedEntry['type'] {
  switch (type) {
    case 1:
      return 'login'
    case 2:
    case 3:
    case 4:
      return 'secure_note'
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

function formatCardAsNotes(card: Record<string, string | null>): string {
  const lines: string[] = []
  if (card['cardholderName']) lines.push(`Cardholder: ${card['cardholderName']}`)
  if (card['number']) lines.push(`Number: ${card['number']}`)
  if (card['expMonth'] && card['expYear']) lines.push(`Expires: ${card['expMonth']}/${card['expYear']}`)
  if (card['code']) lines.push(`CVV: ${card['code']}`)
  if (card['brand']) lines.push(`Brand: ${card['brand']}`)
  return lines.join('\n')
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
