import {atom, computed, wrap} from '@reatom/core'

import {isTauriRuntime} from 'root/core/runtime/runtime'
import {guidanceCompletionBridge} from 'root/core/guidance'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {dialogService} from 'root/shared/services/dialog'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'
import {subscribeAfterInitial} from 'root/shared/services/subscribed-signal'
import type {RemoteSessionState} from 'root/app/state/store'

import {WelcomeRemoteModel} from './welcome-remote.model'
import {WelcomeSharedModel} from './welcome-shared.model'
import {
  estimatePasswordStrength,
  RpcError,
  mapVaultUnlockError,
  tauriRpc,
  type PasswordStrengthFeedback,
} from './welcome-rpc'
import type {NetworkPairedPeer} from '../remote/remote.model'

export type WelcomeSetupStep =
  | 'mode-select'
  | 'create-master'
  | 'remote-connect'
  | 'remote-pair'
  | 'remote-wait'
  | null

export type PasswordFeedback = PasswordStrengthFeedback

function createNeutralPasswordFeedback(): PasswordFeedback {
  return {
    score: 0,
    feedback: {
      warning: '',
      suggestions: [],
    },
  }
}

type WelcomeSetupModelOptions = {
  shared?: WelcomeSharedModel
  remote?: WelcomeRemoteModel
}

export class WelcomeSetupModel {
  readonly shared: WelcomeSharedModel
  readonly remote: WelcomeRemoteModel
  readonly isNeedInit!: ReturnType<typeof computed<boolean>>
  readonly isDesktopRemoteSupported!: ReturnType<typeof computed<boolean>>
  readonly effectiveStep!: ReturnType<typeof computed<WelcomeSetupStep>>
  readonly heroTitle!: ReturnType<typeof computed<string>>
  readonly heroDescription!: ReturnType<typeof computed<string>>
  readonly heroEyebrow!: ReturnType<typeof computed<string>>
  readonly heroProof!: ReturnType<typeof computed<string>>
  readonly connectedPeerLabel!: ReturnType<typeof computed<string>>
  readonly setupStep = atom<WelcomeSetupStep>(null)
  readonly setupInProgress = atom(false)
  readonly passwordStrength = atom<PasswordFeedback>(createNeutralPasswordFeedback())
  readonly creationState = atom({
    p1: '',
    p2: '',
  })

  private remoteSessionUnsubscribe: (() => void) | null = null
  private passwordStrengthRequestId = 0

  constructor(options: WelcomeSetupModelOptions = {}) {
    this.shared = options.shared ?? new WelcomeSharedModel()
    this.remote = options.remote ?? new WelcomeRemoteModel()
    this.isNeedInit = computed<boolean>(() => Boolean(getAppContext().state.data().NeedUserInitialization))
    this.isDesktopRemoteSupported = computed<boolean>(() => {
      const caps = getRuntimeCapabilities()
      return isTauriRuntime() && caps.desktop && caps.supports_network_remote
    })
    this.effectiveStep = computed<WelcomeSetupStep>(() => {
      const step = this.setupStep()
      if (this.isNeedInit() && step === null) {
        return 'mode-select'
      }
      return step
    })
    this.heroTitle = computed<string>(() => {
      const step = this.effectiveStep()
      if (step === 'remote-connect') return i18n('welcome:remote-vault-title')
      if (step === 'remote-pair') return i18n('welcome:pair-iphone-hero-title')
      if (step === 'remote-wait') return i18n('welcome:wait-iphone-title')
      if (!this.isNeedInit()) return i18n('onboard:hero:unlock')
      if (step === 'create-master') return i18n('welcome:create-local-storage-title')
      return i18n('onboard:hero:create')
    })
    this.heroDescription = computed<string>(() => {
      const step = this.effectiveStep()
      if (step === 'remote-connect') return i18n('welcome:remote-vault-desc')
      if (step === 'remote-pair') return i18n('welcome:pair-iphone-hero-desc')
      if (step === 'remote-wait') return i18n('welcome:wait-iphone-desc')
      if (!this.isNeedInit()) return i18n('welcome:unlock-desc')
      if (step === 'create-master') return i18n('welcome:create-master-desc')
      return i18n('welcome:choose-storage-desc')
    })
    this.heroEyebrow = computed<string>(() => {
      const step = this.effectiveStep()
      if (step === 'remote-connect' || step === 'remote-pair' || step === 'remote-wait') {
        return i18n('welcome:eyebrow-remote-host')
      }
      if (!this.isNeedInit()) return i18n('welcome:eyebrow-local-vault')
      if (step === 'create-master') return i18n('welcome:eyebrow-first-run')
      return i18n('welcome:eyebrow-setup-path')
    })
    this.heroProof = computed<string>(() => {
      const step = this.effectiveStep()
      if (step === 'remote-connect') return i18n('welcome:proof-remote-connect')
      if (step === 'remote-pair') return i18n('welcome:proof-remote-pair')
      if (step === 'remote-wait') return i18n('welcome:proof-remote-wait')
      if (!this.isNeedInit()) return i18n('welcome:proof-unlock')
      if (step === 'create-master') return i18n('welcome:proof-create-master')
      return i18n('welcome:proof-default')
    })
    this.connectedPeerLabel = computed<string>(() => this.remote.connectedPeerLabel())
  }

  get busy() {
    return this.shared.busy
  }

  get shakeError() {
    return this.shared.shakeError
  }

  connect = () => {
    this.remote.connect({
      onTransportLost: () => {
        if (this.effectiveStep() === 'remote-wait') {
          this.remote.showHosts()
          this.setupStep.set('remote-connect')
        }
      },
    })
    this.remoteSessionUnsubscribe?.()
    this.syncSetupStepFromRemoteSession(getAppContext().store.remoteSessionState())
    this.remoteSessionUnsubscribe = subscribeAfterInitial(getAppContext().store.remoteSessionState, () => {
      this.syncSetupStepFromRemoteSession(getAppContext().store.remoteSessionState())
    })
  }

  disconnect = () => {
    this.remote.disconnect()
    this.remoteSessionUnsubscribe?.()
    this.remoteSessionUnsubscribe = null
  }

  handleCreateMasterSubmit = (event: Event) => {
    event.preventDefault()
    void this.submitMasterSetup()
  }

  handleMasterPasswordInput = (event: Event) => {
    const nextValue = this.resolveInputValue(event)
    const state = this.creationState()
    this.creationState.set({...state, p1: nextValue})
    void this.updatePasswordStrength(nextValue)
  }

  handleMasterPasswordConfirmInput = (event: Event) => {
    const nextValue = this.resolveInputValue(event)
    const state = this.creationState()
    this.creationState.set({...state, p2: nextValue})
  }

  submitMasterSetup = async () => {
    if (this.shared.busy()) return
    const {p1, p2} = this.creationState()

    if (!p1) {
      this.shared.setBusy(false, i18n('welcome:master-required'))
      return
    }

    if (p1.length < 12) {
      this.shared.setBusy(false, i18n('welcome:master-too-short'))
      return
    }

    if (p1 !== p2) {
      this.shared.setBusy(false, i18n('welcome:master-mismatch'))
      return
    }

    try {
      this.setupInProgress.set(true)
      this.shared.setBusy(true)
      await wrap(tauriRpc('master:setup', {master_password: p1}))
      guidanceCompletionBridge.markVaultCreated()
      getAppContext().state.update({NeedUserInitialization: false})
      getAppContext().store.pushNotification('success', i18n('welcome:storage-created'))
      this.setupStep.set(null)
      this.creationState.set({p1: '', p2: ''})
      this.resetPasswordStrength()
    } catch (error) {
      this.shared.setBusy(false, error instanceof Error ? error.message : String(error))
    } finally {
      this.setupInProgress.set(false)
      this.shared.setBusy(false)
    }
  }

  onUnlock = async () => {
    if (!isTauriRuntime()) return
    if (this.shared.busy()) return

    writeAndroidUnlockDebug('welcome', 'onUnlock:start')
    const pwd = await wrap(dialogService.showInputDialog({
      title: i18n('onboard:hero:unlock'),
      label: i18n('welcome:vault-password'),
      type: 'password',
      required: true,
    }))
    writeAndroidUnlockDebug('welcome', 'onUnlock:dialog resolved', {
      cancelled: !pwd,
    })
    if (!pwd) return

    try {
      this.setupInProgress.set(true)
      this.shared.setBusy(true)
      writeAndroidUnlockDebug('welcome', 'onUnlock:vault:unlock start')
      await wrap(tauriRpc('vault:unlock', {password: pwd}))
      writeAndroidUnlockDebug('welcome', 'onUnlock:vault:unlock success')
      getAppContext().state.update({StorageOpened: true})
      writeAndroidUnlockDebug('welcome', 'onUnlock:state updated', {
        storageOpened: true,
      })
    } catch (error) {
      console.error(error)
      writeAndroidUnlockDebug('welcome', 'onUnlock:error', {
        code: error instanceof RpcError ? error.code : null,
      })
      const errorMessage =
        error instanceof RpcError
          ? mapVaultUnlockError(error.code, i18n('welcome:unable-access-vault'))
          : i18n('welcome:unable-access-vault')
      this.shared.setBusy(false, errorMessage)
    } finally {
      this.setupInProgress.set(false)
      this.shared.setBusy(false)
    }
  }

  onSelectLocalMode = () => {
    this.remote.showHosts()
    this.shared.clearError()
    this.setupStep.set('create-master')
  }

  onSelectRemoteMode = () => {
    if (!this.isDesktopRemoteSupported()) {
      getAppContext().store.pushNotification('info', i18n('welcome:remote-mode-unavailable'))
      return
    }

    this.shared.clearError()
    this.remote.showHosts()
    this.setupStep.set('remote-connect')
    void this.remote.loadPeers()
  }

  onBackToModeSelect = () => {
    this.remote.showHosts()
    this.shared.clearError()
    this.setupStep.set('mode-select')
    this.creationState.set({p1: '', p2: ''})
    this.resetPasswordStrength()
  }

  onOpenRemotePair = () => {
    this.shared.clearError()
    this.remote.openPairIos()
    this.setupStep.set('remote-pair')
  }

  onBackFromRemoteConnect = () => {
    void this.backFromRemoteConnect()
  }

  onBackFromRemotePair = () => {
    void this.backFromRemotePair()
  }

  onBackFromRemoteWait = () => {
    void this.backFromRemoteWait()
  }

  onConnectRemotePeer = (peerId: string) => {
    void this.connectRemotePeer(peerId)
  }

  onRemoveRemotePeer = (peer: NetworkPairedPeer) => {
    void this.removeRemotePeer(peer)
  }

  onSubmitRemotePair = () => {
    void this.submitRemotePair()
  }
  private syncSetupStepFromRemoteSession(sessionState: RemoteSessionState): void {
    if (sessionState === 'waiting_host_unlock') {
      this.remote.view.set('wait')
      this.setupStep.set('remote-wait')
      return
    }
    if (sessionState === 'ready' && this.effectiveStep() === 'remote-wait') {
      this.setupStep.set(null)
    }
  }

  private resolveInputValue(event: Event): string {
    const customEvent = event as CustomEvent<{value?: string}>
    const target = event.target as {value?: string} | null
    return customEvent.detail?.value ?? target?.value ?? ''
  }

  private resetPasswordStrength(): void {
    this.passwordStrengthRequestId += 1
    this.passwordStrength.set(createNeutralPasswordFeedback())
  }

  private async updatePasswordStrength(password: string): Promise<void> {
    const requestId = ++this.passwordStrengthRequestId
    if (!password || !isTauriRuntime()) {
      this.passwordStrength.set(createNeutralPasswordFeedback())
      return
    }

    try {
      const feedback = await wrap(estimatePasswordStrength(password))
      if (requestId !== this.passwordStrengthRequestId) return
      this.passwordStrength.set(feedback)
    } catch (error) {
      if (requestId !== this.passwordStrengthRequestId) return
      this.passwordStrength.set(createNeutralPasswordFeedback())
      console.warn('[welcome] password strength estimate failed', error)
    }
  }

  private async submitRemotePair(): Promise<void> {
    this.shared.clearError()
    const success = await this.remote.submitPairing()
    if (!success) {
      this.shared.setError(this.remote.errorText())
      return
    }
    this.remote.showHosts()
    this.setupStep.set('remote-connect')
  }

  private async connectRemotePeer(peerId: string): Promise<void> {
    this.shared.clearError()
    const success = await this.remote.connectToPeer(peerId)
    if (!success) {
      this.shared.setError(this.remote.errorText())
      return
    }
    this.setupStep.set('remote-wait')
  }

  private async removeRemotePeer(peer: NetworkPairedPeer): Promise<void> {
    this.shared.clearError()
    const removed = await this.remote.removePeer(peer)
    if (!removed && this.remote.errorText()) {
      this.shared.setError(this.remote.errorText())
    }
  }

  private async backFromRemoteConnect(): Promise<void> {
    await this.remote.exitPreAuthRemote()
    this.shared.clearError()
    this.setupStep.set(this.isNeedInit() ? 'mode-select' : null)
  }

  private async backFromRemotePair(): Promise<void> {
    await this.remote.closePairIos()
    await this.remote.loadPeers()
    this.shared.clearError()
    this.setupStep.set('remote-connect')
  }

  private async backFromRemoteWait(): Promise<void> {
    await this.remote.disconnectTransport()
    await this.remote.loadPeers()
    this.shared.clearError()
    this.setupStep.set('remote-connect')
  }
}
