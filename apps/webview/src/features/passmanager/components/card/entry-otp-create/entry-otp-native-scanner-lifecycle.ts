export const NATIVE_OTP_QR_SCANNER_LIFECYCLE_START_EVENT =
  'chromvoid:native-otp-qr-scanner-lifecycle-start'
export const NATIVE_OTP_QR_SCANNER_LIFECYCLE_END_EVENT =
  'chromvoid:native-otp-qr-scanner-lifecycle-end'

const DEFAULT_TIMEOUT_MS = 30_000

export type NativeOtpQrScannerLifecycleStartDetail = {
  timeoutMs: number
}

export function notifyNativeOtpQrScannerLifecycleStart(timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<NativeOtpQrScannerLifecycleStartDetail>(
      NATIVE_OTP_QR_SCANNER_LIFECYCLE_START_EVENT,
      {detail: {timeoutMs}},
    ),
  )
}

export function notifyNativeOtpQrScannerLifecycleEnd() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(NATIVE_OTP_QR_SCANNER_LIFECYCLE_END_EVENT))
}
