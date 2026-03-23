import {state} from '@statx/core'
import {open} from '@tauri-apps/plugin-dialog'
import zxcvbn from 'zxcvbn'

import {getAppContext} from 'root/shared/services/app-context'
import {dialogService} from 'root/shared/services/dialog'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {i18n} from 'root/i18n'
import type {RemoteSessionState} from 'root/app/state/store'
import {WelcomeRemoteModel} from './welcome-remote.model'
import {RpcError, mapVaultUnlockError, tauriRpc} from './welcome-rpc'
import type {NetworkPairedPeer} from '../remote/remote.model'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr
type RpcCommandResult<T> = RpcResult<T>
const DEFAULT_STORAGE_ROOT = 'storage'

export type WelcomeSetupStep =
  | 'mode-select'
  | 'create-master'
  | 'remote-connect'
  | 'remote-pair'
  | 'remote-wait'
  | null

export interface PasswordFeedback {
  score: number
  feedback: {
    warning: string
    suggestions: string[]
  }
}

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

class WelcomeModel {
  readonly busy = state(false)
  readonly restoreInProgress = state(false)
  readonly restoreCancelling = state(false)
  readonly errorText = state<string | null>(null)
  readonly shakeError = state(false)
  readonly isPrivacyMode = state(false)
  readonly setupStep = state<WelcomeSetupStep>(null)
  readonly passwordStrength = state<PasswordFeedback>({
    score: 0,
    feedback: {
      warning: '',
      suggestions: [],
    },
  })
  readonly creationState = state({
    p1: '',
    p2: '',
  })
  readonly remote = new WelcomeRemoteModel()
  private remoteSessionUnsubscribe: (() => void) | null = null

  private syncSetupStepFromRemoteSession(sessionState: RemoteSessionState) {
    if (sessionState === 'waiting_host_unlock') {
      this.setupStep.set('remote-wait')
      return
    }
    if (sessionState === 'ready' && this.setupStep() === 'remote-wait') {
      this.setupStep.set(null)
    }
  }

  connect = () => {
    this.remote.connect({
      onTransportLost: () => {
        if (this.setupStep() === 'remote-wait') {
          this.setupStep.set('remote-connect')
        }
      },
    })
    this.remoteSessionUnsubscribe?.()
    this.syncSetupStepFromRemoteSession(getAppContext().store.remoteSessionState())
    this.remoteSessionUnsubscribe = getAppContext().store.remoteSessionState.subscribe((sessionState) => {
      this.syncSetupStepFromRemoteSession(sessionState)
    })
  }

  disconnect = () => {
    this.remote.disconnect()
    this.remoteSessionUnsubscribe?.()
    this.remoteSessionUnsubscribe = null
  }

  get isNeedInit(): boolean {
    const s = getAppContext().state.data()
    return Boolean(s.NeedUserInitialization)
  }

  get storePath(): string {
    const s = getAppContext().state.data()
    return String(s.StorePath ?? '')
  }

  private setBusy(val: boolean, error: string | null = null) {
    this.busy.set(val)
    this.errorText.set(error)
    if (error) {
      this.triggerShake()
    }
  }

  ensureSetupStep = () => {
    if (this.isNeedInit && this.setupStep() === null) {
      this.setupStep.set('mode-select')
    }
  }

  private triggerShake() {
    this.shakeError.set(true)
    this.setTimeout(() => {
      this.shakeError.set(false)
    }, 500)
  }

  private setTimeout<T>(callback: () => T, timeout: number): number {
    return window.setTimeout(callback, timeout)
  }

  togglePrivacy = () => {
    this.isPrivacyMode.set(!this.isPrivacyMode())
  }

  private checkStrength(password: string): ReturnType<typeof zxcvbn> {
    const result = zxcvbn(password)
    this.passwordStrength.set({
      score: result.score,
      feedback: {
        warning: result.feedback.warning,
        suggestions: result.feedback.suggestions || [],
      },
    })
    return result
  }

  handleMasterPasswordInput = (e: Event) => {
    const event = e as CustomEvent<{value?: string}>
    const target = e.target as {value?: string} | null
    const val = event.detail?.value ?? target?.value ?? ''
    const state = this.creationState()
    this.creationState.set({...state, p1: val})
    this.checkStrength(val)
  }

  handleMasterPasswordConfirmInput = (e: Event) => {
    const event = e as CustomEvent<{value?: string}>
    const target = e.target as {value?: string} | null
    const val = event.detail?.value ?? target?.value ?? ''
    const state = this.creationState()
    this.creationState.set({...state, p2: val})
  }

  submitMasterSetup = async () => {
    if (this.busy()) return
    const {p1, p2} = this.creationState()

    if (!p1) {
      this.setBusy(false, 'Master Password is required')
      return
    }

    if (p1.length < 12) {
      this.setBusy(false, 'Master Password must be 12+ chars')
      return
    }

    if (p1 !== p2) {
      this.setBusy(false, 'Master Passwords do not match')
      return
    }

    try {
      this.setBusy(true)
      await tauriRpc('master:setup', {master_password: p1})
      getAppContext().state.update({NeedUserInitialization: false})
      getAppContext().store.pushNotification('success', 'Storage created! Now unlock your vault.')
      this.setupStep.set(null)
      this.creationState.set({p1: '', p2: ''})
      this.passwordStrength.set({
        score: 0,
        feedback: {
          warning: '',
          suggestions: [],
        },
      })
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      this.setBusy(false, errorMsg)
    } finally {
      this.setBusy(false)
    }
  }

  onUnlock = async () => {
    if (!isTauriRuntime()) return
    if (this.busy()) return

    const pwd = await dialogService.showInputDialog({
      title: i18n('onboard:hero:unlock'),
      label: 'Vault Password',
      type: 'password',
      required: true,
    })
    if (!pwd) return

    try {
      this.setBusy(true)
      await tauriRpc('vault:unlock', {password: pwd})
      getAppContext().state.update({StorageOpened: true})
      getAppContext().store.pushNotification('success', 'Vault unlocked')
    } catch (e) {
      console.error(e)
      const errorMsg =
        e instanceof RpcError
          ? mapVaultUnlockError(e.code, 'Unable to access vault')
          : 'Unable to access vault'
      this.setBusy(false, errorMsg)
    } finally {
      this.setBusy(false)
    }
  }

  onBackupClick = async () => {
    if (!isTauriRuntime()) return
    if (this.busy()) return

    const targetDir = await open({
      directory: true,
      multiple: false,
      title: 'Select Backup Destination',
      defaultPath: this.storePath || undefined,
    })
    if (!targetDir) return

    const pwd = await dialogService.showInputDialog({
      title: i18n('backup:title'),
      label: 'Master Password',
      type: 'password',
      required: true,
    })
    if (!pwd) return

    try {
      this.setBusy(true)
      const res = await tauriInvoke<RpcCommandResult<{backup_dir: string}>>('backup_local_create', {
        masterPassword: pwd,
        targetDir,
      })

      if (!isOk(res)) throw new Error(res.error)

      getAppContext().store.pushNotification('success', `Backup created at: ${res.result.backup_dir}`)
    } catch (e) {
      getAppContext().store.pushNotification('error', e instanceof Error ? e.message : String(e))
    } finally {
      this.setBusy(false)
    }
  }

  onRestoreClick = async () => {
    if (!isTauriRuntime()) return
    if (this.busy()) return

    const confirmed = await dialogService.showConfirmDialog({
      title: i18n('restore:title'),
      message: i18n('onboard:restore:warning'),
      confirmText: 'Continue',
      confirmVariant: 'danger',
    })
    if (!confirmed) return

    const backupPath = await open({
      directory: true,
      multiple: false,
      title: 'Select Backup Folder',
      defaultPath: this.storePath || undefined,
    })
    if (!backupPath) return

    const pwd = await dialogService.showInputDialog({
      title: 'Restore',
      label: 'Master Password',
      type: 'password',
      required: true,
    })
    if (!pwd) return

    try {
      this.restoreInProgress.set(true)
      this.restoreCancelling.set(false)
      this.setBusy(true)
      const res = await tauriInvoke<RpcCommandResult<unknown>>('restore_local_from_folder', {
        masterPassword: pwd,
        backupPath: backupPath,
      })

      if (!isOk(res)) {
        if (res.code === 'CANCELLED') {
          getAppContext().store.pushNotification('info', 'Restore cancelled')
        } else {
          throw new Error(res.error)
        }
      } else {
        getAppContext().store.pushNotification('success', i18n('onboard:restore:success'))
      }
    } catch (e) {
      getAppContext().store.pushNotification('error', e instanceof Error ? e.message : String(e))
    } finally {
      this.restoreInProgress.set(false)
      this.restoreCancelling.set(false)
      this.setBusy(false)
    }
  }

  cancelRestore = async () => {
    if (!isTauriRuntime()) return
    if (!this.restoreInProgress()) return
    if (this.restoreCancelling()) return

    this.restoreCancelling.set(true)

    try {
      const res =
        await tauriInvoke<RpcCommandResult<{cancelled: boolean; operation: string}>>('restore_local_cancel')
      if (!isOk(res)) {
        this.restoreCancelling.set(false)
        getAppContext().store.pushNotification('error', res.error || 'Failed to request restore cancellation')
      }
    } catch (e) {
      this.restoreCancelling.set(false)
      getAppContext().store.pushNotification('error', e instanceof Error ? e.message : String(e))
    }
  }

  onEraseClick = async () => {
    if (!isTauriRuntime()) return
    if (this.busy()) return

    const confirmed = await dialogService.showConfirmDialog({
      title: 'Erase Device',
      message: i18n('onboard:erase:confirm:text'),
      confirmText: i18n('button:erase'),
      confirmVariant: 'danger',
    })
    if (!confirmed) return

    const pwd = await dialogService.showInputDialog({
      title: 'Erase Device',
      label: 'Master Password',
      type: 'password',
      required: true,
    })
    if (!pwd) return

    try {
      this.setBusy(true)
      const res = await tauriInvoke<RpcCommandResult<unknown>>('erase_device', {
        masterPassword: pwd,
        confirm: true,
      })
      if (!isOk(res)) throw new Error(res.error)
      getAppContext().store.pushNotification('success', 'Device erased')
    } catch (e) {
      getAppContext().store.pushNotification('error', e instanceof Error ? e.message : String(e))
    } finally {
      this.setBusy(false)
    }
  }

  onChangeStorePath = async () => {
    if (!isTauriRuntime()) return
    if (this.busy()) return
    const next = await open({
      directory: true,
      multiple: false,
      title: 'Select Storage Folder',
      defaultPath: this.storePath || undefined,
    })
    if (!next) return

    try {
      this.setBusy(true)
      const res = await tauriInvoke<RpcCommandResult<{storage_root: string}>>('storage_set_root', {
        storageRoot: next,
      })
      if (!isOk(res)) throw new Error(res.error)
      getAppContext().state.update({StorePath: res.result.storage_root, StorageOpened: false})
    } catch (e) {
      this.setBusy(false, e instanceof Error ? e.message : String(e))
    } finally {
      this.setBusy(false)
    }
  }

  onUseDefaultStorePath = async () => {
    if (!isTauriRuntime()) return
    if (this.busy()) return

    try {
      this.setBusy(true)
      const res = await tauriInvoke<RpcCommandResult<{storage_root: string}>>('storage_set_root', {
        storageRoot: DEFAULT_STORAGE_ROOT,
      })
      if (!isOk(res)) throw new Error(res.error)
      getAppContext().state.update({StorePath: res.result.storage_root, StorageOpened: false})
    } catch (e) {
      this.setBusy(false, e instanceof Error ? e.message : String(e))
    } finally {
      this.setBusy(false)
    }
  }

  onPrintKit = () => {
    window.print()
  }

  onSelectLocalMode = () => {
    this.setupStep.set('create-master')
  }

  onSelectRemoteMode = () => {
    const caps = getRuntimeCapabilities()
    if (!isTauriRuntime() || !caps.desktop || !caps.supports_network_remote) {
      getAppContext().store.pushNotification('info', 'Remote mode is not available on this device')
      return
    }

    this.errorText.set(null)
    this.setupStep.set('remote-connect')
    void this.remote.loadPeers()
  }

  onBackToModeSelect = () => {
    this.setupStep.set('mode-select')
    this.errorText.set(null)
    this.creationState.set({p1: '', p2: ''})
    this.passwordStrength.set({
      score: 0,
      feedback: {
        warning: '',
        suggestions: [],
      },
    })
  }

  onOpenRemotePair = () => {
    this.errorText.set(null)
    this.remote.pausePeerPolling()
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

  onRemoteOfferInput = (e: Event) => {
    const target = e.target as {value?: string} | null
    this.remote.pairModel.setOfferInput(target?.value ?? '')
  }

  onRemotePinInput = (e: Event) => {
    const target = e.target as {value?: string} | null
    this.remote.pairModel.setPinInput(target?.value ?? '')
  }

  onRemoteDeviceLabelInput = (e: Event) => {
    const target = e.target as {value?: string} | null
    this.remote.pairModel.setDeviceLabel(target?.value ?? '')
  }

  onRefreshRemotePeers = () => {
    void this.remote.loadPeers()
  }

  onSubmitRemotePair = () => {
    void this.submitRemotePair()
  }

  onConnectRemotePeer = (peerId: string) => {
    void this.connectRemotePeer(peerId)
  }

  onRemoveRemotePeer = (peer: NetworkPairedPeer) => {
    void this.removeRemotePeer(peer)
  }

  private async submitRemotePair(): Promise<void> {
    this.errorText.set(null)
    const success = await this.remote.submitPairing()
    if (!success) {
      this.errorText.set(this.remote.errorText())
      return
    }
    this.setupStep.set('remote-connect')
  }

  private async connectRemotePeer(peerId: string): Promise<void> {
    this.errorText.set(null)
    const success = await this.remote.connectToPeer(peerId)
    if (!success) {
      this.errorText.set(this.remote.errorText())
      return
    }
    this.setupStep.set('remote-wait')
  }

  private async removeRemotePeer(peer: NetworkPairedPeer): Promise<void> {
    this.errorText.set(null)
    const removed = await this.remote.removePeer(peer)
    if (!removed && this.remote.errorText()) {
      this.errorText.set(this.remote.errorText())
    }
  }

  private async backFromRemoteConnect(): Promise<void> {
    await this.remote.exitPreAuthRemote()
    this.errorText.set(null)
    this.setupStep.set(this.isNeedInit ? 'mode-select' : null)
  }

  private async backFromRemotePair(): Promise<void> {
    await this.remote.cancelPairing()
    await this.remote.loadPeers()
    this.errorText.set(null)
    this.setupStep.set('remote-connect')
  }

  private async backFromRemoteWait(): Promise<void> {
    await this.remote.disconnectTransport()
    await this.remote.loadPeers()
    this.errorText.set(null)
    this.setupStep.set('remote-connect')
  }

  getHeroTitle(isNeedInit: boolean): string {
    if (this.setupStep() === 'remote-connect') return 'Connect Remote Vault'
    if (this.setupStep() === 'remote-pair') return 'Pair iPhone'
    if (this.setupStep() === 'remote-wait') return 'Waiting For iPhone Vault'
    if (!isNeedInit) return i18n('onboard:hero:unlock')
    if (this.setupStep() === 'create-master') return 'Create Local Storage'
    return i18n('onboard:hero:create')
  }

  getHeroDesc(isNeedInit: boolean): string {
    if (this.setupStep() === 'remote-connect') {
      return 'Connect to a paired iPhone host before opening the vault on this desktop.'
    }
    if (this.setupStep() === 'remote-pair') {
      return 'Paste the pairing offer from your iPhone and confirm it with the displayed PIN.'
    }
    if (this.setupStep() === 'remote-wait') {
      return 'Transport is ready. Open the vault on your iPhone to continue into the remote dashboard.'
    }
    if (!isNeedInit) return 'Your device is locked. Enter your Vault Password to access data.'
    if (this.setupStep() === 'create-master') return 'Set up your master password to secure your storage.'
    return 'Welcome to ChromVoid. Choose how you want to store your data.'
  }
}

export {WelcomeModel, RpcError, mapVaultUnlockError, tauriRpc}
