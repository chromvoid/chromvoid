export const MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT = 'chromvoid:mobile-file-picker-lifecycle-start'
export const MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT = 'chromvoid:mobile-file-picker-lifecycle-end'

const DEFAULT_TIMEOUT_MS = 30_000

export type MobileFilePickerLifecycleStartDetail = {
  timeoutMs: number
}

export function notifyMobileFilePickerLifecycleStart(timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<MobileFilePickerLifecycleStartDetail>(MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT, {
      detail: {timeoutMs},
    }),
  )
}

export function notifyMobileFilePickerLifecycleEnd() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT))
}
