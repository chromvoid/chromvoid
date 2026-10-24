import {atom, computed} from '@reatom/core'

import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {i18n} from 'root/i18n'

import type {
  ConnectedDesktopPeer,
  MobileHostPageState,
  MobileHostStatus,
  MobileHostTransportKind,
  PairingOffer,
  RemoteHostsPairPhase,
} from './remote-hosts-flow.contract'

const PAIR_PHASE_BY_HOST_STATUS = {
  Idle: 'idle',
  Pairing: 'waiting',
  Ready: 'success',
  Error: 'failed',
} as const satisfies Record<MobileHostStatus['phase'], RemoteHostsPairPhase>

export class RemoteMobileHostModel {
  readonly pairPhase = atom<RemoteHostsPairPhase>('idle')
  readonly pairError = atom<string | null>(null)
  readonly deviceLabel = atom('')
  readonly hostStatus = atom<MobileHostStatus | null>(null)
  readonly stopping = atom(false, 'remote.mobileHost.stopping')

  readonly isRuntime = computed<boolean>(() => {
    const capabilities = getRuntimeCapabilities()
    return capabilities.mobile && capabilities.supports_network_remote
  })

  // The webview hosts only on iOS; the native Android client has its own host.
  readonly platform = computed<string>(() => this.hostStatus()?.platform?.trim() || 'ios')

  readonly transports = computed<MobileHostTransportKind[]>(() =>
    this.isRuntime() ? ['wss_relay' as const] : [],
  )

  readonly pageState = computed<MobileHostPageState>(() => {
    const phase = this.pairPhase()
    const status = this.hostStatus()

    if (phase === 'starting') return 'starting'
    if (this.connectedNetworkPeers().length) return 'connected'
    if (phase === 'failed' || status?.phase === 'Error') return 'error'
    if (phase === 'waiting' || status?.phase === 'Pairing') return 'pairing'
    if (phase === 'success' || status?.phase === 'Ready') return 'ready'
    return 'off'
  }, 'remote.mobileHost.pageState')

  readonly connectedNetworkPeers = computed(
    () => this.filterConnectedPeers((peer) => peer.transport_type !== 'usb_mobile'),
    'remote.mobileHost.connectedNetworkPeers',
  )

  readonly pairingPin = computed<string>(() => this.hostStatus()?.pairing_pin ?? '')
  readonly offer = computed<PairingOffer | null>(() => this.hostStatus()?.pairing_offer ?? null)

  readonly offerText = computed<string>(() => {
    const offer = this.offer()
    if (!offer) return ''

    const params = new URLSearchParams({
      session_id: offer.session_id,
      relay_base_url: offer.relay_base_url,
      device_label: offer.device_label,
      expires_at_ms: String(offer.expires_at_ms),
      platform: offer.platform ?? this.platform(),
    })
    return `chromvoid://pair-mobile?${params.toString()}`
  })

  readonly currentDeviceLabel = computed<string>(() => {
    const hostLabel = this.hostStatus()?.device_label?.trim()
    if (hostLabel) return hostLabel

    const input = this.deviceLabel().trim()
    if (input) return input

    if (!this.isRuntime()) return i18n('network-pair:default-device-desktop')
    return i18n('network-pair:default-device-ios')
  })

  applyStatus(status: MobileHostStatus): boolean {
    this.hostStatus.set(status)
    this.pairError.set(status.error)
    if (status.device_label) this.deviceLabel.set(status.device_label)

    this.pairPhase.set(PAIR_PHASE_BY_HOST_STATUS[status.phase])
    return status.phase === 'Idle'
  }

  clearTransientErrors(): void {
    this.pairError.set(null)
    if (!this.isRuntime()) this.pairPhase.set('idle')
  }

  reset(): void {
    this.pairPhase.set('idle')
    this.pairError.set(null)
    this.hostStatus.set(null)
  }

  private filterConnectedPeers(
    predicate: (peer: ConnectedDesktopPeer) => boolean,
  ): ConnectedDesktopPeer[] {
    return this.hostStatus()?.connected_peers.filter(predicate) ?? []
  }
}
