import type {State} from '@statx/core'
import {computed, state} from '@statx/core'

import {sha256} from '@project/utils'
import Swal from 'sweetalert2'
import {v4} from 'uuid'

import {i18n} from '../i18n'
import {formatDateTime} from '../i18n/format'
import {isLink, normalizeTimestampMs, truncateLink} from '../utils'
import {matchesAnyUrlRule} from '../url-matching'
import {Group} from './group'
import {notify} from './notify'
import {logger} from './logger'
import {OTP} from './otp'
import type {ManagerRoot} from './root'
import type {IEntry, IEntryExternal, OTPOptions, SshKeyEntry, UrlRule} from './types'

export const DEFAULT_OPTIONS: OTPOptions = {
  id: '',
  algorithm: 'SHA1',
  digits: 6,
  label: '',
  period: 30,
  encoding: 'base32',
  secret: undefined,
  type: 'TOTP',
}

export const filterEntries = (entries: (Entry | Group)[]) => {
  return entries.filter((item) => item instanceof Entry)
}

export const filterGroups = (entries: (Group | Entry)[]) => {
  return entries.filter((item) => item instanceof Group)
}

export class Entry {
  private pendingPersistence: Promise<void> | undefined
  private passwordCache: string | undefined
  private noteCache: string | undefined
  private passwordCacheReady = false
  private noteCacheReady = false
  private passwordReadPending: Promise<string | undefined> | undefined
  private noteReadPending: Promise<string | undefined> | undefined

  static root: ManagerRoot

  static create(
    parent: Group | ManagerRoot,
    data: Partial<IEntry>,
    password = '',
    note = '',
    otp: undefined | OTPOptions,
  ) {
    const entry = new Entry(parent, {
      ...data,
      id: v4(),
      createdTs: Date.now(),
      updatedTs: Date.now(),
    } as IEntry)
    entry.seedSecretCache(password, note)

    parent.addEntry(entry)

    // Сохраняем в фоне — UI обновляется сразу
    entry.pendingPersistence = entry.persistNew(parent, password, note, otp)
    void entry.pendingPersistence

    return entry
  }

  /**
   * Сохраняет новую запись на диск (meta.json, пароль, заметка, OTP).
   * Вызывается в фоне после создания.
   */
  flushPendingPersistence(): Promise<void> {
    return this.pendingPersistence ?? Promise.resolve()
  }

  private async persistNew(
    parent: Group | ManagerRoot,
    password: string,
    note: string,
    otp: OTPOptions | undefined,
  ) {
    this.root.beginEntryUpdate()
    try {
      const metaSaved = await parent.root.managerSaver.saveEntryMeta({
        id: this.id,
        title: this.title,
        urls: this.urls,
        username: this.username,
        iconRef: this._data().iconRef,
        otps: this.otps().map((o) => ({
          id: o.id,
          label: o.data.label,
          algorithm: o.data.algorithm,
          digits: o.data.digits,
          period: o.data.period,
          encoding: o.data.encoding,
          type: o.data.type,
          counter: o.data.counter,
        })),
        groupPath: parent instanceof Group ? parent.name : undefined,
      })
      if (!metaSaved) {
        logger.warn('[PassManager][Entry.persistNew] saveEntryMeta failed, skip secret writes', {
          entryId: this.id,
        })
        return
      }

      if (password) await this.savePassword(password)
      if (note) await this.saveNote(note)

      if (otp) {
        await this.addOTP(otp)
      }
    } catch (error) {
      logger.error('[PassManager][Entry.persistNew] failed', {entryId: this.id, error})
    } finally {
      this.root.endEntryUpdate()
    }
  }

  static import(parent: Group | ManagerRoot, data: IEntryExternal) {
    return new Entry(parent, {
      id: data.id,
      createdTs: normalizeTimestampMs(data.createdTs),
      updatedTs: normalizeTimestampMs(data.updatedTs),
      title: data.title,
      urls: data.urls,
      username: data.username,
      iconRef: data.iconRef,
      otps: data.otps,
      sshKeys: [],
    })
  }

  private _data: State<IEntry>

  otps = state<Array<OTP>>([])

  constructor(
    public parent: Group | ManagerRoot,
    data: IEntry,
  ) {
    const normalized: IEntry = {
      ...data,
      createdTs: normalizeTimestampMs(data.createdTs),
      updatedTs: normalizeTimestampMs(data.updatedTs),
      sshKeys: data.sshKeys ?? [],
    }
    this._data = state(normalized)

    this.otps.set((data.otps ?? []).map((item) => new OTP(this, item)))
  }

  get root() {
    return Entry.root
  }

  get id() {
    return this.data().id
  }

  get groupPath(): string | undefined {
    return this.parent instanceof Group ? this.parent.name : undefined
  }

  get name() {
    return this.title
  }
  get title() {
    return truncateLink(this._data().title)
  }

  get urls(): UrlRule[] {
    const value = this._data().urls

    if ((!value || value.length === 0) && isLink(this.title)) {
      return [{value: this.title, match: 'base_domain'}]
    }

    return value || []
  }

  matchesUrl(url: URL): boolean {
    return matchesAnyUrlRule(this.urls, url)
  }

  get username() {
    return this._data().username
  }

  get iconRef() {
    return this._data().iconRef
  }

  async passwordID() {
    const id = this._data.peek().id + ':password:' + this.root.salt
    return sha256(id)
  }

  async noteID() {
    const id = this._data.peek().id + ':note:' + this.root.salt
    return sha256(id)
  }

  // seed/privateKey удалены

  async note() {
    logger.debug('[PassManager] readNote', {entryId: this.id})
    if (this.noteCacheReady) {
      return this.noteCache
    }
    if (!this.noteReadPending) {
      this.noteReadPending = this.root.managerSaver
        .readEntryNote(this.id)
        .then((note) => {
          this.noteCache = note
          this.noteCacheReady = true
          return note
        })
        .finally(() => {
          this.noteReadPending = undefined
        })
    }
    return this.noteReadPending
  }

  async password() {
    if (this.passwordCacheReady) {
      return this.passwordCache
    }
    if (!this.passwordReadPending) {
      this.passwordReadPending = this.root.managerSaver
        .readEntryPassword(this.id)
        .then((password) => {
          this.passwordCache = password
          this.passwordCacheReady = true
          return password
        })
        .finally(() => {
          this.passwordReadPending = undefined
        })
    }
    return this.passwordReadPending
  }

  async sshPrivateKey(keyId: string) {
    return this.root.managerSaver.readEntrySshPrivateKey(this.id, keyId)
  }

  async sshPublicKey(keyId: string) {
    return this.root.managerSaver.readEntrySshPublicKey(this.id, keyId)
  }

  get sshKeys(): SshKeyEntry[] {
    return this._data().sshKeys ?? []
  }

  get createdTs() {
    return normalizeTimestampMs(this._data().createdTs)
  }

  get updatedTs() {
    return normalizeTimestampMs(this._data().updatedTs)
  }

  data() {
    return this._data.peek()
  }

  get updatedFormatted() {
    return formatDateTime(this.updatedTs)
  }

  get createdFormatted() {
    return formatDateTime(this.createdTs)
  }

  isSelected = computed(
    () => {
      if ('root' in this.parent) {
        return this.parent.root.showElement() === this
      }
      return Entry.root.showElement() === this
    },
    {name: 'isSelected'},
  )

  async savePassword(password: string) {
    logger.debug('[PassManager] savePassword', {
      entryId: this.id,
      length: typeof password === 'string' ? password.length : 0,
    })
    const ok = await this.root.managerSaver.saveEntryPassword(this.id, password)
    if (ok) {
      this.seedPasswordCache(password)
    }
    logger.debug('[PassManager] savePassword:result', {entryId: this.id, ok})
    return ok
  }

  async saveNote(note: string) {
    logger.debug('[PassManager] saveNote', {
      entryId: this.id,
      length: typeof note === 'string' ? note.length : 0,
    })
    const ok = await this.root.managerSaver.saveEntryNote(this.id, note)
    if (ok) {
      this.seedNoteCache(note)
    }
    logger.debug('[PassManager] saveNote:result', {entryId: this.id, ok})
    return ok
  }

  async saveSshKey(keyId: string, privateKey: string, publicKey: string) {
    logger.debug('[PassManager] saveSshKey', {entryId: this.id, keyId})
    const [okPriv, okPub] = await Promise.all([
      this.root.managerSaver.saveEntrySshPrivateKey(this.id, keyId, privateKey),
      this.root.managerSaver.saveEntrySshPublicKey(this.id, keyId, publicKey),
    ])
    logger.debug('[PassManager] saveSshKey:result', {entryId: this.id, keyId, okPriv, okPub})
    return okPriv && okPub
  }

  async cleanSshKeys() {
    await Promise.all(
      this.sshKeys.map((k) =>
        Promise.all([
          this.root.managerSaver.removeEntrySshPrivateKey(this.id, k.id),
          this.root.managerSaver.removeEntrySshPublicKey(this.id, k.id),
        ]),
      ),
    )
  }

  async addOTP(params: OTPOptions) {
    if (!params.label) {
      params.label = `${(params.type ?? 'TOTP').toUpperCase()}-${this.otps().length + 1}`
    }

    const secret = params.secret ?? ''

    logger.debug('[PassManager] addOTP:begin', {
      entryId: this.id,
      hasSecret: Boolean(secret),
      secretLength: typeof secret === 'string' ? secret.length : 0,
      label: params.label,
      digits: params.digits,
      period: params.period,
      algorithm: params.algorithm,
      encoding: params.encoding,
    })

    const otp = await OTP.create(this, params)
    logger.debug('[PassManager] addOTP:created', {entryId: this.id, otpId: otp.id})

    const nextOtps = [...this.otps(), otp]
    const metaOk = await this.root.managerSaver.saveEntryMeta({
      id: this.id,
      title: this.title,
      urls: this.urls,
      username: this.username,
      iconRef: this._data().iconRef,
      otps: nextOtps.map((o) => ({
        id: o.id,
        label: o.data.label,
        algorithm: o.data.algorithm,
        digits: o.data.digits,
        period: o.data.period,
        encoding: o.data.encoding,
        type: o.data.type,
        counter: o.data.counter,
      })),
      groupPath: this.parent instanceof Group ? this.parent.name : undefined,
      sshKeys: this.sshKeys,
    })
    logger.debug('[PassManager] addOTP:metaSaved', {entryId: this.id, ok: metaOk})
    if (!metaOk) {
      logger.warn('[PassManager] addOTP:skipSecretAndStateWhenMetaSaveFailed', {
        entryId: this.id,
        otpId: otp.id,
      })
      return
    }

    if (secret) {
      logger.debug('[PassManager] addOTP:saveSecret:begin', {
        entryId: this.id,
        otpId: otp.id,
        secretLength: secret.length,
      })
      const ok = await this.root.managerSaver.saveOTP(otp.id, secret)
      logger.debug('[PassManager] addOTP:saveSecret:result', {entryId: this.id, otpId: otp.id, ok})
    }

    this.otps.set(nextOtps)
  }

  // seed/privateKey удалены

  async update(data: IEntry, password: string | undefined, note: string | undefined): Promise<void> {
    const current = this.data()
    this._data.set({
      ...data,
      createdTs: current.createdTs,
      updatedTs: Date.now(),
      id: current.id,
    })

    this.root.beginEntryUpdate()
    try {
      await this.root.managerSaver.saveEntryMeta({
        id: this.id,
        title: this.title,
        urls: this.urls,
        username: this.username,
        iconRef: this._data().iconRef,
        otps: this.otps().map((o) => ({
          id: o.id,
          label: o.data.label,
          algorithm: o.data.algorithm,
          digits: o.data.digits,
          period: o.data.period,
          encoding: o.data.encoding,
          type: o.data.type,
          counter: o.data.counter,
        })),
        groupPath: this.parent instanceof Group ? this.parent.name : undefined,
        sshKeys: this.sshKeys,
      })

      if (password !== undefined) {
        await this.savePassword(password)
      }
      if (note !== undefined) {
        await this.saveNote(note)
      }
    } finally {
      this.root.endEntryUpdate()
    }
  }

  async updateSshKeys(sshKeys: SshKeyEntry[]) {
    this._data.set({
      ...this._data(),
      sshKeys,
      updatedTs: Date.now(),
    })
    return this.root.managerSaver.saveEntryMeta({
      id: this.id,
      title: this.title,
      urls: this.urls,
      username: this.username,
      iconRef: this._data().iconRef,
      otps: this.otps().map((o) => ({
        id: o.id,
        label: o.data.label,
        algorithm: o.data.algorithm,
        digits: o.data.digits,
        period: o.data.period,
        encoding: o.data.encoding,
        type: o.data.type,
        counter: o.data.counter,
      })),
      groupPath: this.parent instanceof Group ? this.parent.name : undefined,
      sshKeys,
    })
  }

  async removeSshKey(keyId: string) {
    const newKeys = this.sshKeys.filter((k) => k.id !== keyId)
    this._data.set({
      ...this._data(),
      sshKeys: newKeys,
      updatedTs: Date.now(),
    })
    await Promise.all([
      this.root.managerSaver.removeEntrySshPrivateKey(this.id, keyId),
      this.root.managerSaver.removeEntrySshPublicKey(this.id, keyId),
    ])
    return this.root.managerSaver.saveEntryMeta({
      id: this.id,
      title: this.title,
      urls: this.urls,
      username: this.username,
      iconRef: this._data().iconRef,
      otps: this.otps().map((o) => ({
        id: o.id,
        label: o.data.label,
        algorithm: o.data.algorithm,
        digits: o.data.digits,
        period: o.data.period,
        encoding: o.data.encoding,
        type: o.data.type,
        counter: o.data.counter,
      })),
      groupPath: this.parent instanceof Group ? this.parent.name : undefined,
      sshKeys: newKeys,
    })
  }

  move(newParent: Group | ManagerRoot, options: {silent?: boolean} = {}) {
    if (newParent === this.parent) {
      return
    }

    this.parent.excludeEntry(this)
    this.parent.updateData()
    newParent.addEntry(this)
    newParent.updateData()
    this.root.save()
    if (!options.silent) {
      try {
        notify.success(i18n('notify:move:success'))
      } catch {}
    }
  }

  async remove({
    silent = false,
    updateParent = true,
  }: {
    silent?: boolean
    updateParent?: boolean
  } = {}) {
    if (!silent) {
      const res = await Swal.fire({
        title: i18n('remove:dialog:title'),
        html: i18n('remove:dialog:text'),
        showCancelButton: true,
        showConfirmButton: true,
      })
      if (!res.isConfirmed) {
        return
      }
    }

    await Promise.all([this.cleanNote(), this.cleanPassword(), this.cleanOTPs(), this.cleanSshKeys()])

    if (updateParent) {
      this.parent.excludeEntry(this)
      this.parent.updateData({})
      await this.parent.root.managerSaver.removeEntry(this.id)
      this.parent.root.showElement.set(this.parent)
      try {
        notify.success(i18n('notify:remove:success'))
      } catch {}
    }
  }

  async cleanPassword() {
    const ok = await this.root.managerSaver.removeEntryPassword(this.id)
    if (ok) {
      this.seedPasswordCache(undefined)
    }
    return ok
  }

  async cleanNote() {
    const ok = await this.root.managerSaver.removeEntryNote(this.id)
    if (ok) {
      this.seedNoteCache(undefined)
    }
    return ok
  }

  async cleanOTPs() {
    const otps = this.otps.peek()
    return Promise.all(otps.map((otp) => otp.clean()))
  }

  async removeOTP(otp: OTP, isSilent?: boolean) {
    const res = await otp.remove(isSilent)
    if (res) {
      this.otps.set(this.otps().filter((item) => item !== otp))
    }
  }

  async export(): Promise<IEntryExternal> {
    let password = ''
    try {
      password = (await this.password()) ?? ''
    } catch {
      // Пароль недоступен (например, секрет не найден) — используем пустую строку
    }
    return {
      id: this.id,
      title: this.title,
      createdTs: this.createdTs,
      updatedTs: this.updatedTs,
      exportedTs: Date.now(),
      username: this.username,
      urls: this.urls,
      iconRef: this._data().iconRef,
      password,
      otps: await Promise.all(this.otps().map((otp) => otp.export())),
    }
  }

  toJSON(): IEntry {
    const data = this._data()
    return {
      ...data,
      otps: this.otps().map((otp) => otp.toJSON()),
    }
  }

  private seedSecretCache(password: string | undefined, note: string | undefined): void {
    this.seedPasswordCache(password)
    this.seedNoteCache(note)
  }

  private seedPasswordCache(password: string | undefined): void {
    this.passwordCache = password || undefined
    this.passwordCacheReady = true
    this.passwordReadPending = undefined
  }

  private seedNoteCache(note: string | undefined): void {
    this.noteCache = note || undefined
    this.noteCacheReady = true
    this.noteReadPending = undefined
  }
}
