import {action, atom, computed, isAbort, sleep, withAbort, wrap} from '@reatom/core'

import {runtimeCapabilitiesAtom} from 'root/core/runtime/runtime-capabilities'
import {subscribeToSignalChanges} from 'root/shared/services/subscribed-signal'
import {
  type MobileUsbHostPairingApprovalView,
  type MobileUsbHostSessionApprovalView,
  mobileUsbHostApprovePairing,
  mobileUsbHostApproveSession,
  mobileUsbHostPendingPairingApproval,
  mobileUsbHostPendingSessionApproval,
  mobileUsbHostRejectPairing,
  mobileUsbHostRejectSession,
  onMobileUsbHostApprovalResolved,
  onMobileUsbHostPairingApprovalRequired,
  onMobileUsbHostSessionApprovalRequired,
} from 'root/routes/remote/remote.model'

export type MobileUsbHostApprovalKind = 'pairing' | 'session'

function visiblePairingApproval(
  approval: MobileUsbHostPairingApprovalView | null,
): MobileUsbHostPairingApprovalView | null {
  if (approval?.decision === 'rejected') return null
  return approval
}

function visibleSessionApproval(
  approval: MobileUsbHostSessionApprovalView | null,
): MobileUsbHostSessionApprovalView | null {
  if (approval?.decision !== 'pending' || approval.expires_at_ms <= Date.now()) return null
  return approval
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class MobileUsbHostApprovalModel {
  readonly pairingApproval = atom<MobileUsbHostPairingApprovalView | null>(
    null,
    'mobileUsbHostApproval.pairingApproval',
  )
  readonly sessionApproval = atom<MobileUsbHostSessionApprovalView | null>(
    null,
    'mobileUsbHostApproval.sessionApproval',
  )
  readonly busy = atom(false, 'mobileUsbHostApproval.busy')
  readonly errorText = atom<string | null>(null, 'mobileUsbHostApproval.errorText')

  readonly activeKind = computed((): MobileUsbHostApprovalKind | null => {
    if (this.pairingApproval()) return 'pairing'
    if (this.sessionApproval()) return 'session'
    return null
  }, 'mobileUsbHostApproval.activeKind')

  readonly visible = computed(() => this.activeKind() !== null, 'mobileUsbHostApproval.visible')

  private connected = false
  private nativeBridgeConnected = false
  private refreshEpoch = 0
  private eventUnlisteners: Array<() => void> = []
  private unsubscribeRuntimeCapabilities?: () => void
  private readonly expireSessionApproval = action(async (approval: MobileUsbHostSessionApprovalView) => {
    await wrap(sleep(Math.max(0, approval.expires_at_ms - Date.now())))
    if (!this.nativeBridgeConnected || this.sessionApproval()?.attempt_id !== approval.attempt_id) return
    this.sessionApproval.set(null)
  }, 'mobileUsbHostApproval.expireSessionApproval').extend(withAbort())

  connect(): void {
    if (this.connected) return
    this.connected = true
    this.unsubscribeRuntimeCapabilities = subscribeToSignalChanges(
      runtimeCapabilitiesAtom,
      () => this.syncNativeBridge(),
      {readSnapshot: () => Boolean(runtimeCapabilitiesAtom().mobile)},
    )
    this.syncNativeBridge()
  }

  disconnect(): void {
    if (!this.connected) return
    this.connected = false
    this.unsubscribeRuntimeCapabilities?.()
    this.unsubscribeRuntimeCapabilities = undefined
    this.stopNativeBridge({clearState: true})
  }

  async refreshPendingApprovals(): Promise<void> {
    if (!this.nativeBridgeConnected) return
    const refreshEpoch = ++this.refreshEpoch

    try {
      const [pairingApproval, sessionApproval] = await wrap(
        Promise.all([mobileUsbHostPendingPairingApproval(), mobileUsbHostPendingSessionApproval()]),
      )
      if (!this.nativeBridgeConnected || refreshEpoch !== this.refreshEpoch) return

      const nextPairingApproval = visiblePairingApproval(pairingApproval)
      const nextSessionApproval = nextPairingApproval
        ? null
        : visibleSessionApproval(sessionApproval)
      this.pairingApproval.set(nextPairingApproval)
      this.sessionApproval.set(nextSessionApproval)
      this.expireSessionApproval.abort()
      if (nextSessionApproval) {
        void this.expireSessionApproval(nextSessionApproval).catch((error) => {
          if (!isAbort(error)) {
            console.warn('[mobile-usb-host] session approval expiry task failed', error)
          }
        })
      }
      if (nextPairingApproval || nextSessionApproval) {
        this.errorText.set(null)
      }
    } catch (error) {
      console.warn('[mobile-usb-host] pending approval refresh failed', error)
    }
  }

  async approvePairing(): Promise<void> {
    await this.resolvePairingApproval(true)
  }

  async rejectPairing(): Promise<void> {
    await this.resolvePairingApproval(false)
  }

  async approveSession(): Promise<void> {
    await this.resolveSessionApproval(true)
  }

  async rejectSession(): Promise<void> {
    await this.resolveSessionApproval(false)
  }

  private syncNativeBridge(): void {
    if (!this.connected) return

    if (runtimeCapabilitiesAtom().mobile) {
      this.startNativeBridge()
      return
    }

    this.stopNativeBridge({clearState: true})
  }

  private startNativeBridge(): void {
    if (this.nativeBridgeConnected) return
    this.nativeBridgeConnected = true
    window.addEventListener('focus', this.handleForeground)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    this.setupNativeListeners()
    void this.refreshPendingApprovals()
  }

  private stopNativeBridge({clearState = false}: {clearState?: boolean} = {}): void {
    this.refreshEpoch += 1
    if (this.nativeBridgeConnected) {
      window.removeEventListener('focus', this.handleForeground)
      document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    }
    this.nativeBridgeConnected = false
    this.teardownNativeListeners()
    this.expireSessionApproval.abort()

    if (clearState) {
      this.pairingApproval.set(null)
      this.sessionApproval.set(null)
      this.busy.set(false)
      this.errorText.set(null)
    }
  }

  private setupNativeListeners(): void {
    const guard = (promise: Promise<() => void>) => {
      promise
        .then((unlisten) => {
          if (!this.nativeBridgeConnected) {
            unlisten()
            return
          }
          this.eventUnlisteners.push(unlisten)
        })
        .catch((error) => {
          console.warn('[mobile-usb-host] approval listener setup failed', error)
        })
    }

    guard(onMobileUsbHostPairingApprovalRequired(wrap(() => void this.refreshPendingApprovals())))
    guard(onMobileUsbHostSessionApprovalRequired(wrap(() => void this.refreshPendingApprovals())))
    guard(onMobileUsbHostApprovalResolved(wrap(() => void this.refreshPendingApprovals())))
  }

  private teardownNativeListeners(): void {
    for (const unlisten of this.eventUnlisteners) unlisten()
    this.eventUnlisteners = []
  }

  private readonly handleForeground = (): void => {
    void this.refreshPendingApprovals()
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      void this.refreshPendingApprovals()
    }
  }

  private async resolvePairingApproval(approve: boolean): Promise<void> {
    const approval = this.pairingApproval()
    if (!approval || this.busy()) return

    this.busy.set(true)
    this.errorText.set(null)

    try {
      if (approve) {
        await wrap(mobileUsbHostApprovePairing(approval.attempt_id))
      } else {
        await wrap(mobileUsbHostRejectPairing(approval.attempt_id))
      }

      if (this.pairingApproval()?.attempt_id === approval.attempt_id) {
        this.pairingApproval.set(approve ? {...approval, decision: 'approved'} : null)
      }
      await this.refreshPendingApprovals()
    } catch (error) {
      this.errorText.set(formatError(error))
    } finally {
      this.busy.set(false)
    }
  }

  private async resolveSessionApproval(approve: boolean): Promise<void> {
    const approval = this.sessionApproval()
    if (!approval || this.busy()) return

    this.busy.set(true)
    this.errorText.set(null)

    try {
      if (approve) {
        await wrap(mobileUsbHostApproveSession(approval.attempt_id))
      } else {
        await wrap(mobileUsbHostRejectSession(approval.attempt_id))
      }

      if (this.sessionApproval()?.attempt_id === approval.attempt_id) {
        this.sessionApproval.set(null)
        this.expireSessionApproval.abort()
      }
      await this.refreshPendingApprovals()
    } catch (error) {
      this.errorText.set(formatError(error))
    } finally {
      this.busy.set(false)
    }
  }
}

export const mobileUsbHostApprovalModel = new MobileUsbHostApprovalModel()
