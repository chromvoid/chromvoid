import {atom, wrap} from '@reatom/core'

import {listNetworkPairedPeers, type NetworkPairedPeer} from './remote.model'

export type RemotePeerLoadIntent = 'initial' | 'manual' | 'poll'
export type RemotePeerListErrorKind = 'initial' | 'refresh'

interface RemotePeerListOptions {
  isMobileHostRuntime: () => boolean
  transportConnected: () => boolean
  refreshMode: (silent: boolean) => Promise<void>
  clearGlobalError: () => void
  reportGlobalError: (message: string) => void
}

export class RemotePeerListModel {
  readonly peers = atom<NetworkPairedPeer[]>([], 'remote.hosts.peers')
  readonly loading = atom(false, 'remote.hosts.loadingPeers')
  readonly loaded = atom(false, 'remote.hosts.peerListLoaded')
  readonly error = atom<string | null>(null, 'remote.hosts.peerListError')
  readonly errorKind = atom<RemotePeerListErrorKind | null>(null, 'remote.hosts.peerListErrorKind')

  private pollingEnabled = false
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private pollRequestId: number | null = null
  private loadGeneration = 0

  constructor(private readonly options: RemotePeerListOptions) {}

  async load(intent: RemotePeerLoadIntent = 'manual'): Promise<void> {
    if (this.options.isMobileHostRuntime()) return
    this.pollingEnabled = true
    const foreground = intent !== 'poll'
    if (foreground && this.loading()) return
    if (!foreground && (this.loading() || this.pollRequestId !== null)) return

    const requestId = ++this.loadGeneration
    const firstLoad = !this.loaded()
    if (foreground) {
      this.pollRequestId = null
      this.loading.set(true)
      this.error.set(null)
      this.errorKind.set(null)
      this.options.clearGlobalError()
    } else {
      this.pollRequestId = requestId
    }

    try {
      const [peers] = await wrap(
        Promise.all([listNetworkPairedPeers(), this.options.refreshMode(intent === 'poll')]),
      )
      if (!this.isCurrent(requestId)) return
      this.peers.set(peers)
      this.loaded.set(true)
      this.error.set(null)
      this.errorKind.set(null)
    } catch (error) {
      if (!this.isCurrent(requestId) || !foreground) return
      const message = error instanceof Error ? error.message : String(error)
      this.loaded.set(true)
      this.error.set(message)
      this.errorKind.set(intent === 'initial' && firstLoad ? 'initial' : 'refresh')
      this.options.reportGlobalError(message)
    } finally {
      if (this.pollRequestId === requestId) this.pollRequestId = null
      if (!this.isCurrent(requestId)) return
      if (foreground) this.loading.set(false)
      this.resumeIfEnabled()
    }
  }

  pause(): void {
    this.pollingEnabled = false
    this.stopPolling()
  }

  stopPolling(): void {
    if (this.pollTimer !== null) clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  resumeIfEnabled(): void {
    if (!this.pollingEnabled || this.options.transportConnected()) return
    this.pollTimer ??= setInterval(
      wrap(() => void this.load('poll')),
      2_000,
    )
  }

  invalidate(): void {
    this.loadGeneration += 1
    this.pollRequestId = null
    this.loading.set(false)
  }

  private isCurrent(requestId: number): boolean {
    return requestId === this.loadGeneration
  }
}
