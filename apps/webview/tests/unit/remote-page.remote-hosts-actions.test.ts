import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {RemotePageModel} from '../../src/routes/remote/remote-page.model'
import type {NetworkPairedPeer} from '../../src/routes/remote/remote.model'
import {systemClipboardTextWriter} from '../../src/shared/services/clipboard'
import {toast} from '../../src/shared/services/toast-manager'

describe('RemotePage remote hosts side effects', () => {
  beforeEach(() => {
    navigationModel.disconnect()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    navigationModel.disconnect()
  })

  it('activates passive USB inventory only for the mounted desktop Remote route', () => {
    const model = new RemotePageModel()
    const connect = vi.spyOn(model.remoteHosts, 'connect').mockImplementation(() => {})
    const activate = vi.spyOn(model.remoteHosts, 'activateDesktopInventory').mockImplementation(() => {})
    const disconnect = vi.spyOn(model.remoteHosts, 'disconnect').mockImplementation(() => {})
    vi.spyOn(model.remoteHosts, 'loadPeers').mockResolvedValue(true)
    vi.spyOn(model, 'loadModeData').mockResolvedValue()
    vi.spyOn(model as any, 'setupModeListeners').mockImplementation(() => {})

    model.connect()

    expect(connect).toHaveBeenCalledOnce()
    expect(activate).toHaveBeenCalledOnce()

    model.disconnect()

    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('keeps pair and back navigation side effects after the renderer contract shrink', async () => {
    const model = new RemotePageModel() as any
    const view = atom<'hosts' | 'pair-ios' | 'wait' | 'usb-mobile'>('pair-ios')
    model.remoteHosts = {
      view,
      openPairIos: vi.fn(() => true),
      closePairIos: vi.fn().mockResolvedValue(true),
      closeUsbMobile: vi.fn().mockResolvedValue(true),
    }

    const navigateSpy = vi.spyOn(navigationModel, 'navigateToRemotePanel').mockImplementation(() => {})

    model.openPairIos()
    expect(model.remoteHosts.openPairIos).toHaveBeenCalledTimes(1)
    expect(navigateSpy).toHaveBeenCalledWith('pair-ios')

    model.remoteHosts.openUsbMobile = vi.fn(() => true)
    model.openUsbMobile()
    expect(model.remoteHosts.openUsbMobile).toHaveBeenCalledTimes(1)
    expect(model.remoteHosts.openUsbMobile).toHaveBeenCalledWith({scan: true})
    expect(navigateSpy).toHaveBeenCalledWith('usb-mobile')

    model.backToHosts()
    expect(model.remoteHosts.closePairIos).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('hosts', 'replace'))
  })

  it('keeps usb-mobile panel selected during RemotePage sync', () => {
    const model = new RemotePageModel() as any
    const view = atom<'hosts' | 'pair-ios' | 'wait' | 'usb-mobile'>('hosts')
    model.remoteHosts = {
      view,
      isMobileHostRuntime: vi.fn(() => false),
      openPairIos: vi.fn(() => {
        view.set('pair-ios')
        return true
      }),
      openUsbMobile: vi.fn(() => {
        view.set('usb-mobile')
        return true
      }),
      showHosts: vi.fn(() => view.set('hosts')),
    }

    navigationModel.snapshot.set({
      surface: 'remote',
      remote: {panel: 'usb-mobile'},
      overlay: {kind: 'none'},
    })
    model.syncRemoteHostsPanel()

    expect(model.remoteHosts.openUsbMobile).toHaveBeenCalledTimes(1)
    expect(model.remoteHosts.showHosts).not.toHaveBeenCalled()
    expect(view()).toBe('usb-mobile')
  })

  it('keeps route and panel state aligned when guarded navigation is rejected', async () => {
    const model = new RemotePageModel() as any
    const view = atom<'hosts' | 'pair-ios' | 'wait' | 'usb-mobile'>('hosts')
    model.remoteHosts = {
      view,
      isMobileHostRuntime: vi.fn(() => false),
      openPairIos: vi.fn(() => false),
      openUsbMobile: vi.fn(() => false),
      closePairIos: vi.fn().mockResolvedValue(false),
      closeUsbMobile: vi.fn().mockResolvedValue(false),
    }
    const navigateSpy = vi.spyOn(navigationModel, 'navigateToRemotePanel').mockImplementation(() => {})

    model.openPairIos()
    model.openUsbMobile()

    expect(navigateSpy).not.toHaveBeenCalled()

    view.set('pair-ios')
    navigationModel.snapshot.set({
      surface: 'remote',
      remote: {panel: 'hosts'},
      overlay: {kind: 'none'},
    })
    model.syncRemoteHostsPanel()

    await vi.waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('pair-ios', 'replace'))
    expect(view()).toBe('pair-ios')
  })

  it('dismisses USB recovery locally when the app already uses the local vault', () => {
    const model = new RemotePageModel()
    model.remoteHosts.usb.lastActiveHost.set({
      host_id: 'host-1',
      label: 'OnePlus 13',
      platform: 'android',
      bridge_kind: 'android_aoa',
      pairing_state: 'paired',
      last_seen: null,
    })
    model.remoteHosts.usb.errorText.set('Cable disconnected')
    model.remoteHosts.view.set('wait')

    model.switchToLocal()

    expect(model.remoteHosts.usb.lastActiveHost()).toBeNull()
    expect(model.remoteHosts.usb.errorText()).toBeNull()
    expect(model.remoteHosts.view()).toBe('hosts')
    expect(model.modeSwitching()).toBe(false)
  })

  it('still emits a success toast after removing a paired host', async () => {
    const model = new RemotePageModel() as any
    const peer: NetworkPairedPeer = {
      peer_id: 'peer-1',
      label: 'My iPhone',
      relay_url: 'wss://relay.chromvoid.com',
      last_seen: Date.now(),
      paired_at: Date.now(),
      platform: 'ios',
      status: 'ready',
      presence_expires_at_ms: null,
    }

    model.remoteHosts = {
      removePeer: vi.fn().mockResolvedValue(true),
    }

    const toastSpy = vi.spyOn(toast, 'success').mockImplementation(() => '')

    model.removeRemotePeer(peer)
    await Promise.resolve()
    await Promise.resolve()

    expect(model.remoteHosts.removePeer).toHaveBeenCalledWith(peer)
    expect(toastSpy).toHaveBeenCalledWith('Phone forgotten', 'Remote', {
      key: 'remote.peer.remove:peer-1',
    })
  })

  it('copies the mobile host invitation through the shared clipboard writer', async () => {
    const model = new RemotePageModel() as any
    model.remoteHosts = {
      offerText: vi.fn(() => 'chromvoid://pair-mobile?session_id=pair-1'),
    }
    const writeSpy = vi.spyOn(systemClipboardTextWriter, 'writeText').mockResolvedValue(undefined)
    const toastSpy = vi.spyOn(toast, 'success').mockImplementation(() => '')

    await expect(model.copyMobileHostOffer()).resolves.toBe(true)

    expect(writeSpy).toHaveBeenCalledWith('chromvoid://pair-mobile?session_id=pair-1')
    expect(toastSpy).toHaveBeenCalledWith('Invitation copied', 'Remote', {
      key: 'remote.mobile-host.copy',
    })
  })

  it('shows generic feedback without exposing an invitation when clipboard writing fails', async () => {
    const model = new RemotePageModel() as any
    model.remoteHosts = {
      offerText: vi.fn(() => 'chromvoid://pair-mobile?session_id=secret'),
    }
    vi.spyOn(systemClipboardTextWriter, 'writeText').mockRejectedValue(new Error('secret clipboard failure'))
    const toastSpy = vi.spyOn(toast, 'error').mockImplementation(() => '')

    await expect(model.copyMobileHostOffer()).resolves.toBe(false)

    expect(toastSpy).toHaveBeenCalledWith('Could not copy the invitation', 'Remote', {
      key: 'remote.mobile-host.copy',
    })
    expect(toastSpy.mock.calls.flat().join(' ')).not.toContain('secret')
  })
})
