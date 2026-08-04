import {action, atom, computed, isAbort, withAbort, withAsync, wrap} from '@reatom/core'
import {parseOtpAuthUri, type Entry, type OtpAuthUriMetadata} from '@project/passmanager/core'
import {i18n as passmanagerI18n} from '@project/passmanager/i18n'
import type {UrlRule} from '@project/passmanager/types'
import {getPrimaryUrlRule} from '@project/passmanager/urls'
import {isError, isSuccess, type RpcResult} from '@chromvoid/scheme'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {i18n as appI18n} from 'root/i18n'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {runtimeCapabilitiesAtom} from 'root/core/runtime/runtime-capabilities'
import {runtimeModeModel} from 'root/core/runtime/runtime-mode.model'
import {tauriInvoke, tauriListen} from 'root/core/transport/tauri/ipc'
import {getAppContext} from 'root/shared/services/app-context'
import {subscribeToSignalChanges} from 'root/shared/services/subscribed-signal'
import {getPassmanagerRoot, passmanagerRoot} from 'root/features/passmanager/models/pm-root.adapter'
import {passmanagerNavigationController} from 'root/features/passmanager/passmanager-navigation.controller'
import {PMEntryOtpCreateModel} from '../card/entry-otp-create/entry-otp-create.model'
import {PMEntryWebsiteEditorModel} from '../card/entry-website-editor'

export type PendingOtpImportMetadata = {
  pending_id: string
  origin: 'system_url'
  expires_at_ms: number
}

type OtpImportTakeResult = PendingOtpImportMetadata & {
  raw_uri: string
}

export type OtpImportTargetMode = 'existing' | 'new' | null
export type OtpImportDuplicateResolution = 'replace' | 'rename' | null
export type OtpImportPhase = 'idle' | 'waiting' | 'review' | 'error'
export type OtpImportAvailability =
  | 'ready'
  | 'local_core_required'
  | 'vault_required'
  | 'passmanager_loading'
  | 'read_only'

export type OtpImportFocusField = 'target' | 'title' | 'website' | 'label' | 'duplicate' | 'alert'

export type OtpImportFocusRequest = {
  field: OtpImportFocusField
  token: number
}

export type OtpImportEntryOption = {
  id: string
  title: string
  username: string
  website: string
  suggested: boolean
}

export type OtpImportNativePort = {
  pending(): Promise<RpcResult<PendingOtpImportMetadata | null>>
  take(pendingId: string): Promise<RpcResult<OtpImportTakeResult>>
  clear(pendingId?: string): Promise<RpcResult<boolean>>
  onPending(handler: (metadata: PendingOtpImportMetadata) => void): Promise<() => void>
}

const defaultNativePort: OtpImportNativePort = {
  pending: () => tauriInvoke('macos_otp_import_pending'),
  take: (pendingId) => tauriInvoke('macos_otp_import_take', {pendingId}),
  clear: (pendingId) => tauriInvoke('macos_otp_import_clear', pendingId ? {pendingId} : undefined),
  onPending: (handler) => tauriListen('otp-import-pending', handler),
}

function macosTauriRuntimeAvailable(): boolean {
  return isTauriRuntime() && runtimeCapabilitiesAtom().platform === 'macos'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizeForMatch(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function entryWebsite(entry: Entry): string {
  return getPrimaryUrlRule(entry.urls)?.value ?? ''
}

export class OtpImportReviewModel {
  readonly otpDraft: PMEntryOtpCreateModel
  readonly pending = atom<PendingOtpImportMetadata | null>(null, 'otpImport.pending')
  readonly phase = atom<OtpImportPhase>('idle', 'otpImport.phase')
  readonly parseMetadata = atom<OtpAuthUriMetadata | null>(null, 'otpImport.parseMetadata')
  readonly targetMode = atom<OtpImportTargetMode>(null, 'otpImport.targetMode')
  readonly selectedEntryId = atom('', 'otpImport.selectedEntryId')
  readonly newTitle = atom('', 'otpImport.newTitle')
  readonly newUsername = atom('', 'otpImport.newUsername')
  readonly websiteEditor = new PMEntryWebsiteEditorModel()
  readonly duplicateResolution = atom<OtpImportDuplicateResolution>(null, 'otpImport.duplicateResolution')
  readonly targetError = atom('', 'otpImport.targetError')
  readonly titleError = atom('', 'otpImport.titleError')
  readonly labelError = atom('', 'otpImport.labelError')
  readonly duplicateError = atom('', 'otpImport.duplicateError')
  readonly submitError = atom('', 'otpImport.submitError')
  readonly focusRequest = atom<OtpImportFocusRequest | null>(null, 'otpImport.focusRequest')
  readonly isCommitting = atom(false, 'otpImport.isCommitting')
  private takeInFlight = false
  private connected = false
  private expiryTimer = 0
  private nextFocusToken = 1
  private unlisteners: Array<() => void> = []

  readonly vaultOpen = computed(
    () => Boolean(getAppContext().state.data()?.StorageOpened),
    'otpImport.vaultOpen',
  )
  readonly availability = computed<OtpImportAvailability>(() => {
    if (!runtimeModeModel.localCoreMode()) return 'local_core_required'
    if (!this.vaultOpen()) return 'vault_required'
    const root = getPassmanagerRoot()
    if (!root) return 'passmanager_loading'
    if (root.isReadOnly()) return 'read_only'
    return 'ready'
  }, 'otpImport.availability')
  readonly visible = computed(() => {
    if (!this.pending()) return false
    if (this.phase() !== 'waiting') return true
    const availability = this.availability()
    return availability !== 'local_core_required' && availability !== 'vault_required'
  }, 'otpImport.visible')
  readonly isSubmitting = computed(() => this.submitAction.pending() > 0, 'otpImport.isSubmitting')
  readonly canMutate = computed(() => this.availability() === 'ready', 'otpImport.canMutate')
  readonly existingEntries = computed<OtpImportEntryOption[]>(() => {
    const root = getPassmanagerRoot()
    if (!root) return []
    const metadata = this.parseMetadata()
    const matchTerms = new Set(
      [metadata?.issuer ?? '', metadata?.account ?? ''].map(normalizeForMatch).filter(Boolean),
    )
    return root.allEntries
      .filter((entry) => entry.entryType === 'login')
      .map((entry) => {
        const title = String(entry.data().title ?? entry.title)
        const username = String(entry.username ?? '')
        const website = entryWebsite(entry)
        const entryTerms = [title, username].map(normalizeForMatch)
        return {
          id: entry.id,
          title,
          username,
          website,
          suggested: entryTerms.some((term) => term && matchTerms.has(term)),
        }
      })
      .sort((left, right) => {
        if (left.suggested !== right.suggested) return left.suggested ? -1 : 1
        if (Boolean(left.website) !== Boolean(right.website)) return left.website ? -1 : 1
        return left.title.localeCompare(right.title)
      })
  }, 'otpImport.existingEntries')
  readonly duplicateOtp = computed(() => {
    const entry = this.selectedEntry()
    const label = normalizeForMatch(this.otpDraft.label())
    if (!entry || !label) return null
    return entry.otps().find((otp) => normalizeForMatch(otp.label ?? '') === label) ?? null
  }, 'otpImport.duplicateOtp')

  private readonly submitAction = action(async (): Promise<boolean> => {
    this.clearFormErrors()
    const target = this.validateTarget()
    if (!target) return false

    if (!(await wrap(this.otpDraft.validateWithCore()))) {
      this.submitError.set(passmanagerI18n('otp:secret:error:invalid'))
      this.requestFocus('alert')
      return false
    }

    const root = getPassmanagerRoot()
    if (!root || root.isReadOnly()) {
      this.submitError.set(passmanagerI18n('credentials:unavailable:title'))
      this.requestFocus('alert')
      return false
    }

    const otp = this.otpDraft.getFormData()
    let savedEntry: Entry
    let commitStarted = false
    try {
      this.isCommitting.set(true)
      commitStarted = true
      if (target.mode === 'existing') {
        savedEntry = target.entry
        const duplicate = this.duplicateOtp()
        const beforeOtpIds = new Set(savedEntry.otps().map((item) => item.id))
        await wrap(savedEntry.addOTP(otp))

        if (duplicate && this.duplicateResolution() === 'replace') {
          const added = savedEntry.otps().find((item) => !beforeOtpIds.has(item.id))
          try {
            await wrap(duplicate.remove(true))
          } catch (error) {
            await added?.remove(true).catch(() => false)
            throw error
          }
        }
      } else {
        savedEntry = root.createEntry(
          {
            entryType: 'login',
            title: this.newTitle().trim(),
            username: this.newUsername().trim(),
            urls: target.urls,
          },
          '',
          '',
          otp,
        )
        await wrap(savedEntry.flushPendingPersistence())
      }

      if (getPassmanagerRoot() === root) {
        if (target.mode === 'new') {
          passmanagerNavigationController.presentCreatedEntry(savedEntry)
        } else {
          root.setShowElement(savedEntry)
        }
      }
      await wrap(this.finish())
      this.isCommitting.set(false)
      commitStarted = false
      if (getPassmanagerRoot() === root) {
        navigationModel.navigateToSurface('passwords')
      }
      return true
    } catch (error) {
      if (isAbort(error) && !commitStarted) return false
      this.submitError.set(errorMessage(error) || passmanagerI18n('error:save'))
      this.requestFocus('alert')
      return false
    } finally {
      if (commitStarted) this.isCommitting.set(false)
    }
  }, 'otpImport.submit').extend(withAbort('first-in-win'), withAsync({status: true}))

  constructor(
    private readonly nativePort: OtpImportNativePort = defaultNativePort,
    otpDraft = new PMEntryOtpCreateModel(),
    private readonly runtimeAvailable: () => boolean = macosTauriRuntimeAvailable,
  ) {
    this.otpDraft = otpDraft
  }

  connect(): void {
    if (this.connected || !this.runtimeAvailable()) return
    this.connected = true
    this.unlisteners.push(
      subscribeToSignalChanges(runtimeModeModel.localCoreMode, () => this.handleAvailabilityChange()),
      subscribeToSignalChanges(getAppContext().state.data, () => this.handleAvailabilityChange(), {
        readSnapshot: () => Boolean(getAppContext().state.data()?.StorageOpened),
      }),
      subscribeToSignalChanges(passmanagerRoot, () => this.handleAvailabilityChange()),
    )
    void this.nativePort
      .onPending((metadata) => this.receivePending(metadata))
      .then((unlisten) => {
        if (!this.connected) {
          unlisten()
          return
        }
        this.unlisteners.push(unlisten)
      })
      .catch(() => undefined)
    void this.refreshPending()
  }

  disconnect(): void {
    if (!this.connected) return
    this.connected = false
    for (const unlisten of this.unlisteners) unlisten()
    this.unlisteners = []
    if (this.isCommitting()) return
    void this.clearNativePending()
    this.reset()
  }

  async refreshPending(): Promise<void> {
    if (!this.connected) return
    try {
      const result = await wrap(this.nativePort.pending())
      if (!this.connected || !isSuccess(result) || !result.result) return
      this.receivePending(result.result)
    } catch {
      return
    }
  }

  receivePending(metadata: PendingOtpImportMetadata): void {
    if (!metadata.pending_id || !Number.isFinite(metadata.expires_at_ms)) return
    if (this.isCommitting()) return
    this.submitAction.abort('OTP import replaced')
    this.clearSensitiveDraft()
    this.pending.set(metadata)
    this.phase.set('waiting')
    this.scheduleExpiry(metadata)
    void this.maybeTake()
  }

  setTargetMode(mode: Exclude<OtpImportTargetMode, null>): void {
    this.targetMode.set(mode)
    this.targetError.set('')
    this.duplicateResolution.set(null)
  }

  setSelectedEntryId(value: string): void {
    this.selectedEntryId.set(value)
    this.targetError.set('')
    this.duplicateResolution.set(null)
  }

  setNewTitle(value: string): void {
    this.newTitle.set(value)
    if (value.trim()) this.titleError.set('')
  }

  setNewUsername(value: string): void {
    this.newUsername.set(value)
  }

  setOtpLabel(value: string): void {
    this.otpDraft.setLabel(value)
    this.labelError.set('')
    this.duplicateError.set('')
    if (!this.duplicateOtp()) this.duplicateResolution.set(null)
  }

  setDuplicateResolution(value: Exclude<OtpImportDuplicateResolution, null>): void {
    this.duplicateResolution.set(value)
    this.duplicateError.set('')
    if (value === 'rename') this.requestFocus('label')
  }

  submit(): Promise<boolean> {
    return this.submitAction()
  }

  async cancel(): Promise<boolean> {
    if (this.isCommitting()) return false
    await this.clearNativePending()
    return this.reset()
  }

  private async maybeTake(): Promise<void> {
    const pending = this.pending()
    if (!this.connected || !pending || this.phase() !== 'waiting' || this.takeInFlight) return
    if (this.availability() !== 'ready') return
    this.takeInFlight = true
    try {
      const result = await wrap(this.nativePort.take(pending.pending_id))
      if (!this.connected || this.pending()?.pending_id !== pending.pending_id) return
      if (isError(result)) {
        if (result.code === 'VAULT_REQUIRED' || result.code === 'REMOTE_CORE_UNSUPPORTED') return
        this.phase.set('error')
        this.submitError.set(result.error)
        return
      }

      if (!isSuccess(result)) return
      const parsed = parseOtpAuthUri(result.result.raw_uri)
      if (!parsed.ok) {
        this.phase.set('error')
        this.submitError.set(parsed.message)
        return
      }

      this.parseMetadata.set(parsed.metadata)
      this.otpDraft.applyDraft(parsed.otp)
      this.newTitle.set(parsed.metadata.issuer || parsed.otp.label || passmanagerI18n('entry:type:login'))
      this.newUsername.set(parsed.metadata.account)
      this.phase.set('review')
    } catch (error) {
      if (this.pending()?.pending_id === pending.pending_id) {
        this.phase.set('error')
        this.submitError.set(errorMessage(error))
      }
    } finally {
      this.takeInFlight = false
    }
  }

  private handleAvailabilityChange(): void {
    if (!this.pending()) return
    if (this.phase() === 'review' && this.availability() !== 'ready') {
      void this.cancel()
      return
    }
    void this.maybeTake()
  }

  private validateTarget(): {mode: 'existing'; entry: Entry} | {mode: 'new'; urls: UrlRule[]} | null {
    const mode = this.targetMode()
    if (!mode) {
      this.targetError.set(appI18n('otp-import:error-target'))
      this.requestFocus('target')
      return null
    }

    if (!this.otpDraft.label().trim()) {
      this.labelError.set(passmanagerI18n('otp:label.placeholder'))
      this.requestFocus('label')
      return null
    }

    if (mode === 'existing') {
      const entry = this.selectedEntry()
      if (!entry) {
        this.targetError.set(appI18n('otp-import:error-existing'))
        this.requestFocus('target')
        return null
      }
      if (this.duplicateOtp() && !this.duplicateResolution()) {
        this.duplicateError.set(appI18n('otp-import:error-duplicate'))
        this.requestFocus('duplicate')
        return null
      }
      if (this.duplicateOtp() && this.duplicateResolution() === 'rename') {
        this.labelError.set(appI18n('otp-import:error-rename'))
        this.requestFocus('label')
        return null
      }
      return {mode, entry}
    }

    if (!this.newTitle().trim()) {
      this.titleError.set(passmanagerI18n('error:title_required'))
      this.requestFocus('title')
      return null
    }
    const websiteResult = this.websiteEditor.buildRules()
    if (!websiteResult.ok) {
      this.requestFocus('website')
      return null
    }
    return {mode, urls: websiteResult.rules}
  }

  private selectedEntry(): Entry | undefined {
    return getPassmanagerRoot()?.getEntry(this.selectedEntryId())
  }

  private requestFocus(field: OtpImportFocusField): void {
    this.focusRequest.set({field, token: this.nextFocusToken++})
  }

  private clearFormErrors(): void {
    this.targetError.set('')
    this.titleError.set('')
    this.labelError.set('')
    this.duplicateError.set('')
    this.submitError.set('')
  }

  private scheduleExpiry(metadata: PendingOtpImportMetadata): void {
    window.clearTimeout(this.expiryTimer)
    const delay = Math.max(0, metadata.expires_at_ms - Date.now())
    this.expiryTimer = window.setTimeout(() => {
      if (this.pending()?.pending_id !== metadata.pending_id) return
      void this.cancel()
    }, delay)
  }

  private async clearNativePending(): Promise<void> {
    const pendingId = this.pending()?.pending_id
    if (!pendingId) return
    try {
      await wrap(this.nativePort.clear(pendingId))
    } catch {
      return
    }
  }

  private async finish(): Promise<void> {
    await this.clearNativePending()
    this.resetState()
  }

  private clearSensitiveDraft(): void {
    this.otpDraft.reset()
    this.parseMetadata.set(null)
  }

  private reset(): boolean {
    if (this.isCommitting()) return false
    this.submitAction.abort('OTP import reset')
    this.resetState()
    return true
  }

  private resetState(): void {
    window.clearTimeout(this.expiryTimer)
    this.clearSensitiveDraft()
    this.pending.set(null)
    this.phase.set('idle')
    this.targetMode.set(null)
    this.selectedEntryId.set('')
    this.newTitle.set('')
    this.newUsername.set('')
    this.websiteEditor.reset()
    this.duplicateResolution.set(null)
    this.focusRequest.set(null)
    this.clearFormErrors()
  }
}

export const otpImportReviewModel = new OtpImportReviewModel()
