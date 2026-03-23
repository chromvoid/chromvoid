import {computed, state} from '@statx/core'

import Swal from 'sweetalert2'
import {v4} from 'uuid'

import {SAVE_KEY} from '../consts'
import {i18n} from '../i18n'
import {logger} from './logger'
import {formatDateTime} from '../i18n/format'
import {normalizeTimestampMs} from '../utils'
import {Entry, filterEntries} from './entry'
import {Group} from './group'
import {OTP} from './otp'
import type {Icon} from './icon'
import {notify} from './notify'
import {filterRule, filterValue, quickFilters} from './select'
import type {
  Algorithm,
  Encoding,
  IEntry,
  IEntryExternal,
  IGroupExternal,
  ManagerSaver,
  PassManagerRootV2,
  PassManagerRootV2Encoding,
  PassManagerRootV2Entry,
  PassManagerRootV2OTP,
  OTPOptions,
  TGroupActions,
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

export const ALGORITHMS: Array<Algorithm> = [
  'SHA1',
  'SHA224',
  'SHA256',
  'SHA384',
  'SHA512',
  'SHA3224',
  'SHA3224',
  'SHA3256',
  'SHA3384',
  'SHA3512',
]

export const ENCODINGS: Array<Encoding> = ['base16', 'base32', 'base64', 'utf-8']

const INTEGRITY_SCAN_ENTRY_LIMIT = 64
const INTEGRITY_SCAN_ICON_LIMIT = 64
const INTEGRITY_SCAN_ENTRY_OTP_LIMIT = 16
const INTEGRITY_SCAN_OTP_LIMIT = 64
const INTEGRITY_SCAN_ENTRY_SSH_KEY_LIMIT = 8
const INTEGRITY_SCAN_SSH_KEY_LIMIT = 128

type IntegrityScanMismatchKind =
  | 'entry_password_secret_missing'
  | 'entry_note_secret_missing'
  | 'entry_icon_ref_missing'
  | 'folder_icon_ref_missing'
  | 'entry_otp_secret_missing'
  | 'entry_ssh_private_key_missing'
  | 'entry_ssh_public_key_missing'

type IntegrityScanMismatch = {
  kind: IntegrityScanMismatchKind
  entryId?: string
  folderPath?: string
  iconRef?: string
  otpId?: string
  keyId?: string
}

type IntegrityScanReport = {
  source: 'load'
  ts: number
  scannedEntries: number
  scannedIconRefs: number
  scannedPasswords: number
  scannedNotes: number
  scannedOtps: number
  scannedSshPrivateChecks: number
  scannedSshPublicChecks: number
  skippedOtpChecks: number
  mismatches: IntegrityScanMismatch[]
}

export const ROOT_ID = 'root'

export {Group}
export interface IGroup {
  id: string
  createdTs: number
  updatedTs: number
  entries: IEntry[]
  name: string
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

async function downloadJSON(
  jsonData: Record<string, unknown> | Array<Record<string, unknown>>,
  filename = 'passmanager-export.json',
): Promise<boolean> {
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

export class ManagerRoot implements TGroupActions {
  static root: ManagerRoot
  isRoot = true
  isLoading = state(false)
  entries = state<(Entry | Group)[] | undefined>(undefined)
  isReadOnly = state(false)
  isEditMode = state(false)
  showElement = state<ManagerRoot | Group | Entry | 'createGroup' | 'createEntry' | 'importDialog'>(this)
  updatedTs = state(Date.now())
  createdTs = state(Date.now())
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
  }

  get isShowRoot() {
    return this.showElement() === this
  }

  entriesList() {
    return this.entries() ?? []
  }

  sorted = computed(
    () => {
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
            const Asearched = a.entries.peek()
            const Bsearched = b.entries.peek()

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
    },
    {name: 'sorted'},
  )

  searched = computed(
    () => {
      const fv = filterValue()
      const qf = quickFilters()

      return this.sorted().filter((item) => {
        if (item instanceof Entry) {
          return filterRule(item, fv)
        }
        const searched = item.searched()
        if (fv || qf.length) {
          return searched.length
        }
        return true
      })
    },
    {name: 'searched'},
  )

  setShowElement(
    item: ManagerRoot | Group | Entry | 'createGroup' | 'createEntry' | 'importDialog',
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

  createGroup(data: Pick<IGroup, 'name' | 'icon' | 'iconRef'> & {entries: Entry[]}) {
    const isUniq = this.isUniqName(data.name)
    if (!isUniq) {
      Swal.fire({
        title: i18n('group:error:name_title'),
        text: i18n('group:error:name_text'),
      })
      return
    }
    const group = Group.create({
      entries: data.entries,
      name: data.name,
      icon: undefined,
      iconRef: data.iconRef,
    })
    this.entries.set([group, ...(this.entriesList() ?? [])])
    this.updatedTs.set(Date.now())
    this.save()
    this.showElement.set(group)
    try {
      notify.success(i18n('notify:createGroup:success'))
    } catch {}
  }

  createEntry(data: Partial<IEntry>, password: string, note: string, otps: OTPOptions | undefined) {
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

    const entry = Entry.create(this.createTarget ?? this, data, password, note, otps)

    void this.save()
    void entry.flushPendingPersistence()

    this.showElement.set(entry)
    try {
      notify.success(i18n('notify:createEntry:success'))
    } catch {}
    this.createTarget = undefined
    return entry
  }

  addEntry(entry: Entry) {
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

  async save() {
    if (this._savePromise) {
      // Another save is already running. Mark pending so it re-saves
      // with the latest model state when the current one finishes.
      this._savePending = true
      return this._savePromise
    }
    return this._executeSave()
  }

  private async _executeSave(): Promise<unknown> {
    this._saving = true
    this._savePending = false
    try {
      this._savePromise = this.apiSave(SAVE_KEY)
      return await this._savePromise
    } finally {
      this._savePromise = null
      if (this._savePending) {
        // A save was requested during this one. Re-run with latest model
        // state. Keep _saving = true so load() stays blocked between saves.
        void this._executeSave()
      } else {
        this._saving = false
        if (this._loadRequestedDuringSave) {
          this._loadRequestedDuringSave = false
          void this.load()
        }
      }
    }
  }

  async apiSave(key = SAVE_KEY, value?: File) {
    if (key === SAVE_KEY) {
      const now = Date.now()

      const entries: PassManagerRootV2Entry[] = []
      const explicitFolderPaths = new Set<string>()
      const folderMetaByPath = new Map<string, {path: string; iconRef?: string}>()

      const pushEntry = (entry: Entry, folderPath: string | null) => {
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
          title: String(entry.data().title ?? ''),
          username: String(entry.data().username ?? ''),
          urls: entry.urls,
          otps,
          folderPath,
          iconRef: entry.data().iconRef,
        })

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

      const payload: PassManagerRootV2 = {
        version: 2,
        createdTs: this.createdTs(),
        updatedTs: now,
        folders,
        foldersMeta: Array.from(folderMetaByPath.values()),
        entries,
      }

      const text = JSON.stringify(payload)
      let file: File
      try {
        const ctor = typeof File === 'function' ? File : undefined
        if (ctor) {
          const candidate = new ctor([text], key, {type: 'application/json'})
          const hasText = typeof (candidate as unknown as {text?: unknown}).text === 'function'
          file = hasText
            ? (candidate as unknown as File)
            : ({
                name: key,
                type: 'application/json',
                size: text.length,
                text: async () => text,
              } as unknown as File)
        } else {
          file = {
            name: key,
            type: 'application/json',
            size: text.length,
            text: async () => text,
          } as unknown as File
        }
      } catch {
        file = {
          name: key,
          type: 'application/json',
          size: text.length,
          text: async () => text,
        } as unknown as File
      }

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
    // Не перезагружаем модель во время сохранения — queueRefresh, вызванный
    // saveRoot, может триггерить load() через catalog.subscribe, что перезапишет
    // ещё не сохранённые изменения модели (например, удалённую группу).
    if (this._saving || this._pendingEntryUpdates > 0) {
      this._loadRequestedDuringSave = true
      return
    }

    // Показываем спиннер только при первой загрузке (когда entries ещё не определены)
    const isInitialLoad = this.entries() === undefined
    if (isInitialLoad) {
      this.isLoading.set(true)
    }
    let dataReceived = false
    try {
      const data = await this.apiRead(SAVE_KEY)

      // undefined means the data source is not ready yet (e.g. catalog not
      // synced, vault still unlocking).  Keep current state — the catalog
      // subscription will trigger a retry automatically.
      if (data === undefined) {
        console.info('[PassManager][root.load] data source not ready, will retry on catalog sync')
        return
      }
      dataReceived = true

      let parsed: PassManagerRootV2 | undefined = undefined
      if (typeof data === 'string') {
        parsed = JSON.parse(data || '{"version":2,"folders":[],"entries":[],"createdTs":0,"updatedTs":0}')
      } else if (typeof data === 'object' && data) {
        parsed = data as unknown as PassManagerRootV2
      }

      if (!parsed || parsed.version !== 2) {
        throw new Error('Unsupported PassManager root payload: expected version 2')
      }

      const createdTs = normalizeTimestampMs(parsed.createdTs || Date.now())
      const updatedTs = normalizeTimestampMs(parsed.updatedTs || Date.now())
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
      const folderMetaByPath = new Map<string, {iconRef?: string}>()
      for (const meta of parsed.foldersMeta ?? []) {
        if (!meta || typeof meta !== 'object') continue
        const normalizedPath = normalizeSaveKeyFolderPath(String(meta.path ?? ''))
        if (!normalizedPath) continue
        folderMetaByPath.set(normalizedPath, {iconRef: meta.iconRef})
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
          })
          prev.entries.set([])
          groups.set(normalized, prev)
          return prev
        }

        const group = new Group({
          id: groupId,
          createdTs,
          updatedTs,
          name: normalized,
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

      const toEncoding = (enc?: PassManagerRootV2Encoding): Encoding => {
        if (enc === 'base32' || enc === 'base64') return enc
        if (enc === 'hex') return 'base16'
        return 'base32'
      }

      for (const item of parsed.entries ?? []) {
        if (!item || typeof item !== 'object') continue

        const folderPath = (item as PassManagerRootV2Entry).folderPath
        const folderRaw = folderPath === '/' || folderPath === null ? undefined : folderPath

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

        const otps = Array.isArray((item as PassManagerRootV2Entry).otps)
          ? (item as PassManagerRootV2Entry).otps
          : []
        const normalizedOtps = otps
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
          }))

        const entryId = String(item.id)
        const entryData = {
          id: entryId,
          createdTs: updatedTs,
          updatedTs,
          title: String(item.title ?? ''),
          urls: Array.isArray(item.urls) ? item.urls : [],
          username: String(item.username ?? ''),
          iconRef: typeof item.iconRef === 'string' ? item.iconRef : undefined,
          otps: normalizedOtps,
          sshKeys: Array.isArray(item.sshKeys) ? item.sshKeys : [],
        } as IEntry

        const prev = existingEntryMap.get(entryId)
        let entry: Entry
        if (prev) {
          const normalized: IEntry = {
            ...entryData,
            createdTs: normalizeTimestampMs(entryData.createdTs),
            updatedTs: normalizeTimestampMs(entryData.updatedTs),
          }
          ;(prev as unknown as {_data: {set(v: IEntry): void}})._data.set(normalized)
          prev.parent = parent
          prev.otps.set((entryData.otps ?? []).map((o) => new OTP(prev, o)))
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

      for (const [groupPath, entries] of groupEntries.entries()) {
        const group = groups.get(groupPath)
        if (group) {
          group.entries.set(entries)
        }
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
      this.entries.set(newEntries)
    } catch (e) {
      dataReceived = true
      console.error(e)
      try {
        notify.error(i18n('notify:load:error'))
      } catch {}
    } finally {
      if (isInitialLoad && dataReceived) {
        this.isLoading.set(false)
      }
    }
  }

  clean() {
    this.entries.set([])
    this.createTarget = undefined
    this.showElement.set(this)
  }

  async fullClean() {
    const res = await Swal.fire({
      title: i18n('remove:dialog:title'),
      text: i18n('remove:dialog:text'),
      showConfirmButton: true,
      showCancelButton: true,
    })
    if (!res.isConfirmed) {
      return false
    }
    this._allowEmptyOverwrite = true
    this.clean()
    this.save()
    try {
      notify.success(i18n('notify:clean:success'))
    } catch {}
    return true
  }

  import(rawData: string) {
    try {
      const data = JSON.parse(rawData) as (IGroupExternal | IEntryExternal)[]
      const result = data.map((item: IGroupExternal | IEntryExternal) => {
        if ('title' in item) {
          return Entry.import(this, item)
        }
        return Group.import(item)
      })
      this.entries.set(result)
      this.save()
      try {
        notify.success(i18n('notify:import:success'))
      } catch {}
    } catch (e) {
      Swal.fire({
        title: i18n('import:error:title'),
        text: (e as Error).message,
      })
      try {
        notify.error(i18n('notify:import:error'))
      } catch {}
    }
  }

  async export() {
    const data = await Promise.all(this.entriesList().map((item) => item.export()))
    const saved = await downloadJSON(data)
    if (!saved) return
    try {
      notify.success(i18n('notify:export:success'))
    } catch {}
  }

  toJSON() {
    return {
      id: this.id,
      salt: this.salt,
      updatedTs: this.updatedTs(),
      createdTs: this.createdTs(),
      entries: this.entries.peek?.() ?? [],
    }
  }
}
declare global {
  interface Window {
    passmanager: ManagerRoot
  }
}
