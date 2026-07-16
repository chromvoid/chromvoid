import {action, atom, computed, sleep, withAbort, withAsync, withAsyncData, wrap} from '@reatom/core'

import type {CredentialCandidate, CredentialOneTimeCode, ProviderStatus} from '@chromvoid/scheme'

import type {FillOTP, FillPassword} from '../messenger'
import type {ExtensionTab} from '../runtime/webextension-api'
import {providerContextFromUrl} from './credential-provider-client'
import type {SitePassword, WebProviderContext} from './credential-provider-client'
import {i18n} from './i18n'
import {autofillOtpOptions, pickOtp} from './otp-selection'

export type PopupRuntimeKind =
  | 'checking'
  | 'ready'
  | 'gateway_offline'
  | 'unpaired'
  | 'provider_disabled'
  | 'vault_locked'
  | 'load_error'

export type PopupRuntimeState = {
  kind: PopupRuntimeKind
  message?: string
}

export type PopupActionKind =
  | 'fill_password'
  | 'copy_username'
  | 'copy_password'
  | 'fill_otp'
  | 'copy_otp'
  | 'open_site'

export type WebTabSnapshot = {
  tabId: number
  origin: string
  host: string
  context: WebProviderContext
}

export interface PopupCredentialProvider {
  status(): Promise<ProviderStatus>
  pairWithPin(pin: string): Promise<boolean>
  probeReachable(timeoutMs?: number): Promise<boolean>
  listForContext(context: WebProviderContext): Promise<CredentialCandidate[]>
  searchAll(query: string): Promise<CredentialCandidate[]>
  readPasswordForSite(context: WebProviderContext, credentialId: string): Promise<SitePassword>
  readOneTimeCodeForSite(
    context: WebProviderContext,
    credentialId: string,
    otpId: string,
  ): Promise<CredentialOneTimeCode>
}

export type PopupModelDependencies = {
  provider: PopupCredentialProvider
  getActiveTab(): Promise<ExtensionTab | undefined>
  sendPassword(tabId: number, data: FillPassword): Promise<unknown>
  sendOtp(tabId: number, data: FillOTP): Promise<unknown>
  writeClipboard(value: string): Promise<void>
  openTab(url: string): Promise<unknown>
  subscribeFocus(listener: () => void): () => void
  subscribeVisible(listener: () => void): () => void
}

type PopupActionRequest = {
  kind: PopupActionKind
  candidate: CredentialCandidate
  otpId?: string
}

const SEARCH_DEBOUNCE_MS = 225
const FEEDBACK_DURATION_MS = 1400

const errorMessage = (error: unknown, fallback: string): string => {
  return error instanceof Error && error.message ? error.message : fallback
}

const candidateOtpOptions = (candidate: CredentialCandidate) =>
  autofillOtpOptions(candidate.otp_options ?? [])

export const webTabSnapshot = (tab: ExtensionTab | undefined): WebTabSnapshot | undefined => {
  const context = providerContextFromUrl(tab?.url)
  if (typeof tab?.id !== 'number' || !context) {
    return undefined
  }
  return {
    tabId: tab.id,
    origin: context.origin,
    host: context.domain,
    context,
  }
}

const candidateSiteUrl = (candidate: CredentialCandidate): string | undefined => {
  if (!candidate.domain) {
    return undefined
  }

  try {
    const url = new URL(`https://${candidate.domain}`)
    if (!url.hostname || url.username || url.password || url.port) {
      return undefined
    }
    return url.origin
  } catch {
    return undefined
  }
}

export class PopupModel {
  readonly runtime = atom<PopupRuntimeState>({kind: 'checking'}, 'popup.runtime')
  readonly activeTab = atom<ExtensionTab | undefined>(undefined, 'popup.activeTab')
  readonly query = atom('', 'popup.query')
  readonly siteCandidates = atom<CredentialCandidate[]>([], 'popup.siteCandidates')
  readonly selectedCandidate = atom<CredentialCandidate | undefined>(undefined, 'popup.selectedCandidate')
  readonly selectedOtpId = atom<string | undefined>(undefined, 'popup.selectedOtpId')
  readonly pairingPin = atom('', 'popup.pairingPin')
  readonly pairingSubmitted = atom(false, 'popup.pairingSubmitted')
  readonly pairingError = atom<string | undefined>(undefined, 'popup.pairingError')
  readonly pairingFocusRequest = atom(0, 'popup.pairingFocusRequest')
  readonly pendingAction = atom<PopupActionKind | undefined>(undefined, 'popup.pendingAction')
  readonly actionError = atom<string | undefined>(undefined, 'popup.actionError')
  readonly feedback = atom<string | undefined>(undefined, 'popup.feedback')

  private connected = false
  private lifecycleCleanups: Array<() => void> = []

  constructor(private readonly dependencies: PopupModelDependencies) {}

  readonly currentTab = computed(() => webTabSnapshot(this.activeTab()), 'popup.currentTab')
  readonly currentHost = computed(() => this.currentTab()?.host ?? '', 'popup.currentHost')
  readonly isWebTab = computed(() => Boolean(this.currentTab()), 'popup.isWebTab')
  readonly isSearchMode = computed(() => Boolean(this.query().trim()), 'popup.isSearchMode')
  readonly isDetailMode = computed(() => Boolean(this.selectedCandidate()), 'popup.isDetailMode')
  readonly siteCandidateIds = computed(
    () => new Set(this.siteCandidates().map((candidate) => candidate.credential_id)),
    'popup.siteCandidateIds',
  )

  readonly search = action(async (query: string) => {
    const normalized = query.trim()
    if (!normalized) {
      return []
    }

    await wrap(sleep(SEARCH_DEBOUNCE_MS))
    return await wrap(this.dependencies.provider.searchAll(normalized))
  }, 'popup.search').extend(withAsyncData({initState: [] as CredentialCandidate[]}))

  readonly visibleCandidates = computed(
    () => (this.isSearchMode() ? this.search.data() : this.siteCandidates()),
    'popup.visibleCandidates',
  )

  readonly searchError = computed(() => {
    const error = this.search.error()
    return error ? errorMessage(error, i18n('error.searchFailed')) : undefined
  }, 'popup.searchError')

  readonly pairingPinError = computed(() => {
    if (!this.pairingSubmitted()) {
      return undefined
    }
    return /^\d{6}$/.test(this.pairingPin().trim()) ? undefined : i18n('error.pinInvalid')
  }, 'popup.pairingPinError')

  readonly refresh = action(async (showChecking = false): Promise<void> => {
    if (showChecking) {
      this.runtime.set({kind: 'checking'})
    }
    this.actionError.set(undefined)

    const tab = await wrap(this.dependencies.getActiveTab())
    this.activeTab.set(tab)

    let status: ProviderStatus
    try {
      status = await wrap(this.dependencies.provider.status())
    } catch {
      let reachable = false
      try {
        reachable = await wrap(this.dependencies.provider.probeReachable(1200))
      } catch {
        reachable = false
      }
      this.siteCandidates.set([])
      this.runtime.set({kind: reachable ? 'unpaired' : 'gateway_offline'})
      return
    }

    if (!status.enabled) {
      this.siteCandidates.set([])
      this.runtime.set({kind: 'provider_disabled'})
      return
    }
    if (!status.vault_open) {
      this.siteCandidates.set([])
      this.runtime.set({kind: 'vault_locked'})
      return
    }

    const snapshot = webTabSnapshot(tab)
    try {
      const candidates = snapshot
        ? await wrap(this.dependencies.provider.listForContext(snapshot.context))
        : []
      this.siteCandidates.set(candidates)
      this.runtime.set({kind: 'ready'})
      const query = this.query().trim()
      if (query) {
        void this.search(query).catch(() => undefined)
      }
    } catch (error) {
      this.siteCandidates.set([])
      this.runtime.set({
        kind: 'load_error',
        message: errorMessage(error, i18n('error.loadSiteData')),
      })
    }
  }, 'popup.refresh').extend(withAbort())

  readonly pair = action(async (): Promise<boolean> => {
    this.pairingSubmitted.set(true)
    this.pairingError.set(undefined)
    if (this.pairingPinError()) {
      this.pairingFocusRequest.set((value) => value + 1)
      return false
    }

    try {
      const paired = await wrap(this.dependencies.provider.pairWithPin(this.pairingPin().trim()))
      if (!paired) {
        const reachable = await wrap(this.dependencies.provider.probeReachable(1200))
        this.pairingError.set(reachable ? i18n('error.pairingFailed') : i18n('error.gatewayUnreachable'))
        return false
      }

      this.pairingPin.set('')
      this.pairingSubmitted.set(false)
      await wrap(this.refresh(true))
      return this.runtime().kind === 'ready'
    } catch (error) {
      this.pairingError.set(errorMessage(error, i18n('error.pairingFailed')))
      return false
    }
  }, 'popup.pair').extend(withAsync(), withAbort('first-in-win'))

  private readonly feedbackFlow = action(async (message: string) => {
    this.feedback.set(message)
    await wrap(sleep(FEEDBACK_DURATION_MS))
    this.feedback.set(undefined)
  }, 'popup.feedbackFlow').extend(withAbort())

  private readonly runAction = action(async (request: PopupActionRequest): Promise<void> => {
    if (this.pendingAction()) {
      return
    }

    this.pendingAction.set(request.kind)
    this.actionError.set(undefined)
    try {
      const feedback = await this.executeAction(request)
      if (feedback) {
        void this.feedbackFlow(feedback).catch(() => undefined)
      }
    } catch (error) {
      this.actionError.set(errorMessage(error, i18n('error.actionFailed')))
    } finally {
      this.pendingAction.set(undefined)
    }
  }, 'popup.runAction').extend(withAbort('first-in-win'))

  connect(): void {
    if (this.connected) {
      return
    }
    this.connected = true
    this.lifecycleCleanups = [
      this.dependencies.subscribeFocus(wrap(() => void this.refresh(false).catch(() => undefined))),
      this.dependencies.subscribeVisible(wrap(() => void this.refresh(false).catch(() => undefined))),
    ]
    void this.refresh(true).catch(() => undefined)
  }

  disconnect(): void {
    if (!this.connected) {
      return
    }
    this.connected = false
    for (const cleanup of this.lifecycleCleanups.splice(0)) {
      cleanup()
    }
    this.refresh.abort()
    this.search.abort()
    this.pair.abort()
    this.runAction.abort()
    this.feedbackFlow.abort()
  }

  setQuery(value: string): void {
    this.query.set(value)
    this.closeDetail()
    this.actionError.set(undefined)
    const normalized = value.trim()
    if (!normalized) {
      this.search.abort()
      this.search.data.reset()
      return
    }
    void this.search(normalized).catch(() => undefined)
  }

  setPairingPin(value: string): void {
    this.pairingPin.set(value)
    this.pairingError.set(undefined)
  }

  retry(): void {
    void this.refresh(true).catch(() => undefined)
  }

  retrySearch(): void {
    const query = this.query().trim()
    if (query) {
      void this.search(query).catch(() => undefined)
    }
  }

  openDetail(candidate: CredentialCandidate): void {
    this.selectedCandidate.set(candidate)
    this.selectedOtpId.set(pickOtp(candidateOtpOptions(candidate))?.id)
    this.actionError.set(undefined)
  }

  closeDetail(): void {
    this.selectedCandidate.set(undefined)
    this.selectedOtpId.set(undefined)
    this.actionError.set(undefined)
  }

  setSelectedOtp(otpId: string): void {
    const candidate = this.selectedCandidate()
    const selected = candidate ? pickOtp(candidateOtpOptions(candidate), otpId) : undefined
    if (selected) {
      this.selectedOtpId.set(selected.id)
    }
  }

  isCurrentSite(candidate: CredentialCandidate): boolean {
    return this.siteCandidateIds().has(candidate.credential_id)
  }

  fillPassword(candidate: CredentialCandidate): Promise<void> {
    return this.runAction({kind: 'fill_password', candidate})
  }

  copyUsername(candidate: CredentialCandidate): Promise<void> {
    return this.runAction({kind: 'copy_username', candidate})
  }

  copyPassword(candidate: CredentialCandidate): Promise<void> {
    return this.runAction({kind: 'copy_password', candidate})
  }

  fillOtp(candidate: CredentialCandidate, otpId = this.selectedOtpId()): Promise<void> {
    return this.runAction({kind: 'fill_otp', candidate, otpId})
  }

  copyOtp(candidate: CredentialCandidate, otpId = this.selectedOtpId()): Promise<void> {
    return this.runAction({kind: 'copy_otp', candidate, otpId})
  }

  openSite(candidate: CredentialCandidate): Promise<void> {
    return this.runAction({kind: 'open_site', candidate})
  }

  performAction(kind: PopupActionKind, candidate: CredentialCandidate, otpId?: string): Promise<void> {
    return this.runAction({kind, candidate, otpId})
  }

  private async executeAction(request: PopupActionRequest): Promise<string | undefined> {
    if (request.kind === 'copy_username') {
      await wrap(this.dependencies.writeClipboard(request.candidate.username))
      return i18n('feedback.usernameCopied')
    }
    if (request.kind === 'open_site') {
      const url = candidateSiteUrl(request.candidate)
      if (!url) {
        throw new Error(i18n('error.siteUnavailable'))
      }
      await wrap(this.dependencies.openTab(url))
      return undefined
    }

    const snapshot = await this.captureAllowedSite(request.candidate)
    if (request.kind === 'fill_password' || request.kind === 'copy_password') {
      const secret = await wrap(
        this.dependencies.provider.readPasswordForSite(snapshot.context, request.candidate.credential_id),
      )
      await this.assertTabUnchanged(snapshot)
      if (request.kind === 'fill_password') {
        await wrap(
          this.dependencies.sendPassword(snapshot.tabId, {
            id: request.candidate.credential_id,
            username: secret.username,
            password: secret.password,
            expectedOrigin: snapshot.origin,
          }),
        )
        return i18n('feedback.credentialsFilled')
      }
      await wrap(this.dependencies.writeClipboard(secret.password))
      return i18n('feedback.passwordCopied')
    }

    if (!request.otpId) {
      throw new Error(i18n('error.otpUnavailable'))
    }
    const oneTimeCode = await wrap(
      this.dependencies.provider.readOneTimeCodeForSite(
        snapshot.context,
        request.candidate.credential_id,
        request.otpId,
      ),
    )
    await this.assertTabUnchanged(snapshot)
    if (request.kind === 'fill_otp') {
      await wrap(
        this.dependencies.sendOtp(snapshot.tabId, {
          id: request.candidate.credential_id,
          username: request.candidate.username,
          otp: oneTimeCode.code,
          expectedOrigin: snapshot.origin,
        }),
      )
      return i18n('feedback.otpFilled')
    }
    await wrap(this.dependencies.writeClipboard(oneTimeCode.code))
    return i18n('feedback.otpCopied')
  }

  private async captureAllowedSite(candidate: CredentialCandidate): Promise<WebTabSnapshot> {
    if (!this.isCurrentSite(candidate)) {
      throw new Error(i18n('error.currentSiteOnly'))
    }
    const tab = await wrap(this.dependencies.getActiveTab())
    const snapshot = webTabSnapshot(tab)
    if (!snapshot) {
      throw new Error(i18n('error.currentSiteOnly'))
    }
    return snapshot
  }

  private async assertTabUnchanged(expected: WebTabSnapshot): Promise<void> {
    const current = webTabSnapshot(await wrap(this.dependencies.getActiveTab()))
    if (!current || current.tabId !== expected.tabId || current.origin !== expected.origin) {
      throw new Error(i18n('error.tabChanged'))
    }
  }
}

export const createPopupModel = (dependencies: PopupModelDependencies) => new PopupModel(dependencies)
