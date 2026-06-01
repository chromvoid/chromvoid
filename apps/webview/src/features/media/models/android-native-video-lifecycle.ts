export const ANDROID_NATIVE_VIDEO_LIFECYCLE_START_EVENT =
  'chromvoid:android-native-video-lifecycle-start'
export const ANDROID_NATIVE_VIDEO_LIFECYCLE_END_EVENT =
  'chromvoid:android-native-video-lifecycle-end'

const DEFAULT_TIMEOUT_MS = 6 * 60 * 60 * 1000

export type AndroidNativeVideoLifecycleStartDetail = {
  timeoutMs: number
}

export function notifyAndroidNativeVideoLifecycleStart(timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<AndroidNativeVideoLifecycleStartDetail>(
      ANDROID_NATIVE_VIDEO_LIFECYCLE_START_EVENT,
      {detail: {timeoutMs}},
    ),
  )
}

export function notifyAndroidNativeVideoLifecycleEnd() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ANDROID_NATIVE_VIDEO_LIFECYCLE_END_EVENT))
}
