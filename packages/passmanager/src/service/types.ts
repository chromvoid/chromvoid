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

export type OTPEntry = {
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
  name?: string
  comment?: string
}

export type PassManagerEntryType = 'login' | 'payment_card'

export type PaymentCardBrand = 'visa' | 'mastercard' | 'amex' | 'mir' | 'unionpay' | 'unknown'

export type PaymentCardMeta = {
  cardholderName: string
  expMonth: number
  expYear: number
  brand?: PaymentCardBrand
  last4?: string
}

export type PassManagerSecretSlot = 'password' | 'note' | 'card_pan' | 'card_cvv'

type EntryBase = {
  id: string
  createdTs: number
  updatedTs: number
  title: string
  tags?: string[]
  iconRef?: string
}

export type LoginEntry = EntryBase & {
  entryType?: 'login'
  urls: UrlRule[]
  username: string
  otps: Array<OTPEntry>
  sshKeys: Array<SshKeyEntry>
  paymentCard?: undefined
}

export type PaymentCardEntry = EntryBase & {
  entryType: 'payment_card'
  urls: UrlRule[]
  username: string
  otps: Array<OTPEntry>
  sshKeys: Array<SshKeyEntry>
  paymentCard: PaymentCardMeta
}

export type IEntry = LoginEntry | PaymentCardEntry

export type LoginEntryExternal = {
  id: string
  entryType?: 'login'
  createdTs: number
  updatedTs: number
  exportedTs: number
  title: string
  folderPath?: string | null
  urls: UrlRule[]
  username: string
  password?: string
  note?: string
  otps: Array<OTPEntry & {secret: string}>
  tags?: string[]
  iconRef?: string
}

export type PaymentCardEntryExternal = {
  id: string
  entryType: 'payment_card'
  createdTs: number
  updatedTs: number
  exportedTs: number
  title: string
  folderPath?: string | null
  paymentCard: PaymentCardMeta
  cardPan: string
  cardCvv?: string
  note?: string
  tags?: string[]
  iconRef?: string
}

export type IEntryExternal = LoginEntryExternal | PaymentCardEntryExternal

export type IGroupExternal = {
  id: string
  createdTs: number
  updatedTs: number
  exportedTs: number
  name: string
  iconRef?: string
  description?: string
  entries: IEntryExternal[]
}

// --- Legacy SAVE_KEY root payload (v2) ---

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
  sshKeys?: Array<{id: string; type: string; fingerprint: string; name?: string; comment?: string}>
}

export type PassManagerRootV2FolderMeta = {
  path: string
  iconRef?: string
  description?: string
}

export interface PassManagerRootV2 {
  version: 2
  createdTs: number
  updatedTs: number
  folders: string[]
  foldersMeta?: PassManagerRootV2FolderMeta[]
  entries: PassManagerRootV2Entry[]
}

// --- Runtime persistence payload (v3) ---

export type PassManagerRootV3Encoding = PassManagerRootV2Encoding
export type PassManagerRootV3OTP = PassManagerRootV2OTP
export type PassManagerRootV3FolderMeta = PassManagerRootV2FolderMeta

type PassManagerRootV3EntryTimestamps = {
  createdTs?: number
  updatedTs?: number
}

export type PassManagerRootV3LoginEntry = PassManagerRootV3EntryTimestamps & {
  id: string
  entryType?: 'login'
  title: string
  username: string
  urls: UrlRule[]
  otps: PassManagerRootV3OTP[]
  folderPath: string | null
  tags?: string[]
  iconRef?: string
  sshKeys?: Array<{id: string; type: string; fingerprint: string; name?: string; comment?: string}>
}

export type PassManagerRootV3PaymentCardEntry = PassManagerRootV3EntryTimestamps & {
  id: string
  entryType: 'payment_card'
  title: string
  paymentCard: PaymentCardMeta
  folderPath: string | null
  tags?: string[]
  iconRef?: string
}

export type PassManagerRootV3Entry = PassManagerRootV3LoginEntry | PassManagerRootV3PaymentCardEntry

export interface PassManagerRootV3 {
  version: 3
  createdTs: number
  updatedTs: number
  folders: string[]
  foldersMeta?: PassManagerRootV3FolderMeta[]
  tags?: string[]
  entries: PassManagerRootV3Entry[]
}

// --- Full-backup export payload (v1) ---

export type PassManagerExportV1Entry = LoginEntryExternal | PaymentCardEntryExternal

export interface PassManagerExportV1 {
  version: 1
  createdTs: number
  updatedTs: number
  folders: string[]
  foldersMeta?: PassManagerRootV3FolderMeta[]
  tags?: string[]
  entries: PassManagerExportV1Entry[]
}

type PassManagerSaveEntryOtpPayload = {
  id?: string
  label?: string
  algorithm?: Algorithm
  digits?: number
  period?: number
  encoding?: Encoding
  type?: OTPType
  counter?: number
}

type PassManagerSaveEntryMetaTimestamps = {
  createdTs?: number
  updatedTs?: number
}

export type PassManagerSaveLoginEntryMetaPayload = PassManagerSaveEntryMetaTimestamps & {
  id: string
  entryType?: 'login'
  title: string
  urls: UrlRule[]
  username: string
  otps: Array<PassManagerSaveEntryOtpPayload>
  groupPath?: string
  tags?: string[]
  iconRef?: string
  sshKeys?: Array<{id: string; type: string; fingerprint: string; name?: string; comment?: string}>
  paymentCard?: undefined
}

export type PassManagerSavePaymentCardEntryMetaPayload = PassManagerSaveEntryMetaTimestamps & {
  id: string
  entryType: 'payment_card'
  title: string
  paymentCard: PaymentCardMeta
  groupPath?: string
  tags?: string[]
  iconRef?: string
  urls?: undefined
  username?: undefined
  otps?: undefined
  sshKeys?: undefined
}

export type PassManagerSaveEntryMetaPayload =
  | PassManagerSaveLoginEntryMetaPayload
  | PassManagerSavePaymentCardEntryMetaPayload

export interface ManagerSaver {
  save(key: string, value: File): Promise<boolean>
  read<T = unknown>(key: string): Promise<T | undefined>
  remove(key: string): Promise<boolean>
  getOTP(data: OTPGetParams): Promise<string | undefined>
  getOTPSeckey(id: string): Promise<string | undefined>
  removeOTP(id: OTPId): Promise<boolean>
  saveOTP(id: OTPId, secret: string): Promise<boolean>
  readEntrySecret(entryId: string, slot: PassManagerSecretSlot): Promise<string | undefined>
  saveEntrySecret(entryId: string, slot: PassManagerSecretSlot, value: string | null): Promise<boolean>
  removeEntrySecret(entryId: string, slot: PassManagerSecretSlot): Promise<boolean>
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
  getIcon?(iconRef: string): Promise<{
    iconRef: string
    mimeType: string
    backgroundColor?: string
    contentBase64: string
  }>
  removeEntrySshPrivateKey(entryId: string, keyId: string): Promise<boolean>
  removeEntrySshPublicKey(entryId: string, keyId: string): Promise<boolean>
  saveEntryMeta(data: PassManagerSaveEntryMetaPayload): Promise<boolean>
  moveEntryToGroup(entryId: string, targetGroupPath: string | undefined): Promise<boolean>
  removeEntry(id: string): Promise<boolean>
}

export interface TGroupActions {
  createEntry(data: Partial<IEntry>, password: string, note: string, otp: OTPOptions | undefined): Entry
  rename?(nextPath: string): boolean
  updateData(data: Partial<IGroup>): void
}

export type SortField = 'name' | 'username' | 'modified' | 'created' | 'website'

export type SortDirection = 'asc' | 'desc'

export type GroupBy = 'none' | 'website' | 'modified' | 'security'

export type ViewMode = 'default' | 'compact' | 'dense'
