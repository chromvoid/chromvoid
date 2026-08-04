import {wrap} from '@reatom/core'

import {tauriInvoke, type UnlistenFn} from 'root/core/transport/tauri/ipc'
import {i18n} from 'root/i18n'

import {
  DEFAULT_IOS_RELAY_URL,
  type BootstrapProfile,
  type ServerProfileSummary,
} from './remote-hosts-flow.contract'
import {onMobileUsbInventoryChanged, onMobileUsbStatusChanged, type MobileUsbStatus} from './remote.model'
import type {RemoteUsbFlowModel} from './remote-usb-flow.model'

type PollTimer = ReturnType<typeof setInterval>

interface RemoteHostsPollingCallbacks {
  refreshMode: () => void
  refreshMobileHost: () => void
}

export class RemoteHostsPolling {
  private modeTimer: PollTimer | null = null
  private mobileHostTimer: PollTimer | null = null

  constructor(private readonly callbacks: RemoteHostsPollingCallbacks) {}

  startMode(): void {
    this.modeTimer ??= setInterval(wrap(this.callbacks.refreshMode), 2_000)
  }

  stopMode(): void {
    if (this.modeTimer !== null) clearInterval(this.modeTimer)
    this.modeTimer = null
  }

  startMobileHost(): void {
    this.mobileHostTimer ??= setInterval(wrap(this.callbacks.refreshMobileHost), 2_000)
  }

  stopMobileHost(): void {
    if (this.mobileHostTimer !== null) clearInterval(this.mobileHostTimer)
    this.mobileHostTimer = null
  }
}

interface RemoteUsbInventoryCallbacks {
  available: () => boolean
  applyStatus: (status: MobileUsbStatus) => void
}

export class RemoteUsbInventoryWatch {
  private inventoryUnlisten: Promise<UnlistenFn> | null = null
  private statusUnlisten: Promise<UnlistenFn> | null = null

  constructor(
    private readonly usb: RemoteUsbFlowModel,
    private readonly callbacks: RemoteUsbInventoryCallbacks,
  ) {}

  startStatus(): void {
    if (!this.callbacks.available() || this.statusUnlisten !== null) return
    this.statusUnlisten = onMobileUsbStatusChanged(wrap(this.callbacks.applyStatus)).catch(() => () => {})
  }

  stopStatus(): void {
    const statusUnlisten = this.statusUnlisten
    this.statusUnlisten = null
    if (statusUnlisten !== null) void statusUnlisten.then((dispose) => dispose())
  }

  activateInventory({refresh = true}: {refresh?: boolean} = {}): void {
    if (!this.callbacks.available() || !this.usb.activateDetectedInventory()) return
    this.startInventory()
    if (refresh) void this.usb.refreshDetectedDevices()
  }

  deactivateInventory(): void {
    this.stopInventory()
    this.usb.deactivateDetectedInventory()
  }

  startInventory(): void {
    if (!this.callbacks.available() || this.inventoryUnlisten !== null) return
    this.inventoryUnlisten = onMobileUsbInventoryChanged(
      wrap(() => void this.usb.refreshDetectedDevices()),
    ).catch(() => () => {})
  }

  stopInventory(): void {
    const inventoryUnlisten = this.inventoryUnlisten
    this.inventoryUnlisten = null
    if (inventoryUnlisten !== null) void inventoryUnlisten.then((dispose) => dispose())
  }
}

export async function resolveRemoteRelayUrl(): Promise<string> {
  const profiles = await wrap(tauriInvoke<ServerProfileSummary[]>('network_list_server_profiles'))
  if (!profiles || profiles.length === 0) return DEFAULT_IOS_RELAY_URL

  const profileId = profiles[0]!.profile_id
  const bootstrap = await wrap(tauriInvoke<BootstrapProfile>('network_get_bootstrap_profile', {profileId}))
  if (!bootstrap.relay_url) {
    throw new Error(i18n('network-pair:error-relay-missing', {profileId}))
  }
  return bootstrap.relay_url
}
