export interface ImportResult {
  entries: ImportedEntry[]
  folders: ImportedFolder[]
  conflicts: Conflict[]
  warnings: string[]
}

export interface ImportedIcon {
  iconRef?: string
  contentBase64?: string
  mimeType?: string
  source?: 'keepass-custom' | 'keepass-standard'
  sourceId?: string
}

export type UrlMatch = 'base_domain' | 'host' | 'starts_with' | 'exact' | 'regex' | 'never'

export type UrlRule = {
  value: string
  match: UrlMatch
}

export interface ImportedEntry {
  id: string
  type: 'login' | 'secure_note' | 'card' | 'identity' | 'unknown'
  name: string
  username?: string
  password?: string
  urls?: UrlRule[]
  notes?: string
  folder?: string
  customFields?: Array<{key: string; value: string}>
  icon?: ImportedIcon
  otp?: {
    secret: string
    label?: string
    algorithm?: string
    digits?: number
    period?: number
    encoding?: 'base32' | 'base64' | 'hex' | 'base16' | 'utf-8'
    type?: 'TOTP' | 'HOTP'
    counter?: number
  }
}

export interface ImportedFolder {
  id: string
  name: string
  path: string
  icon?: ImportedIcon
}

export interface Conflict {
  type: 'name_collision' | 'path_conflict' | 'id_collision' | 'possible_duplicate'
  existingEntry?: ImportedEntry
  newEntry: ImportedEntry
  resolution?: ConflictResolution
}

export type ConflictResolution = 'skip' | 'overwrite' | 'rename' | 'merge'

export interface ImportProgress {
  total: number
  imported: number
  updated: number
  skipped: number
  errors: number
  currentItem?: string
}

export interface ExistingEntryInfo {
  nodeId: number
  path: string
  childNodeIds: number[]
  entryId?: string
}
