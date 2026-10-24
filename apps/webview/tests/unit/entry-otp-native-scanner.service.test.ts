import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const ipc = vi.hoisted(() => ({
  tauriInvoke: vi.fn(),
  tauriListen: vi.fn(),
}))

vi.mock('root/core/transport/tauri/ipc', () => ({
  tauriInvoke: (...args: unknown[]) => ipc.tauriInvoke(...args),
  tauriListen: (...args: unknown[]) => ipc.tauriListen(...args),
}))

import {
  NATIVE_OTP_QR_SCANNER_LIFECYCLE_END_EVENT,
  NATIVE_OTP_QR_SCANNER_LIFECYCLE_START_EVENT,
} from '../../src/features/passmanager/components/card/entry-otp-create/entry-otp-native-scanner-lifecycle'
import {
  scanOtpQr,
  type OtpQrNativeScanResultEvent,
} from '../../src/features/passmanager/components/card/entry-otp-create/entry-otp-native-scanner.service'

describe('native OTP QR scanner service', () => {
  let resultListener: ((payload: OtpQrNativeScanResultEvent) => void) | undefined
  let lifecycleEvents: string[]
  let handleLifecycleStart: () => void
  let handleLifecycleEnd: () => void

  beforeEach(() => {
    resultListener = undefined
    lifecycleEvents = []
    handleLifecycleStart = () => lifecycleEvents.push('start')
    handleLifecycleEnd = () => lifecycleEvents.push('end')
    window.addEventListener(NATIVE_OTP_QR_SCANNER_LIFECYCLE_START_EVENT, handleLifecycleStart)
    window.addEventListener(NATIVE_OTP_QR_SCANNER_LIFECYCLE_END_EVENT, handleLifecycleEnd)

    ipc.tauriInvoke.mockReset()
    ipc.tauriListen.mockReset()
    ipc.tauriInvoke.mockResolvedValue({ok: true, result: null})
    ipc.tauriListen.mockImplementation(
      async (_event: string, listener: (payload: OtpQrNativeScanResultEvent) => void) => {
        resultListener = listener
        return vi.fn()
      },
    )
  })

  afterEach(() => {
    window.removeEventListener(NATIVE_OTP_QR_SCANNER_LIFECYCLE_START_EVENT, handleLifecycleStart)
    window.removeEventListener(NATIVE_OTP_QR_SCANNER_LIFECYCLE_END_EVENT, handleLifecycleEnd)
  })

  it('holds the native activity lifecycle until a successful scan result arrives', async () => {
    const scan = scanOtpQr('scan-success')

    await vi.waitFor(() => {
      expect(ipc.tauriInvoke).toHaveBeenCalledWith('native_otp_qr_scan_start', {
        scanId: 'scan-success',
      })
    })
    expect(lifecycleEvents).toEqual(['start'])

    resultListener?.({
      scanId: 'scan-success',
      status: 'success',
      value: 'otpauth://totp/ChromVoid?secret=JBSWY3DPEHPK3PXP',
    })

    await expect(scan).resolves.toBe('otpauth://totp/ChromVoid?secret=JBSWY3DPEHPK3PXP')
    expect(lifecycleEvents).toEqual(['start', 'end'])
  })

  it('ends the native activity lifecycle when the scan is cancelled', async () => {
    const scan = scanOtpQr('scan-cancelled')

    await vi.waitFor(() => {
      expect(resultListener).toBeTypeOf('function')
    })
    resultListener?.({scanId: 'scan-cancelled', status: 'cancelled'})

    await expect(scan).rejects.toMatchObject({code: 'cancelled'})
    expect(lifecycleEvents).toEqual(['start', 'end'])
  })

  it('ends the native activity lifecycle when scanner startup fails', async () => {
    ipc.tauriInvoke.mockResolvedValue({
      ok: false,
      error: 'Scanner unavailable',
      code: 'OTP_QR_SCAN_UNAVAILABLE',
    })

    await expect(scanOtpQr('scan-unavailable')).rejects.toMatchObject({
      code: 'unavailable',
    })
    expect(lifecycleEvents).toEqual(['start', 'end'])
  })
})
