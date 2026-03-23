import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'

const {tauriInvokeMock, handleBackgroundMock, handleForegroundResumeMock} = vi.hoisted(() => ({
  tauriInvokeMock: vi.fn(() => Promise.resolve({ok: true, result: {}})),
  handleBackgroundMock: vi.fn(),
  handleForegroundResumeMock: vi.fn(),
}))

vi.mock('../../src/core/transport/tauri/ipc', () => ({
  tauriInvoke: tauriInvokeMock,
}))

vi.mock('../../src/routes/biometric-app-gate/biometric-app-gate.model', () => ({
  biometricAppGateModel: {
    handleBackground: handleBackgroundMock,
    handleForegroundResume: handleForegroundResumeMock,
  },
}))

import {
  MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT,
  MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT,
} from '@chromvoid/password-import'
import {setupMobileLifecycle} from '../../src/app/bootstrap/mobile-lifecycle'

describe('setupMobileLifecycle', () => {
  let visibilityState: DocumentVisibilityState = 'visible'

  beforeAll(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    })

    setupMobileLifecycle(
      {kind: 'tauri'} as never,
      {
        isMobile: () => true,
      } as never,
    )
  })

  beforeEach(() => {
    visibilityState = 'visible'
    tauriInvokeMock.mockClear()
    handleBackgroundMock.mockClear()
    handleForegroundResumeMock.mockClear()
  })

  it('treats hidden and visible as background and foreground by default', () => {
    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))

    expect(handleBackgroundMock).toHaveBeenCalledTimes(1)
    expect(tauriInvokeMock).toHaveBeenCalledWith('mobile_notify_background')

    visibilityState = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))

    expect(handleForegroundResumeMock).toHaveBeenCalledTimes(1)
    expect(tauriInvokeMock).toHaveBeenCalledWith('mobile_notify_foreground')
  })

  it('ignores the hidden-visible cycle triggered by the mobile file picker', () => {
    window.dispatchEvent(
      new CustomEvent(MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT, {
        detail: {timeoutMs: 30_000},
      }),
    )

    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))

    visibilityState = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))

    window.dispatchEvent(new CustomEvent(MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT))

    expect(handleBackgroundMock).not.toHaveBeenCalled()
    expect(handleForegroundResumeMock).not.toHaveBeenCalled()
    expect(tauriInvokeMock).not.toHaveBeenCalled()
  })

  it('resumes normal lifecycle handling after the file picker session ends', () => {
    window.dispatchEvent(
      new CustomEvent(MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT, {
        detail: {timeoutMs: 30_000},
      }),
    )
    window.dispatchEvent(new CustomEvent(MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT))

    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))

    expect(handleBackgroundMock).toHaveBeenCalledTimes(1)
    expect(tauriInvokeMock).toHaveBeenCalledWith('mobile_notify_background')
  })
})
