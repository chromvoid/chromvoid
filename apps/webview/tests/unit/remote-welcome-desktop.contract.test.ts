import {describe, expect, it} from 'vitest'

import {
  deriveDesktopNetworkPeerPresentations,
  deriveDesktopRemoteHostsPresentation,
  deriveDesktopUsbSummaryPresentation,
  normalizeRemoteTimestampMs,
} from '../../src/routes/remote/remote-desktop-preauth.contract'
import type {MobileUsbDetectedDevice, NetworkPairedPeer} from '../../src/routes/remote/remote.model'

function networkPeer(overrides: Partial<NetworkPairedPeer> = {}): NetworkPairedPeer {
  return {
    peer_id: 'peer-1',
    label: 'Phone',
    relay_url: 'wss://relay.chromvoid.com',
    last_seen: 0,
    paired_at: 0,
    platform: 'ios',
    status: 'ready',
    presence_expires_at_ms: null,
    ...overrides,
  }
}

function detectedDevice(overrides: Partial<MobileUsbDetectedDevice> = {}): MobileUsbDetectedDevice {
  return {
    scan: {
      platform: 'android',
      bridge_kind: 'android_aoa',
      usb_hint: {manufacturer: 'Google', model: 'Pixel'},
      label: null,
    },
    accessory_mode: false,
    paired_match: null,
    ...overrides,
  }
}

describe('desktop pre-auth Remote presentation contract', () => {
  it('normalizes backend Unix-second timestamps without changing millisecond values', () => {
    expect(normalizeRemoteTimestampMs(1_700_000_000)).toBe(1_700_000_000_000)
    expect(normalizeRemoteTimestampMs(1_700_000_000_000)).toBe(1_700_000_000_000)
    expect(normalizeRemoteTimestampMs(null)).toBeNull()
  })

  it('orders network peers by readiness, recency, and stable peer id without mutating input', () => {
    const peers = [
      networkPeer({peer_id: 'null-peer', status: null, last_seen: 99}),
      networkPeer({peer_id: 'offline-peer', status: 'offline', last_seen: 100}),
      networkPeer({peer_id: 'waking-peer', status: 'waking', last_seen: 1}),
      networkPeer({peer_id: 'ready-b', status: 'ready', last_seen: 20}),
      networkPeer({peer_id: 'ready-a', status: 'ready', last_seen: 20}),
      networkPeer({peer_id: 'ready-newest', status: 'ready', last_seen: 30}),
    ]

    const presentation = deriveDesktopNetworkPeerPresentations(peers)

    expect(presentation.map(({source}) => source.peer_id)).toEqual([
      'ready-newest',
      'ready-a',
      'ready-b',
      'waking-peer',
      'offline-peer',
      'null-peer',
    ])
    expect(peers.map(({peer_id}) => peer_id)).toEqual([
      'null-peer',
      'offline-peer',
      'waking-peer',
      'ready-b',
      'ready-a',
      'ready-newest',
    ])
  })

  it('keeps unavailable distinct from offline and reserves Wake & Connect for non-ready iOS peers', () => {
    const presentation = deriveDesktopNetworkPeerPresentations([
      networkPeer({peer_id: 'ios-null', platform: 'ios', status: null}),
      networkPeer({peer_id: 'ios-offline', platform: 'ios', status: 'offline'}),
      networkPeer({peer_id: 'ios-ready', platform: 'ios', status: 'ready'}),
      networkPeer({peer_id: 'android-waking', platform: 'android', status: 'waking'}),
      networkPeer({peer_id: 'network-offline', platform: 'linux', status: 'offline'}),
    ])
    const byId = new Map(presentation.map((peer) => [peer.source.peer_id, peer]))

    expect(byId.get('ios-null')).toMatchObject({status: 'unavailable', connectAction: 'wake_connect'})
    expect(byId.get('ios-offline')).toMatchObject({status: 'offline', connectAction: 'wake_connect'})
    expect(byId.get('ios-ready')).toMatchObject({status: 'ready', connectAction: 'connect'})
    expect(byId.get('android-waking')).toMatchObject({status: 'waking', connectAction: 'connect'})
    expect(byId.get('network-offline')).toMatchObject({status: 'offline', connectAction: 'connect'})
  })

  it('projects network last-seen seconds as milliseconds for display', () => {
    const [peer] = deriveDesktopNetworkPeerPresentations([
      networkPeer({last_seen: Math.floor(Date.now() / 1_000)}),
    ])

    expect(peer?.lastSeenMs).toBeGreaterThan(Date.now() - 2_000)
    expect(peer?.lastSeenMs).toBeLessThanOrEqual(Date.now())
  })

  it('projects hidden, checking, and resolved-empty USB summaries', () => {
    expect(deriveDesktopUsbSummaryPresentation({supported: false, checking: true, devices: []})).toEqual({
      kind: 'hidden',
    })
    expect(deriveDesktopUsbSummaryPresentation({supported: true, checking: true, devices: []})).toEqual({
      kind: 'checking',
    })
    expect(deriveDesktopUsbSummaryPresentation({supported: true, checking: false, devices: []})).toEqual({
      kind: 'none',
    })
  })

  it('labels a single detected device and distinguishes available from needs-attention', () => {
    const available = deriveDesktopUsbSummaryPresentation({
      supported: true,
      checking: false,
      devices: [detectedDevice()],
    })
    const needsAttention = deriveDesktopUsbSummaryPresentation({
      supported: true,
      checking: false,
      devices: [
        detectedDevice({
          paired_match: {host_id: 'host-1', label: 'Saved Pixel', pairing_state: 'incomplete'},
        }),
      ],
    })

    expect(available).toMatchObject({kind: 'single', availability: 'available', label: 'Pixel'})
    expect(needsAttention).toMatchObject({
      kind: 'single',
      availability: 'needs_attention',
      label: 'Saved Pixel',
    })
  })

  it('keeps multiple passive devices explicit and never exposes an implicit single target', () => {
    const presentation = deriveDesktopUsbSummaryPresentation({
      supported: true,
      checking: false,
      devices: [
        detectedDevice({scan: {...detectedDevice().scan, label: 'Pixel 1'}}),
        detectedDevice({
          scan: {...detectedDevice().scan, label: 'Pixel 2'},
          paired_match: {host_id: 'host-2', label: 'Pixel 2', pairing_state: 'incomplete'},
        }),
      ],
    })

    expect(presentation).toMatchObject({
      kind: 'multiple',
      availability: 'needs_attention',
      devices: [{label: 'Pixel 1'}, {label: 'Pixel 2'}],
    })
    expect('device' in presentation).toBe(false)
  })

  it('combines the network and USB projections without changing source contracts', () => {
    const presentation = deriveDesktopRemoteHostsPresentation({
      peers: [networkPeer({peer_id: 'peer-offline', status: 'offline'})],
      usbSupported: true,
      usbChecking: false,
      usbDevices: [detectedDevice()],
    })

    expect(presentation.networkPeers[0]).toMatchObject({
      source: {peer_id: 'peer-offline'},
      status: 'offline',
    })
    expect(presentation.usb).toMatchObject({kind: 'single', label: 'Pixel'})
  })
})
