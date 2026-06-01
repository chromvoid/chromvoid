import type {RpcResult} from '@chromvoid/scheme'
import {isSuccess} from '@chromvoid/scheme'

import {
  getRuntimeCapabilities,
  runtimeCapabilitiesAtom,
} from 'root/core/runtime/runtime-capabilities'
import {tauriInvoke, tauriListen, type UnlistenFn} from 'root/core/transport/tauri/ipc'

export type OtpQrNativeScanStatus =
  | 'success'
  | 'cancelled'
  | 'permission_denied'
  | 'unavailable'
  | 'invalid'

export type OtpQrNativeScanResultEvent = {
  scanId?: string
  status?: OtpQrNativeScanStatus
  value?: string | null
  message?: string | null
}

export class OtpQrNativeScanError extends Error {
  readonly code: Exclude<OtpQrNativeScanStatus, 'success'>

  constructor(code: Exclude<OtpQrNativeScanStatus, 'success'>, message: string) {
    super(message)
    this.name = 'OtpQrNativeScanError'
    this.code = code
  }
}

export type OtpQrScannerPort = {
  isAvailable(): boolean
  scanOtpQr(scanId: string): Promise<string>
  cancelOtpQr(scanId: string): Promise<void>
}

export const defaultOtpQrScannerPort: OtpQrScannerPort = {
  isAvailable: canScanOtpQr,
  scanOtpQr,
  cancelOtpQr,
}

export function canScanOtpQr(): boolean {
  const capabilities = getRuntimeCapabilities()
  return Boolean(capabilities.supports_native_otp_qr_scan)
}

export function canScanOtpQrReactive(): boolean {
  const capabilities = runtimeCapabilitiesAtom()
  return Boolean(capabilities.supports_native_otp_qr_scan)
}

export async function scanOtpQr(scanId: string): Promise<string> {
  let unlisten: UnlistenFn | undefined
  let resolveEvent: (value: string) => void = () => undefined
  let rejectEvent: (error: unknown) => void = () => undefined

  const eventResult = new Promise<string>((resolve, reject) => {
    resolveEvent = resolve
    rejectEvent = reject
  })

  try {
    unlisten = await tauriListen<OtpQrNativeScanResultEvent>('otp:qr-scan-result', (payload) => {
      if (!payload || payload.scanId !== scanId) return

      const status = payload.status ?? 'invalid'
      if (status === 'success') {
        const value = typeof payload.value === 'string' ? payload.value.trim() : ''
        if (value) {
          resolveEvent(value)
        } else {
          rejectEvent(new OtpQrNativeScanError('invalid', payload.message ?? 'QR scan returned an empty value'))
        }
        return
      }

      rejectEvent(
        new OtpQrNativeScanError(
          status,
          payload.message ?? defaultErrorMessage(status),
        ),
      )
    })
    const response = await tauriInvoke<RpcResult<null>>('native_otp_qr_scan_start', {scanId})
    unwrapRpcResult(response, 'Native OTP QR scanner is unavailable')
    return await eventResult
  } catch (error) {
    throw normalizeStartError(error)
  } finally {
    safeUnlisten(unlisten)
  }
}

export async function cancelOtpQr(scanId: string): Promise<void> {
  if (!scanId) return

  const response = await tauriInvoke<RpcResult<null>>('native_otp_qr_scan_cancel', {scanId})
  unwrapRpcResult(response, 'Native OTP QR scanner cancel failed')
}

function unwrapRpcResult<T>(result: RpcResult<T>, fallbackMessage: string): T {
  if (!isSuccess(result)) {
    throw new OtpQrNativeScanError(
      result.code === 'OTP_QR_SCAN_UNAVAILABLE' ? 'unavailable' : 'invalid',
      result.error || fallbackMessage,
    )
  }

  return result.result
}

function normalizeStartError(error: unknown): unknown {
  if (error instanceof OtpQrNativeScanError) return error
  const message = error instanceof Error ? error.message : 'Native OTP QR scanner is unavailable'
  return new OtpQrNativeScanError('unavailable', message)
}

function defaultErrorMessage(status: Exclude<OtpQrNativeScanStatus, 'success'>): string {
  switch (status) {
    case 'cancelled':
      return 'QR scan cancelled'
    case 'permission_denied':
      return 'Camera permission denied'
    case 'unavailable':
      return 'Native OTP QR scanner is unavailable'
    case 'invalid':
      return 'QR scan did not return a valid value'
  }
}

function safeUnlisten(unlisten: UnlistenFn | undefined): void {
  try {
    unlisten?.()
  } catch (error) {
    console.warn('[otp][qr] failed to remove native scan listener', error)
  }
}
