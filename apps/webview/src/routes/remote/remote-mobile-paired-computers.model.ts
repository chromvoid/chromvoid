import {action, atom, computed, withAbort, withAsync, withAsyncData, wrap} from '@reatom/core'

import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {i18n} from 'root/i18n'
import {dialogService} from 'root/shared/services/dialog'

import type {
  ConnectedDesktopPeer,
  MobileHostPairedComputer,
  MobileHostPairingTransport,
  MobileHostRevokeResult,
  MobileHostStatus,
} from './remote-hosts-flow.contract'

export interface MobileHostPairedComputerRow extends MobileHostPairedComputer {
  connected: boolean
  display_transport: MobileHostPairingTransport
}

type RefreshOptions = {
  allowRevokedReentry?: boolean
}

type Dependencies = {
  hostStatus: () => MobileHostStatus | null
  hostOperationBusy: () => boolean
  refreshHostStatus: () => Promise<void>
  invoke?: typeof tauriInvoke
  confirm?: typeof dialogService.showConfirmDialog
}

export class RemoteMobilePairedComputersModel {
  private readonly invoke: typeof tauriInvoke
  private readonly confirm: typeof dialogService.showConfirmDialog
  private connected = false
  private refreshGeneration = 0
  private lastPairingRefreshPeerId: string | null = null
  private readonly revokedPeerIds = atom<ReadonlySet<string>>(
    new Set<string>(),
    'remote.mobilePairedComputers.revokedPeerIds',
  )

  private readonly listResource = action(
    async (): Promise<MobileHostPairedComputer[]> =>
      await wrap(this.invoke<MobileHostPairedComputer[]>('mobile_host_list_paired_computers')),
    'remote.mobilePairedComputers.list',
  ).extend(withAsyncData({initState: [] as MobileHostPairedComputer[]}))

  private readonly revokeMutation = action(
    async (row: MobileHostPairedComputerRow): Promise<MobileHostRevokeResult | null> => {
      if (!this.connected || this.dependencies.hostOperationBusy()) return null
      this.revokingPeerId.set(row.peer_id)
      this.errorText.set(null)
      this.statusText.set(null)
      try {
        const confirmed = await wrap(
          this.confirm({
            title: i18n('remote:mobile-paired-revoke-title'),
            message: i18n(
              row.connected
                ? 'remote:mobile-paired-revoke-connected-description'
                : 'remote:mobile-paired-revoke-description',
              {label: row.label || row.peer_id},
            ),
            confirmText: i18n('remote:mobile-paired-revoke-action'),
            confirmVariant: 'danger',
          }),
        )
        if (!confirmed || !this.connected) return null

        const result = await wrap(
          this.invoke<MobileHostRevokeResult>('mobile_host_revoke_paired_computer', {
            peerId: row.peer_id,
          }),
        )
        if (!this.connected) return null
        if (this.lastPairingRefreshPeerId === row.peer_id) this.lastPairingRefreshPeerId = null
        this.revokedPeerIds.set(new Set([...this.revokedPeerIds(), row.peer_id]))
        await wrap(this.refresh())
        if (this.connected) await wrap(this.dependencies.refreshHostStatus())
        if (!this.connected) return result
        this.statusText.set(i18n('remote:mobile-paired-revoked-status', {label: row.label || row.peer_id}))
        if (result.session_action === 'disconnect_failed') {
          this.recoveryWarning.set(i18n('remote:mobile-paired-revoke-disconnect-warning'))
        }
        return result
      } catch (error) {
        if (this.connected && !isAbortError(error)) this.errorText.set(errorMessage(error))
        return null
      } finally {
        if (this.revokingPeerId() === row.peer_id) this.revokingPeerId.set(null)
      }
    },
    'remote.mobilePairedComputers.revoke',
  ).extend(withAsync(), withAbort('first-in-win'))

  readonly loaded = atom(false, 'remote.mobilePairedComputers.loaded')
  readonly errorText = atom<string | null>(null, 'remote.mobilePairedComputers.errorText')
  readonly recoveryWarning = atom<string | null>(null, 'remote.mobilePairedComputers.recoveryWarning')
  readonly statusText = atom<string | null>(null, 'remote.mobilePairedComputers.statusText')
  readonly revokingPeerId = atom<string | null>(null, 'remote.mobilePairedComputers.revokingPeerId')
  readonly loading = computed(
    () => !this.loaded() && this.listResource.pending() > 0,
    'remote.mobilePairedComputers.loading',
  )
  readonly refreshing = computed(
    () => this.loaded() && this.listResource.pending() > 0,
    'remote.mobilePairedComputers.refreshing',
  )
  readonly operationBusy = computed(
    () => this.revokingPeerId() !== null,
    'remote.mobilePairedComputers.operationBusy',
  )
  readonly rows = computed<MobileHostPairedComputerRow[]>(() => {
    const connectedById = new Map(
      (this.dependencies.hostStatus()?.connected_peers ?? []).map((peer) => [peer.peer_id, peer]),
    )
    const revoked = this.revokedPeerIds()
    return this.listResource
      .data()
      .filter((computer) => !revoked.has(computer.peer_id))
      .map((computer) => presentComputer(computer, connectedById.get(computer.peer_id)))
      .sort(compareComputerRows)
  }, 'remote.mobilePairedComputers.rows')

  constructor(private readonly dependencies: Dependencies) {
    this.invoke = dependencies.invoke ?? tauriInvoke
    this.confirm = dependencies.confirm ?? dialogService.showConfirmDialog.bind(dialogService)
  }

  connect(): void {
    if (this.connected) return
    this.connected = true
    void this.refresh()
  }

  disconnect(): void {
    if (!this.connected) return
    this.connected = false
    this.refreshGeneration += 1
    this.listResource.abort()
    this.revokeMutation.abort()
    this.revokingPeerId.set(null)
    this.statusText.set(null)
  }

  async refresh(options: RefreshOptions = {}): Promise<boolean> {
    if (!this.connected) return false
    const requestId = ++this.refreshGeneration
    this.recoveryWarning.set(null)
    try {
      const computers = await wrap(this.listResource())
      if (!this.isCurrent(requestId)) return false
      this.loaded.set(true)
      this.errorText.set(null)
      if (options.allowRevokedReentry) {
        const storedIds = new Set(computers.map(({peer_id}) => peer_id))
        this.revokedPeerIds.set(
          new Set([...this.revokedPeerIds()].filter((peerId) => !storedIds.has(peerId))),
        )
      }
      return true
    } catch (error) {
      if (this.isCurrent(requestId) && !isAbortError(error)) {
        this.errorText.set(errorMessage(error))
      }
      return false
    }
  }

  async revoke(peerId: string): Promise<MobileHostRevokeResult | null> {
    if (this.operationBusy() || this.dependencies.hostOperationBusy()) return null
    const row = this.rows().find(({peer_id}) => peer_id === peerId)
    if (!row) return null
    return await wrap(this.revokeMutation(row))
  }

  handleHostStatus(status: MobileHostStatus): void {
    const knownIds = new Set(this.listResource.data().map(({peer_id}) => peer_id))
    const newlyPairedId = [status.paired_peer_id, ...status.connected_peers.map(({peer_id}) => peer_id)]
      .filter((peerId): peerId is string => Boolean(peerId))
      .find((peerId) => !knownIds.has(peerId))
    if (
      !newlyPairedId ||
      newlyPairedId === this.lastPairingRefreshPeerId ||
      this.loading() ||
      this.refreshing()
    )
      return

    this.lastPairingRefreshPeerId = newlyPairedId
    void this.refresh({allowRevokedReentry: true})
  }

  private isCurrent(requestId: number): boolean {
    return this.connected && requestId === this.refreshGeneration
  }
}

function presentComputer(
  computer: MobileHostPairedComputer,
  connectedPeer?: ConnectedDesktopPeer,
): MobileHostPairedComputerRow {
  return {
    ...computer,
    connected: Boolean(connectedPeer),
    display_transport: connectedPeer
      ? connectedPeer.transport_type === 'usb_mobile'
        ? 'usb_mobile'
        : 'network'
      : computer.pairing_transport,
  }
}

function compareComputerRows(left: MobileHostPairedComputerRow, right: MobileHostPairedComputerRow): number {
  if (left.connected !== right.connected) return left.connected ? -1 : 1
  if (left.last_seen_ms !== right.last_seen_ms) return right.last_seen_ms - left.last_seen_ms
  return left.peer_id.localeCompare(right.peer_id)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
