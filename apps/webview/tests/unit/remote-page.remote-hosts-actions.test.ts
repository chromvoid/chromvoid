import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import {RemotePageModel} from '../../src/routes/remote/remote-page.model'
import {remotePageStyles} from '../../src/routes/remote/remote-page.styles'
import type {NetworkPairedPeer} from '../../src/routes/remote/remote.model'
import {toast} from '../../src/shared/services/toast-manager'

function stylesToText(styles: unknown): string {
  const values = Array.isArray(styles) ? styles : [styles]
  return values
    .map((value) => {
      if (value == null) return ''
      return typeof value === 'object' && 'cssText' in (value as object) ? String((value as {cssText: string}).cssText) : String(value)
    })
    .join('\n')
}

describe('RemotePage remote hosts side effects', () => {
  beforeEach(() => {
    navigationModel.disconnect()
  })

  afterEach(() => {
    navigationModel.disconnect()
  })

  it('keeps pair and back navigation side effects after the renderer contract shrink', async () => {
    const model = new RemotePageModel() as any
    model.remoteHosts = {
      openPairIos: vi.fn(),
      closePairIos: vi.fn().mockResolvedValue(undefined),
    }

    const navigateSpy = vi.spyOn(navigationModel, 'navigateToRemotePanel').mockImplementation(() => {})

    model.openPairIos()
    expect(model.remoteHosts.openPairIos).toHaveBeenCalledTimes(1)
    expect(navigateSpy).toHaveBeenCalledWith('pair-ios')

    model.backToHosts()
    expect(model.remoteHosts.closePairIos).toHaveBeenCalledTimes(1)
    expect(navigateSpy).toHaveBeenCalledWith('hosts', 'replace')
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
    expect(toastSpy).toHaveBeenCalledWith('Paired host removed', 'Remote')
  })

  it('lets the mobile shell own safe-area bottom clearance', () => {
    const cssText = stylesToText(remotePageStyles)

    expect(cssText).toContain('padding-block-end: var(--app-spacing-8);')
    expect(cssText).not.toContain('env(safe-area-inset-bottom')
  })
})
