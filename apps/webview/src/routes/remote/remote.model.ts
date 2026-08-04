import {tauriInvoke, tauriListen, type UnlistenFn} from 'root/core/transport/tauri/ipc'
import {i18n} from 'root/i18n'

// ---------------------------------------------------------------------------
// Types (mirror Rust structs from mode_cmds + core_adapter/types)
// ---------------------------------------------------------------------------

export type ConnectionState = 'disconnected' | 'connecting' | 'syncing' | 'ready' | 'locked' | 'error'

/**
 * Client-side remote status derived from ConnectionState.
 * When `connection_state` is `'locked'`, `locked_by_other` is `true` — the
 * vault writer lock is held by another device (ADR-011 single-writer semantics).
 */
export interface RemoteStatus {
  connection_state: ConnectionState
  vault_locked: boolean
  locked_by_other: boolean
  writer_device: string | null
}

/**
 * Derive a `RemoteStatus` from the current `ConnectionState`.
 * Until the backend exposes a dedicated command, we infer writer-lock
 * status: `'locked'` means another device holds the writer lock.
 */
export function deriveRemoteStatus(state: ConnectionState): RemoteStatus {
  const lockedByOther = state === 'locked'
  return {
    connection_state: state,
    vault_locked: lockedByOther,
    locked_by_other: lockedByOther,
    writer_device: null,
  }
}

// ---------------------------------------------------------------------------
// Mode types (mirror Rust structs from mode_cmds.rs + core_adapter/types.rs)
// ---------------------------------------------------------------------------

/**
 * Remote host identity discriminated by transport type.
 * Mirrors Rust `RemoteHost` enum with serde `rename_all = snake_case, tag = type`.
 */
export type RemoteHost =
  | {type: 'tauri_remote_wss'; peer_id: string}
  | {type: 'mobile_usb'; host_id: string; label?: string | null; platform: string}

/**
 * Core operating mode. Mirrors Rust `CoreMode` enum.
 * - `'local'` — using local vault
 * - `'switching'` — mode transition in progress
 * - `{remote: {host: RemoteHost}}` — connected to remote Core Host
 */
export type CoreMode = 'local' | 'switching' | {remote: {host: RemoteHost}}

/** Returned by `mode_get` / `mode_status` commands. */
export interface ModeInfo {
  mode: CoreMode
  connection_state: ConnectionState
  transport_type: string | null
  remote_core_features: string[]
  transport_session_generation?: number | null
}

/** Returned by `mode_switch` command and emitted via `mode:changed`. */
export interface ModeSwitchResult {
  previous_mode: CoreMode
  current_mode: CoreMode
  remote_core_features?: string[]
  transport_session_generation?: number | null
  auto_locked: boolean
  drain_completed: boolean
}

/** Emitted via `mode:switching` event during transition. */
export interface ModeTransition {
  from: CoreMode
  to_mode: string
  started_at_ms: number
  drain_deadline_ms: number
}

/** Emitted via `connection:status` event. */
export interface ConnectionStatusEvent {
  phase: string
  peer_id?: string
  relay_url?: string
  transport_type?: string
  reason?: string
}

/** Emitted via `sync:status` event. */
export interface SyncStatusEvent {
  phase: string
  [key: string]: unknown
}

/** Network paired peer — returned by `network_list_paired_peers`. */
export interface NetworkPairedPeer {
  peer_id: string
  label: string
  relay_url: string
  last_seen: number
  paired_at: number
  platform: string
  status: 'ready' | 'offline' | 'waking' | null
  presence_expires_at_ms: number | null
}

export type MobileUsbPlatform = 'android' | 'ios'
export type MobileUsbBridgeKind = 'android_aoa' | 'ios_external_accessory'
export type MobileUsbSessionState =
  | 'locked_shell'
  | 'transport_select'
  | 'idle_usb_mobile'
  | 'scanning_usb_mobile'
  | 'pairing_usb_mobile'
  | 'pairing_approval_required'
  | 'connecting_usb_mobile'
  | 'session_approval_required'
  | 'transport_ready_host_locked'
  | 'remote_dashboard_open'
  | 'disconnected'
  | 'error'

export type MobileUsbErrorCode =
  | 'ERR_USB_MOBILE_UNSUPPORTED_PLATFORM'
  | 'ERR_USB_MOBILE_IOS_MFI_REQUIRED'
  | 'ERR_USB_MOBILE_BUSY'
  | 'ERR_USB_MOBILE_INVALID_STATE'
  | 'ERR_USB_MOBILE_BRIDGE_UNAVAILABLE'
  | 'ERR_USB_MOBILE_NO_ACCESSORY'
  | 'ERR_USB_MOBILE_PERMISSION_DENIED'
  | 'ERR_USB_MOBILE_AMBIGUOUS_DISCOVERY'
  | 'ERR_USB_MOBILE_NOT_PAIRED'
  | 'ERR_USB_MOBILE_PAIRING_DUPLICATE'
  | 'ERR_USB_MOBILE_HANDSHAKE_FAILED'
  | 'ERR_USB_MOBILE_STALE_PAIRING'
  | 'ERR_USB_MOBILE_SECRET_STORE_UNAVAILABLE'
  | 'ERR_USB_MOBILE_SECRET_REF_INVALID'
  | 'ERR_USB_MOBILE_PAIR_COMMIT_FAILED'
  | 'ERR_USB_MOBILE_PAIRING_STORE_CORRUPT'
  | 'ERR_USB_MOBILE_PAIRING_APPROVAL_REQUIRED'
  | 'ERR_USB_MOBILE_PAIRING_APPROVAL_REJECTED'
  | 'ERR_USB_MOBILE_PAIRING_APPROVAL_EXPIRED'
  | 'ERR_USB_MOBILE_RECORD_LAYER_FAILED'
  | 'ERR_USB_MOBILE_CABLE_DISCONNECTED'
  | 'ERR_USB_MOBILE_HOST_LOCKED'
  | 'ERR_USB_MOBILE_UNLOCK_NOT_AUTHENTICATED'
  | 'ERR_USB_MOBILE_WRITER_LOCKED'

export type MobileUsbRecoveryAction =
  | 'hide_usb_entry'
  | 'manual_retry'
  | 'retry_scan'
  | 'retry_permission'
  | 'wait_in_flight'
  | 'keep_current_flow'
  | 'list_paired'
  | 'pair_host'
  | 'connect_existing'
  | 'remove_and_repair'
  | 'disconnect_before_retry'
  | 'wait_for_host_unlock'
  | 'ignore_stale_unlock'
  | 'continue_read_only'

export interface UsbHint {
  manufacturer?: string | null
  model?: string | null
  serial_number?: string | null
  protocol_id?: string | null
}

export interface MobileUsbPairRequest {
  platform: MobileUsbPlatform
  bridge_kind: MobileUsbBridgeKind
  usb_hint: UsbHint
  label?: string | null
}

export interface MobileUsbPairConfirmRequest {
  attempt_id: string
  approval_pin: string
}

export interface MobileUsbPairingApprovalView {
  attempt_id: string
  peer_label: string
  peer_fingerprint: string
  attempts_left: number
  locked_until_ms: number | null
  expires_at_ms: number
}

export type MobileUsbHostApprovalDecision = 'pending' | 'approved' | 'rejected'

export interface MobileUsbHostPairingApprovalView {
  attempt_id: string
  approval_pin: string
  peer_label: string
  peer_fingerprint: string
  attempts_left: number
  decision: MobileUsbHostApprovalDecision
  expires_at_ms: number
}

export interface MobileUsbHostSessionApprovalView {
  attempt_id: string
  peer_id: string
  peer_label: string
  transport_type: string
  decision: MobileUsbHostApprovalDecision
  expires_at_ms: number
}

export interface MobileUsbHostApprovalEvent {
  attempt_id: string
}

export interface MobileUsbScanResult {
  platform: MobileUsbPlatform
  bridge_kind: MobileUsbBridgeKind
  usb_hint: UsbHint
  label?: string | null
}

export type MobileUsbScanClassification =
  | 'unpaired'
  | 'ambiguous'
  | {paired: {host_id: string}}
  | {broken_local_state: {host_id: string}}

export interface MobileUsbScannedHost {
  scan: MobileUsbScanResult
  classification: MobileUsbScanClassification
}

export interface MobileUsbDetectedPairedMatch {
  host_id: string
  label: string
  pairing_state: 'confirmed' | 'incomplete'
}

/** Passive inventory entry from `mobile_usb_detect`: descriptors only, no AOA side effects. */
export interface MobileUsbDetectedDevice {
  scan: MobileUsbScanResult
  accessory_mode: boolean
  paired_match: MobileUsbDetectedPairedMatch | null
}

export interface MobileUsbHostView {
  host_id: string
  label: string
  platform: MobileUsbPlatform
  bridge_kind: MobileUsbBridgeKind
  pairing_state: 'paired' | 'broken_local_state'
  last_seen: number | null
}

export interface MobileUsbStatus {
  transport_family: 'usb_mobile'
  available_transports: Array<'usb_mobile'>
  selected_transport: 'usb_mobile' | null
  session_state: MobileUsbSessionState
  fallback_allowed: false
  active_host: MobileUsbHostView | null
  paired_hosts: MobileUsbHostView[]
  pairing_approval: MobileUsbPairingApprovalView | null
  in_flight: 'scan' | 'pair' | 'pair_confirm' | 'connect' | null
  error_code: MobileUsbErrorCode | null
}

// ---------------------------------------------------------------------------
// Mode invoke wrappers
// ---------------------------------------------------------------------------

export async function getModeInfo(): Promise<ModeInfo> {
  return tauriInvoke('mode_get')
}

export async function getModeStatus(): Promise<ModeInfo> {
  return tauriInvoke('mode_status')
}

export async function switchMode(target: string, peer_id?: string): Promise<ModeSwitchResult> {
  const args: Record<string, unknown> = {target}
  if (peer_id) args['peerId'] = peer_id
  return tauriInvoke('mode_switch', args)
}

export async function listNetworkPairedPeers(): Promise<NetworkPairedPeer[]> {
  return tauriInvoke('network_list_paired_peers')
}

export async function removeNetworkPairedPeer(peerId: string): Promise<void> {
  await tauriInvoke('network_remove_paired_peer', {peerId})
}

export async function mobileUsbScan(): Promise<MobileUsbScannedHost[]> {
  return tauriInvoke('mobile_usb_scan')
}

export async function mobileUsbDetect(): Promise<MobileUsbDetectedDevice[]> {
  return tauriInvoke('mobile_usb_detect')
}

export async function mobileUsbPair(request: MobileUsbPairRequest): Promise<MobileUsbStatus> {
  return tauriInvoke('mobile_usb_pair', {request})
}

export async function mobileUsbConfirmPairing(
  request: MobileUsbPairConfirmRequest,
): Promise<MobileUsbStatus> {
  return tauriInvoke('mobile_usb_confirm_pairing', {request})
}

export async function mobileUsbConnect(hostId: string): Promise<MobileUsbStatus> {
  return tauriInvoke('mobile_usb_connect', {hostId})
}

export async function mobileUsbDisconnect(): Promise<MobileUsbStatus> {
  return tauriInvoke('mobile_usb_disconnect')
}

export async function mobileUsbStatus(): Promise<MobileUsbStatus> {
  return tauriInvoke('mobile_usb_status')
}

export async function mobileUsbListPaired(): Promise<MobileUsbHostView[]> {
  return tauriInvoke('mobile_usb_list_paired')
}

export async function mobileUsbRemovePaired(hostId: string): Promise<MobileUsbHostView[]> {
  return tauriInvoke('mobile_usb_remove_paired', {hostId})
}

export async function mobileUsbHostPendingPairingApproval(): Promise<MobileUsbHostPairingApprovalView | null> {
  return tauriInvoke('mobile_usb_host_pending_pairing_approval')
}

export async function mobileUsbHostApprovePairing(attemptId: string): Promise<void> {
  return tauriInvoke('mobile_usb_host_approve_pairing', {attemptId})
}

export async function mobileUsbHostRejectPairing(attemptId: string): Promise<void> {
  return tauriInvoke('mobile_usb_host_reject_pairing', {attemptId})
}

export async function mobileUsbHostPendingSessionApproval(): Promise<MobileUsbHostSessionApprovalView | null> {
  return tauriInvoke('mobile_usb_host_pending_session_approval')
}

export async function mobileUsbHostApproveSession(attemptId: string): Promise<void> {
  return tauriInvoke('mobile_usb_host_approve_session', {attemptId})
}

export async function mobileUsbHostRejectSession(attemptId: string): Promise<void> {
  return tauriInvoke('mobile_usb_host_reject_session', {attemptId})
}

// ---------------------------------------------------------------------------
// Mode event listeners
// ---------------------------------------------------------------------------

export function onModeSwitching(handler: (t: ModeTransition) => void): Promise<UnlistenFn> {
  return tauriListen<ModeTransition>('mode:switching', handler)
}

export function onModeChanged(handler: (r: ModeSwitchResult) => void): Promise<UnlistenFn> {
  return tauriListen<ModeSwitchResult>('mode:changed', handler)
}

export function onConnectionStatus(handler: (e: ConnectionStatusEvent) => void): Promise<UnlistenFn> {
  return tauriListen<ConnectionStatusEvent>('connection:status', handler)
}

export function onSyncStatus(handler: (e: SyncStatusEvent) => void): Promise<UnlistenFn> {
  return tauriListen<SyncStatusEvent>('sync:status', handler)
}

export function onMobileUsbInventoryChanged(handler: () => void): Promise<UnlistenFn> {
  return tauriListen<unknown>('mobile_usb_inventory_changed', () => handler())
}

export function onMobileUsbStatusChanged(handler: (status: MobileUsbStatus) => void): Promise<UnlistenFn> {
  return tauriListen<MobileUsbStatus>('mobile_usb_status_changed', handler)
}

export function onMobileUsbHostPairingApprovalRequired(
  handler: (e: MobileUsbHostApprovalEvent) => void,
): Promise<UnlistenFn> {
  return tauriListen<MobileUsbHostApprovalEvent>('mobile_usb_host_pairing_approval_required', handler)
}

export function onMobileUsbHostSessionApprovalRequired(
  handler: (e: MobileUsbHostApprovalEvent) => void,
): Promise<UnlistenFn> {
  return tauriListen<MobileUsbHostApprovalEvent>('mobile_usb_host_session_approval_required', handler)
}

export function onMobileUsbHostApprovalResolved(
  handler: (e: MobileUsbHostApprovalEvent) => void,
): Promise<UnlistenFn> {
  return tauriListen<MobileUsbHostApprovalEvent>('mobile_usb_host_approval_resolved', handler)
}

// ---------------------------------------------------------------------------
// Mode helpers
// ---------------------------------------------------------------------------

/** Check if mode is Remote (object with `remote` key). */
export function isRemoteMode(mode: CoreMode): mode is {remote: {host: RemoteHost}} {
  return typeof mode === 'object' && mode !== null && 'remote' in mode
}

/** Human-readable mode label. */
export function getModeLabel(mode: CoreMode): string {
  if (mode === 'local') return i18n('remote:mode-label-local')
  if (mode === 'switching') return i18n('remote:mode-label-switching')
  return i18n('remote:mode-label-remote')
}

/** Extract peer/device name from CoreMode when in Remote. */
export function getConnectedPeerName(mode: CoreMode): string | null {
  if (!isRemoteMode(mode)) return null
  const host = mode.remote.host
  return host.type === 'tauri_remote_wss' ? host.peer_id : (host.label ?? host.host_id)
}

/** Map ConnectionState to a semantic status category for badge styling. */
export function getConnectionStatusCategory(
  s: ConnectionState,
): 'connected' | 'degraded' | 'disconnected' | 'switching' {
  switch (s) {
    case 'ready':
      return 'connected'
    case 'connecting':
    case 'syncing':
      return 'degraded'
    case 'disconnected':
    case 'error':
    case 'locked':
      return 'disconnected'
    default:
      return 'disconnected'
  }
}

// ---------------------------------------------------------------------------
// Sync status types (Task 13)
// ---------------------------------------------------------------------------

/** Semantic sync state for UI rendering. */
export type SyncState = 'idle' | 'syncing' | 'synced' | 'reconnecting' | 'error'

/** Writer-lock info mirroring Rust `WriterLockInfo`. */
export interface WriterLockInfo {
  holder: string
  since_ms: number
}

/** Full sync status snapshot for UI. */
export interface SyncSnapshot {
  state: SyncState
  progress: string | null
  lastSyncMs: number | null
  writerLock: WriterLockInfo | null
  errorMessage: string | null
}

/** Create a default (idle) sync snapshot. */
export function defaultSyncSnapshot(): SyncSnapshot {
  return {
    state: 'idle',
    progress: null,
    lastSyncMs: null,
    writerLock: null,
    errorMessage: null,
  }
}

/**
 * Map a `sync:status` event phase to a `SyncState`.
 * Known phases from backend: bootstrap_started, cleared, reconnect_completed.
 */
export function syncPhaseToState(phase: string): SyncState {
  switch (phase) {
    case 'bootstrap_started':
    case 'syncing':
    case 'delta_apply':
      return 'syncing'
    case 'reconnect_started':
    case 'reconnecting':
      return 'reconnecting'
    case 'reconnect_completed':
    case 'synced':
    case 'bootstrap_completed':
      return 'synced'
    case 'cleared':
    case 'idle':
      return 'idle'
    case 'error':
      return 'error'
    default:
      return 'syncing'
  }
}

/**
 * Build a sync progress string from event payload.
 * Example: `"Syncing... (45/120)"` when items_synced and items_total present.
 */
export function formatSyncProgress(event: SyncStatusEvent): string | null {
  const phase = event.phase
  const synced = event['items_synced'] as number | undefined
  const total = event['items_total'] as number | undefined
  if (phase === 'bootstrap_started' || phase === 'syncing' || phase === 'delta_apply') {
    if (typeof synced === 'number' && typeof total === 'number') {
      return i18n('remote:sync-progress', {synced, total})
    }
    return i18n('remote:syncing-text')
  }
  if (phase === 'reconnect_started' || phase === 'reconnecting') {
    return i18n('remote:reconnecting-text')
  }
  return null
}

/**
 * Derive a `RemoteStatus` with writer-lock info from sync snapshot.
 * Extends the base `deriveRemoteStatus` with actual lock holder data.
 */
export function deriveRemoteStatusWithLock(
  connState: ConnectionState,
  syncSnapshot: SyncSnapshot,
): RemoteStatus {
  const lock = syncSnapshot.writerLock
  const lockedByOther = connState === 'locked' || lock !== null
  return {
    connection_state: connState,
    vault_locked: lockedByOther,
    locked_by_other: lockedByOther,
    writer_device: lock?.holder ?? null,
  }
}

/** Format a relative time for last sync display. */
export function formatLastSyncTime(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 5_000) return i18n('time:just-now')
  if (diff < 60_000) return i18n('time:seconds-ago', {value: Math.floor(diff / 1_000)})
  if (diff < 3_600_000) return i18n('time:minutes-ago', {value: Math.floor(diff / 60_000)})
  if (diff < 86_400_000) return i18n('time:hours-ago', {value: Math.floor(diff / 3_600_000)})
  return new Date(ms).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})
}

/**
 * Build the writer-lock warning toast message.
 * Used when a locked write attempt is made.
 */
export function getWriterLockToastMessage(holderName: string | null): string {
  if (holderName) {
    return i18n('remote:writer-lock-toast-holder', {holder: holderName})
  }
  return i18n('remote:writer-lock-toast-other')
}
