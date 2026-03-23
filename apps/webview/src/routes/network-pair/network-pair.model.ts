import {computed, state} from '@statx/core'

import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'

const DEFAULT_IOS_RELAY_URL = 'wss://relay.chromvoid.com'
const PRESENCE_AUTO_REFRESH_THRESHOLD_MS = 30_000

export interface PairingOffer {
  session_id: string
  relay_base_url: string
  device_label: string
  expires_at_ms: number
}

export interface HostPresence {
  peer_id: string
  relay_url: string
  room_id: string
  expires_at_ms: number
  status: 'ready' | 'offline' | 'waking'
}

export type IosHostPhase = 'Idle' | 'Pairing' | 'Ready' | 'Error'

export interface IosHostStatus {
  phase: IosHostPhase
  relay_url: string | null
  device_id: string | null
  device_label: string | null
  pairing_pin: string | null
  pairing_offer: PairingOffer | null
  expires_at_ms: number | null
  presence: HostPresence | null
  paired_peer_id: string | null
  error: string | null
}

interface ServerProfileSummary {
  profile_id: string
  mode: string
}

interface BootstrapProfile {
  profile_id: string
  relay_url: string
}

export type NetworkPairPhase = 'idle' | 'starting' | 'waiting' | 'connecting' | 'success' | 'failed'

export class NetworkPairModel {
  readonly phase = state<NetworkPairPhase>('idle')
  readonly error = state<string | null>(null)
  readonly offerInput = state('')
  readonly pinInput = state('')
  readonly deviceLabel = state('')
  readonly hostStatus = state<IosHostStatus | null>(null)

  readonly isIosRuntime = computed<boolean>(() => getRuntimeCapabilities().platform === 'ios')
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
    })
    return `chromvoid://pair-ios?${params.toString()}`
  })
  readonly currentDeviceLabel = computed<string>(() => {
    const hostLabel = this.hostStatus()?.device_label?.trim()
    if (hostLabel) return hostLabel
    const input = this.deviceLabel().trim()
    if (input) return input
    return this.isIosRuntime() ? 'ChromVoid iPhone' : 'ChromVoid Desktop'
  })

  private pollTimer: ReturnType<typeof setInterval> | null = null
  private presenceRefreshPromise: Promise<void> | null = null

  initialize(): void {
    if (this.isIosRuntime()) {
      void this.refreshHostStatus()
    }
  }

  setOfferInput(value: string): void {
    this.offerInput.set(value)
  }

  setPinInput(value: string): void {
    this.pinInput.set(value.replace(/\s+/g, ''))
  }

  setDeviceLabel(value: string): void {
    this.deviceLabel.set(value)
  }

  async startPairing(): Promise<void> {
    console.info('[network-pair] startPairing', {
      isIosRuntime: this.isIosRuntime(),
      phase: this.phase(),
      deviceLabel: this.currentDeviceLabel(),
    })
    if (this.isIosRuntime()) {
      await this.startIosHostMode()
      return
    }
    await this.pairDesktopToIos()
  }

  async cancelPairing(): Promise<void> {
    console.info('[network-pair] cancelPairing', {
      isIosRuntime: this.isIosRuntime(),
      phase: this.phase(),
    })
    this.stopPolling()
    if (this.isIosRuntime()) {
      try {
        await tauriInvoke<unknown>('stop_ios_host_mode')
      } catch {
        // best-effort
      }
    }
    this.reset()
  }

  async refreshPresence(): Promise<void> {
    await this.refreshPresenceInternal(true)
  }

  private async refreshPresenceInternal(markFailureAsFatal: boolean): Promise<void> {
    if (!this.isIosRuntime()) return
    if (this.presenceRefreshPromise) {
      await this.presenceRefreshPromise
      return
    }

    this.presenceRefreshPromise = (async () => {
      try {
        const relayUrl = this.hostStatus()?.relay_url ?? (await this.resolveRelayUrl())
        const status = await tauriInvoke<IosHostStatus>('publish_ios_presence', {
          relayUrl,
        })
        this.applyHostStatus(status)
      } catch (e) {
        this.error.set(e instanceof Error ? e.message : String(e))
        if (markFailureAsFatal) {
          this.phase.set('failed')
        }
      } finally {
        this.presenceRefreshPromise = null
      }
    })()

    await this.presenceRefreshPromise
  }

  private async startIosHostMode(): Promise<void> {
    console.info('[network-pair] startIosHostMode:start', {
      deviceLabel: this.currentDeviceLabel(),
    })
    this.phase.set('starting')
    this.error.set(null)

    try {
      const relayUrl = await this.resolveRelayUrl()
      console.info('[network-pair] startIosHostMode:invoke', {relayUrl})
      const status = await tauriInvoke<IosHostStatus>('start_ios_host_mode', {
        relayUrl,
        deviceLabel: this.currentDeviceLabel(),
      })
      this.applyHostStatus(status)
      this.startPolling()
    } catch (e) {
      console.error('[network-pair] startIosHostMode:failed', e)
      this.error.set(e instanceof Error ? e.message : String(e))
      this.phase.set('failed')
    }
  }

  private async pairDesktopToIos(): Promise<void> {
    console.info('[network-pair] pairDesktopToIos:start', {
      offerLength: this.offerInput().trim().length,
      pinLength: this.pinInput().trim().length,
      deviceLabel: this.currentDeviceLabel(),
    })
    this.phase.set('connecting')
    this.error.set(null)

    try {
      const offer = this.parseOfferInput()
      const pin = this.pinInput().trim()
      if (!pin) {
        throw new Error('PIN is required')
      }

      console.info('[network-pair] pairDesktopToIos:invoke', {
        sessionId: offer.session_id,
        relayBaseUrl: offer.relay_base_url,
        offerDeviceLabel: offer.device_label,
        pinLength: pin.length,
        deviceLabel: this.currentDeviceLabel(),
      })
      await tauriInvoke<unknown>('desktop_pair_ios', {
        offer,
        pin,
        deviceLabel: this.currentDeviceLabel(),
      })
      console.info('[network-pair] pairDesktopToIos:success', {
        sessionId: offer.session_id,
      })
      this.phase.set('success')
    } catch (e) {
      console.error('[network-pair] pairDesktopToIos:failed', e)
      this.error.set(e instanceof Error ? e.message : String(e))
      this.phase.set('failed')
    }
  }

  private parseOfferInput(): PairingOffer {
    const raw = this.offerInput().trim()
    console.info('[network-pair] parseOfferInput', {
      rawLength: raw.length,
      format: raw.startsWith('{') ? 'json' : raw.startsWith('chromvoid://') ? 'deeplink' : 'unknown',
    })
    if (!raw) {
      throw new Error('Pairing offer is required')
    }

    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as Partial<PairingOffer>
      return this.validateOffer(parsed)
    }

    if (raw.startsWith('chromvoid://')) {
      const normalized = raw.replace('chromvoid://', 'https://chromvoid.local/')
      const parsed = new URL(normalized)
      return this.validateOffer({
        session_id: parsed.searchParams.get('session_id') ?? '',
        relay_base_url: parsed.searchParams.get('relay_base_url') ?? '',
        device_label: parsed.searchParams.get('device_label') ?? '',
        expires_at_ms: Number(parsed.searchParams.get('expires_at_ms') ?? '0'),
      })
    }

    throw new Error('Unsupported pairing offer format')
  }

  private validateOffer(offer: Partial<PairingOffer>): PairingOffer {
    if (!offer.session_id || !offer.relay_base_url || !offer.device_label || !offer.expires_at_ms) {
      throw new Error('Pairing offer is missing required fields')
    }
    return {
      session_id: offer.session_id,
      relay_base_url: offer.relay_base_url,
      device_label: offer.device_label,
      expires_at_ms: offer.expires_at_ms,
    }
  }

  private async refreshHostStatus(): Promise<void> {
    if (!this.isIosRuntime()) return

    try {
      const status = await tauriInvoke<IosHostStatus>('ios_host_status')
      this.applyHostStatus(status)
      if (this.shouldAutoRefreshPresence(status)) {
        await this.refreshPresenceInternal(false)
      }
      if (status.phase === 'Pairing' || status.phase === 'Ready') {
        this.startPolling()
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e))
      this.phase.set('failed')
    }
  }

  private shouldAutoRefreshPresence(status: IosHostStatus): boolean {
    if (status.phase !== 'Ready') return false

    const presence = status.presence
    if (!presence) return true

    return presence.status !== 'ready' || presence.expires_at_ms - Date.now() <= PRESENCE_AUTO_REFRESH_THRESHOLD_MS
  }

  private applyHostStatus(status: IosHostStatus): void {
    console.info('[network-pair] applyHostStatus', {
      phase: status.phase,
      hasOffer: status.pairing_offer !== null,
      hasPresence: status.presence !== null,
      error: status.error,
    })
    this.hostStatus.set(status)
    this.error.set(status.error)
    if (status.device_label) {
      this.deviceLabel.set(status.device_label)
    }

    switch (status.phase) {
      case 'Idle':
        this.phase.set('idle')
        this.stopPolling()
        break
      case 'Pairing':
        this.phase.set('waiting')
        break
      case 'Ready':
        this.phase.set('success')
        break
      case 'Error':
        this.phase.set('failed')
        break
    }
  }

  private startPolling(): void {
    if (this.pollTimer != null) return
    this.pollTimer = setInterval(() => {
      void this.refreshHostStatus()
    }, 2_000)
  }

  private stopPolling(): void {
    if (this.pollTimer != null) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  private async resolveRelayUrl(): Promise<string> {
    const profiles = await tauriInvoke<ServerProfileSummary[]>('network_list_server_profiles')
    console.info('[network-pair] resolveRelayUrl:profiles', {count: profiles?.length ?? 0})
    if (!profiles || profiles.length === 0) {
      console.info('[network-pair] resolveRelayUrl:fallback', {relayUrl: DEFAULT_IOS_RELAY_URL})
      return DEFAULT_IOS_RELAY_URL
    }

    const profileId = profiles[0]!.profile_id
    const bootstrap = await tauriInvoke<BootstrapProfile>('network_get_bootstrap_profile', {
      profileId,
    })
    console.info('[network-pair] resolveRelayUrl:bootstrap', {
      profileId,
      relayUrl: bootstrap.relay_url,
    })

    if (!bootstrap.relay_url) {
      throw new Error(`Server profile "${profileId}" has no relay URL configured.`)
    }
    return bootstrap.relay_url
  }

  private reset(): void {
    this.phase.set('idle')
    this.error.set(null)
    this.hostStatus.set(null)
    if (!this.isIosRuntime()) {
      this.offerInput.set('')
      this.pinInput.set('')
    }
  }

  dispose(): void {
    this.stopPolling()
  }
}
