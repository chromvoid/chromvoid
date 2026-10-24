import {atom} from '@reatom/core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import type {RemoteSessionState} from '../../src/app/state/store'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {RemotePageModel} from '../../src/routes/remote/remote-page.model'
import type {MobileUsbHostView, MobileUsbStatus} from '../../src/routes/remote/remote.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {dialogService} from '../../src/shared/services/dialog'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
  tauriListen: async () => () => {},
}))

const phoneA: MobileUsbHostView = {
  host_id: 'phone-a',
  label: 'Previously connected phone A',
  platform: 'android',
  bridge_kind: 'android_aoa',
  pairing_state: 'paired',
  last_seen: null,
}
const phoneB: MobileUsbHostView = {...phoneA, host_id: 'phone-b', label: 'Silent phone B'}

function usbStatus(overrides: Partial<MobileUsbStatus> = {}): MobileUsbStatus {
  return {
    transport_family: 'usb_mobile',
    available_transports: ['usb_mobile'],
    selected_transport: null,
    session_state: 'idle_usb_mobile',
    fallback_allowed: false,
    active_host: null,
    paired_hosts: [phoneA, phoneB],
    pairing_approval: null,
    in_flight: null,
    error_code: null,
    ...overrides,
  }
}

describe('USB session recovery target', () => {
  let model: RemotePageModel

  beforeEach(() => {
    tauriInvoke.mockReset()
    resetRuntimeCapabilities()
    setRuntimeCapabilities({desktop: true, supports_mobile_usb_remote: true})
    navigationModel.disconnect()
    clearAppContext()
    const context = createMockAppContext()
    context.store.remoteSessionState = atom<RemoteSessionState>('inactive')
    initAppContext(context)
    model = new RemotePageModel()
    vi.spyOn(navigationModel, 'navigateToRemotePanel').mockImplementation(() => {})
  })

  afterEach(() => {
    model.remoteHosts.disconnect()
    vi.restoreAllMocks()
    resetRuntimeCapabilities()
    navigationModel.disconnect()
    clearAppContext()
  })

  async function connectAThenFailB(): Promise<void> {
    let status = usbStatus()
    let paired = [phoneA, phoneB]
    let bAttempts = 0
    tauriInvoke.mockImplementation(async (command: string, args?: {hostId: string}) => {
      switch (command) {
        case 'mobile_usb_connect': {
          const host = paired.find(({host_id}) => host_id === args?.hostId)
          if (!host) throw new Error(`Unknown USB host: ${args?.hostId}`)
          if (host.host_id === phoneB.host_id && bAttempts++ === 0) {
            status = usbStatus({
              session_state: 'error',
              error_code: 'ERR_USB_MOBILE_PHONE_NOT_RESPONDING',
              paired_hosts: paired,
            })
            throw new Error('ERR_USB_MOBILE_PHONE_NOT_RESPONDING: no IK response')
          }
          status = usbStatus({
            selected_transport: 'usb_mobile',
            session_state: 'remote_dashboard_open',
            active_host: host,
            paired_hosts: paired,
          })
          return status
        }
        case 'mobile_usb_disconnect':
          status = usbStatus({session_state: 'disconnected', paired_hosts: paired})
          return status
        case 'mobile_usb_remove_paired':
          paired = paired.filter(({host_id}) => host_id !== args?.hostId)
          status = usbStatus({paired_hosts: paired})
          return paired
        case 'mobile_usb_status':
          return status
        case 'mobile_usb_detect':
          return []
        default:
          throw new Error(`Unexpected command: ${command}`)
      }
    })

    await expect(model.remoteHosts.connectUsbPairedHost(phoneA.host_id)).resolves.toBe(true)
    await expect(model.remoteHosts.disconnectUsb()).resolves.toBe(true)
    await expect(model.remoteHosts.connectUsbPairedHost(phoneB.host_id)).resolves.toBe(false)
    model.remoteHosts.usb.applyStatusEvent(status)

    expect(model.remoteHosts.usb.lastActiveHost()).toEqual(phoneA)
    expect(model.remoteHosts.usb.status()).toMatchObject({
      active_host: null,
      session_state: 'error',
      error_code: 'ERR_USB_MOBILE_PHONE_NOT_RESPONDING',
      paired_hosts: [phoneA, phoneB],
    })
  }

  it('retries failed phone B after phone A was successfully connected and disconnected', async () => {
    await connectAThenFailB()

    model.retryUsbSession()

    await vi.waitFor(() => expect(model.remoteHosts.usb.busy()).toBe(false))
    expect(tauriInvoke.mock.calls.filter(([command]) => command === 'mobile_usb_connect')).toEqual([
      ['mobile_usb_connect', {hostId: phoneA.host_id}],
      ['mobile_usb_connect', {hostId: phoneB.host_id}],
      ['mobile_usb_connect', {hostId: phoneB.host_id}],
    ])
    expect(model.remoteHosts.usb.status()?.active_host).toEqual(phoneB)
  })

  it('confirms and forgets failed phone B while preserving the previous phone A pairing', async () => {
    await connectAThenFailB()
    const confirm = vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)

    await model.forgetUsbSessionPhone()

    expect(tauriInvoke).toHaveBeenCalledWith('mobile_usb_remove_paired', {hostId: phoneB.host_id})
    expect(tauriInvoke).not.toHaveBeenCalledWith('mobile_usb_remove_paired', {hostId: phoneA.host_id})
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({message: expect.stringContaining(phoneB.label)}))
    expect(model.remoteHosts.usb.pairedHosts()).toEqual([phoneA])
    expect(model.remoteHosts.view()).toBe('usb-mobile')
    expect(navigationModel.navigateToRemotePanel).toHaveBeenCalledWith('usb-mobile')
  })

  it('dismisses silent phone B recovery when the user chooses the local vault', async () => {
    await connectAThenFailB()
    expect(model.currentMode()).toBe('local')
    expect(model.desktopUsbSessionPresentation()).toMatchObject({
      stage: 'error',
      host: {hostId: phoneB.host_id},
      errorCode: 'ERR_USB_MOBILE_PHONE_NOT_RESPONDING',
    })

    model.switchToLocal()

    expect(model.remoteHosts.usb.status()?.error_code).toBe('ERR_USB_MOBILE_PHONE_NOT_RESPONDING')
    expect(model.remoteHosts.usb.activeErrorCode()).toBeNull()
    expect(model.remoteHosts.usb.lastActiveHost()).toBeNull()
    expect(model.remoteHosts.usb.silentPhoneRecoveryHostId()).toBeNull()
    expect(model.remoteHosts.usb.silentPhoneRecoveryHost()).toBeNull()
    expect(model.desktopUsbSessionPresentation()).toBeNull()
  })

  it('dismisses silent phone recovery without a known target when the user chooses the local vault', () => {
    model.remoteHosts.usb.applyStatusEvent(usbStatus({
      session_state: 'error',
      active_host: null,
      error_code: 'ERR_USB_MOBILE_PHONE_NOT_RESPONDING',
    }))
    expect(model.currentMode()).toBe('local')
    expect(model.desktopUsbSessionPresentation()).toMatchObject({stage: 'error', host: null})

    model.switchToLocal()

    expect(model.remoteHosts.usb.status()?.error_code).toBe('ERR_USB_MOBILE_PHONE_NOT_RESPONDING')
    expect(model.remoteHosts.usb.activeErrorCode()).toBeNull()
    expect(model.remoteHosts.usb.lastActiveHost()).toBeNull()
    expect(model.remoteHosts.usb.silentPhoneRecoveryHostId()).toBeNull()
    expect(model.desktopUsbSessionPresentation()).toBeNull()
  })

  it('hides the old session identity and never forgets it when the failed target is unknown', async () => {
    model.remoteHosts.usb.applyStatusEvent(usbStatus({
      session_state: 'error',
      active_host: phoneA,
      error_code: 'ERR_USB_MOBILE_PHONE_NOT_RESPONDING',
    }))
    const confirm = vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    const open = vi.spyOn(model.remoteHosts, 'openUsbMobile').mockReturnValue(true)

    expect(model.desktopUsbSessionPresentation()).toMatchObject({stage: 'error', host: null})
    await model.forgetUsbSessionPhone()
    model.retryUsbSession()

    expect(confirm).not.toHaveBeenCalled()
    expect(tauriInvoke).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith()
    expect(navigationModel.navigateToRemotePanel).toHaveBeenCalledWith('usb-mobile')
  })
})
