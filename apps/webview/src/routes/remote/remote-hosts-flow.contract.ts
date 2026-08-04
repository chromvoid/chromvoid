import {i18n} from 'root/i18n'

import {isRemoteMode, type ModeInfo, type RemoteHost} from './remote.model'

export const DEFAULT_IOS_RELAY_URL = 'wss://relay.chromvoid.com'

const PRESENCE_AUTO_REFRESH_THRESHOLD_MS = 30_000

export interface PairingOffer {
  session_id: string
  relay_base_url: string
  device_label: string
  expires_at_ms: number
  platform?: string | null
}

export interface HostPresence {
  peer_id: string
  relay_url: string
  room_id: string
  expires_at_ms: number
  status: 'ready' | 'offline' | 'waking'
}

export type MobileHostPhase = 'Idle' | 'Pairing' | 'Ready' | 'Error'

export interface ConnectedDesktopPeer {
  peer_id: string
  label: string
  connected_at_ms: number
  transport_type: string
}

export type MobileHostPairingTransport = 'usb_mobile' | 'network'

export interface MobileHostPairedComputer {
  peer_id: string
  label: string
  platform: string
  pairing_transport: MobileHostPairingTransport
  paired_at_ms: number
  last_seen_ms: number
}

export type MobileHostRevokeSessionAction = 'not_connected' | 'disconnect_signalled' | 'disconnect_failed'

export interface MobileHostRevokeResult {
  peer_id: string
  pairing_removed: boolean
  session_action: MobileHostRevokeSessionAction
}

export interface MobileHostStatus {
  phase: MobileHostPhase
  platform: string
  relay_url: string | null
  device_id: string | null
  device_label: string | null
  pairing_pin: string | null
  pairing_offer: PairingOffer | null
  expires_at_ms: number | null
  presence: HostPresence | null
  paired_peer_id: string | null
  connected_peers: ConnectedDesktopPeer[]
  error: string | null
}

export type IosHostStatus = MobileHostStatus

export interface ServerProfileSummary {
  profile_id: string
  mode: string
}

export interface BootstrapProfile {
  profile_id: string
  relay_url: string
}

export type RemoteHostsCallbacks = {
  onTransportLost?: () => void
  onUsbRecoveryRequired?: () => void
}

export type RemoteHostsFlowView = 'hosts' | 'pair-ios' | 'wait' | 'usb-mobile'
export type RemoteHostsPairPhase = 'idle' | 'starting' | 'waiting' | 'connecting' | 'success' | 'failed'
export type MobileHostTransportKind = 'wss_relay' | 'usb_mobile'
export type MobileHostPageState = 'off' | 'starting' | 'pairing' | 'ready' | 'connected' | 'error'

export function parsePairingOffer(rawInput: string): PairingOffer {
  const raw = rawInput.trim()
  if (!raw) {
    throw new Error(i18n('network-pair:error-offer-required'))
  }

  if (raw.startsWith('{')) {
    try {
      return validatePairingOffer(JSON.parse(raw), 'ios')
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(i18n('network-pair:error-offer-format'))
      }
      throw error
    }
  }

  if (raw.startsWith('chromvoid://')) {
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      throw new Error(i18n('network-pair:error-offer-format'))
    }
    if (parsed.protocol !== 'chromvoid:' || parsed.hostname !== 'pair-mobile') {
      throw new Error(i18n('network-pair:error-offer-format'))
    }
    return validatePairingOffer(
      {
        session_id: parsed.searchParams.get('session_id'),
        relay_base_url: parsed.searchParams.get('relay_base_url'),
        device_label: parsed.searchParams.get('device_label'),
        expires_at_ms: parsed.searchParams.get('expires_at_ms'),
        platform: parsed.searchParams.get('platform'),
      },
      'android',
    )
  }

  throw new Error(i18n('network-pair:error-offer-format'))
}

export function shouldAutoRefreshPresence(status: MobileHostStatus, now = Date.now()): boolean {
  if (status.phase !== 'Ready') return false

  const presence = status.presence
  if (!presence) return true

  return presence.status !== 'ready' || presence.expires_at_ms - now <= PRESENCE_AUTO_REFRESH_THRESHOLD_MS
}

export function resolveModeRemotePeerId(modeInfo: ModeInfo | null): string | null {
  return resolveRemoteHostId(resolveModeRemoteHost(modeInfo))
}

export function resolveActiveRemotePeerId(modeInfo: ModeInfo | null): string | null {
  return resolveRemoteHostId(resolveActiveRemoteHost(modeInfo))
}

export function resolveRemoteHostId(host: RemoteHost | null): string | null {
  if (!host) return null
  return host.type === 'tauri_remote_wss' ? host.peer_id : host.host_id
}

export function resolveModeRemoteHost(modeInfo: ModeInfo | null): RemoteHost | null {
  if (!modeInfo || !isRemoteMode(modeInfo.mode)) return null
  return modeInfo.mode.remote.host
}

export function resolveActiveRemoteHost(modeInfo: ModeInfo | null): RemoteHost | null {
  if (!modeInfo || modeInfo.connection_state === 'disconnected' || modeInfo.connection_state === 'error') {
    return null
  }
  return resolveModeRemoteHost(modeInfo)
}

function validatePairingOffer(offer: unknown, defaultPlatform: string): PairingOffer {
  if (!offer || typeof offer !== 'object' || Array.isArray(offer)) {
    throw new Error(i18n('network-pair:error-offer-fields'))
  }

  const candidate = offer as Record<string, unknown>
  const sessionId = candidate['session_id']
  const relayBaseUrl = candidate['relay_base_url']
  const deviceLabel = candidate['device_label']
  const expiresAtMs = Number(candidate['expires_at_ms'])
  const platform = candidate['platform']

  if (
    typeof sessionId !== 'string' ||
    !sessionId.trim() ||
    typeof relayBaseUrl !== 'string' ||
    !relayBaseUrl.trim() ||
    typeof deviceLabel !== 'string' ||
    !deviceLabel.trim() ||
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= 0 ||
    (platform !== undefined && platform !== null && typeof platform !== 'string')
  ) {
    throw new Error(i18n('network-pair:error-offer-fields'))
  }

  return {
    session_id: sessionId,
    relay_base_url: relayBaseUrl,
    device_label: deviceLabel,
    expires_at_ms: expiresAtMs,
    platform: (platform as string | null | undefined) ?? defaultPlatform,
  }
}
