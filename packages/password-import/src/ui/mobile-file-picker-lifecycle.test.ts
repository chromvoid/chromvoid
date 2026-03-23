// @vitest-environment jsdom

import {describe, expect, it, vi} from 'vitest'

import {
  MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT,
  MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT,
  notifyMobileFilePickerLifecycleEnd,
  notifyMobileFilePickerLifecycleStart,
} from './mobile-file-picker-lifecycle.js'

describe('mobile file picker lifecycle bridge', () => {
  it('dispatches lifecycle start with timeout detail', () => {
    const listener = vi.fn()
    window.addEventListener(MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT, listener, {once: true})

    notifyMobileFilePickerLifecycleStart(12_345)

    expect(listener).toHaveBeenCalledTimes(1)
    const event = listener.mock.calls[0]?.[0] as CustomEvent<{timeoutMs: number}>
    expect(event.detail.timeoutMs).toBe(12_345)
  })

  it('dispatches lifecycle end event', () => {
    const listener = vi.fn()
    window.addEventListener(MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT, listener, {once: true})

    notifyMobileFilePickerLifecycleEnd()

    expect(listener).toHaveBeenCalledTimes(1)
  })
})
