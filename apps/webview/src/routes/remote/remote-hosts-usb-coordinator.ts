import {wrap} from '@reatom/core'

import {i18n} from 'root/i18n'
import {dialogService} from 'root/shared/services/dialog'

import type {MobileUsbHostView} from './remote.model'
import type {RemoteUsbFlowModel} from './remote-usb-flow.model'

interface RemoteHostsUsbCoordinatorOptions {
  usb: RemoteUsbFlowModel
  available: () => boolean
  busy: () => boolean
  isOpen: () => boolean
  enter: () => void
  leave: () => void
  setRemovingHostId: (hostId: string | null) => void
}

export class RemoteHostsUsbCoordinator {
  private generation = 0

  constructor(private readonly options: RemoteHostsUsbCoordinatorOptions) {}

  open({scan = false}: {scan?: boolean} = {}): boolean {
    const {usb} = this.options
    if (!this.options.available() || this.options.busy()) return false
    const generation = ++this.generation
    const isCurrent = () => generation === this.generation && this.options.isOpen()

    const blocksAutoAdvance = () => {
      const summary = usb.desktopSummary()
      return summary.kind === 'checking' || summary.kind === 'multiple'
    }
    let passiveSelectionUnsafe = blocksAutoAdvance()

    this.options.enter()
    const detect = usb.refreshDetectedDevices()
    const refresh = usb.refreshStatus()
    if (!scan) return true

    const reconcileDetect = detect.then(
      wrap(() => {
        passiveSelectionUnsafe ||= blocksAutoAdvance()
      }),
    )
    void Promise.all([reconcileDetect, refresh]).then(
      wrap(([, statusReady]) => {
        if (!statusReady || !isCurrent()) return
        passiveSelectionUnsafe ||= blocksAutoAdvance()
        if (passiveSelectionUnsafe) {
          void usb.scan()
          return
        }
        void usb.scanAndConnectSingleHost(() => {
          passiveSelectionUnsafe ||= blocksAutoAdvance()
          return isCurrent() && !passiveSelectionUnsafe
        })
      }),
    )
    return true
  }

  async close(): Promise<boolean> {
    if (this.options.busy()) return false
    this.invalidate()
    if (this.options.usb.flowState() === 'pairing_approval') {
      const disconnected = await wrap(this.options.usb.disconnect())
      if (!disconnected) return false
    }
    this.options.leave()
    return true
  }

  invalidate(): void {
    this.generation += 1
  }

  async remove(hostId: string): Promise<boolean> {
    if (this.options.busy()) return false
    const host = this.findHost(hostId)
    if (!host) return false

    const label = host.label || host.host_id
    this.options.setRemovingHostId(host.host_id)
    try {
      const confirmed = await wrap(
        dialogService.showConfirmDialog({
          title: i18n('remote:preauth-remove-title'),
          message: i18n('remote:preauth-remove-description', {label}),
          confirmText: i18n('remote:preauth-remove-confirm'),
          confirmVariant: 'danger',
        }),
      )
      return confirmed ? await wrap(this.options.usb.removePaired(host.host_id)) : false
    } finally {
      this.options.setRemovingHostId(null)
    }
  }

  async dispatchPrimary(): Promise<boolean> {
    if (this.options.busy()) return false
    const action = this.options.usb.desktopPresentation().primaryAction
    if (action?.kind === 'back_to_hosts') return await wrap(this.close())
    if (action?.kind === 'remove') return await wrap(this.remove(action.hostId))
    return await wrap(this.options.usb.dispatchDesktopAction())
  }

  async run(action: () => Promise<boolean>): Promise<boolean> {
    return this.options.busy() ? false : await wrap(action())
  }

  private findHost(hostId: string): MobileUsbHostView | null {
    const {usb} = this.options
    const knownHost =
      usb.pairedHosts().find((host) => host.host_id === hostId) ??
      usb.status()?.paired_hosts.find((host) => host.host_id === hostId) ??
      null
    if (knownHost) return knownHost

    const detected = usb.detectedDevices().find(({paired_match}) => paired_match?.host_id === hostId)
    if (detected?.paired_match) {
      return {
        host_id: hostId,
        label: detected.paired_match.label || detected.scan.label || hostId,
        platform: detected.scan.platform,
        bridge_kind: detected.scan.bridge_kind,
        pairing_state:
          detected.paired_match.pairing_state === 'confirmed' ? 'paired' : 'broken_local_state',
        last_seen: null,
      }
    }

    const scannedHost = usb
      .scannedHostViews()
      .find(({pairedHostId, brokenHostId}) => pairedHostId === hostId || brokenHostId === hostId)
    if (!scannedHost) return null

    return {
      host_id: hostId,
      label: scannedHost.label ?? hostId,
      platform: scannedHost.source.scan.platform,
      bridge_kind: scannedHost.source.scan.bridge_kind,
      pairing_state: scannedHost.classification === 'broken_local_state' ? 'broken_local_state' : 'paired',
      last_seen: null,
    }
  }
}
