import {tauriInvoke, tauriListen, type UnlistenFn} from 'root/core/transport/tauri/ipc'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'

// ---------------------------------------------------------------------------
// Types (mirror Rust structs from usb + mode_cmds + core_adapter/types)
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

export interface UsbDevice {
  port_path: string
  display_name: string
  serial_number: string | null
  vendor_id: number
  product_id: number
  is_paired: boolean
  device_state: 'blank' | 'initialized' | 'unknown' | null
}

export interface PairedDeviceInfo {
  serial_number: string
  label: string
  last_seen: number
  paired_at: number
}

// ---------------------------------------------------------------------------
// Tauri invoke wrappers
// ---------------------------------------------------------------------------

export async function scanUsbDevices(): Promise<UsbDevice[]> {
  if (!getRuntimeCapabilities().supports_usb_remote) return []
  return tauriInvoke('usb_scan_devices')
}

export async function getConnectionState(): Promise<ConnectionState> {
  if (!getRuntimeCapabilities().supports_usb_remote) return 'disconnected'
  const raw = await tauriInvoke<string>('usb_connection_state')
  return JSON.parse(raw) as ConnectionState
}

export async function listPairedDevices(): Promise<PairedDeviceInfo[]> {
  if (!getRuntimeCapabilities().supports_usb_remote) return []
  return tauriInvoke('usb_list_paired')
}

export async function pairUsbDevice(args: {
  port_path: string
  serial_number: string
  label: string
}): Promise<void> {
  if (!getRuntimeCapabilities().supports_usb_remote) {
    throw new Error('USB remote is not available on this platform')
  }
  await tauriInvoke('usb_pair_device', args)
}

export async function connectUsbDevice(args: {port_path: string; serial_number: string}): Promise<void> {
  if (!getRuntimeCapabilities().supports_usb_remote) {
    throw new Error('USB remote is not available on this platform')
  }
  await tauriInvoke('usb_connect', args)
}

export async function disconnectUsbDevice(): Promise<void> {
  if (!getRuntimeCapabilities().supports_usb_remote) {
    throw new Error('USB remote is not available on this platform')
  }
  await tauriInvoke('usb_disconnect')
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
  | {type: 'orangepi_usb'; device_id: string}
  | {type: 'mobile_ble'; device_id: string}
  | {type: 'tauri_remote_wss'; peer_id: string}

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
}

/** Returned by `mode_switch` command and emitted via `mode:changed`. */
export interface ModeSwitchResult {
  previous_mode: CoreMode
  current_mode: CoreMode
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

// ---------------------------------------------------------------------------
// Mode helpers
// ---------------------------------------------------------------------------

/** Check if mode is Remote (object with `remote` key). */
export function isRemoteMode(mode: CoreMode): mode is {remote: {host: RemoteHost}} {
  return typeof mode === 'object' && mode !== null && 'remote' in mode
}

/** Human-readable mode label. */
export function getModeLabel(mode: CoreMode): string {
  if (mode === 'local') return 'Local'
  if (mode === 'switching') return 'Switching…'
  return 'Remote'
}

/** Extract peer/device name from CoreMode when in Remote. */
export function getConnectedPeerName(mode: CoreMode): string | null {
  if (!isRemoteMode(mode)) return null
  const host = mode.remote.host
  switch (host.type) {
    case 'tauri_remote_wss':
      return host.peer_id
    case 'orangepi_usb':
      return host.device_id
    case 'mobile_ble':
      return host.device_id
  }
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
      return `Syncing… (${synced}/${total})`
    }
    return 'Syncing…'
  }
  if (phase === 'reconnect_started' || phase === 'reconnecting') {
    return 'Reconnecting…'
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
  if (diff < 5_000) return 'just now'
  if (diff < 60_000) return `${Math.floor(diff / 1_000)}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ms).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})
}

/**
 * Build the writer-lock warning toast message.
 * Used when a locked write attempt is made.
 */
export function getWriterLockToastMessage(holderName: string | null): string {
  if (holderName) {
    return `Write locked by ${holderName}. Wait or request lock.`
  }
  return 'Write locked by another device. Wait or request lock.'
}
