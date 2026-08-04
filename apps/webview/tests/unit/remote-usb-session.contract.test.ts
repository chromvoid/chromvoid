import {describe, expect, it} from 'vitest'

import {deriveDesktopUsbRemoteSessionPresentation} from '../../src/routes/remote/remote-usb-session.contract'
import type {
  MobileUsbHostView,
  MobileUsbStatus,
  SyncSnapshot,
} from '../../src/routes/remote/remote.model'

const host: MobileUsbHostView = {
  host_id: 'usb-host-1',
  label: 'OnePlus 13',
  platform: 'android',
  bridge_kind: 'android_aoa',
  pairing_state: 'paired',
  last_seen: 1_730_000_000_000,
}

const syncSnapshot: SyncSnapshot = {
  state: 'synced',
  progress: null,
  lastSyncMs: 1_730_000_000_000,
  writerLock: null,
  errorMessage: null,
}

function usbStatus(
  sessionState: MobileUsbStatus['session_state'],
  overrides: Partial<MobileUsbStatus> = {},
): MobileUsbStatus {
  return {
    transport_family: 'usb_mobile',
    available_transports: ['usb_mobile'],
    selected_transport: 'usb_mobile',
    session_state: sessionState,
    fallback_allowed: false,
    active_host: host,
    paired_hosts: [host],
    pairing_approval: null,
    in_flight: null,
    error_code: null,
    ...overrides,
  }
}

function derive(
  overrides: Partial<Parameters<typeof deriveDesktopUsbRemoteSessionPresentation>[0]> = {},
) {
  return deriveDesktopUsbRemoteSessionPresentation({
    currentMode: {remote: {host: {type: 'mobile_usb', host_id: host.host_id, label: host.label, platform: 'android'}}},
    connectionState: 'ready',
    remoteSessionState: 'inactive',
    remoteStatus: {
      connection_state: 'ready',
      vault_locked: false,
      locked_by_other: false,
      writer_device: null,
    },
    syncSnapshot,
    usbStatus: usbStatus('transport_ready_host_locked'),
    lastActiveHost: host,
    usbPanelOpen: false,
    usbErrorText: null,
    switchingToLocal: false,
    ...overrides,
  })
}

describe('desktop USB Remote session presentation', () => {
  it('keeps access pending while the mobile host vault is locked', () => {
    const presentation = derive()

    expect(presentation).toMatchObject({
      stage: 'waiting_host_unlock',
      host: {hostId: 'usb-host-1', label: 'OnePlus 13', platform: 'android'},
      access: 'pending',
    })
  })

  it('uses the safe host-unlock state while USB mode metadata is still loading', () => {
    expect(derive({usbStatus: null, lastActiveHost: null})).toMatchObject({
      stage: 'waiting_host_unlock',
      access: 'pending',
      host: {label: 'OnePlus 13'},
    })
  })

  it('shows phone approval as a separate pending state', () => {
    expect(derive({usbStatus: usbStatus('session_approval_required')})).toMatchObject({
      stage: 'waiting_phone_approval',
      access: 'pending',
    })
  })

  it('grants write access only after the Remote dashboard is open', () => {
    expect(derive({usbStatus: usbStatus('remote_dashboard_open')})).toMatchObject({
      stage: 'ready',
      access: 'write',
    })
  })

  it('presents a ready writer-locked session as read-only', () => {
    const writerLock = {holder: 'Office Mac', since_ms: 1_730_000_000_000}
    expect(
      derive({
        usbStatus: usbStatus('remote_dashboard_open'),
        syncSnapshot: {...syncSnapshot, writerLock},
      }),
    ).toMatchObject({
      stage: 'ready',
      access: 'read_only',
      writerLockHolder: 'Office Mac',
    })
  })

  it('retains the last host identity for cable-loss recovery', () => {
    expect(
      derive({
        currentMode: 'local',
        connectionState: 'disconnected',
        usbStatus: usbStatus('disconnected', {active_host: null}),
      }),
    ).toMatchObject({
      stage: 'connection_lost',
      host: {hostId: 'usb-host-1', label: 'OnePlus 13'},
      access: 'pending',
    })
  })

  it('exposes a USB error only after a USB host identity exists', () => {
    expect(
      derive({
        usbStatus: usbStatus('error', {
          active_host: null,
          error_code: 'ERR_USB_MOBILE_CABLE_DISCONNECTED',
        }),
        usbErrorText: 'USB session ended',
      }),
    ).toMatchObject({
      stage: 'error',
      errorCode: 'ERR_USB_MOBILE_CABLE_DISCONNECTED',
      errorText: 'USB session ended',
    })
  })

  it('does not replace the network or pre-connect USB flows', () => {
    expect(
      derive({
        currentMode: {remote: {host: {type: 'tauri_remote_wss', peer_id: 'network-peer'}}},
        usbStatus: null,
        lastActiveHost: null,
      }),
    ).toBeNull()
    expect(derive({usbPanelOpen: true})).toBeNull()
  })
})
