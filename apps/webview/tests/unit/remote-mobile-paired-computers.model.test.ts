import {describe, expect, it, vi} from 'vitest'
import {atom} from '@reatom/core'

import type {
  MobileHostPairedComputer,
  MobileHostStatus,
} from '../../src/routes/remote/remote-hosts-flow.contract'
import {RemoteMobilePairedComputersModel} from '../../src/routes/remote/remote-mobile-paired-computers.model'

function status(overrides: Partial<MobileHostStatus> = {}): MobileHostStatus {
  return {
    phase: 'Idle',
    platform: 'ios',
    relay_url: null,
    device_id: 'phone-1',
    device_label: 'Phone',
    pairing_pin: null,
    pairing_offer: null,
    expires_at_ms: null,
    presence: null,
    paired_peer_id: null,
    connected_peers: [],
    error: null,
    ...overrides,
  }
}

function computer(
  peerId: string,
  overrides: Partial<MobileHostPairedComputer> = {},
): MobileHostPairedComputer {
  return {
    peer_id: peerId,
    label: peerId,
    platform: 'macos',
    pairing_transport: 'network',
    paired_at_ms: 1_700_000_000_000,
    last_seen_ms: 1_700_000_100_000,
    ...overrides,
  }
}

describe('RemoteMobilePairedComputersModel', () => {
  it('retains the last successful list and orders active computers first', async () => {
    const hostStatus = atom(
      status({
        connected_peers: [
          {
            peer_id: 'active',
            label: 'Active computer',
            connected_at_ms: 1_700_000_300_000,
            transport_type: 'usb_mobile',
          },
        ],
      }),
    )
    const invoke = vi
      .fn()
      .mockResolvedValueOnce([
        computer('recent', {last_seen_ms: 1_700_000_200_000}),
        computer('active', {last_seen_ms: 1_700_000_000_000}),
      ])
      .mockRejectedValueOnce(new Error('store unavailable'))
    const model = new RemoteMobilePairedComputersModel({
      hostStatus,
      hostOperationBusy: () => false,
      refreshHostStatus: vi.fn().mockResolvedValue(undefined),
      invoke,
      confirm: vi.fn().mockResolvedValue(true),
    })

    model.connect()
    await vi.waitFor(() => expect(model.loaded()).toBe(true))
    expect(model.rows().map(({peer_id}) => peer_id)).toEqual(['active', 'recent'])
    expect(model.rows()[0]?.display_transport).toBe('usb_mobile')

    await expect(model.refresh()).resolves.toBe(false)
    expect(model.rows().map(({peer_id}) => peer_id)).toEqual(['active', 'recent'])
    expect(model.errorText()).toBe('store unavailable')

    hostStatus.set(status())
    expect(model.rows()[0]?.connected).toBe(false)
    model.disconnect()
  })

  it('cancels revoke without mutation', async () => {
    const invoke = vi.fn().mockResolvedValue([computer('desktop-1')])
    const confirm = vi.fn().mockResolvedValue(false)
    const model = new RemoteMobilePairedComputersModel({
      hostStatus: () => status(),
      hostOperationBusy: () => false,
      refreshHostStatus: vi.fn().mockResolvedValue(undefined),
      invoke,
      confirm,
    })
    model.connect()
    await vi.waitFor(() => expect(model.loaded()).toBe(true))

    await expect(model.revoke(model.rows()[0]!.peer_id)).resolves.toBeNull()

    expect(confirm).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(model.rows()).toHaveLength(1)
    model.disconnect()
  })

  it('removes a durably revoked row and reports partial disconnect recovery', async () => {
    let stored = [computer('desktop-1')]
    const invoke = vi.fn(async (command: string) => {
      if (command === 'mobile_host_list_paired_computers') return stored
      if (command === 'mobile_host_revoke_paired_computer') {
        stored = []
        return {
          peer_id: 'desktop-1',
          pairing_removed: true,
          session_action: 'disconnect_failed',
        }
      }
      throw new Error(`unexpected command ${command}`)
    })
    const refreshHostStatus = vi.fn().mockResolvedValue(undefined)
    const model = new RemoteMobilePairedComputersModel({
      hostStatus: () => status(),
      hostOperationBusy: () => false,
      refreshHostStatus,
      invoke,
      confirm: vi.fn().mockResolvedValue(true),
    })
    model.connect()
    await vi.waitFor(() => expect(model.loaded()).toBe(true))

    const result = await model.revoke(model.rows()[0]!.peer_id)

    expect(result?.session_action).toBe('disconnect_failed')
    expect(model.rows()).toEqual([])
    expect(model.statusText()).toBe('Access revoked for desktop-1.')
    expect(model.recoveryWarning()).toContain('Access was revoked')
    expect(refreshHostStatus).toHaveBeenCalledOnce()
    model.disconnect()
  })

  it('blocks concurrent revoke attempts while confirmation is open', async () => {
    let resolveConfirmation!: (confirmed: boolean) => void
    const confirmation = new Promise<boolean>((resolve) => {
      resolveConfirmation = resolve
    })
    const invoke = vi.fn().mockResolvedValue([computer('desktop-1'), computer('desktop-2')])
    const model = new RemoteMobilePairedComputersModel({
      hostStatus: () => status(),
      hostOperationBusy: () => false,
      refreshHostStatus: vi.fn().mockResolvedValue(undefined),
      invoke,
      confirm: vi.fn().mockReturnValue(confirmation),
    })
    model.connect()
    await vi.waitFor(() => expect(model.loaded()).toBe(true))

    const first = model.revoke(model.rows()[0]!.peer_id)
    await vi.waitFor(() => expect(model.revokingPeerId()).toBe('desktop-1'))
    await expect(model.revoke(model.rows()[1]!.peer_id)).resolves.toBeNull()
    resolveConfirmation(false)
    await expect(first).resolves.toBeNull()

    expect(model.rows()).toHaveLength(2)
    model.disconnect()
  })

  it('ignores a list completion after disconnect', async () => {
    let resolveList!: (rows: MobileHostPairedComputer[]) => void
    const list = new Promise<MobileHostPairedComputer[]>((resolve) => {
      resolveList = resolve
    })
    const model = new RemoteMobilePairedComputersModel({
      hostStatus: () => status(),
      hostOperationBusy: () => false,
      refreshHostStatus: vi.fn().mockResolvedValue(undefined),
      invoke: vi.fn().mockReturnValue(list),
      confirm: vi.fn().mockResolvedValue(true),
    })

    model.connect()
    model.disconnect()
    resolveList([computer('late')])
    await Promise.resolve()
    await Promise.resolve()

    expect(model.loaded()).toBe(false)
    expect(model.rows()).toEqual([])
  })
})
