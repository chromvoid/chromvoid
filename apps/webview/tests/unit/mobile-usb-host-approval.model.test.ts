import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const ipc = vi.hoisted(() => ({
  tauriInvoke: vi.fn(),
  tauriListen: vi.fn(),
}))

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => ipc.tauriInvoke(...args),
  tauriListen: (...args: unknown[]) => ipc.tauriListen(...args),
}))

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {
  type MobileUsbHostPairingApprovalView,
  type MobileUsbHostSessionApprovalView,
} from '../../src/routes/remote/remote.model'
import {MobileUsbHostApprovalModel} from '../../src/features/mobile-usb-host/mobile-usb-host-approval.model'

const pairingApproval = (
  override: Partial<MobileUsbHostPairingApprovalView> = {},
): MobileUsbHostPairingApprovalView => ({
  attempt_id: 'pair-attempt-1',
  approval_pin: '123456',
  peer_label: 'MacBook',
  peer_fingerprint: 'abcd1234',
  attempts_left: 5,
  decision: 'pending',
  expires_at_ms: Date.now() + 60_000,
  ...override,
})

const sessionApproval = (
  override: Partial<MobileUsbHostSessionApprovalView> = {},
): MobileUsbHostSessionApprovalView => ({
  attempt_id: 'session-attempt-1',
  peer_id: 'desktop-peer-1',
  peer_label: 'MacBook',
  transport_type: 'UsbMobile',
  decision: 'pending',
  expires_at_ms: Date.now() + 60_000,
  ...override,
})

describe('MobileUsbHostApprovalModel', () => {
  let pendingPairing: MobileUsbHostPairingApprovalView | null
  let pendingSession: MobileUsbHostSessionApprovalView | null
  let listeners: Map<string, (payload: unknown) => void>
  let unlisteners: Array<ReturnType<typeof vi.fn>>

  beforeEach(() => {
    pendingPairing = null
    pendingSession = null
    listeners = new Map()
    unlisteners = []
    resetRuntimeCapabilities()
    ipc.tauriInvoke.mockReset()
    ipc.tauriListen.mockReset()
    ipc.tauriInvoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      switch (command) {
        case 'mobile_usb_host_pending_pairing_approval':
          return pendingPairing
        case 'mobile_usb_host_pending_session_approval':
          return pendingSession
        case 'mobile_usb_host_approve_pairing':
        case 'mobile_usb_host_reject_pairing':
          if (pendingPairing && args?.['attemptId'] === pendingPairing.attempt_id) {
            pendingPairing = {
              ...pendingPairing,
              decision: command === 'mobile_usb_host_approve_pairing' ? 'approved' : 'rejected',
            }
          }
          return undefined
        case 'mobile_usb_host_approve_session':
        case 'mobile_usb_host_reject_session':
          if (pendingSession && args?.['attemptId'] === pendingSession.attempt_id) {
            pendingSession = {
              ...pendingSession,
              decision: command === 'mobile_usb_host_approve_session' ? 'approved' : 'rejected',
            }
          }
          return undefined
        default:
          throw new Error(`Unexpected command: ${command}`)
      }
    })
    ipc.tauriListen.mockImplementation(async (event: string, handler: (payload: unknown) => void) => {
      listeners.set(event, handler)
      const unlisten = vi.fn()
      unlisteners.push(unlisten)
      return unlisten
    })
  })

  afterEach(() => {
    resetRuntimeCapabilities()
    vi.restoreAllMocks()
  })

  it('waits for mobile runtime capabilities before opening native approval IPC', async () => {
    const model = new MobileUsbHostApprovalModel()

    model.connect()

    expect(ipc.tauriInvoke).not.toHaveBeenCalled()
    expect(ipc.tauriListen).not.toHaveBeenCalled()

    setRuntimeCapabilities({platform: 'android', mobile: true})

    await vi.waitFor(() => {
      expect(ipc.tauriListen).toHaveBeenCalledTimes(3)
    })
    expect(ipc.tauriInvoke.mock.calls.map(([command]) => command)).toEqual([
      'mobile_usb_host_pending_pairing_approval',
      'mobile_usb_host_pending_session_approval',
    ])

    model.disconnect()
    expect(unlisteners).toHaveLength(3)
    expect(unlisteners.every((unlisten) => unlisten.mock.calls.length === 1)).toBe(true)
  })

  it('refreshes pending pairing approval after the backend event', async () => {
    const model = new MobileUsbHostApprovalModel()
    setRuntimeCapabilities({platform: 'android', mobile: true})
    model.connect()

    await vi.waitFor(() => {
      expect(listeners.has('mobile_usb_host_pairing_approval_required')).toBe(true)
    })

    pendingPairing = pairingApproval()
    listeners.get('mobile_usb_host_pairing_approval_required')?.({attempt_id: 'pair-attempt-1'})

    await vi.waitFor(() => {
      expect(model.pairingApproval()?.approval_pin).toBe('123456')
    })
    expect(model.activeKind()).toBe('pairing')
    expect(model.sessionApproval()).toBeNull()

    model.disconnect()
  })

  it('approves and rejects pairing attempts with Tauri camelCase args', async () => {
    pendingPairing = pairingApproval()
    const model = new MobileUsbHostApprovalModel()
    setRuntimeCapabilities({platform: 'android', mobile: true})
    model.connect()

    await vi.waitFor(() => {
      expect(model.pairingApproval()?.attempt_id).toBe('pair-attempt-1')
    })
    ipc.tauriInvoke.mockClear()

    await model.approvePairing()

    expect(ipc.tauriInvoke).toHaveBeenCalledWith('mobile_usb_host_approve_pairing', {
      attemptId: 'pair-attempt-1',
    })
    expect(model.pairingApproval()?.decision).toBe('approved')

    pendingPairing = pairingApproval({attempt_id: 'pair-attempt-2'})
    await model.refreshPendingApprovals()
    ipc.tauriInvoke.mockClear()

    await model.rejectPairing()

    expect(ipc.tauriInvoke).toHaveBeenCalledWith('mobile_usb_host_reject_pairing', {
      attemptId: 'pair-attempt-2',
    })
    expect(model.pairingApproval()).toBeNull()

    model.disconnect()
  })

  it('approves and rejects session attempts with Tauri camelCase args', async () => {
    pendingSession = sessionApproval()
    const model = new MobileUsbHostApprovalModel()
    setRuntimeCapabilities({platform: 'android', mobile: true})
    model.connect()

    await vi.waitFor(() => {
      expect(model.sessionApproval()?.attempt_id).toBe('session-attempt-1')
    })
    expect(model.activeKind()).toBe('session')
    ipc.tauriInvoke.mockClear()

    await model.approveSession()

    expect(ipc.tauriInvoke).toHaveBeenCalledWith('mobile_usb_host_approve_session', {
      attemptId: 'session-attempt-1',
    })
    expect(model.sessionApproval()).toBeNull()

    pendingSession = sessionApproval({attempt_id: 'session-attempt-2'})
    await model.refreshPendingApprovals()
    ipc.tauriInvoke.mockClear()

    await model.rejectSession()

    expect(ipc.tauriInvoke).toHaveBeenCalledWith('mobile_usb_host_reject_session', {
      attemptId: 'session-attempt-2',
    })
    expect(model.sessionApproval()).toBeNull()

    model.disconnect()
  })

  it('closes a session fallback after a notification action resolves it natively', async () => {
    const staleSession = sessionApproval()
    let sessionReadCount = 0
    let resolveInitialSessionRead: ((approval: MobileUsbHostSessionApprovalView | null) => void) | undefined
    ipc.tauriInvoke.mockImplementation((command: string) => {
      if (command === 'mobile_usb_host_pending_pairing_approval') return Promise.resolve(null)
      if (command === 'mobile_usb_host_pending_session_approval') {
        sessionReadCount += 1
        if (sessionReadCount === 1) {
          return new Promise<MobileUsbHostSessionApprovalView | null>((resolve) => {
            resolveInitialSessionRead = resolve
          })
        }
        return Promise.resolve(pendingSession)
      }
      throw new Error(`Unexpected command: ${command}`)
    })
    const model = new MobileUsbHostApprovalModel()
    setRuntimeCapabilities({platform: 'android', mobile: true})
    model.connect()

    await vi.waitFor(() => {
      expect(listeners.has('mobile_usb_host_approval_resolved')).toBe(true)
      expect(resolveInitialSessionRead).toBeDefined()
    })
    pendingSession = sessionApproval({decision: 'approved'})
    listeners.get('mobile_usb_host_approval_resolved')?.({attempt_id: 'session-attempt-1'})

    await vi.waitFor(() => {
      expect(model.visible()).toBe(false)
      expect(model.sessionApproval()).toBeNull()
    })

    resolveInitialSessionRead?.(staleSession)
    await Promise.resolve()
    await Promise.resolve()
    expect(model.visible()).toBe(false)
    expect(model.sessionApproval()).toBeNull()

    model.disconnect()
  })
})
