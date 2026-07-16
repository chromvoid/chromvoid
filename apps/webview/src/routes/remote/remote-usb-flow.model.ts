import {atom, computed, wrap} from '@reatom/core'

import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {i18n} from 'root/i18n'
import {tryGetAppContext} from 'root/shared/services/app-context'

import {
  mobileUsbConfirmPairing,
  mobileUsbConnect,
  mobileUsbDetect,
  mobileUsbDisconnect,
  mobileUsbListPaired,
  mobileUsbPair,
  mobileUsbRemovePaired,
  mobileUsbScan,
  mobileUsbStatus,
} from './remote.model'
import type {
  MobileUsbDetectedDevice,
  MobileUsbErrorCode,
  MobileUsbHostView,
  MobileUsbPairRequest,
  MobileUsbPairingApprovalView,
  MobileUsbRecoveryAction,
  MobileUsbScanClassification,
  MobileUsbScannedHost,
  MobileUsbStatus,
} from './remote.model'

export type MobileUsbFlowState =
  | 'unsupported'
  | 'idle'
  | 'scanning'
  | 'unpaired'
  | 'paired'
  | 'pairing'
  | 'pairing_approval'
  | 'session_approval'
  | 'connecting'
  | 'waiting_host_unlock'
  | 'ready'
  | 'disconnected'
  | 'recovery'
  | 'error'

export type MobileUsbScanClassificationKind = 'unpaired' | 'paired' | 'broken_local_state' | 'ambiguous'
export type MobileUsbPendingAction =
  | 'refresh_status'
  | 'scan'
  | 'load_paired'
  | 'pair'
  | 'pair_confirm'
  | 'connect'
  | 'disconnect'
  | 'remove'

export interface MobileUsbScannedHostView {
  source: MobileUsbScannedHost
  label: string | null
  platform: string
  classification: MobileUsbScanClassificationKind
  pairedHostId: string | null
  brokenHostId: string | null
  canPair: boolean
  canConnect: boolean
  canRemoveBroken: boolean
  canListPaired: boolean
}

export interface MobileUsbDetectedDeviceView {
  source: MobileUsbDetectedDevice
  label: string
  platform: string
  accessoryMode: boolean
  pairedHostId: string | null
  pairedLabel: string | null
  connectable: boolean
}

export interface MobileUsbPairedHostViewModel {
  source: MobileUsbHostView
  label: string
  platform: string
  pairingState: MobileUsbHostView['pairing_state']
  canConnect: boolean
  canRemove: boolean
}

const MOBILE_USB_ERROR_RECOVERY_ACTIONS: Record<MobileUsbErrorCode, MobileUsbRecoveryAction> = {
  ERR_USB_MOBILE_UNSUPPORTED_PLATFORM: 'hide_usb_entry',
  ERR_USB_MOBILE_IOS_MFI_REQUIRED: 'hide_usb_entry',
  ERR_USB_MOBILE_BUSY: 'wait_in_flight',
  ERR_USB_MOBILE_INVALID_STATE: 'keep_current_flow',
  ERR_USB_MOBILE_BRIDGE_UNAVAILABLE: 'manual_retry',
  ERR_USB_MOBILE_NO_ACCESSORY: 'retry_scan',
  ERR_USB_MOBILE_PERMISSION_DENIED: 'retry_permission',
  ERR_USB_MOBILE_AMBIGUOUS_DISCOVERY: 'list_paired',
  ERR_USB_MOBILE_NOT_PAIRED: 'pair_host',
  ERR_USB_MOBILE_PAIRING_DUPLICATE: 'connect_existing',
  ERR_USB_MOBILE_HANDSHAKE_FAILED: 'manual_retry',
  ERR_USB_MOBILE_STALE_PAIRING: 'remove_and_repair',
  ERR_USB_MOBILE_SECRET_STORE_UNAVAILABLE: 'manual_retry',
  ERR_USB_MOBILE_SECRET_REF_INVALID: 'remove_and_repair',
  ERR_USB_MOBILE_PAIR_COMMIT_FAILED: 'manual_retry',
  ERR_USB_MOBILE_PAIRING_STORE_CORRUPT: 'manual_retry',
  ERR_USB_MOBILE_PAIRING_APPROVAL_REQUIRED: 'keep_current_flow',
  ERR_USB_MOBILE_PAIRING_APPROVAL_REJECTED: 'keep_current_flow',
  ERR_USB_MOBILE_PAIRING_APPROVAL_EXPIRED: 'manual_retry',
  ERR_USB_MOBILE_RECORD_LAYER_FAILED: 'manual_retry',
  ERR_USB_MOBILE_CABLE_DISCONNECTED: 'disconnect_before_retry',
  ERR_USB_MOBILE_HOST_LOCKED: 'wait_for_host_unlock',
  ERR_USB_MOBILE_UNLOCK_NOT_AUTHENTICATED: 'ignore_stale_unlock',
  ERR_USB_MOBILE_WRITER_LOCKED: 'continue_read_only',
}

const MOBILE_USB_ERROR_CODES = Object.keys(MOBILE_USB_ERROR_RECOVERY_ACTIONS) as MobileUsbErrorCode[]

function getRuntimeMobileUsbAvailable(): boolean {
  const capabilities = getRuntimeCapabilities()
  return capabilities.desktop && capabilities.supports_mobile_usb_remote
}

function getClassificationKind(classification: MobileUsbScanClassification): MobileUsbScanClassificationKind {
  if (classification === 'unpaired' || classification === 'ambiguous') return classification
  if ('paired' in classification) return 'paired'
  return 'broken_local_state'
}

function getClassificationHostId(classification: MobileUsbScanClassification): string | null {
  if (classification !== 'unpaired' && classification !== 'ambiguous' && 'paired' in classification) {
    return classification.paired.host_id
  }
  if (
    classification !== 'unpaired' &&
    classification !== 'ambiguous' &&
    'broken_local_state' in classification
  ) {
    return classification.broken_local_state.host_id
  }
  return null
}

function getErrorCode(error: unknown): MobileUsbErrorCode | null {
  const message = error instanceof Error ? error.message : String(error)
  return MOBILE_USB_ERROR_CODES.find((code) => message.includes(code)) ?? null
}

function formatMobileUsbErrorText(code: MobileUsbErrorCode | null, fallback: string): string {
  if (code === 'ERR_USB_MOBILE_UNSUPPORTED_PLATFORM' || code === 'ERR_USB_MOBILE_IOS_MFI_REQUIRED') {
    return `${i18n('remote:usb-mobile-error-unavailable')} (${code})`
  }
  if (code === 'ERR_USB_MOBILE_PERMISSION_DENIED') {
    return `${i18n('remote:usb-mobile-error-permission-denied')} (${code})`
  }
  if (code === 'ERR_USB_MOBILE_STALE_PAIRING' || code === 'ERR_USB_MOBILE_SECRET_REF_INVALID') {
    return `${i18n('remote:usb-mobile-error-remove-and-repair')} (${code})`
  }
  if (code === 'ERR_USB_MOBILE_CABLE_DISCONNECTED') {
    return `${i18n('remote:usb-mobile-error-cable-disconnected')} (${code})`
  }
  if (code === 'ERR_USB_MOBILE_BUSY') {
    return `${i18n('remote:usb-mobile-error-busy')} (${code})`
  }
  if (code) return `${i18n('remote:usb-mobile-error-generic')} (${code})`
  return fallback
}

export class RemoteUsbFlowModel {
  readonly status = atom<MobileUsbStatus | null>(null)
  readonly scanResults = atom<MobileUsbScannedHost[]>([])
  readonly scanFoundNothing = atom(false)
  readonly detectedDevices = atom<MobileUsbDetectedDevice[]>([])
  readonly detectingDevices = atom(false)
  readonly pairedHosts = atom<MobileUsbHostView[]>([])
  readonly busy = atom(false)
  readonly pendingAction = atom<MobileUsbPendingAction | null>(null)
  readonly errorText = atom<string | null>(null)
  readonly lastErrorCode = atom<MobileUsbErrorCode | null>(null)
  readonly pairingApprovalPin = atom('')

  readonly available = computed<boolean>(() => getRuntimeMobileUsbAvailable())
  readonly availableTransports = computed<Array<'usb_mobile'>>(
    () => this.status()?.available_transports ?? [],
  )
  readonly selectedTransport = computed<string | null>(() => this.status()?.selected_transport ?? null)
  readonly fallbackAllowed = computed<boolean>(() => Boolean(this.status()?.fallback_allowed))
  readonly inFlight = computed<MobileUsbStatus['in_flight']>(() => this.status()?.in_flight ?? null)
  readonly actionBusy = computed<boolean>(() => this.busy() || this.inFlight() !== null)
  readonly pairingApproval = computed<MobileUsbPairingApprovalView | null>(
    () => this.status()?.pairing_approval ?? null,
  )
  readonly canConfirmPairing = computed<boolean>(() => {
    const approval = this.pairingApproval()
    const pin = this.pairingApprovalPin()
    return approval !== null && /^\d{6}$/.test(pin) && !this.actionBusy()
  })
  readonly activeErrorCode = computed<MobileUsbErrorCode | null>(
    () => this.lastErrorCode() ?? this.status()?.error_code ?? null,
  )
  readonly recoveryAction = computed<MobileUsbRecoveryAction | null>(() => {
    const code = this.activeErrorCode()
    return code ? MOBILE_USB_ERROR_RECOVERY_ACTIONS[code] : null
  })
  readonly scannedHostViews = computed<MobileUsbScannedHostView[]>(() => {
    return this.scanResults().map((source) => {
      const classification = getClassificationKind(source.classification)
      const hostId = getClassificationHostId(source.classification)

      return {
        source,
        label: source.scan.label ?? source.scan.usb_hint.model ?? source.scan.usb_hint.manufacturer ?? null,
        platform: source.scan.platform,
        classification,
        pairedHostId: classification === 'paired' ? hostId : null,
        brokenHostId: classification === 'broken_local_state' ? hostId : null,
        canPair: classification === 'unpaired',
        canConnect: classification === 'paired' && hostId !== null,
        canRemoveBroken: classification === 'broken_local_state' && hostId !== null,
        canListPaired: classification === 'ambiguous',
      }
    })
  })
  readonly detectedDeviceViews = computed<MobileUsbDetectedDeviceView[]>(() => {
    return this.detectedDevices().map((source) => {
      return {
        source,
        label:
          source.paired_match?.label ??
          source.scan.label ??
          source.scan.usb_hint.model ??
          source.scan.usb_hint.manufacturer ??
          source.scan.platform,
        platform: source.scan.platform,
        accessoryMode: source.accessory_mode,
        pairedHostId: source.paired_match?.host_id ?? null,
        pairedLabel: source.paired_match?.label ?? null,
        connectable: source.paired_match?.connectable ?? false,
      }
    })
  })
  readonly pairedHostViews = computed<MobileUsbPairedHostViewModel[]>(() => {
    return this.pairedHosts().map((source) => {
      return {
        source,
        label: source.label || source.host_id,
        platform: source.platform,
        pairingState: source.pairing_state,
        canConnect: source.pairing_state === 'paired',
        canRemove: source.pairing_state === 'broken_local_state',
      }
    })
  })
  readonly flowState = computed<MobileUsbFlowState>(() => {
    if (!this.available()) return 'unsupported'

    switch (this.pendingAction()) {
      case 'scan':
        return 'scanning'
      case 'pair':
        return 'pairing'
      case 'pair_confirm':
        return 'pairing'
      case 'connect':
        return 'connecting'
      default:
        break
    }

    const status = this.status()
    if (status) {
      switch (status.session_state) {
        case 'scanning_usb_mobile':
          return 'scanning'
        case 'pairing_usb_mobile':
          return 'pairing'
        case 'pairing_approval_required':
          return 'pairing_approval'
        case 'connecting_usb_mobile':
          return 'connecting'
        case 'session_approval_required':
          return 'session_approval'
        case 'transport_ready_host_locked':
          return 'waiting_host_unlock'
        case 'remote_dashboard_open':
          return 'ready'
        case 'disconnected':
          return 'disconnected'
        case 'error':
          return status.error_code ? 'recovery' : 'error'
        case 'idle_usb_mobile':
        case 'locked_shell':
        case 'transport_select':
          break
      }
    }

    if (this.activeErrorCode()) return 'recovery'

    const scanned = this.scannedHostViews()
    if (
      scanned.some(
        (host) => host.classification === 'ambiguous' || host.classification === 'broken_local_state',
      )
    ) {
      return 'recovery'
    }
    if (scanned.some((host) => host.classification === 'unpaired')) return 'unpaired'
    const paired = this.pairedHostViews()
    if (paired.some((host) => host.canRemove)) return 'recovery'
    if (paired.length > 0 || scanned.some((host) => host.classification === 'paired')) return 'paired'
    return 'idle'
  })

  private activeSessionHostId: string | null = null

  async refreshStatus(): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    return await this.run('refresh_status', async () => {
      const status = await wrap(mobileUsbStatus())
      this.applyStatus(status)
    })
  }

  async scan(): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    this.scanFoundNothing.set(false)
    return await this.run('scan', async () => {
      const results = await wrap(mobileUsbScan())
      this.scanResults.set(results)
      this.scanFoundNothing.set(results.length === 0)
    })
  }

  /**
   * Passive inventory preview (`mobile_usb_detect`): safe on page mount and
   * hotplug events. Deliberately bypasses `run()` — it must not flash the busy
   * state or clobber errors of an explicit user action, and its own failures
   * stay silent because it is a background preview, not a user-initiated flow.
   */
  async refreshDetectedDevices(): Promise<boolean> {
    if (!this.available()) return false
    if (this.detectingDevices()) return false
    this.detectingDevices.set(true)
    try {
      this.detectedDevices.set(await wrap(mobileUsbDetect()))
      return true
    } catch {
      return false
    } finally {
      this.detectingDevices.set(false)
    }
  }

  scanAndConnectSingleHost(shouldContinue: () => boolean = () => true): Promise<boolean> {
    if (!shouldContinue()) return Promise.resolve(false)
    return this.scan().then((ok) => {
      if (!ok || !shouldContinue()) return false
      return this.connectSingleScannedHost()
    })
  }

  async connectSingleScannedHost(): Promise<boolean> {
    const [host, extraHost] = this.scannedHostViews()
    if (!host || extraHost) return false

    if (host.canPair) {
      return await this.pairScannedHost(host.source)
    }

    if (host.canConnect && host.pairedHostId) {
      return await this.connectPairedHost(host.pairedHostId)
    }

    if (host.canListPaired) {
      await this.loadPaired()
    }

    return false
  }

  async pairScannedHost(host: MobileUsbScannedHost): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    if (getClassificationKind(host.classification) !== 'unpaired') return false
    return await this.run('pair', async () => {
      const status = await wrap(
        mobileUsbPair({
          platform: host.scan.platform,
          bridge_kind: host.scan.bridge_kind,
          usb_hint: host.scan.usb_hint,
          label: host.scan.label ?? null,
        } satisfies MobileUsbPairRequest),
      )
      this.applyStatus(status)
    })
  }

  setPairingApprovalPin(value: string): void {
    this.pairingApprovalPin.set(value.replace(/\D+/g, '').slice(0, 6))
  }

  async confirmPairing(): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    const approval = this.pairingApproval()
    if (!approval || !this.canConfirmPairing()) return false
    return await this.run('pair_confirm', async () => {
      const status = await wrap(
        mobileUsbConfirmPairing({
          attempt_id: approval.attempt_id,
          approval_pin: this.pairingApprovalPin(),
        }),
      )
      this.applyStatus(status)
    })
  }

  async connectPairedHost(hostId: string): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    if (!hostId.trim()) return false
    return await this.run('connect', async () => {
      const status = await wrap(mobileUsbConnect(hostId))
      this.applyStatus(status, hostId)
    })
  }

  async disconnect(): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    return await this.run('disconnect', async () => {
      const activeHostId = this.status()?.active_host?.host_id ?? null
      const status = await wrap(mobileUsbDisconnect())
      this.applyStatus(status, activeHostId)
    })
  }

  async loadPaired(): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    return await this.run('load_paired', async () => {
      this.pairedHosts.set(await wrap(mobileUsbListPaired()))
    })
  }

  async removePaired(hostId: string): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    if (!hostId.trim()) return false
    return await this.run('remove', async () => {
      this.pairedHosts.set(await wrap(mobileUsbRemovePaired(hostId)))
      this.scanResults.set(
        this.scanResults().filter((result) => getClassificationHostId(result.classification) !== hostId),
      )
    })
  }

  dismissError(): void {
    this.errorText.set(null)
    this.lastErrorCode.set(null)
  }

  applyStatusEvent(status: MobileUsbStatus): void {
    this.applyStatus(status)
  }

  private applyStatus(status: MobileUsbStatus, fallbackHostId: string | null = null): void {
    this.status.set(status)
    this.pairedHosts.set(status.paired_hosts)
    this.lastErrorCode.set(status.error_code)
    this.syncRemoteSessionState(status, fallbackHostId)
    if (status.error_code !== null) {
      this.errorText.set(formatMobileUsbErrorText(status.error_code, i18n('remote:usb-mobile-error-generic')))
    }
    if (status.pairing_approval === null) {
      this.pairingApprovalPin.set('')
    }
  }

  private blockIfUnavailable(): boolean {
    if (this.available()) return false
    this.lastErrorCode.set('ERR_USB_MOBILE_UNSUPPORTED_PLATFORM')
    this.errorText.set(
      formatMobileUsbErrorText(
        'ERR_USB_MOBILE_UNSUPPORTED_PLATFORM',
        i18n('remote:usb-mobile-error-unavailable'),
      ),
    )
    return true
  }

  private async run(action: MobileUsbPendingAction, task: () => Promise<void>): Promise<boolean> {
    if (this.busy()) return false
    this.busy.set(true)
    this.pendingAction.set(action)
    this.errorText.set(null)
    this.lastErrorCode.set(null)
    try {
      await task()
      return true
    } catch (error) {
      const code = getErrorCode(error)
      const message = error instanceof Error ? error.message : String(error)
      this.errorText.set(formatMobileUsbErrorText(code, message))
      this.lastErrorCode.set(code)
      return false
    } finally {
      this.pendingAction.set(null)
      this.busy.set(false)
    }
  }

  private syncRemoteSessionState(status: MobileUsbStatus, fallbackHostId: string | null): void {
    const store = tryGetAppContext()?.store as
      | {
          resetRemoteSession?: () => void
          setRemoteSessionPhoneApproval?: (peerId: string | null) => void
          setRemoteSessionReady?: (peerId: string | null) => void
          setRemoteSessionWaiting?: (peerId: string | null) => void
        }
      | undefined
    if (!store) return

    const peerId = status.active_host?.host_id ?? fallbackHostId ?? this.activeSessionHostId
    switch (status.session_state) {
      case 'session_approval_required':
        this.activeSessionHostId = peerId
        store.setRemoteSessionPhoneApproval?.(peerId)
        break
      case 'transport_ready_host_locked':
        this.activeSessionHostId = peerId
        store.setRemoteSessionWaiting?.(peerId)
        break
      case 'remote_dashboard_open':
        this.activeSessionHostId = peerId
        store.setRemoteSessionReady?.(peerId)
        break
      case 'disconnected':
      case 'error':
        if (peerId) {
          store.resetRemoteSession?.()
        }
        this.activeSessionHostId = null
        break
      case 'idle_usb_mobile':
      case 'locked_shell':
      case 'transport_select':
      case 'scanning_usb_mobile':
      case 'pairing_usb_mobile':
      case 'pairing_approval_required':
      case 'connecting_usb_mobile':
        break
    }
  }
}
