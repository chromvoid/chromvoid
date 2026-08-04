import {sha256} from '@project/utils'
import {action, atom, computed, peek, withAsync, wrap} from '@reatom/core'

import {v4} from 'uuid'

import {SAVE_KEY} from '../consts'
import {i18n} from '../i18n'
import {confirmPassManagerAction, showPassManagerAlert} from './dialog'
import {normalizeGroupDescription} from './group-description'
import {logger} from './logger'
import {formatDateTime} from '../i18n/format'
import {normalizeTimestampMs} from '../utils'
import {Entry, filterEntries} from './entry'
import {Group} from './group'
import {OTP} from './otp'
import type {Icon} from './icon'
import {notify} from './notify'
import type {MutationPresentation} from './mutation-presentation'
import {parseCredentialSecurityAuditArtifact, type CredentialSecurityAuditArtifactV1} from './security-audit'
import {
  createEntryFilterMatcher,
  filterValue,
  getEffectiveSelectedCredentialTagFilters,
  quickFilters,
} from './select'
import {
  normalizeCredentialTagCatalog,
  normalizeCredentialTagCatalogMeta,
  normalizeCredentialTags,
  pruneCredentialTagCatalogMeta,
  type CredentialTagCatalogMeta,
} from './tags'
import type {
  Algorithm,
  Encoding,
  IEntry,
  IEntryExternal,
  IGroupExternal,
  ManagerSaver,
  PassManagerExportV1,
  PassManagerRootV2,
  PassManagerRootV2Encoding,
  PassManagerRootV2Entry,
  PassManagerRootV2OTP,
  PassManagerRootV3,
  PassManagerRootV3Encoding,
  PassManagerRootV3Entry,
  PassManagerRootV4,
  PassManagerSshKey,
  PaymentCardCreationSecrets,
  PaymentCardMeta,
  OTPOptions,
  TGroupActions,
  SshKeygenParams,
} from './types'

const GROUP_PATH_LIMITS = {
  MAX_DEPTH: 10,
  MAX_SEGMENT_LENGTH: 100,
  MAX_PATH_LENGTH: 500,
} as const

function normalizeSaveKeyFolderPath(raw: string): string | undefined {
  const input = String(raw ?? '').trim()
  if (!input) return undefined

  const segments = input
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)

  if (segments.length === 0) return undefined
  if (segments.some((s) => s === '.' || s === '..')) {
    throw new Error('Invalid folderPath: traversal segments are not allowed')
  }
  if (segments.length > GROUP_PATH_LIMITS.MAX_DEPTH) {
    throw new Error(`Invalid folderPath: depth ${segments.length} > ${GROUP_PATH_LIMITS.MAX_DEPTH}`)
  }
  if (segments.some((s) => s.length > GROUP_PATH_LIMITS.MAX_SEGMENT_LENGTH)) {
    throw new Error('Invalid folderPath: segment too long')
  }
  const out = segments.join('/')
  if (out.length > GROUP_PATH_LIMITS.MAX_PATH_LENGTH) {
    throw new Error('Invalid folderPath: path too long')
  }
  return out
}

function normalizeSaveKeyEncoding(enc?: Encoding): PassManagerRootV2Encoding | undefined {
  if (enc === 'base32' || enc === 'base64') return enc
  if (enc === 'base16') return 'hex'
  return undefined
}

function normalizeEntryType(value: unknown): IEntry['entryType'] {
  return value === 'payment_card' ? 'payment_card' : 'login'
}

function normalizePaymentCardMeta(value: unknown): PaymentCardMeta | undefined {
  if (!value || typeof value !== 'object') return undefined
  const rec = value as Record<string, unknown>
  const cardholderName = rec['cardholderName'] ?? rec['cardholder_name']
  const expMonthRaw = rec['expMonth'] ?? rec['exp_month']
  const expYearRaw = rec['expYear'] ?? rec['exp_year']
  const expMonth = typeof expMonthRaw === 'number' ? expMonthRaw : Number(expMonthRaw)
  const expYear = typeof expYearRaw === 'number' ? expYearRaw : Number(expYearRaw)
  if (typeof cardholderName !== 'string' || !cardholderName.trim()) return undefined
  if (!Number.isInteger(expMonth) || !Number.isInteger(expYear)) return undefined

  const brandValue = typeof rec['brand'] === 'string' && rec['brand'].trim() ? rec['brand'] : 'unknown'
  const last4Value = typeof rec['last4'] === 'string' && rec['last4'].trim() ? rec['last4'] : undefined

  return {
    cardholderName: cardholderName.trim(),
    brand: brandValue as PaymentCardMeta['brand'],
    expMonth,
    expYear,
    ...(last4Value ? {last4: last4Value} : {}),
  }
}

function isValidSshKeyId(id: string): boolean {
  return id.length > 0 && id.length <= 64 && /^[A-Za-z0-9_-]+$/.test(id)
}

function normalizeSshKey(
  value: unknown,
  sourceEntryId?: string,
  forcedId?: string,
): PassManagerSshKey | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const id = forcedId ?? (typeof raw['id'] === 'string' ? raw['id'].trim() : '')
  const type = raw['type']
  const fingerprint = typeof raw['fingerprint'] === 'string' ? raw['fingerprint'].trim() : ''
  if (!isValidSshKeyId(id) || !['ed25519', 'rsa', 'ecdsa'].includes(String(type)) || !fingerprint) {
    return undefined
  }
  const optionalString = (key: string, alias?: string) => {
    const candidate = raw[key] ?? (alias ? raw[alias] : undefined)
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined
  }
  const optionalTimestamp = (key: string, alias: string) => {
    const candidate = raw[key] ?? raw[alias]
    return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
      ? Math.floor(candidate)
      : undefined
  }
  return {
    id,
    type: type as PassManagerSshKey['type'],
    fingerprint,
    name: optionalString('name'),
    comment: optionalString('comment'),
    sourceEntryId: optionalString('sourceEntryId', 'source_entry_id') ?? sourceEntryId,
    createdTs: optionalTimestamp('createdTs', 'created_ts'),
    updatedTs: optionalTimestamp('updatedTs', 'updated_ts'),
  }
}

async function normalizeRootSshKeys(
  root: PassManagerRootV2 | PassManagerRootV3 | PassManagerRootV4,
): Promise<PassManagerSshKey[]> {
  const keys: PassManagerSshKey[] = []
  const usedIds = new Set<string>()
  const rootKeys = root.version === 4 && Array.isArray(root.sshKeys) ? root.sshKeys : []
  for (const value of rootKeys) {
    const key = normalizeSshKey(value)
    if (!key || usedIds.has(key.id)) {
      throw new Error('Invalid or duplicate root SSH key metadata')
    }
    usedIds.add(key.id)
    keys.push(key)
  }

  for (const entry of root.entries) {
    const raw = entry as PassManagerRootV3Entry & {sshKeys?: unknown}
    if (!Array.isArray(raw.sshKeys)) continue
    for (const value of raw.sshKeys) {
      if (!value || typeof value !== 'object') continue
      const rawId = typeof (value as {id?: unknown}).id === 'string' ? (value as {id: string}).id.trim() : ''
      const id =
        isValidSshKeyId(rawId) && !usedIds.has(rawId)
          ? rawId
          : `migrated-${(await sha256(`${entry.id}:${rawId}`)).slice(0, 32)}`
      const key = normalizeSshKey(value, entry.id, id)
      if (!key || usedIds.has(key.id)) {
        throw new Error('Invalid legacy SSH key metadata')
      }
      usedIds.add(key.id)
      keys.push(key)
    }
  }
  return keys
}

export const ALGORITHMS: Array<Algorithm> = ['SHA1', 'SHA256', 'SHA512']

export const ENCODINGS: Array<Encoding> = ['base16', 'base32', 'base64', 'utf-8']

export const ROOT_ID = 'root'

export {Group}
export type {GroupSaveChangesInput, GroupSaveChangesResult} from './group'
export interface IGroup {
  id: string
  createdTs: number
  updatedTs: number
  entries: IEntry[]
  name: string
  description?: string
  icon?: Icon
  iconRef?: string
}

export type RootJSONData = {
  name: string
  salt: string
  entries: (IEntry | IGroup)[]
  createdTs: number
  updatedTs: number
}

export type {IEntry, Entry}
export {filterEntries}

function downloadJSONBrowser(jsonStr: string, filename: string) {
  const blob = new Blob([jsonStr], {type: 'application/json'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function downloadJSON(jsonData: unknown, filename = 'passmanager-export.json'): Promise<boolean> {
  const jsonStr = JSON.stringify(jsonData, null, 2)

  const tauriInternals = (globalThis as unknown as {__TAURI_INTERNALS__?: {invoke?: unknown}})
    .__TAURI_INTERNALS__
  if (tauriInternals && typeof tauriInternals === 'object' && typeof tauriInternals.invoke === 'function') {
    try {
      const {save} = await import('@tauri-apps/plugin-dialog')
      const targetPath = await save({
        defaultPath: filename,
        filters: [{name: 'JSON', extensions: ['json']}],
      })
      if (!targetPath) return false

      const {invoke} = await import('@tauri-apps/api/core')
      await invoke('write_text_file', {path: targetPath, content: jsonStr})
      return true
    } catch {
      downloadJSONBrowser(jsonStr, filename)
      return true
    }
  }

  downloadJSONBrowser(jsonStr, filename)
  return true
}

function createJsonFile(content: string, filename: string): File {
  try {
    const ctor = typeof File === 'function' ? File : undefined
    if (ctor) {
      const candidate = new ctor([content], filename, {type: 'application/json'})
      if (typeof (candidate as unknown as {text?: unknown}).text === 'function') {
        return candidate as unknown as File
      }
    }
  } catch {}

  return {
    name: filename,
    type: 'application/json',
    size: content.length,
    text: async () => content,
  } as unknown as File
}

export class ManagerRoot implements TGroupActions {
  static root: ManagerRoot
  isRoot = true
  isLoading = atom(false)
  entries = atom<(Entry | Group)[] | undefined>(undefined)
  isReadOnly = atom(false)
  isEditMode = atom(false)
  showElement = atom<
    | ManagerRoot
    | Group
    | Entry
    | 'createGroup'
    | 'createEntry'
    | 'importDialog'
    | 'otpView'
    | 'sshView'
    | 'envRuntimeView'
  >(this)
  updatedTs = atom(Date.now())
  createdTs = atom(Date.now())
  credentialTags = atom<string[]>([], 'passmanager.root.credentialTags')
  credentialTagMeta = atom<CredentialTagCatalogMeta>({}, 'passmanager.root.credentialTagMeta')
  credentialSecurityAudit = atom<CredentialSecurityAuditArtifactV1 | undefined>(
    undefined,
    'passmanager.root.credentialSecurityAudit',
  )
  sshKeys = atom<PassManagerSshKey[]>([], 'passmanager.root.sshKeys')
  sshKeysBySourceEntryId = computed(() => {
    const result = new Map<string, PassManagerSshKey[]>()
    for (const key of this.sshKeys()) {
      if (!key.sourceEntryId) continue
      const current = result.get(key.sourceEntryId) ?? []
      current.push(key)
      result.set(key.sourceEntryId, current)
    }
    return result
  }, 'passmanager.root.sshKeysBySourceEntryId')
  salt = v4().replaceAll('-', '').slice(0, 16)

  private createTarget: Group | undefined = undefined
  private _saving = false
  private _savePromise: Promise<unknown> | null = null
  private _savePending = false
  private _allowEmptyOverwrite = false
  private _loadRequestedDuringSave = false

  private _pendingEntryUpdates = 0

  beginEntryUpdate() {
    this._pendingEntryUpdates++
  }

  endEntryUpdate() {
    if (this._pendingEntryUpdates > 0) {
      this._pendingEntryUpdates--
    }
    this.flushDeferredLoad()
  }

  private flushDeferredLoad(): void {
    if (!this._loadRequestedDuringSave || this._saving || this._pendingEntryUpdates > 0) {
      return
    }
    this._loadRequestedDuringSave = false
    void this.load()
  }

  get isShowRoot() {
    return this.showElement() === this
  }

  entriesList() {
    return this.entries() ?? []
  }

  sorted = computed(() => {
    return (
      this.entriesList()?.sort((a, b) => {
        if (a instanceof Entry && b instanceof Entry) {
          return a.title.localeCompare(b.title)
        }
        if (a instanceof Entry) {
          return 1
        }
        if (b instanceof Entry) {
          return -1
        }
        if (a instanceof Group && b instanceof Group) {
          const Asearched = peek(a.entries)
          const Bsearched = peek(b.entries)

          if (Asearched.length === 0 && Bsearched.length === 0) {
            return a.name.localeCompare(b.name)
          }
          if (Asearched.length === 0) {
            return 1
          }
          if (Bsearched.length === 0) {
            return -1
          }

          return a.name.localeCompare(b.name)
        }
        return 0
      }) ?? []
    )
  }, 'sorted')

  searched = computed(() => {
    const fv = filterValue()
    const qf = quickFilters()
    const selectedTags = getEffectiveSelectedCredentialTagFilters(this.allEntries, this.credentialTags())
    const matches = createEntryFilterMatcher(fv, qf, Date.now(), selectedTags)

    return this.sorted().filter((item) => {
      if (item instanceof Entry) {
        return matches(item)
      }
      const searched = item.searched()
      if (fv || qf.length || selectedTags.length) {
        return searched.length
      }
      return true
    })
  }, 'searched')

  setShowElement(
    item:
      | ManagerRoot
      | Group
      | Entry
      | 'createGroup'
      | 'createEntry'
      | 'importDialog'
      | 'otpView'
      | 'sshView'
      | 'envRuntimeView',
    target?: Group,
  ) {
    this.createTarget = target
    this.showElement.set(item)
  }

  get root() {
    return this
  }

  get id() {
    return ROOT_ID
  }

  get name() {
    return i18n('root:title')
  }

  get groups(): Group[] {
    const data = this.sorted().filter((item) => item instanceof Group) as Group[]
    return [this as unknown as Group, ...data]
  }

  constructor(public managerSaver: ManagerSaver) {
    Group.root = this
    Entry.root = this
    ManagerRoot.root = this
  }

  sshKeysForEntry(entryId: string): PassManagerSshKey[] {
    return this.sshKeysBySourceEntryId().get(entryId) ?? []
  }

  sshKeyById(keyId: string): PassManagerSshKey | undefined {
    return this.sshKeys().find((key) => key.id === keyId)
  }

  readonly refreshSshKeys = action(async () => {
    if (!this.managerSaver.listSshKeys) return this.sshKeys()
    const keys = await wrap(this.managerSaver.listSshKeys())
    this.sshKeys.set(keys)
    return keys
  }, 'passmanager.root.refreshSshKeys').extend(withAsync())

  readonly updateSshKey = action(async (key: PassManagerSshKey) => {
    if (!this.managerSaver.updateSshKey) throw new Error('SSH key repository is unavailable')
    const saved = await wrap(this.managerSaver.updateSshKey(key))
    if (!saved) throw new Error('Failed to update SSH key')
    this.sshKeys.set([...this.sshKeys().filter((item) => item.id !== key.id), key])
    return true
  }, 'passmanager.root.updateSshKey').extend(withAsync())

  readonly removeSshKey = action(async (keyId: string) => {
    if (!this.managerSaver.removeSshKey) throw new Error('SSH key repository is unavailable')
    const removed = await wrap(this.managerSaver.removeSshKey(keyId))
    if (!removed) throw new Error('Failed to remove SSH key')
    this.sshKeys.set(this.sshKeys().filter((key) => key.id !== keyId))
    return true
  }, 'passmanager.root.removeSshKey').extend(withAsync())

  readonly readSshPublicKey = action(async (keyId: string) => {
    if (!this.managerSaver.readSshPublicKey) throw new Error('SSH key repository is unavailable')
    return await wrap(this.managerSaver.readSshPublicKey(keyId))
  }, 'passmanager.root.readSshPublicKey').extend(withAsync())

  readonly generateSshKey = action(async (params: SshKeygenParams) => {
    if (!this.managerSaver.generateSshKey) throw new Error('SSH key generation is unavailable')
    const result = await wrap(this.managerSaver.generateSshKey(params))
    await wrap(this.refreshSshKeys())
    return result
  }, 'passmanager.root.generateSshKey').extend(withAsync())
  removeEntry(_entry: Entry): void {
    throw new Error('Method not implemented.')
  }

  get topLevelEntries(): Array<Entry> {
    return this.entriesList()?.filter((item) => item instanceof Entry) ?? []
  }

  get allEntries(): Array<Entry> {
    const res: Array<Entry> = []

    for (const item of this.entriesList() ?? []) {
      if (item instanceof Entry) {
        res.push(item)
      } else {
        res.push(...item.entries())
      }
    }
    return res
  }

  get updatedFormatted() {
    return formatDateTime(this.updatedTs())
  }

  get createdFormatted() {
    return formatDateTime(this.createdTs())
  }

  getCardByID(id: string): Entry | Group | ManagerRoot | undefined {
    if (id === this.id) {
      return this
    }
    for (const item of this.entriesList() ?? []) {
      if (item instanceof Entry) {
        if (item.id === id) {
          return item
        }
        continue
      }
      if (item.id === id) {
        return item
      }
      const entry = item.getEntry(id)
      if (entry) {
        return entry
      }
    }
    return undefined
  }

  getEntry(id: string): Entry | undefined {
    for (const item of this.entriesList() ?? []) {
      if (item instanceof Entry) {
        if (item.id === id) {
          return item
        }
        continue
      }
      const entry = item.getEntry(id)
      if (entry) {
        return entry
      }
    }
    return undefined
  }

  getGroup(id: string): Group | undefined {
    if (id === this.id) {
      return this as unknown as Group
    }
    for (const item of this.entriesList() ?? []) {
      if (item instanceof Group) {
        if (item.id === id) {
          return item
        }
      }
    }
    return undefined
  }

  private isUniqName(name: string) {
    name = name.toLowerCase().trim()

    return !this.entriesList()?.find((item) => {
      if (item instanceof Group) {
        return item.name.toLowerCase().trim() === name
      }
      return false
    })
  }

  async createGroup(
    data: Pick<IGroup, 'name' | 'description' | 'icon' | 'iconRef'> & {entries: Entry[]},
    {presentation = 'auto'}: {presentation?: MutationPresentation} = {},
  ): Promise<Group | undefined> {
    const isUniq = this.isUniqName(data.name)
    if (!isUniq) {
      void showPassManagerAlert({
        title: i18n('group:error:name_title'),
        message: i18n('group:error:name_text'),
        variant: 'warning',
      })
      return
    }
    const group = Group.create({
      entries: data.entries,
      name: data.name,
      description: data.description,
      icon: undefined,
      iconRef: data.iconRef,
    })
    const previousEntries = this.entriesList() ?? []
    const previousShowElement = this.showElement()
    this.entries.set([group, ...previousEntries])
    this.updatedTs.set(Date.now())
    const saved = await wrap(this.save())
    if (saved !== true) {
      this.entries.set(previousEntries)
      if (this.showElement() === group) this.showElement.set(previousShowElement)
      throw new Error('Failed to create group')
    }
    if (presentation === 'auto') {
      if (this.showElement() === previousShowElement) this.showElement.set(group)
      this.notifyCreatedGroup()
    }
    return group
  }

  presentCreatedGroup(group: Group): void {
    this.showElement.set(group)
    this.notifyCreatedGroup()
  }

  private notifyCreatedGroup(): void {
    try {
      notify.success(i18n('notify:createGroup:success'), undefined, {
        key: 'passmanager.group.create',
      })
    } catch {}
  }

  createEntry(
    data: Partial<IEntry>,
    password: string,
    note: string,
    otps: OTPOptions | undefined,
    paymentCardSecrets?: PaymentCardCreationSecrets,
  ) {
    this.updatedTs.set(Date.now())
    logger.debug('[PassManager] createEntry', {
      data: {
        title: (data as Partial<IEntry>)?.title,
        username: (data as Partial<IEntry>)?.username,
        urlsCount: Array.isArray((data as Partial<IEntry>)?.urls)
          ? ((data as Partial<IEntry>).urls as unknown[]).length
          : 0,
      },
      passwordLength: typeof password === 'string' ? password.length : 0,
      noteLength: typeof note === 'string' ? note.length : 0,
      hasOtp: Boolean(otps),
    })

    const entry = Entry.create(this.createTarget ?? this, data, password, note, otps, paymentCardSecrets)
    this.createTarget = undefined
    return entry
  }

  presentCreatedEntry(entry: Entry): void {
    this.showElement.set(entry)
    try {
      notify.success(i18n('notify:createEntry:success'), undefined, {
        key: 'passmanager.entry.create',
      })
    } catch {}
  }

  addEntry(entry: Entry) {
    entry.parent = this
    this.entries.set([entry, ...this.entriesList()])
  }

  excludeEntry(entry: Entry) {
    const entries = this.entriesList()
    this.entries.set(entries.filter((c) => c.id !== entry.id))
  }

  updateData() {
    this.updatedTs.set(Date.now())
    this.save()
  }

  setCredentialTagCatalog(tags: unknown, meta?: unknown): void {
    const catalogTags = normalizeCredentialTagCatalog(tags)
    this.credentialTags.set(catalogTags)
    this.credentialTagMeta.set(
      meta === undefined
        ? pruneCredentialTagCatalogMeta(this.credentialTagMeta(), catalogTags)
        : normalizeCredentialTagCatalogMeta(meta, catalogTags),
    )
    this.updatedTs.set(Date.now())
  }

  async saveCredentialTagCatalog(tags: unknown, meta?: unknown): Promise<boolean> {
    this.setCredentialTagCatalog(tags, meta)
    return Boolean(await this.save())
  }

  save(): Promise<unknown> {
    if (this._savePromise) {
      // Another save is already running. Mark pending so it re-saves
      // with the latest model state when the current one finishes.
      this._savePending = true
      return this._savePromise
    }

    let resolveCycle!: (value: unknown) => void
    let rejectCycle!: (reason?: unknown) => void
    const cycle = new Promise<unknown>((resolve, reject) => {
      resolveCycle = resolve
      rejectCycle = reject
    })
    this._savePromise = cycle
    void this._executeSaveCycle().then(resolveCycle, rejectCycle)
    return cycle
  }

  private async _executeSaveCycle(): Promise<unknown> {
    this._saving = true
    let result: unknown
    try {
      do {
        this._savePending = false
        result = await this.apiSave(SAVE_KEY)
      } while (this._savePending)
      return result
    } finally {
      this._savePromise = null
      this._saving = false
      this.flushDeferredLoad()
    }
  }

  async apiSave(key = SAVE_KEY, value?: File) {
    if (key === SAVE_KEY) {
      const now = Date.now()

      const entries: PassManagerRootV3Entry[] = []
      const assignedTagLabels: string[] = []
      const explicitFolderPaths = new Set<string>()
      const folderMetaByPath = new Map<string, {path: string; iconRef?: string; description?: string}>()

      const pushEntry = (entry: Entry, folderPath: string | null) => {
        assignedTagLabels.push(...entry.tags)
        if (entry.entryType === 'payment_card') {
          const paymentCard = entry.paymentCard
          if (!paymentCard) {
            throw new Error('payment_card metadata is required')
          }
          entries.push({
            id: entry.id,
            entryType: 'payment_card',
            createdTs: entry.createdTs,
            updatedTs: entry.updatedTs,
            title: String(entry.data().title ?? ''),
            paymentCard,
            folderPath,
            iconRef: entry.data().iconRef,
            tags: entry.tags,
          })
        } else {
          const otps: PassManagerRootV2OTP[] = entry
            .otps()
            .filter((o) => Boolean(o.id) && Boolean(o.data?.label))
            .map((o) => {
              const encoding = normalizeSaveKeyEncoding(o.data.encoding)
              return {
                id: o.id,
                label: o.data.label,
                algorithm: o.data.algorithm,
                digits: o.data.digits,
                period: o.data.period,
                encoding,
                type: o.data.type,
                counter: o.data.counter,
              }
            })

          entries.push({
            id: entry.id,
            entryType: 'login',
            createdTs: entry.createdTs,
            updatedTs: entry.updatedTs,
            title: String(entry.data().title ?? ''),
            username: String(entry.data().username ?? ''),
            urls: entry.urls,
            otps,
            folderPath,
            iconRef: entry.data().iconRef,
            tags: entry.tags,
          })
        }

        if (folderPath) {
          explicitFolderPaths.add(folderPath)
        }
      }

      for (const item of this.entriesList()) {
        if (item instanceof Entry) {
          pushEntry(item, null)
          continue
        }
        if (item instanceof Group) {
          const normalizedFolder = normalizeSaveKeyFolderPath(item.name)
          if (!normalizedFolder) {
            throw new Error('Invalid group name: empty folderPath is not allowed')
          }

          explicitFolderPaths.add(normalizedFolder)
          folderMetaByPath.set(normalizedFolder, {
            path: normalizedFolder,
            iconRef: item.iconRef,
            description: normalizeGroupDescription(item.description),
          })
          for (const entry of item.entriesList()) {
            pushEntry(entry, normalizedFolder)
          }
        }
      }

      const folderPrefixes = new Set<string>()
      for (const rawPath of explicitFolderPaths) {
        const normalized = normalizeSaveKeyFolderPath(rawPath)
        if (!normalized) continue
        const parts = normalized.split('/').filter(Boolean)
        for (let i = 1; i <= parts.length; i++) {
          folderPrefixes.add(parts.slice(0, i).join('/'))
        }
      }
      const folders = Array.from(folderPrefixes).sort()

      const catalogTags = normalizeCredentialTagCatalog([...this.credentialTags(), ...assignedTagLabels])
      const tagMeta = pruneCredentialTagCatalogMeta(this.credentialTagMeta(), catalogTags)
      const payload: PassManagerRootV4 = {
        version: 4,
        createdTs: this.createdTs(),
        updatedTs: now,
        folders,
        foldersMeta: Array.from(folderMetaByPath.values()),
        tags: catalogTags,
        ...(Object.keys(tagMeta).length > 0 ? {tagMeta} : {}),
        entries,
        sshKeys: this.sshKeys(),
      }

      const text = JSON.stringify(payload)
      const file = createJsonFile(text, key)

      return this.managerSaver.save(SAVE_KEY, file).catch(() => false)
    }
    if (value) {
      return this.managerSaver.save(key, value)
    }
    return false
  }

  apiRemove(key: string) {
    return this.managerSaver.remove(key)
  }

  apiRead<T>(key: string) {
    return this.managerSaver.read<T>(key)
  }

  async load() {
    // Do not restart the model during saving - queueRefresh caused by
    // SaveRoot can trigger load() through catalog.subscribe that will be overwritten.
    // not yet saved model changes (e.g. remote group)
    if (this._saving || this._pendingEntryUpdates > 0) {
      this._loadRequestedDuringSave = true
      return
    }

    // Show the spinner only at the first boot (when entries are not yet defined)
    const isInitialLoad = this.entries() === undefined
    if (isInitialLoad) {
      this.isLoading.set(true)
    }
    let dataReceived = false
    try {
      const data = await wrap(this.apiRead(SAVE_KEY))

      // undefined means the data source is not ready yet (e.g. catalog not
      // synced, vault still unlocking).  Keep current state — the catalog
      // subscription will trigger a retry automatically.
      if (data === undefined) {
        console.info('[PassManager][root.load] data source not ready, will retry on catalog sync')
        return
      }
      dataReceived = true

      let parsed: PassManagerRootV2 | PassManagerRootV3 | PassManagerRootV4 | undefined = undefined
      let credentialSecurityAudit: CredentialSecurityAuditArtifactV1 | undefined
      if (typeof data === 'string') {
        parsed = JSON.parse(
          data || '{"version":4,"folders":[],"entries":[],"sshKeys":[],"createdTs":0,"updatedTs":0}',
        )
      } else if (typeof data === 'object' && data) {
        parsed = data as PassManagerRootV2 | PassManagerRootV3 | PassManagerRootV4
        credentialSecurityAudit = parseCredentialSecurityAuditArtifact(
          (data as Record<string, unknown>)['credentialSecurityAudit'],
        )
      }

      if (!parsed || (parsed.version !== 2 && parsed.version !== 3 && parsed.version !== 4)) {
        throw new Error('Unsupported PassManager root payload: expected version 2, 3, or 4')
      }

      const fallbackSshKeys = await wrap(normalizeRootSshKeys(parsed))
      const sshKeys = this.managerSaver.listSshKeys
        ? await wrap(this.managerSaver.listSshKeys())
        : fallbackSshKeys
      this.sshKeys.set(sshKeys)

      const createdTs = normalizeTimestampMs(parsed.createdTs || Date.now())
      const updatedTs = normalizeTimestampMs(parsed.updatedTs || Date.now())
      const parsedCatalogTags = normalizeCredentialTagCatalog(
        (parsed as PassManagerRootV3 & {tags?: unknown}).tags,
      )
      const parsedTagMetaRaw =
        (parsed as PassManagerRootV3 & {tagMeta?: unknown}).tagMeta ??
        (parsed as PassManagerRootV3 & {tag_meta?: unknown}).tag_meta
      const entryCatalogTags: string[] = []
      this.credentialSecurityAudit.set(credentialSecurityAudit)
      this.createdTs.set(createdTs)
      this.updatedTs.set(updatedTs)

      // Build lookup maps for reload merge (reuse existing objects by id)
      const existingEntryMap = new Map<string, Entry>()
      const existingGroupMap = new Map<string, Group>()
      if (!isInitialLoad) {
        for (const item of this.entriesList()) {
          if (item instanceof Group) {
            existingGroupMap.set(item.id, item)
            for (const entry of item.entries()) {
              existingEntryMap.set(entry.id, entry)
            }
          } else if (item instanceof Entry) {
            existingEntryMap.set(item.id, item)
          }
        }
      }
      const groups = new Map<string, Group>()
      const folderMetaByPath = new Map<string, {iconRef?: string; description?: string}>()
      for (const meta of parsed.foldersMeta ?? []) {
        if (!meta || typeof meta !== 'object') continue
        const normalizedPath = normalizeSaveKeyFolderPath(String(meta.path ?? ''))
        if (!normalizedPath) continue
        folderMetaByPath.set(normalizedPath, {
          iconRef: meta.iconRef,
          description: normalizeGroupDescription(meta.description),
        })
      }

      const ensureGroup = (folderPath: string): Group => {
        const normalized = normalizeSaveKeyFolderPath(folderPath)
        if (!normalized) {
          throw new Error('Invalid folderPath: empty is not allowed')
        }
        const existing = groups.get(normalized)
        if (existing) return existing

        const groupId = `group:${normalized}`
        const prev = existingGroupMap.get(groupId)
        if (prev) {
          prev.updateData({
            name: normalized,
            iconRef: folderMetaByPath.get(normalized)?.iconRef,
            description: folderMetaByPath.get(normalized)?.description,
          })
          groups.set(normalized, prev)
          return prev
        }

        const group = new Group({
          id: groupId,
          createdTs,
          updatedTs,
          name: normalized,
          description: folderMetaByPath.get(normalized)?.description,
          icon: undefined,
          iconRef: folderMetaByPath.get(normalized)?.iconRef,
          entries: [],
        })
        groups.set(normalized, group)
        return group
      }

      for (const folderPath of parsed.folders ?? []) {
        try {
          ensureGroup(folderPath)
        } catch {
          // ignore malformed folderPath
        }
      }

      const rootEntries: Entry[] = []
      const groupEntries = new Map<string, Entry[]>()

      const toEncoding = (enc?: PassManagerRootV2Encoding | PassManagerRootV3Encoding): Encoding => {
        if (enc === 'base32' || enc === 'base64') return enc
        if (enc === 'hex') return 'base16'
        return 'base32'
      }

      for (const item of parsed.entries ?? []) {
        if (!item || typeof item !== 'object') continue
        const rawItem = item as Record<string, unknown>

        const folderPath = (item as PassManagerRootV2Entry | PassManagerRootV3Entry).folderPath
        const folderRaw = folderPath === '/' || folderPath === null ? undefined : folderPath
        const entryType = normalizeEntryType(
          (item as PassManagerRootV3Entry & Record<string, unknown>).entryType ??
            (item as Record<string, unknown>)['entry_type'],
        )

        let parent: Group | ManagerRoot = this
        let groupKey: string | undefined

        if (typeof folderRaw === 'string' && folderRaw.trim()) {
          const normalized = normalizeSaveKeyFolderPath(folderRaw)
          if (normalized) {
            const group = ensureGroup(normalized)
            parent = group
            groupKey = normalized
          }
        }

        const entryId = String(item.id)
        const prev = existingEntryMap.get(entryId)
        const rawCreatedTs = rawItem['createdTs'] ?? rawItem['created_ts']
        const rawUpdatedTs = rawItem['updatedTs'] ?? rawItem['updated_ts']
        const entryUpdatedTs = normalizeTimestampMs(
          typeof rawUpdatedTs === 'number' || typeof rawUpdatedTs === 'string' ? rawUpdatedTs : updatedTs,
        )
        const entryCreatedTs = normalizeTimestampMs(
          typeof rawCreatedTs === 'number' || typeof rawCreatedTs === 'string'
            ? rawCreatedTs
            : (prev?.createdTs ?? entryUpdatedTs),
        )
        const entryTags = normalizeCredentialTags(rawItem['tags'])
        entryCatalogTags.push(...entryTags)

        const entryData: IEntry =
          entryType === 'payment_card'
            ? {
                id: entryId,
                entryType: 'payment_card',
                createdTs: entryCreatedTs,
                updatedTs: entryUpdatedTs,
                title: String(item.title ?? ''),
                urls: [],
                username: '',
                iconRef: typeof item.iconRef === 'string' ? item.iconRef : undefined,
                otps: [],
                sshKeys: [],
                tags: entryTags,
                paymentCard:
                  normalizePaymentCardMeta(
                    (item as Record<string, unknown>)['paymentCard'] ??
                      (item as Record<string, unknown>)['payment_card'],
                  ) ??
                  (() => {
                    throw new Error('payment_card entry requires paymentCard metadata')
                  })(),
              }
            : {
                id: entryId,
                entryType: 'login',
                createdTs: entryCreatedTs,
                updatedTs: entryUpdatedTs,
                title: String(item.title ?? ''),
                urls: Array.isArray(rawItem['urls']) ? (rawItem['urls'] as IEntry['urls']) : [],
                username: String(rawItem['username'] ?? ''),
                iconRef: typeof item.iconRef === 'string' ? item.iconRef : undefined,
                tags: entryTags,
                otps: (Array.isArray((item as PassManagerRootV2Entry).otps)
                  ? (item as PassManagerRootV2Entry).otps
                  : []
                )
                  .filter((o) => Boolean(o?.id) && Boolean(o?.label))
                  .map((o) => ({
                    id: String(o.id),
                    label: String(o.label),
                    period: Number(o.period ?? 30),
                    digits: Number(o.digits ?? 6),
                    algorithm: (o.algorithm ?? 'SHA1') as Algorithm,
                    encoding: toEncoding(o.encoding),
                    type: o.type,
                    counter: o.counter,
                  })),
                sshKeys: [],
              }

        let entry: Entry
        if (prev) {
          const normalized: IEntry = {
            ...entryData,
            createdTs: normalizeTimestampMs(entryData.createdTs),
            updatedTs: normalizeTimestampMs(entryData.updatedTs),
          }
          const existingOtpMap = new Map(prev.otps().map((otp) => [otp.id, otp]))
          ;(prev as unknown as {_data: {set(v: IEntry): void}})._data.set(normalized)
          prev.parent = parent
          prev.otps.set(
            (entryData.otps ?? []).map((otpData) => {
              const existingOtp = existingOtpMap.get(otpData.id)
              if (existingOtp) {
                existingOtp.updateData(otpData)
                return existingOtp
              }

              return new OTP(prev, otpData)
            }),
          )
          entry = prev
        } else {
          entry = new Entry(parent, entryData)
        }

        if (groupKey) {
          const list = groupEntries.get(groupKey) ?? []
          list.push(entry)
          groupEntries.set(groupKey, list)
        } else {
          rootEntries.push(entry)
        }
      }

      for (const [groupPath, group] of groups.entries()) {
        group.entries.set(groupEntries.get(groupPath) ?? [])
      }

      // Ensure all groups from folders[] are present even if empty.
      const topLevelGroups = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name))
      // Guard: refuse to overwrite non-empty entries with empty payload
      // unless this is the initial load or an explicit fullClean().
      const newEntries = [...topLevelGroups, ...rootEntries]
      if (newEntries.length === 0 && !isInitialLoad && !this._allowEmptyOverwrite) {
        const currentCount = this.entriesList().length
        if (currentCount > 0) {
          console.warn(
            '[PassManager][root.load] refusing to overwrite %d entries with empty payload',
            currentCount,
          )
          return
        }
      }
      this._allowEmptyOverwrite = false
      const catalogTags = normalizeCredentialTagCatalog([...parsedCatalogTags, ...entryCatalogTags])
      this.credentialTags.set(catalogTags)
      this.credentialTagMeta.set(normalizeCredentialTagCatalogMeta(parsedTagMetaRaw, catalogTags))
      this.entries.set(newEntries)
    } catch (e) {
      dataReceived = true
      console.error(e)
      try {
        notify.error(i18n('notify:load:error'), undefined, {
          key: 'passmanager.vault.load',
        })
      } catch {}
    } finally {
      if (isInitialLoad && dataReceived) {
        this.isLoading.set(false)
      }
    }
  }

  clean() {
    this.entries.set([])
    this.credentialTags.set([])
    this.credentialTagMeta.set({})
    this.credentialSecurityAudit.set(undefined)
    this.sshKeys.set([])
    this.createTarget = undefined
    this.showElement.set(this)
  }

  async fullClean() {
    const confirmed = await wrap(
      confirmPassManagerAction({
        title: i18n('remove:dialog:title'),
        message: i18n('remove:dialog:text'),
        variant: 'danger',
        confirmVariant: 'danger',
      }),
    )
    if (!confirmed) {
      return false
    }
    this._allowEmptyOverwrite = true
    this.clean()
    const saved = await wrap(this.save())
    if (saved !== true) {
      throw new Error('Failed to clear PassManager vault')
    }
    try {
      notify.success(i18n('notify:clean:success'), undefined, {
        key: 'passmanager.vault.clean',
      })
    } catch {}
    return true
  }

  async import(rawData: string) {
    try {
      const parsed = JSON.parse(rawData) as unknown

      if (
        parsed &&
        typeof parsed === 'object' &&
        'version' in parsed &&
        ((parsed as {version?: unknown}).version === 1 ||
          (parsed as {version?: unknown}).version === 2 ||
          (parsed as {version?: unknown}).version === 3 ||
          (parsed as {version?: unknown}).version === 4)
      ) {
        const ok = await this.managerSaver.save(SAVE_KEY, createJsonFile(rawData, SAVE_KEY))
        if (!ok) {
          throw new Error('Failed to import PassManager backup')
        }
        await this.load()
      } else {
        const data = parsed as (IGroupExternal | IEntryExternal)[]
        const result = data.map((item: IGroupExternal | IEntryExternal) => {
          if ('title' in item) {
            return Entry.import(this, item)
          }
          return Group.import(item)
        })
        this.entries.set(result)
        const saved = await wrap(this.save())
        if (saved !== true) {
          throw new Error('Failed to import PassManager backup')
        }
      }

      try {
        notify.success(i18n('notify:import:success'), undefined, {
          key: 'passmanager.vault.import',
        })
      } catch {}
    } catch (e) {
      await showPassManagerAlert({
        title: i18n('import:error:title'),
        message: (e as Error).message,
        variant: 'danger',
      })
      try {
        notify.error(i18n('notify:import:error'), undefined, {
          key: 'passmanager.vault.import',
        })
      } catch {}
    }
  }

  async export() {
    const folders = new Set<string>()
    const foldersMeta = new Map<string, {path: string; iconRef?: string; description?: string}>()
    const entries: IEntryExternal[] = []

    for (const item of this.entriesList()) {
      if (item instanceof Group) {
        const normalized = normalizeSaveKeyFolderPath(item.name)
        if (normalized) {
          const parts = normalized.split('/').filter(Boolean)
          for (let i = 1; i <= parts.length; i++) {
            folders.add(parts.slice(0, i).join('/'))
          }
          foldersMeta.set(normalized, {
            path: normalized,
            ...(item.iconRef ? {iconRef: item.iconRef} : {}),
            ...(item.description ? {description: item.description} : {}),
          })
        }
        entries.push(...(await Promise.all(item.entriesList().map((entry) => entry.export()))))
        continue
      }

      entries.push(await item.export())
    }

    const data: PassManagerExportV1 = {
      version: 1,
      createdTs: this.createdTs(),
      updatedTs: this.updatedTs(),
      folders: Array.from(folders).sort(),
      foldersMeta: Array.from(foldersMeta.values()).sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
      entries,
    }

    const saved = await downloadJSON(data)
    if (!saved) return
    try {
      notify.success(i18n('notify:export:success'), undefined, {
        key: 'passmanager.vault.export',
      })
    } catch {}
  }

  toJSON() {
    return {
      id: this.id,
      salt: this.salt,
      updatedTs: this.updatedTs(),
      createdTs: this.createdTs(),
      entries: peek(this.entries) ?? [],
    }
  }
}
