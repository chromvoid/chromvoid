import {i18n} from 'root/i18n'

import {normalizeRemoteTimestampMs} from './remote-desktop-preauth.contract'
import type {
  MobileUsbDetectedDevice,
  MobileUsbHostView,
  MobileUsbRecoveryAction,
  MobileUsbScannedHost,
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

export type DesktopUsbAction =
  | {kind: 'refresh_status'}
  | {kind: 'scan'}
  | {kind: 'load_paired'}
  | {kind: 'pair'; host: MobileUsbScannedHost}
  | {kind: 'pair_confirm'}
  | {kind: 'connect'; hostId: string}
  | {kind: 'disconnect'}
  | {kind: 'remove'; hostId: string}

export type DesktopUsbUiAction =
  | DesktopUsbAction
  | {kind: 'back_to_hosts'}
  | {kind: 'dismiss_error'}
  | {kind: 'continue_read_only'}

export interface DesktopUsbRecoveryCta {
  action: DesktopUsbUiAction
  label: string
}

export interface DesktopUsbPresentation {
  scannedRows: DesktopUsbScannedRow[]
  pairedRows: DesktopUsbPairedRow[]
  detailRows: DesktopUsbTechnicalRow[]
  primaryAction: DesktopUsbUiAction | null
  primaryActionEnabled: boolean
  showPrimaryAction: boolean
  recoveryAction: MobileUsbRecoveryAction | null
  recoveryCommand: DesktopUsbAction | null
  recoveryCta: DesktopUsbRecoveryCta | null
}

export interface DesktopUsbTechnicalRow {
  hostId: string
  label: string
  bridge: string
  state: string
  lastSeenMs: number | null
  canRemove: boolean
}

export interface DesktopUsbScannedRow {
  source: MobileUsbScannedHost
  label: string | null
  platform: string
  classification: 'unpaired' | 'paired' | 'broken_local_state' | 'ambiguous'
  pairedHostId: string | null
  brokenHostId: string | null
  canPair: boolean
  canConnect: boolean
  canRemoveBroken: boolean
  canListPaired: boolean
}

interface DetectedActionTarget {
  source: MobileUsbDetectedDevice
  pairedHostId: string | null
  pairingState: 'confirmed' | 'incomplete' | null
}

export interface DesktopUsbPairedRow {
  source: MobileUsbHostView
  label: string
  platform: string
  pairingState: MobileUsbHostView['pairing_state']
  canConnect: boolean
  canRemove: boolean
}

export interface DesktopUsbPresentationInput {
  flowState: MobileUsbFlowState
  actionBusy: boolean
  canConfirmPairing: boolean
  recoveryAction: MobileUsbRecoveryAction | null
  lastFailedAction: DesktopUsbAction | null
  activeHost: MobileUsbHostView | null
  repairScanPending: boolean
  scannedHosts: DesktopUsbScannedRow[]
  detectedDevices: DetectedActionTarget[]
  pairedHosts: DesktopUsbPairedRow[]
}

function getUniqueValue(values: string[]): string | null {
  const uniqueValues = [...new Set(values)]
  return uniqueValues.length === 1 ? uniqueValues[0]! : null
}

function resolveUniquePairAction(
  input: DesktopUsbPresentationInput,
): Extract<DesktopUsbAction, {kind: 'pair'}> | null {
  const hosts = input.scannedHosts.filter(({canPair}) => canPair)
  return input.scannedHosts.length === 1 && hosts.length === 1 ? {kind: 'pair', host: hosts[0]!.source} : null
}

function resolveUniqueConnectAction(
  input: DesktopUsbPresentationInput,
): Extract<DesktopUsbAction, {kind: 'connect'}> | null {
  if (input.lastFailedAction?.kind === 'connect') return input.lastFailedAction
  if (input.activeHost) return {kind: 'connect', hostId: input.activeHost.host_id}

  if (input.scannedHosts.length === 1) {
    const scanned = input.scannedHosts[0]!
    if (scanned.canConnect && scanned.pairedHostId) {
      return {kind: 'connect', hostId: scanned.pairedHostId}
    }
  }

  if (input.scannedHosts.length === 0 && input.detectedDevices.length === 1) {
    const detected = input.detectedDevices[0]!
    if (detected.pairingState === 'confirmed' && detected.pairedHostId) {
      return {kind: 'connect', hostId: detected.pairedHostId}
    }
  }

  return null
}

function resolveUniqueRemoveAction(
  input: DesktopUsbPresentationInput,
): Extract<DesktopUsbAction, {kind: 'remove'}> | null {
  const lastAction = input.lastFailedAction
  if (lastAction?.kind === 'connect' || lastAction?.kind === 'remove') {
    return {kind: 'remove', hostId: lastAction.hostId}
  }
  if (input.activeHost) return {kind: 'remove', hostId: input.activeHost.host_id}
  if (input.scannedHosts.some(({canListPaired}) => canListPaired)) return null

  const scannedIds = input.scannedHosts.flatMap(({canRemoveBroken, brokenHostId}) =>
    canRemoveBroken && brokenHostId ? [brokenHostId] : [],
  )
  const pairedIds = input.pairedHosts.flatMap(({canRemove, source}) => (canRemove ? [source.host_id] : []))
  const hostId = getUniqueValue([...scannedIds, ...pairedIds])
  return hostId ? {kind: 'remove', hostId} : null
}

function resolveRecoveryCommand(input: DesktopUsbPresentationInput): DesktopUsbAction | null {
  switch (input.recoveryAction) {
    case 'manual_retry':
    case 'retry_permission':
    case 'retry_scan':
      return {kind: 'scan'}
    case 'list_paired':
      return {kind: 'load_paired'}
    case 'pair_host':
      return resolveUniquePairAction(input)
    case 'connect_existing':
      return resolveUniqueConnectAction(input)
    case 'remove_and_repair':
      return resolveUniqueRemoveAction(input)
    case 'disconnect_before_retry':
      return {kind: 'disconnect'}
    case 'hide_usb_entry':
    case 'wait_in_flight':
    case 'keep_current_flow':
    case 'wait_for_host_unlock':
    case 'ignore_stale_unlock':
    case 'continue_read_only':
    case null:
      return null
  }
}

function formatRecoveryCta(action: MobileUsbRecoveryAction): string {
  switch (action) {
    case 'hide_usb_entry':
      return i18n('remote:preauth-back-phones')
    case 'manual_retry':
    case 'retry_permission':
    case 'retry_scan':
      return i18n('remote:preauth-usb-scan-again')
    case 'keep_current_flow':
      return i18n('button:close')
    case 'list_paired':
      return i18n('remote:preauth-usb-choose')
    case 'pair_host':
      return i18n('remote:preauth-usb-pair')
    case 'connect_existing':
      return i18n('remote:preauth-usb-connect')
    case 'remove_and_repair':
      return i18n('remote:preauth-remove-confirm')
    case 'disconnect_before_retry':
      return i18n('remote:usb-mobile-recovery-disconnect')
    case 'ignore_stale_unlock':
      return i18n('button:refresh')
    case 'continue_read_only':
      return i18n('remote:usb-mobile-recovery-read-only')
    case 'wait_in_flight':
    case 'wait_for_host_unlock':
      return i18n('remote:usb-mobile-recovery-wait')
  }
}

function resolveRecoveryCta(
  input: DesktopUsbPresentationInput,
  command: DesktopUsbAction | null,
): DesktopUsbRecoveryCta | null {
  const recoveryAction = input.recoveryAction
  if (!recoveryAction) return null
  if (command) return {action: command, label: formatRecoveryCta(recoveryAction)}

  let action: DesktopUsbUiAction | null = null
  switch (recoveryAction) {
    case 'hide_usb_entry':
      action = {kind: 'back_to_hosts'}
      break
    case 'keep_current_flow':
      action = {kind: 'dismiss_error'}
      break
    case 'ignore_stale_unlock':
      action = {kind: 'refresh_status'}
      break
    case 'continue_read_only':
      action = {kind: 'continue_read_only'}
      break
    default:
      break
  }
  return action ? {action, label: formatRecoveryCta(recoveryAction)} : null
}

function deriveDesktopRows(input: DesktopUsbPresentationInput): {
  scannedRows: DesktopUsbScannedRow[]
  pairedRows: DesktopUsbPairedRow[]
} {
  const scannedHostIds = new Set(
    input.scannedHosts.flatMap(({pairedHostId, brokenHostId}) =>
      [pairedHostId, brokenHostId].filter((hostId): hostId is string => hostId !== null),
    ),
  )

  return {
    scannedRows: [...input.scannedHosts],
    pairedRows: input.pairedHosts.filter(({source}) => !scannedHostIds.has(source.host_id)),
  }
}

function deriveTechnicalRows(input: DesktopUsbPresentationInput): DesktopUsbTechnicalRow[] {
  const rows = new Map<string, DesktopUsbTechnicalRow>()
  const removableHostIds = new Set([
    ...input.pairedHosts.map(({source}) => source.host_id),
    ...input.scannedHosts.flatMap(({pairedHostId, brokenHostId}) =>
      [pairedHostId, brokenHostId].filter((hostId): hostId is string => hostId !== null),
    ),
  ])

  if (input.activeHost) {
    rows.set(input.activeHost.host_id, {
      hostId: input.activeHost.host_id,
      label: input.activeHost.label || input.activeHost.host_id,
      bridge: input.activeHost.bridge_kind,
      state: input.activeHost.pairing_state,
      lastSeenMs: normalizeRemoteTimestampMs(input.activeHost.last_seen),
      canRemove: removableHostIds.has(input.activeHost.host_id),
    })
  }

  for (const host of input.scannedHosts) {
    const hostId = host.pairedHostId ?? host.brokenHostId
    if (!hostId || rows.has(hostId)) continue
    rows.set(hostId, {
      hostId,
      label: host.label ?? hostId,
      bridge: host.source.scan.bridge_kind,
      state: host.classification,
      lastSeenMs: null,
      canRemove: removableHostIds.has(hostId),
    })
  }

  for (const host of input.pairedHosts) {
    if (rows.has(host.source.host_id)) continue
    rows.set(host.source.host_id, {
      hostId: host.source.host_id,
      label: host.label,
      bridge: host.source.bridge_kind,
      state: host.pairingState,
      lastSeenMs: normalizeRemoteTimestampMs(host.source.last_seen),
      canRemove: removableHostIds.has(host.source.host_id),
    })
  }

  return [...rows.values()]
}

function isPrimaryActionRepresentedByRows(
  action: DesktopUsbUiAction,
  scannedRows: DesktopUsbScannedRow[],
  pairedRows: DesktopUsbPairedRow[],
): boolean {
  switch (action.kind) {
    case 'pair':
      return scannedRows.some(({source, canPair}) => canPair && source === action.host)
    case 'connect':
      return (
        scannedRows.some(({canConnect, pairedHostId}) => canConnect && pairedHostId === action.hostId) ||
        pairedRows.some(({canConnect, source}) => canConnect && source.host_id === action.hostId)
      )
    case 'load_paired':
      return scannedRows.some(({canListPaired}) => canListPaired)
    case 'remove':
      return false
    case 'refresh_status':
    case 'scan':
    case 'pair_confirm':
    case 'disconnect':
    case 'back_to_hosts':
    case 'dismiss_error':
    case 'continue_read_only':
      return false
  }
}

function resolvePrimaryAction(input: DesktopUsbPresentationInput): DesktopUsbAction | null {
  if (input.flowState === 'pairing_approval') return {kind: 'pair_confirm'}
  if (input.flowState === 'recovery' || input.flowState === 'error') {
    return input.recoveryAction ? null : resolveUniqueRemoveAction(input)
  }
  if (!['idle', 'unpaired', 'paired', 'disconnected'].includes(input.flowState)) return null

  if (input.scannedHosts.length === 1) {
    const host = input.scannedHosts[0]!
    if (host.canPair) return {kind: 'pair', host: host.source}
    if (host.canConnect && host.pairedHostId) return {kind: 'connect', hostId: host.pairedHostId}
    if (host.canRemoveBroken && host.brokenHostId) return {kind: 'remove', hostId: host.brokenHostId}
    if (host.canListPaired) return {kind: 'load_paired'}
    return null
  }
  if (input.scannedHosts.length > 1) return null

  if (input.pairedHosts.length === 1) {
    const host = input.pairedHosts[0]!
    if (host.canConnect) return {kind: 'connect', hostId: host.source.host_id}
    if (host.canRemove) return {kind: 'remove', hostId: host.source.host_id}
  }
  if (input.pairedHosts.length > 1) return null
  return {kind: 'scan'}
}

export function deriveDesktopUsbPresentation(input: DesktopUsbPresentationInput): DesktopUsbPresentation {
  const effectiveInput = input.repairScanPending ? {...input, recoveryAction: 'retry_scan' as const} : input
  const {scannedRows, pairedRows} = deriveDesktopRows(effectiveInput)
  const detailRows = deriveTechnicalRows(effectiveInput)
  const recoveryCommand = resolveRecoveryCommand(effectiveInput)
  const recoveryCta = resolveRecoveryCta(effectiveInput, recoveryCommand)
  const defaultAction = resolvePrimaryAction(effectiveInput)
  const primaryAction =
    defaultAction?.kind === 'pair_confirm' ? defaultAction : (recoveryCta?.action ?? defaultAction)

  return {
    scannedRows,
    pairedRows,
    detailRows,
    primaryAction,
    primaryActionEnabled:
      primaryAction !== null &&
      !effectiveInput.actionBusy &&
      (primaryAction.kind !== 'pair_confirm' || effectiveInput.canConfirmPairing),
    showPrimaryAction:
      primaryAction !== null && !isPrimaryActionRepresentedByRows(primaryAction, scannedRows, pairedRows),
    recoveryAction: effectiveInput.recoveryAction,
    recoveryCommand,
    recoveryCta,
  }
}
