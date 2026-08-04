import type {MobileUsbDetectedDevice, NetworkPairedPeer} from './remote.model'

export type DesktopNetworkPeerStatus = Exclude<NetworkPairedPeer['status'], null> | 'unavailable'
export type DesktopNetworkPeerConnectAction = 'connect' | 'wake_connect'

export interface DesktopNetworkPeerPresentation {
  source: NetworkPairedPeer
  status: DesktopNetworkPeerStatus
  connectAction: DesktopNetworkPeerConnectAction
  lastSeenMs: number | null
}

export interface DesktopUsbDetectedDevicePresentation {
  source: MobileUsbDetectedDevice
  label: string
  availability: 'available' | 'needs_attention'
}

export type DesktopUsbSummaryPresentation =
  | {kind: 'hidden'}
  | {kind: 'checking'}
  | {kind: 'none'}
  | {
      kind: 'single'
      availability: 'available' | 'needs_attention'
      label: string
      device: DesktopUsbDetectedDevicePresentation
    }
  | {
      kind: 'multiple'
      availability: 'available' | 'needs_attention'
      devices: DesktopUsbDetectedDevicePresentation[]
    }

export interface DesktopRemoteHostsPresentation {
  networkPeers: DesktopNetworkPeerPresentation[]
  usb: DesktopUsbSummaryPresentation
}

export interface DesktopRemoteHostsPresentationInput {
  peers: NetworkPairedPeer[]
  usbSupported: boolean
  usbChecking: boolean
  usbDevices: MobileUsbDetectedDevice[]
}

function getNetworkStatusOrder(status: NetworkPairedPeer['status']): number {
  if (status === 'ready') return 0
  if (status === 'waking') return 1
  return 2
}

export function normalizeRemoteTimestampMs(value: number | null): number | null {
  if (value === null) return null
  return value < 100_000_000_000 ? value * 1_000 : value
}

export function compareDesktopNetworkPeers(a: NetworkPairedPeer, b: NetworkPairedPeer): number {
  const statusDifference = getNetworkStatusOrder(a.status) - getNetworkStatusOrder(b.status)
  if (statusDifference !== 0) return statusDifference

  const lastSeenDifference = b.last_seen - a.last_seen
  if (lastSeenDifference !== 0) return lastSeenDifference

  if (a.peer_id < b.peer_id) return -1
  if (a.peer_id > b.peer_id) return 1
  return 0
}

export function deriveDesktopNetworkPeerPresentations(
  peers: NetworkPairedPeer[],
): DesktopNetworkPeerPresentation[] {
  return [...peers].sort(compareDesktopNetworkPeers).map((source) => ({
    source,
    status: source.status ?? 'unavailable',
    connectAction: source.platform === 'ios' && source.status !== 'ready' ? 'wake_connect' : 'connect',
    lastSeenMs: normalizeRemoteTimestampMs(source.last_seen),
  }))
}

export function deriveDesktopUsbSummaryPresentation({
  supported,
  checking,
  devices,
}: {
  supported: boolean
  checking: boolean
  devices: MobileUsbDetectedDevice[]
}): DesktopUsbSummaryPresentation {
  if (!supported) return {kind: 'hidden'}
  if (checking) return {kind: 'checking'}
  if (devices.length === 0) return {kind: 'none'}

  const presentations = devices.map(deriveDesktopUsbDetectedDevicePresentation)
  if (devices.length === 1) {
    const device = presentations[0]!
    return {
      kind: 'single',
      availability: device.availability,
      label: device.label,
      device,
    }
  }

  return {
    kind: 'multiple',
    availability: presentations.some(({availability}) => availability === 'needs_attention')
      ? 'needs_attention'
      : 'available',
    devices: presentations,
  }
}

function deriveDesktopUsbDetectedDevicePresentation(
  source: MobileUsbDetectedDevice,
): DesktopUsbDetectedDevicePresentation {
  return {
    source,
    label:
      source.paired_match?.label ??
      source.scan.label ??
      source.scan.usb_hint.model ??
      source.scan.usb_hint.manufacturer ??
      source.scan.platform,
    availability:
      source.paired_match === null || source.paired_match.pairing_state === 'confirmed'
        ? 'available'
        : 'needs_attention',
  }
}

export function deriveDesktopRemoteHostsPresentation({
  peers,
  usbSupported,
  usbChecking,
  usbDevices,
}: DesktopRemoteHostsPresentationInput): DesktopRemoteHostsPresentation {
  return {
    networkPeers: deriveDesktopNetworkPeerPresentations(peers),
    usb: deriveDesktopUsbSummaryPresentation({
      supported: usbSupported,
      checking: usbChecking,
      devices: usbDevices,
    }),
  }
}
