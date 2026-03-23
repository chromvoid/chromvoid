import type {Entry} from './entry'
import type {IGroup} from './root'

export type Algorithm =
  | 'SHA1'
  | 'SHA224'
  | 'SHA256'
  | 'SHA384'
  | 'SHA512'
  | 'SHA3224'
  | 'SHA3256'
  | 'SHA3384'
  | 'SHA3512'

export type Encoding = 'base32' | 'base64' | 'base16' | 'utf-8'

export type OTPType = 'TOTP' | 'HOTP'

export type UrlMatch = 'base_domain' | 'host' | 'starts_with' | 'exact' | 'regex' | 'never'

export type UrlRule = {
  value: string
  match: UrlMatch
}

export type OTPOptions = {
  id: string
  label: string
  algorithm: Algorithm
  digits: number
  period: number
  secret: string | undefined
  encoding: Encoding
  type?: OTPType
  counter?: number
}

type OTPId = string

export type OTPItem = {
  id: OTPId
  label: string
}

export type OTPGetParams = {
  ts: number
  id: OTPId
  period: number
  digits: number
  ha: Algorithm
  entryId?: string
  label?: string
  entryTitle?: string
  entryGroupPath?: string
}

type OTPEntry = {
  id: OTPId
  label: string
  period: number
  digits: number
  algorithm: Algorithm
  encoding: Encoding
  type?: OTPType
  counter?: number
}

export type SshKeyType = 'ed25519' | 'rsa' | 'ecdsa'

export type SshKeyEntry = {
  id: string
  type: SshKeyType
  fingerprint: string
  comment?: string
}

export type IEntry = {
  id: string
  createdTs: number
  updatedTs: number
  title: string
  urls: UrlRule[]
  username: string
  otps: Array<OTPEntry>
  iconRef?: string
  sshKeys: Array<SshKeyEntry>
}

export type IEntryExternal = {
  id: string
  createdTs: number
  updatedTs: number
  exportedTs: number
  title: string
  urls: UrlRule[]
  username: string
  password?: string
  otps: Array<OTPEntry & {secret: string}>
  iconRef?: string
}

export type IGroupExternal = {
  id: string
  createdTs: number
  updatedTs: number
  exportedTs: number
  name: string
  iconRef?: string
  entries: IEntryExternal[]
}

// --- SAVE_KEY root payload (v2) ---

export type PassManagerRootV2Encoding = 'base32' | 'base64' | 'hex'

export type PassManagerRootV2OTP = {
  id?: string
  label?: string
  algorithm?: Algorithm
  digits?: number
  period?: number
  encoding?: PassManagerRootV2Encoding
  type?: OTPType
  counter?: number
}

export type PassManagerRootV2Entry = {
  id: string
  title: string
  username: string
  urls: UrlRule[]
  otps: PassManagerRootV2OTP[]
  /** null = root (/.passmanager/<entry>) */
  folderPath: string | null
  iconRef?: string
  sshKeys?: Array<{id: string; type: string; fingerprint: string; comment?: string}>
}

export type PassManagerRootV2FolderMeta = {
  path: string
  iconRef?: string
}

export interface PassManagerRootV2 {
  version: 2
  createdTs: number
  updatedTs: number
  /** List of folders that must exist (including empty). Root is not included. */
  folders: string[]
  foldersMeta?: PassManagerRootV2FolderMeta[]
  /** Flat list of entries. */
  entries: PassManagerRootV2Entry[]
}

export interface ManagerSaver {
  save(key: string, value: File): Promise<boolean>
  read<T = unknown>(key: string): Promise<T | undefined>
  remove(key: string): Promise<boolean>
  getOTP(data: OTPGetParams): Promise<string | undefined>
  getOTPSeckey(id: string): Promise<string | undefined>
  removeOTP(id: OTPId): Promise<boolean>
  saveOTP(id: OTPId, secret: string): Promise<boolean>
  /** Секреты записи (пароль/заметка) поверх каталога */
  readEntryPassword(entryId: string): Promise<string | undefined>
  readEntryNote(entryId: string): Promise<string | undefined>
  saveEntryPassword(entryId: string, password: string | null): Promise<boolean>
  saveEntryNote(entryId: string, note: string | null): Promise<boolean>
  removeEntryPassword(entryId: string): Promise<boolean>
  removeEntryNote(entryId: string): Promise<boolean>
  readEntrySshPrivateKey(entryId: string, keyId: string): Promise<string | undefined>
  readEntrySshPublicKey(entryId: string, keyId: string): Promise<string | undefined>
  saveEntrySshPrivateKey(entryId: string, keyId: string, key: string | null): Promise<boolean>
  saveEntrySshPublicKey(entryId: string, keyId: string, key: string | null): Promise<boolean>
  getIcon?(iconRef: string): Promise<{iconRef: string; mimeType: string; contentBase64: string}>
  removeEntrySshPrivateKey(entryId: string, keyId: string): Promise<boolean>
  removeEntrySshPublicKey(entryId: string, keyId: string): Promise<boolean>
  /** Точечная запись/обновление meta.json для одной записи */
  saveEntryMeta(data: {
    id: string
    title: string
    urls: UrlRule[]
    username: string
    otps: Array<{
      id?: string
      label?: string
      algorithm?: Algorithm
      digits?: number
      period?: number
      encoding?: Encoding
      type?: OTPType
      counter?: number
    }>
    groupPath?: string
    iconRef?: string
    sshKeys?: Array<{id: string; type: string; fingerprint: string; comment?: string}>
  }): Promise<boolean>
  /** Удаление директории записи по её id */
  removeEntry(id: string): Promise<boolean>
}

export interface TGroupActions {
  createEntry(data: Partial<IEntry>, password: string, note: string, otp: OTPOptions | undefined): Entry
  updateData(data: Partial<IGroup>): void
}

// Типы для сортировки и группировки записей
export type SortField = 'name' | 'username' | 'modified' | 'created' | 'website'

export type SortDirection = 'asc' | 'desc'

export type GroupBy = 'none' | 'folder' | 'website' | 'modified' | 'security'
