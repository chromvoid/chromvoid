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
}

export type RemoteHostsFlowView = 'hosts' | 'pair-ios' | 'wait' | 'usb-mobile'
export type RemoteHostsPairPhase = 'idle' | 'starting' | 'waiting' | 'connecting' | 'success' | 'failed'
export type MobileHostTransportKind = 'wss_relay' | 'usb_mobile'
export type RemoteFlowScreen = 'hosts' | 'pair' | 'usb' | 'wait'

export type RemoteFlowSummaryItem = {
  label: string
  value: string
  state?: 'connected' | 'idle'
}

export function parsePairingOffer(rawInput: string): PairingOffer {
  const raw = rawInput.trim()
  if (!raw) {
    throw new Error(i18n('network-pair:error-offer-required'))
  }

  if (raw.startsWith('{')) {
    return validatePairingOffer(JSON.parse(raw) as Partial<PairingOffer>)
  }

  if (raw.startsWith('chromvoid://')) {
    const normalized = raw.replace('chromvoid://', 'https://chromvoid.local/')
    const parsed = new URL(normalized)
    const scheme = raw.slice('chromvoid://'.length).split('?')[0] ?? ''
    return validatePairingOffer({
      session_id: parsed.searchParams.get('session_id') ?? '',
      relay_base_url: parsed.searchParams.get('relay_base_url') ?? '',
      device_label: parsed.searchParams.get('device_label') ?? '',
      expires_at_ms: Number(parsed.searchParams.get('expires_at_ms') ?? '0'),
      platform: parsed.searchParams.get('platform') ?? (scheme === 'pair-mobile' ? 'android' : 'ios'),
    })
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
  return resolveRemotePeerId(modeInfo)
}

export function resolveActiveRemotePeerId(modeInfo: ModeInfo | null): string | null {
  if (!modeInfo) return null
  if (modeInfo.connection_state === 'disconnected' || modeInfo.connection_state === 'error') {
    return null
  }
  return resolveRemotePeerId(modeInfo)
}

function validatePairingOffer(offer: Partial<PairingOffer>): PairingOffer {
  if (!offer.session_id || !offer.relay_base_url || !offer.device_label || !offer.expires_at_ms) {
    throw new Error(i18n('network-pair:error-offer-fields'))
  }

  return {
    session_id: offer.session_id,
    relay_base_url: offer.relay_base_url,
    device_label: offer.device_label,
    expires_at_ms: offer.expires_at_ms,
    platform: offer.platform ?? 'ios',
  }
}

function resolveRemotePeerId(modeInfo: ModeInfo | null): string | null {
  if (!modeInfo || !isRemoteMode(modeInfo.mode)) return null
  const host = modeInfo.mode.remote.host as RemoteHost
  return host.type === 'tauri_remote_wss' ? host.peer_id : host.host_id
}
