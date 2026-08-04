import type {RemoteSessionState} from 'root/app/state/store'

import {isRemoteMode} from './remote.model'
import type {
  ConnectionState,
  CoreMode,
  MobileUsbBridgeKind,
  MobileUsbErrorCode,
  MobileUsbHostView,
  MobileUsbPlatform,
  MobileUsbStatus,
  RemoteStatus,
  SyncSnapshot,
} from './remote.model'

export type DesktopUsbRemoteSessionStage =
  | 'waiting_host_unlock'
  | 'waiting_phone_approval'
  | 'ready'
  | 'connection_lost'
  | 'error'

export type DesktopUsbRemoteAccess = 'pending' | 'write' | 'read_only'

export interface DesktopUsbRemoteHost {
  hostId: string
  label: string | null
  platform: MobileUsbPlatform
  bridgeKind: MobileUsbBridgeKind
}

export interface DesktopUsbRemoteSessionPresentation {
  stage: DesktopUsbRemoteSessionStage
  host: DesktopUsbRemoteHost
  access: DesktopUsbRemoteAccess
  writerLockHolder: string | null
  sync: SyncSnapshot
  errorCode: MobileUsbErrorCode | null
  errorText: string | null
  switchingToLocal: boolean
}

interface DesktopUsbRemoteSessionInput {
  currentMode: CoreMode
  connectionState: ConnectionState
  remoteSessionState: RemoteSessionState
  remoteStatus: RemoteStatus
  syncSnapshot: SyncSnapshot
  usbStatus: MobileUsbStatus | null
  lastActiveHost: MobileUsbHostView | null
  usbPanelOpen: boolean
  usbErrorText: string | null
  switchingToLocal: boolean
}

function hostFromMode(mode: CoreMode): DesktopUsbRemoteHost | null {
  if (!isRemoteMode(mode) || mode.remote.host.type !== 'mobile_usb') return null

  const host = mode.remote.host
  const platform = host.platform === 'ios' ? 'ios' : 'android'
  return {
    hostId: host.host_id,
    label: host.label?.trim() || null,
    platform,
    bridgeKind: platform === 'ios' ? 'ios_external_accessory' : 'android_aoa',
  }
}

function hostFromView(host: MobileUsbHostView): DesktopUsbRemoteHost {
  return {
    hostId: host.host_id,
    label: host.label.trim() || null,
    platform: host.platform,
    bridgeKind: host.bridge_kind,
  }
}

function resolveStage(input: DesktopUsbRemoteSessionInput): DesktopUsbRemoteSessionStage | null {
  const usbState = input.usbStatus?.session_state
  const usbMode = isRemoteMode(input.currentMode) && input.currentMode.remote.host.type === 'mobile_usb'
  if (usbState === 'error' || input.usbStatus?.error_code) return 'error'
  if (usbState === 'disconnected') return 'connection_lost'
  if (usbState === 'session_approval_required') return 'waiting_phone_approval'
  if (usbState === 'transport_ready_host_locked') return 'waiting_host_unlock'
  if (usbState === 'remote_dashboard_open') return 'ready'

  if (input.remoteSessionState === 'waiting_phone_approval') return 'waiting_phone_approval'
  if (input.remoteSessionState === 'waiting_host_unlock') return 'waiting_host_unlock'
  if (input.remoteSessionState === 'ready') return 'ready'

  if (input.connectionState === 'error') return 'error'
  if (input.connectionState === 'disconnected' && (input.lastActiveHost || usbMode)) {
    return 'connection_lost'
  }
  if (usbMode) return 'waiting_host_unlock'
  return null
}

export function deriveDesktopUsbRemoteSessionPresentation(
  input: DesktopUsbRemoteSessionInput,
): DesktopUsbRemoteSessionPresentation | null {
  if (input.usbPanelOpen) return null

  const modeHost = hostFromMode(input.currentMode)
  const activeHost = input.usbStatus?.active_host ?? input.lastActiveHost
  const host = activeHost ? hostFromView(activeHost) : modeHost
  if (!host) return null

  const stage = resolveStage(input)
  if (!stage) return null

  const writerLockHolder = input.syncSnapshot.writerLock?.holder ?? input.remoteStatus.writer_device
  const readOnly = input.syncSnapshot.writerLock !== null || input.remoteStatus.locked_by_other
  const access: DesktopUsbRemoteAccess =
    stage !== 'ready' ? 'pending' : readOnly ? 'read_only' : 'write'

  return {
    stage,
    host,
    access,
    writerLockHolder,
    sync: input.syncSnapshot,
    errorCode: input.usbStatus?.error_code ?? null,
    errorText: input.usbErrorText,
    switchingToLocal: input.switchingToLocal,
  }
}
