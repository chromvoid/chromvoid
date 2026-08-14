import {atom, computed, wrap} from '@reatom/core'

import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {i18n} from 'root/i18n'
import {tryGetAppContext} from 'root/shared/services/app-context'

import {
  deriveDesktopUsbSummaryPresentation,
  type DesktopUsbSummaryPresentation,
} from './remote-desktop-preauth.contract'
import {
  deriveDesktopUsbPresentation,
  type DesktopUsbAction,
  type DesktopUsbPairedRow,
  type DesktopUsbPresentation,
  type DesktopUsbScannedRow,
  type DesktopUsbUiAction,
  type MobileUsbFlowState,
} from './remote-usb-desktop-presentation'
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

export type MobileUsbScannedHostView = DesktopUsbScannedRow

export interface MobileUsbDetectedDeviceView {
  source: MobileUsbDetectedDevice
  label: string
  platform: string
  accessoryMode: boolean
  pairedHostId: string | null
  pairedLabel: string | null
  pairingState: 'confirmed' | 'incomplete' | null
}

export type MobileUsbPairedHostViewModel = DesktopUsbPairedRow

export type {
  DesktopUsbAction,
  DesktopUsbPresentation,
  DesktopUsbRecoveryCta,
  DesktopUsbUiAction,
  MobileUsbFlowState,
} from './remote-usb-desktop-presentation'

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
  ERR_USB_MOBILE_SESSION_APPROVAL_EXPIRED: 'manual_retry',
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
  readonly status = atom<MobileUsbStatus | null>(null, 'remote.usb.status')
  readonly lastActiveHost = atom<MobileUsbHostView | null>(null, 'remote.usb.lastActiveHost')
  readonly scanResults = atom<MobileUsbScannedHost[]>([], 'remote.usb.scanResults')
  readonly scanFoundNothing = atom(false, 'remote.usb.scanFoundNothing')
  readonly detectedDevices = atom<MobileUsbDetectedDevice[]>([], 'remote.usb.detectedDevices')
  readonly detectingDevices = atom(false, 'remote.usb.detectingDevices')
  readonly pairedHosts = atom<MobileUsbHostView[]>([], 'remote.usb.pairedHosts')
  readonly busy = atom(false, 'remote.usb.busy')
  readonly pendingAction = atom<MobileUsbPendingAction | null>(null, 'remote.usb.pendingAction')
  readonly errorText = atom<string | null>(null, 'remote.usb.errorText')
  readonly lastErrorCode = atom<MobileUsbErrorCode | null>(null, 'remote.usb.lastErrorCode')
  readonly dismissedErrorCode = atom<MobileUsbErrorCode | null>(null, 'remote.usb.dismissedErrorCode')
  readonly pairingApprovalPin = atom('', 'remote.usb.pairingApprovalPin')
  readonly pairingApprovalSubmitAttempted = atom(false, 'remote.usb.pairingApprovalSubmitAttempted')
  readonly pairingApprovalPinFocusRequest = atom(0, 'remote.usb.pairingApprovalPinFocusRequest')
  readonly lastFailedAction = atom<DesktopUsbAction | null>(null, 'remote.usb.lastFailedAction')
  private readonly repairScanHostId = atom<string | null>(null, 'remote.usb.repairScanHostId')
  private inventoryActive = false
  private inventoryGeneration = 0

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
  readonly pairingApprovalPinError = computed<string | null>(() => {
    if (!this.pairingApprovalSubmitAttempted()) return null
    const pin = this.pairingApprovalPin()
    if (!pin) return i18n('network-pair:error-pin-required')
    if (!/^\d{6}$/.test(pin)) return i18n('network-pair:error-pin-format')
    return null
  }, 'remote.usb.pairingApprovalPinError')
  readonly canConfirmPairing = computed<boolean>(() => {
    const approval = this.pairingApproval()
    return approval !== null && !this.actionBusy()
  })
  readonly activeErrorCode = computed<MobileUsbErrorCode | null>(() => {
    const code = this.lastErrorCode() ?? this.status()?.error_code ?? null
    return code === this.dismissedErrorCode() ? null : code
  })
  readonly recoveryAction = computed<MobileUsbRecoveryAction | null>(() => {
    const code = this.activeErrorCode()
    if (code) return MOBILE_USB_ERROR_RECOVERY_ACTIONS[code]

    const brokenScan = this.scanResults().some(
      ({classification}) => getClassificationKind(classification) === 'broken_local_state',
    )
    const brokenPairing = this.pairedHosts().some(
      ({pairing_state}) => pairing_state === 'broken_local_state',
    )
    return brokenScan || brokenPairing ? 'remove_and_repair' : null
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
        pairingState: source.paired_match?.pairing_state ?? null,
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
          if (this.activeErrorCode()) return 'recovery'
          break
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
  readonly desktopSummary = computed<DesktopUsbSummaryPresentation>(
    () =>
      deriveDesktopUsbSummaryPresentation({
        supported: this.available(),
        checking: this.detectingDevices(),
        devices: this.detectedDevices(),
      }),
    'remote.usb.desktopSummary',
  )
  readonly desktopPresentation = computed<DesktopUsbPresentation>(
    () =>
      deriveDesktopUsbPresentation({
        flowState: this.flowState(),
        actionBusy: this.actionBusy(),
        canConfirmPairing: this.canConfirmPairing(),
        recoveryAction: this.recoveryAction(),
        lastFailedAction: this.lastFailedAction(),
        activeHost: this.status()?.active_host ?? null,
        repairScanPending: this.repairScanHostId() !== null,
        scannedHosts: this.scannedHostViews(),
        detectedDevices: this.detectedDeviceViews(),
        pairedHosts: this.pairedHostViews(),
      }),
    'remote.usb.desktopPresentation',
  )
  private activeSessionHostId: string | null = null

  async refreshStatus(): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    return await wrap(
      this.run({kind: 'refresh_status'}, async () => {
        const status = await wrap(mobileUsbStatus())
        this.applyStatus(status)
      }),
    )
  }

  async scan(): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    this.scanFoundNothing.set(false)
    const result = await wrap(
      this.run({kind: 'scan'}, async () => {
        const results = await wrap(mobileUsbScan())
        this.scanResults.set(results)
        this.scanFoundNothing.set(results.length === 0)
      }),
    )
    this.repairScanHostId.set(null)
    return result
  }

  activateDetectedInventory(): boolean {
    if (this.inventoryActive) return false
    this.inventoryActive = true
    this.inventoryGeneration += 1
    return true
  }

  deactivateDetectedInventory(): void {
    this.inventoryActive = false
    this.inventoryGeneration += 1
    this.detectingDevices.set(false)
    this.detectedDevices.set([])
  }

  /** Passive descriptor/metadata inventory owned by the visible Remote surface. */
  async refreshDetectedDevices(): Promise<boolean> {
    if (!this.available() || !this.inventoryActive) return false
    if (this.detectingDevices()) return false
    const generation = this.inventoryGeneration
    this.detectingDevices.set(true)
    try {
      const devices = await wrap(mobileUsbDetect())
      if (!this.inventoryActive || generation !== this.inventoryGeneration) return false
      this.detectedDevices.set(devices)
      return true
    } catch {
      return false
    } finally {
      if (generation === this.inventoryGeneration) this.detectingDevices.set(false)
    }
  }

  async scanAndConnectSingleHost(shouldContinue: () => boolean = () => true): Promise<boolean> {
    if (!shouldContinue()) return false
    const ok = await wrap(this.scan())
    if (!ok || !shouldContinue()) return false
    return await wrap(this.connectSingleScannedHost())
  }

  async connectSingleScannedHost(): Promise<boolean> {
    const [host, extraHost] = this.scannedHostViews()
    if (!host || extraHost) return false

    if (host.canPair) {
      return await wrap(this.pairScannedHost(host.source))
    }

    if (host.canConnect && host.pairedHostId) {
      return await wrap(this.connectPairedHost(host.pairedHostId))
    }

    if (host.canListPaired) {
      await wrap(this.loadPaired())
    }

    return false
  }

  async pairScannedHost(host: MobileUsbScannedHost): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    if (getClassificationKind(host.classification) !== 'unpaired') return false
    return await wrap(
      this.run({kind: 'pair', host}, async () => {
        const status = await wrap(
          mobileUsbPair({
            platform: host.scan.platform,
            bridge_kind: host.scan.bridge_kind,
            usb_hint: host.scan.usb_hint,
            label: host.scan.label ?? null,
          } satisfies MobileUsbPairRequest),
        )
        this.applyStatus(status)
      }),
    )
  }

  setPairingApprovalPin(value: string): void {
    this.pairingApprovalPin.set(value.replace(/\D+/g, '').slice(0, 6))
  }

  async confirmPairing(): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    const approval = this.pairingApproval()
    if (!approval || this.actionBusy()) return false

    this.pairingApprovalSubmitAttempted.set(true)
    if (this.pairingApprovalPinError()) {
      this.requestPairingApprovalPinFocus()
      return false
    }

    const confirmed = await wrap(
      this.run({kind: 'pair_confirm'}, async () => {
        const status = await wrap(
          mobileUsbConfirmPairing({
            attempt_id: approval.attempt_id,
            approval_pin: this.pairingApprovalPin(),
          }),
        )
        this.applyStatus(status)
      }),
    )
    if (!confirmed) {
      this.pairingApprovalPin.set('')
      this.requestPairingApprovalPinFocus()
    }
    return confirmed
  }

  async connectPairedHost(hostId: string): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    if (!hostId.trim()) return false
    return await wrap(
      this.run({kind: 'connect', hostId}, async () => {
        const status = await wrap(mobileUsbConnect(hostId))
        this.applyStatus(status, hostId)
      }),
    )
  }

  async disconnect(): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    return await wrap(
      this.run({kind: 'disconnect'}, async () => {
        const activeHostId = this.status()?.active_host?.host_id ?? null
        const status = await wrap(mobileUsbDisconnect())
        this.applyStatus(status, activeHostId)
      }),
    )
  }

  async loadPaired(): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    return await wrap(
      this.run({kind: 'load_paired'}, async () => {
        this.pairedHosts.set(await wrap(mobileUsbListPaired()))
      }),
    )
  }

  async removePaired(hostId: string): Promise<boolean> {
    if (this.blockIfUnavailable()) return false
    if (!hostId.trim()) return false
    const removeAndRepair = this.recoveryAction() === 'remove_and_repair'
    const removed = await wrap(
      this.run({kind: 'remove', hostId}, async () => {
        this.pairedHosts.set(await wrap(mobileUsbRemovePaired(hostId)))
        this.scanResults.set(
          this.scanResults().filter((result) => getClassificationHostId(result.classification) !== hostId),
        )
      }),
    )
    if (removed && removeAndRepair) {
      this.repairScanHostId.set(hostId)
      this.clearRemovedHostRecoveryStatus(hostId)
    }
    if (removed) await wrap(this.refreshDetectedDevices())
    return removed
  }

  dismissError(): void {
    this.dismissedErrorCode.set(this.activeErrorCode())
    this.errorText.set(null)
    this.lastErrorCode.set(null)
  }

  clearLastActiveHost(): void {
    this.lastActiveHost.set(null)
  }

  applyStatusEvent(status: MobileUsbStatus): void {
    this.applyStatus(status)
  }

  async dispatchDesktopAction(): Promise<boolean> {
    const presentation = this.desktopPresentation()
    if (!presentation.primaryActionEnabled || !presentation.primaryAction) return false
    return await wrap(this.dispatchUiAction(presentation.primaryAction))
  }

  private applyStatus(status: MobileUsbStatus, fallbackHostId: string | null = null): void {
    status = this.normalizeRemovedHostRecoveryStatus(status)
    const previousPairingAttemptId = this.status()?.pairing_approval?.attempt_id ?? null
    this.dismissedErrorCode.set(null)
    this.status.set(status)
    if (status.active_host) {
      this.lastActiveHost.set(status.active_host)
    }
    this.pairedHosts.set(status.paired_hosts)
    this.lastErrorCode.set(status.error_code)
    this.syncRemoteSessionState(status, fallbackHostId)
    if (status.error_code !== null) {
      this.errorText.set(formatMobileUsbErrorText(status.error_code, i18n('remote:usb-mobile-error-generic')))
    }
    const nextPairingAttemptId = status.pairing_approval?.attempt_id ?? null
    if (nextPairingAttemptId !== previousPairingAttemptId) {
      this.pairingApprovalPin.set('')
      this.pairingApprovalSubmitAttempted.set(false)
    }
  }

  private blockIfUnavailable(): boolean {
    if (this.available()) return false
    this.dismissedErrorCode.set(null)
    this.lastErrorCode.set('ERR_USB_MOBILE_UNSUPPORTED_PLATFORM')
    this.errorText.set(
      formatMobileUsbErrorText(
        'ERR_USB_MOBILE_UNSUPPORTED_PLATFORM',
        i18n('remote:usb-mobile-error-unavailable'),
      ),
    )
    return true
  }

  private async run(action: DesktopUsbAction, task: () => Promise<void>): Promise<boolean> {
    const backendOperationRunning = this.inFlight() !== null
    const readOnlyAction = action.kind === 'refresh_status' || action.kind === 'load_paired'
    if (this.busy() || (backendOperationRunning && !readOnlyAction)) return false
    this.busy.set(true)
    this.pendingAction.set(action.kind)
    this.errorText.set(null)
    this.lastErrorCode.set(null)
    this.dismissedErrorCode.set(null)
    try {
      await wrap(task())
      this.lastFailedAction.set(null)
      if (action.kind === 'pair' || action.kind === 'pair_confirm' || action.kind === 'connect') {
        this.repairScanHostId.set(null)
      }
      return true
    } catch (error) {
      const code = getErrorCode(error)
      const message = error instanceof Error ? error.message : String(error)
      this.errorText.set(formatMobileUsbErrorText(code, message))
      this.lastErrorCode.set(code)
      this.lastFailedAction.set(action)
      return false
    } finally {
      this.pendingAction.set(null)
      this.busy.set(false)
    }
  }

  private requestPairingApprovalPinFocus(): void {
    this.pairingApprovalPinFocusRequest.set((request) => request + 1)
  }

  private clearRemovedHostRecoveryStatus(hostId: string): void {
    const status = this.status()
    if (status) this.status.set(this.normalizeRemovedHostRecoveryStatus(status))
    this.lastErrorCode.set(null)
    this.dismissedErrorCode.set(null)
    this.errorText.set(null)
    this.pairedHosts.set(this.pairedHosts().filter((host) => host.host_id !== hostId))
  }

  private normalizeRemovedHostRecoveryStatus(status: MobileUsbStatus): MobileUsbStatus {
    const hostId = this.repairScanHostId()
    if (!hostId) return status
    const recoveryAction = status.error_code ? MOBILE_USB_ERROR_RECOVERY_ACTIONS[status.error_code] : null
    if (recoveryAction !== 'remove_and_repair') return status

    return {
      ...status,
      session_state: status.session_state === 'error' ? 'idle_usb_mobile' : status.session_state,
      error_code: null,
      paired_hosts: status.paired_hosts.filter((host) => host.host_id !== hostId),
    }
  }

  private async dispatchAction(action: DesktopUsbAction): Promise<boolean> {
    switch (action.kind) {
      case 'refresh_status':
        return await wrap(this.refreshStatus())
      case 'scan':
        return await wrap(this.scan())
      case 'load_paired':
        return await wrap(this.loadPaired())
      case 'pair':
        return await wrap(this.pairScannedHost(action.host))
      case 'pair_confirm':
        return await wrap(this.confirmPairing())
      case 'connect':
        return await wrap(this.connectPairedHost(action.hostId))
      case 'disconnect':
        return await wrap(this.disconnect())
      case 'remove':
        return await wrap(this.removePaired(action.hostId))
    }
  }

  private async dispatchUiAction(action: DesktopUsbUiAction): Promise<boolean> {
    switch (action.kind) {
      case 'back_to_hosts':
        return false
      case 'dismiss_error':
        this.dismissError()
        return true
      case 'continue_read_only': {
        const status = this.status()
        if (!status || status.session_state !== 'remote_dashboard_open') return false
        this.dismissError()
        this.syncRemoteSessionState(status, this.activeSessionHostId, true)
        return true
      }
      default:
        return await wrap(this.dispatchAction(action))
    }
  }

  private syncRemoteSessionState(
    status: MobileUsbStatus,
    fallbackHostId: string | null,
    allowWriterLockedReady = false,
  ): void {
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
        if (status.error_code === 'ERR_USB_MOBILE_WRITER_LOCKED' && !allowWriterLockedReady) break
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
