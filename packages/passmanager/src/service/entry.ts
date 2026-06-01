import {sha256} from '@project/utils'
import {
  action,
  atom,
  computed,
  peek,
  wrap,
  withRollback,
  withTransaction,
  type Atom,
} from '@reatom/core'
import {v4} from 'uuid'

import {i18n} from '../i18n'
import {formatDateTime} from '../i18n/format'
import {isLink, normalizeTimestampMs, truncateLink} from '../utils'
import {matchesAnyUrlRule} from '../url-matching'
import {confirmPassManagerAction} from './dialog'
import {Group} from './group'
import {notify} from './notify'
import {logger} from './logger'
import {OTP} from './otp'
import {normalizeCredentialTags} from './tags'
import type {ManagerRoot} from './root'
import type {IEntry, IEntryExternal, OTPOptions, SshKeyEntry, UrlRule} from './types'
import type {ManagerSaver} from './types'

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

type SecretCacheSnapshot = {
  passwordCache: string | undefined
  noteCache: string | undefined
  cardPanCache: string | undefined
  cardCvvCache: string | undefined
  passwordCacheReady: boolean
  noteCacheReady: boolean
  cardPanCacheReady: boolean
  cardCvvCacheReady: boolean
  passwordReadPending: Promise<string | undefined> | undefined
  noteReadPending: Promise<string | undefined> | undefined
  cardPanReadPending: Promise<string | undefined> | undefined
  cardCvvReadPending: Promise<string | undefined> | undefined
}

export class Entry {
  private pendingPersistence: Promise<unknown> | undefined
  private passwordCache: string | undefined
  private noteCache: string | undefined
  private cardPanCache: string | undefined
  private cardCvvCache: string | undefined
  private passwordCacheReady = false
  private noteCacheReady = false
  private cardPanCacheReady = false
  private cardCvvCacheReady = false
  private passwordReadPending: Promise<string | undefined> | undefined
  private noteReadPending: Promise<string | undefined> | undefined
  private cardPanReadPending: Promise<string | undefined> | undefined
  private cardCvvReadPending: Promise<string | undefined> | undefined

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

    const root = parent.root
    root.beginEntryUpdate()
    parent.addEntry(entry)

    // Keep in the background - UI is updated immediately
    entry.pendingPersistence = entry.persistNewAction(parent, password, note, otp)
      .catch((error) => {
        try {
          logger.error('[PassManager][Entry.persistNew] failed', {entryId: entry.id, error})
        } catch {}
      })
      .finally(() => {
        root.endEntryUpdate()
      })
    void entry.pendingPersistence

    return entry
  }

  /*** Stores a new record to disk (meta.json, password, note, OTP).
* Called in the background after creation.
*/
  flushPendingPersistence(): Promise<unknown> {
    return this.pendingPersistence ?? Promise.resolve()
  }

  static import(parent: Group | ManagerRoot, data: IEntryExternal) {
    const entry = new Entry(
      parent,
      data.entryType === 'payment_card'
        ? {
            id: data.id,
            entryType: 'payment_card',
            createdTs: normalizeTimestampMs(data.createdTs),
            updatedTs: normalizeTimestampMs(data.updatedTs),
            title: data.title,
            urls: [],
            username: '',
            iconRef: data.iconRef,
            otps: [],
            sshKeys: [],
            tags: normalizeCredentialTags(data.tags),
            paymentCard: data.paymentCard,
          }
        : {
            id: data.id,
            createdTs: normalizeTimestampMs(data.createdTs),
            updatedTs: normalizeTimestampMs(data.updatedTs),
            title: data.title,
            urls: data.urls,
            username: data.username,
            iconRef: data.iconRef,
            otps: data.otps,
            sshKeys: [],
            tags: normalizeCredentialTags(data.tags),
          },
    )

    if (data.entryType === 'payment_card') {
      entry.seedCardPanCache(data.cardPan)
      entry.seedCardCvvCache(data.cardCvv)
      entry.seedNoteCache(data.note)
    } else {
      entry.seedPasswordCache(data.password)
      entry.seedNoteCache(data.note)
    }

    return entry
  }

  private _data: Atom<IEntry>

  otps = atom<Array<OTP>>([]).extend(withRollback())

  constructor(
    public parent: Group | ManagerRoot,
    data: IEntry,
  ) {
    const normalized: IEntry = {
      ...data,
      createdTs: normalizeTimestampMs(data.createdTs),
      updatedTs: normalizeTimestampMs(data.updatedTs),
      sshKeys: data.sshKeys ?? [],
      tags: normalizeCredentialTags(data.tags),
    }
    this._data = atom(normalized).extend(withRollback())

    this.otps.set((data.otps ?? []).map((item) => new OTP(this, item)))
  }

  private readonly persistNewAction = action(
    async (parent: Group | ManagerRoot, password: string, note: string, otp: OTPOptions | undefined) => {
      const prevOtps = this.otps()
      try {
        let nextOtps = prevOtps
        let otpSecret = ''
        if (otp && this.entryType !== 'payment_card') {
          otpSecret = otp.secret ?? ''
          const createdOtp = await OTP.create(this, otp)
          nextOtps = [...prevOtps, createdOtp]
        }

        const metaSaved = await wrap(this.root.managerSaver.saveEntryMeta(this.buildEntryMetaPayload(parent, nextOtps)))
        if (!metaSaved) {
          throw new Error('saveEntryMeta failed')
        }

        if (nextOtps !== prevOtps && otpSecret) {
          const createdOtp = nextOtps[nextOtps.length - 1]
          if (!createdOtp) {
            throw new Error('saveOTP failed')
          }
          const otpSaved = await wrap(this.root.managerSaver.saveOTP(createdOtp.id, otpSecret))
          if (!otpSaved) {
            throw new Error('saveOTP failed')
          }
        }

        if (nextOtps !== prevOtps) {
          this.otps.set(nextOtps)
        }

        if (password && this.entryType !== 'payment_card') {
          const passwordSaved = await this.savePassword(password)
          if (!passwordSaved) {
            throw new Error('saveEntryPassword failed')
          }
        }

        if (note) {
          const noteSaved = await this.saveNote(note)
          if (!noteSaved) {
            throw new Error('saveEntryNote failed')
          }
        }
      } catch (error) {
        this.otps.set(prevOtps)
        try {
          parent.excludeEntry(this)
        } catch {}
        throw error
      }
    },
    'passmanager.entry.persistNew',
  ).extend(withTransaction())

  private readonly updateAction = action(
    async (data: IEntry, password: string | undefined, note: string | undefined) => {
      const cacheSnapshot = this.snapshotSecretCache()
      const current = this.data()
      this._data.set({
        ...data,
        createdTs: current.createdTs,
        updatedTs: Date.now(),
        id: current.id,
      })

      try {
        const metaSaved = await wrap(this.root.managerSaver.saveEntryMeta(this.buildEntryMetaPayload(undefined, undefined, this.sshKeys)))
        if (!metaSaved) {
          throw new Error('saveEntryMeta failed')
        }

        if (password !== undefined && this.entryType !== 'payment_card') {
          const passwordSaved = await this.savePassword(password)
          if (!passwordSaved) {
            throw new Error('saveEntryPassword failed')
          }
        }

        if (note !== undefined) {
          const noteSaved = await this.saveNote(note)
          if (!noteSaved) {
            throw new Error('saveEntryNote failed')
          }
        }
      } catch (error) {
        this.restoreSecretCache(cacheSnapshot)
        throw error
      }
    },
    'passmanager.entry.update',
  ).extend(withTransaction())

  private readonly addOTPAction = action(
    async (params: OTPOptions) => {
      if (this.entryType === 'payment_card') {
        throw new Error('payment_card entries do not support OTP')
      }
      const prevOtps = this.otps()
      if (!params.label) {
        params.label = `${(params.type ?? 'TOTP').toUpperCase()}-${this.otps().length + 1}`
      }

      try {
        const secret = params.secret ?? ''
        const otp = await OTP.create(this, params)
        const nextOtps = [...prevOtps, otp]

        const metaSaved = await wrap(this.root.managerSaver.saveEntryMeta(this.buildEntryMetaPayload(undefined, nextOtps, this.sshKeys)))
        if (!metaSaved) {
          throw new Error('saveEntryMeta failed')
        }

        if (secret) {
          const otpSaved = await wrap(this.root.managerSaver.saveOTP(otp.id, secret))
          if (!otpSaved) {
            throw new Error('saveOTP failed')
          }
        }

        this.otps.set(nextOtps)
      } catch (error) {
        this.otps.set(prevOtps)
        throw error
      }
    },
    'passmanager.entry.addOTP',
  ).extend(withTransaction())

  private readonly updateSshKeysAction = action(
    async (sshKeys: SshKeyEntry[]) => {
      if (this.entryType === 'payment_card') {
        throw new Error('payment_card entries do not support SSH keys')
      }
      this._data.set({
        ...this._data(),
        sshKeys,
        updatedTs: Date.now(),
      })

      const metaSaved = await wrap(this.root.managerSaver.saveEntryMeta(this.buildEntryMetaPayload(undefined, undefined, sshKeys)))
      if (!metaSaved) {
        throw new Error('saveEntryMeta failed')
      }

      return true
    },
    'passmanager.entry.updateSshKeys',
  ).extend(withTransaction())

  private readonly removeSshKeyAction = action(
    async (keyId: string) => {
      if (this.entryType === 'payment_card') {
        throw new Error('payment_card entries do not support SSH keys')
      }
      const newKeys = this.sshKeys.filter((k) => k.id !== keyId)
      this._data.set({
        ...this._data(),
        sshKeys: newKeys,
        updatedTs: Date.now(),
      })

      const [okPriv, okPub] = await Promise.all([
        wrap(this.root.managerSaver.removeEntrySshPrivateKey(this.id, keyId)),
        wrap(this.root.managerSaver.removeEntrySshPublicKey(this.id, keyId)),
      ])
      if (!okPriv || !okPub) {
        throw new Error('removeSshKey failed')
      }

      const metaSaved = await wrap(this.root.managerSaver.saveEntryMeta(this.buildEntryMetaPayload(undefined, undefined, newKeys)))
      if (!metaSaved) {
        throw new Error('saveEntryMeta failed')
      }

      return true
    },
    'passmanager.entry.removeSshKey',
  ).extend(withTransaction())

  private readonly removeOTPAction = action(
    async (otp: OTP) => {
      if (this.entryType === 'payment_card') {
        throw new Error('payment_card entries do not support OTP')
      }
      const removed = await wrap(otp.clean())
      if (!removed) {
        throw new Error('removeOTP failed')
      }

      const nextOtps = this.otps().filter((item) => item !== otp)
      this.otps.set(nextOtps)

      const metaSaved = await wrap(this.root.managerSaver.saveEntryMeta(this.buildEntryMetaPayload(undefined, nextOtps)))
      if (!metaSaved) {
        throw new Error('saveEntryMeta failed')
      }

      return true
    },
    'passmanager.entry.removeOTP',
  ).extend(withTransaction())

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

  get entryType() {
    return this._data().entryType ?? 'login'
  }

  get urls(): UrlRule[] {
    if (this.entryType === 'payment_card') {
      return []
    }
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
    if (this.entryType === 'payment_card') {
      return ''
    }
    return this._data().username
  }

  get iconRef() {
    return this._data().iconRef
  }

  get paymentCard() {
    return this._data().paymentCard
  }

  get tags(): string[] {
    return normalizeCredentialTags(this._data().tags)
  }

  async passwordID() {
    const id = peek(this._data).id + ':password:' + this.root.salt
    return sha256(id)
  }

  async noteID() {
    const id = peek(this._data).id + ':note:' + this.root.salt
    return sha256(id)
  }

  // seed/privateKey removed

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
    if (this.entryType === 'payment_card') {
      return undefined
    }
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

  async cardPan() {
    if (this.entryType !== 'payment_card') {
      return undefined
    }
    if (this.cardPanCacheReady) {
      return this.cardPanCache
    }
    if (!this.cardPanReadPending) {
      this.cardPanReadPending = this.root.managerSaver
        .readEntrySecret(this.id, 'card_pan')
        .then((cardPan) => {
          this.cardPanCache = cardPan
          this.cardPanCacheReady = true
          return cardPan
        })
        .finally(() => {
          this.cardPanReadPending = undefined
        })
    }
    return this.cardPanReadPending
  }

  async cardCvv() {
    if (this.entryType !== 'payment_card') {
      return undefined
    }
    if (this.cardCvvCacheReady) {
      return this.cardCvvCache
    }
    if (!this.cardCvvReadPending) {
      this.cardCvvReadPending = this.root.managerSaver
        .readEntrySecret(this.id, 'card_cvv')
        .then((cardCvv) => {
          this.cardCvvCache = cardCvv
          this.cardCvvCacheReady = true
          return cardCvv
        })
        .finally(() => {
          this.cardCvvReadPending = undefined
        })
    }
    return this.cardCvvReadPending
  }

  async sshPrivateKey(keyId: string) {
    return this.root.managerSaver.readEntrySshPrivateKey(this.id, keyId)
  }

  async sshPublicKey(keyId: string) {
    return this.root.managerSaver.readEntrySshPublicKey(this.id, keyId)
  }

  get sshKeys(): SshKeyEntry[] {
    if (this.entryType === 'payment_card') {
      return []
    }
    return this._data().sshKeys ?? []
  }

  get createdTs() {
    return normalizeTimestampMs(this._data().createdTs)
  }

  get updatedTs() {
    return normalizeTimestampMs(this._data().updatedTs)
  }

  data() {
    return peek(this._data)
  }

  private buildEntryMetaPayload(
    parent: Group | ManagerRoot | undefined = this.parent,
    otps: OTP[] = this.otps(),
    sshKeys: SshKeyEntry[] | undefined = undefined,
  ): Parameters<ManagerSaver['saveEntryMeta']>[0] {
    const groupPath = parent instanceof Group ? parent.name : undefined

    if (this.entryType === 'payment_card') {
      if (!this.paymentCard) {
        throw new Error('payment_card metadata is required')
      }
      return {
        id: this.id,
        entryType: 'payment_card',
        createdTs: this.createdTs,
        updatedTs: this.updatedTs,
        title: this.title,
        paymentCard: this.paymentCard,
        iconRef: this._data().iconRef,
        tags: this.tags,
        groupPath,
      }
    }

    return {
      id: this.id,
      entryType: 'login',
      createdTs: this.createdTs,
      updatedTs: this.updatedTs,
      title: this.title,
      urls: this.urls,
      username: this.username,
      iconRef: this._data().iconRef,
      tags: this.tags,
      otps: otps.map((o) => ({
        id: o.id,
        label: o.data.label,
        algorithm: o.data.algorithm,
        digits: o.data.digits,
        period: o.data.period,
        encoding: o.data.encoding,
        type: o.data.type,
        counter: o.data.counter,
      })),
      groupPath,
      ...(sshKeys !== undefined ? {sshKeys} : {}),
    }
  }

  private snapshotSecretCache(): SecretCacheSnapshot {
    return {
      passwordCache: this.passwordCache,
      noteCache: this.noteCache,
      cardPanCache: this.cardPanCache,
      cardCvvCache: this.cardCvvCache,
      passwordCacheReady: this.passwordCacheReady,
      noteCacheReady: this.noteCacheReady,
      cardPanCacheReady: this.cardPanCacheReady,
      cardCvvCacheReady: this.cardCvvCacheReady,
      passwordReadPending: this.passwordReadPending,
      noteReadPending: this.noteReadPending,
      cardPanReadPending: this.cardPanReadPending,
      cardCvvReadPending: this.cardCvvReadPending,
    }
  }

  private restoreSecretCache(snapshot: SecretCacheSnapshot): void {
    this.passwordCache = snapshot.passwordCache
    this.noteCache = snapshot.noteCache
    this.cardPanCache = snapshot.cardPanCache
    this.cardCvvCache = snapshot.cardCvvCache
    this.passwordCacheReady = snapshot.passwordCacheReady
    this.noteCacheReady = snapshot.noteCacheReady
    this.cardPanCacheReady = snapshot.cardPanCacheReady
    this.cardCvvCacheReady = snapshot.cardCvvCacheReady
    this.passwordReadPending = snapshot.passwordReadPending
    this.noteReadPending = snapshot.noteReadPending
    this.cardPanReadPending = snapshot.cardPanReadPending
    this.cardCvvReadPending = snapshot.cardCvvReadPending
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
    'isSelected',
  )

  async savePassword(password: string) {
    if (this.entryType === 'payment_card') {
      return false
    }
    logger.debug('[PassManager] savePassword', {
      entryId: this.id,
      length: typeof password === 'string' ? password.length : 0,
    })
    const ok = await wrap(this.root.managerSaver.saveEntryPassword(this.id, password))
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
    const ok = await wrap(this.root.managerSaver.saveEntryNote(this.id, note))
    if (ok) {
      this.seedNoteCache(note)
    }
    logger.debug('[PassManager] saveNote:result', {entryId: this.id, ok})
    return ok
  }

  async saveCardPan(cardPan: string) {
    if (this.entryType !== 'payment_card') {
      return false
    }
    const ok = await wrap(this.root.managerSaver.saveEntrySecret(this.id, 'card_pan', cardPan))
    if (ok) {
      this.seedCardPanCache(cardPan)
    }
    return ok
  }

  async saveCardCvv(cardCvv: string | null) {
    if (this.entryType !== 'payment_card') {
      return false
    }
    const ok = await wrap(this.root.managerSaver.saveEntrySecret(this.id, 'card_cvv', cardCvv))
    if (ok) {
      this.seedCardCvvCache(cardCvv ?? undefined)
    }
    return ok
  }

  async saveSshKey(keyId: string, privateKey: string, publicKey: string) {
    if (this.entryType === 'payment_card') {
      return false
    }
    logger.debug('[PassManager] saveSshKey', {entryId: this.id, keyId})
    const [okPriv, okPub] = await Promise.all([
      wrap(this.root.managerSaver.saveEntrySshPrivateKey(this.id, keyId, privateKey)),
      wrap(this.root.managerSaver.saveEntrySshPublicKey(this.id, keyId, publicKey)),
    ])
    logger.debug('[PassManager] saveSshKey:result', {entryId: this.id, keyId, okPriv, okPub})
    return okPriv && okPub
  }

  async cleanSshKeys() {
    if (this.entryType === 'payment_card') {
      return []
    }
    return await Promise.all(
      this.sshKeys.map((k) =>
        Promise.all([
          wrap(this.root.managerSaver.removeEntrySshPrivateKey(this.id, k.id)),
          wrap(this.root.managerSaver.removeEntrySshPublicKey(this.id, k.id)),
        ]),
      ),
    )
  }

  async addOTP(params: OTPOptions) {
    this.root.beginEntryUpdate()
    try {
      return await this.addOTPAction(params)
    } finally {
      this.root.endEntryUpdate()
    }
  }

  // seed/privateKey removed

  async update(data: IEntry, password: string | undefined, note: string | undefined): Promise<void> {
    this.root.beginEntryUpdate()
    try {
      await this.updateAction(data, password, note)
    } finally {
      this.root.endEntryUpdate()
    }
  }

  async updateTags(tags: unknown): Promise<void> {
    await this.update(
      {
        ...this.data(),
        tags: normalizeCredentialTags(tags),
      },
      undefined,
      undefined,
    )
  }

  async updateSshKeys(sshKeys: SshKeyEntry[]) {
    if (this.entryType === 'payment_card') {
      return false
    }
    this.root.beginEntryUpdate()
    try {
      return await this.updateSshKeysAction(sshKeys)
    } finally {
      this.root.endEntryUpdate()
    }
  }

  async removeSshKey(keyId: string) {
    if (this.entryType === 'payment_card') {
      return false
    }
    this.root.beginEntryUpdate()
    try {
      return await this.removeSshKeyAction(keyId)
    } finally {
      this.root.endEntryUpdate()
    }
  }

  async move(newParent: Group | ManagerRoot, options: {silent?: boolean} = {}) {
    if (newParent === this.parent) {
      return false
    }

    const previousPersistence = this.pendingPersistence
    this.root.beginEntryUpdate()
    const movePromise = this.performMove(previousPersistence, newParent, options)
      .finally(() => {
        this.root.endEntryUpdate()
      })
    this.pendingPersistence = movePromise
    return movePromise
  }

  async remove({
    silent = false,
    updateParent = true,
  }: {
    silent?: boolean
    updateParent?: boolean
  } = {}) {
    if (!silent) {
      const confirmed = await confirmPassManagerAction({
        title: i18n('remove:dialog:title'),
        message: i18n('remove:dialog:text'),
        variant: 'danger',
        confirmVariant: 'danger',
      })
      if (!confirmed) {
        return
      }
    }

    if (this.entryType === 'payment_card') {
      await Promise.all([this.cleanNote(), this.cleanCardCvv(), this.cleanCardPan()])
    } else {
      await Promise.all([this.cleanNote(), this.cleanPassword(), this.cleanOTPs(), this.cleanSshKeys()])
    }

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
    if (this.entryType === 'payment_card') {
      return false
    }
    const ok = await wrap(this.root.managerSaver.removeEntryPassword(this.id))
    if (ok) {
      this.seedPasswordCache(undefined)
    }
    return ok
  }

  async cleanNote() {
    const ok = await wrap(this.root.managerSaver.removeEntryNote(this.id))
    if (ok) {
      this.seedNoteCache(undefined)
    }
    return ok
  }

  async cleanCardPan() {
    if (this.entryType !== 'payment_card') {
      return false
    }
    const ok = await wrap(this.root.managerSaver.removeEntrySecret(this.id, 'card_pan'))
    if (ok) {
      this.seedCardPanCache(undefined)
    }
    return ok
  }

  private async performMove(
    previousPersistence: Promise<unknown> | undefined,
    newParent: Group | ManagerRoot,
    options: {silent?: boolean},
  ): Promise<boolean> {
    if (previousPersistence) {
      await previousPersistence
    }

    const previousParent = this.parent
    if (newParent === previousParent) {
      return false
    }

    const previousParentEntries = this.captureParentEntries(previousParent)
    const nextParentEntries = this.captureParentEntries(newParent)

    previousParent.excludeEntry(this)
    newParent.addEntry(this)

    try {
      const moved = await this.root.managerSaver.moveEntryToGroup(
        this.id,
        newParent instanceof Group ? newParent.name : undefined,
      )
      if (!moved) {
        throw new Error('moveEntryToGroup failed')
      }

      const now = Date.now()
      this.touchParentAfterMove(previousParent, now)
      this.touchParentAfterMove(newParent, now)
      this.root.updatedTs.set(now)

      if (!options.silent) {
        try {
          notify.success(i18n('notify:move:success'))
        } catch {}
      }

      return true
    } catch (error) {
      this.restoreParentEntries(previousParent, previousParentEntries)
      this.restoreParentEntries(newParent, nextParentEntries)
      this.parent = previousParent
      throw error
    }
  }

  private captureParentEntries(parent: Group | ManagerRoot): Array<Entry | Group> {
    return [...parent.entriesList()]
  }

  private restoreParentEntries(parent: Group | ManagerRoot, snapshot: Array<Entry | Group>): void {
    if (parent instanceof Group) {
      const entries = snapshot.filter((item): item is Entry => item instanceof Entry)
      for (const entry of entries) {
        entry.parent = parent
      }
      parent.entries.set(entries)
      return
    }

    for (const item of snapshot) {
      if (item instanceof Entry) {
        item.parent = parent
      }
    }
    parent.entries.set(snapshot)
  }

  private touchParentAfterMove(parent: Group | ManagerRoot, now: number): void {
    if (parent instanceof Group) {
      parent.updateData()
      return
    }

    parent.updatedTs.set(now)
  }

  async cleanCardCvv() {
    if (this.entryType !== 'payment_card') {
      return false
    }
    const ok = await wrap(this.root.managerSaver.removeEntrySecret(this.id, 'card_cvv'))
    if (ok) {
      this.seedCardCvvCache(undefined)
    }
    return ok
  }

  async cleanOTPs() {
    if (this.entryType === 'payment_card') {
      return []
    }
    const otps = peek(this.otps)
    return Promise.all(otps.map((otp) => otp.clean()))
  }

  async removeOTP(otp: OTP, isSilent?: boolean) {
    void isSilent
    this.root.beginEntryUpdate()
    try {
      return await this.removeOTPAction(otp)
    } finally {
      this.root.endEntryUpdate()
    }
  }

  async export(): Promise<IEntryExternal> {
    if (this.entryType === 'payment_card') {
      const cardPan = (await this.cardPan()) ?? ''
      const cardCvv = await this.cardCvv()
      const note = await this.note()
      if (!this.paymentCard) {
        throw new Error('payment_card metadata is required')
      }
      return {
        id: this.id,
        entryType: 'payment_card',
        title: this.title,
        createdTs: this.createdTs,
        updatedTs: this.updatedTs,
        exportedTs: Date.now(),
        folderPath: this.groupPath ?? null,
        paymentCard: this.paymentCard,
        cardPan,
        tags: this.tags,
        ...(cardCvv ? {cardCvv} : {}),
        ...(note ? {note} : {}),
        ...(this._data().iconRef ? {iconRef: this._data().iconRef} : {}),
      }
    }

    let password = ''
    let note: string | undefined
    try {
      password = (await this.password()) ?? ''
      note = await this.note()
    } catch {
      // Secret unavailable (for example, secret not found) - use an empty line
    }
    return {
      id: this.id,
      entryType: 'login',
      title: this.title,
      createdTs: this.createdTs,
      updatedTs: this.updatedTs,
      exportedTs: Date.now(),
      folderPath: this.groupPath ?? null,
      username: this.username,
      urls: this.urls,
      tags: this.tags,
      ...(this._data().iconRef ? {iconRef: this._data().iconRef} : {}),
      password,
      ...(note ? {note} : {}),
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

  private seedCardPanCache(cardPan: string | undefined): void {
    this.cardPanCache = cardPan || undefined
    this.cardPanCacheReady = true
    this.cardPanReadPending = undefined
  }

  private seedCardCvvCache(cardCvv: string | undefined): void {
    this.cardCvvCache = cardCvv || undefined
    this.cardCvvCacheReady = true
    this.cardCvvReadPending = undefined
  }
}
