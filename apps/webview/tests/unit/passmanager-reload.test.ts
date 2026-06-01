import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'
import {clearPassmanagerRoot, setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

const {
  currentSurfaceMock,
  isConnectedMock,
  currentSurfaceSubscribeMock,
  writeAndroidUnlockDebugMock,
} = vi.hoisted(() => {
  const currentSurfaceSubscribeMock = vi.fn(() => () => {})
  const currentSurfaceMock = Object.assign(vi.fn(() => 'passwords'), {
    subscribe: currentSurfaceSubscribeMock,
  })

  return {
    currentSurfaceMock,
    isConnectedMock: vi.fn(() => true),
    currentSurfaceSubscribeMock,
    writeAndroidUnlockDebugMock: vi.fn(),
  }
})

vi.mock('../../src/app/navigation/navigation.model', () => ({
  navigationModel: {
    currentSurface: currentSurfaceMock,
    isConnected: isConnectedMock,
  },
}))

vi.mock('../../src/shared/services/android-unlock-debug', () => ({
  writeAndroidUnlockDebug: writeAndroidUnlockDebugMock,
}))

function createShowElementSignal<T>(initialValue: T, options: {emitOnSubscribe?: boolean} = {}) {
  let value = initialValue
  const listeners = new Set<() => void>()

  return Object.assign(
    () => value,
    {
      set(nextValue: T) {
        value = nextValue
        for (const listener of listeners) {
          listener()
        }
      },
      subscribe(listener: () => void) {
        listeners.add(listener)
        if (options.emitOnSubscribe) {
          listener()
        }
        return () => {
          listeners.delete(listener)
        }
      },
    },
  )
}

describe('setupPassmanagerReload', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    clearPassmanagerRoot()
    currentSurfaceMock.mockReturnValue('passwords')
    isConnectedMock.mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    clearPassmanagerRoot()
  })

  it('reloads once for debounced passmanager:changed events', async () => {
    const {setupPassmanagerReload} = await import('../../src/app/bootstrap/passmanager-reload')

    const loadMock = vi.fn(async () => undefined)
    const handlers = new Map<string, () => void>()

    setPassmanagerRoot({
      load: loadMock,
      showElement: atom(null),
    } as never)

    setupPassmanagerReload(
      {
        on: (event: string, handler: () => void) => {
          handlers.set(event, handler)
        },
      } as never,
      {
        isShowPasswordManager: () => true,
        remoteSessionState: () => 'inactive',
      } as never,
      {
        getRevision: vi.fn(async () => 'rev-0'),
      } as never,
    )

    handlers.get('passmanager:changed')?.()
    handlers.get('passmanager:changed')?.()
    await vi.runAllTimersAsync()

    expect(loadMock).toHaveBeenCalledTimes(1)
    expect(currentSurfaceSubscribeMock).toHaveBeenCalledTimes(1)
  })

  it('checks backend revision on update:state and ignores unchanged revisions', async () => {
    const {setupPassmanagerReload} = await import('../../src/app/bootstrap/passmanager-reload')

    const loadMock = vi.fn(async () => undefined)
    const handlers = new Map<string, () => void>()
    const getRevision = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('rev-0')
      .mockResolvedValueOnce('rev-0')
      .mockResolvedValueOnce('rev-1')

    setPassmanagerRoot({
      load: loadMock,
      showElement: atom(null),
    } as never)

    setupPassmanagerReload(
      {
        on: (event: string, handler: () => void) => {
          handlers.set(event, handler)
        },
      } as never,
      {
        isShowPasswordManager: () => true,
        remoteSessionState: () => 'ready',
      } as never,
      {
        getRevision,
      } as never,
    )

    await Promise.resolve()
    handlers.get('update:state')?.()
    await Promise.resolve()
    await vi.runAllTimersAsync()
    expect(loadMock).not.toHaveBeenCalled()

    handlers.get('update:state')?.()
    await Promise.resolve()
    await vi.runAllTimersAsync()
    expect(loadMock).toHaveBeenCalledTimes(1)
  })

  it('ignores the synchronous subscribe callback and reloads on the next real showElement change when deferred', async () => {
    const {setupPassmanagerReload} = await import('../../src/app/bootstrap/passmanager-reload')

    const loadMock = vi.fn(async () => undefined)
    const handlers = new Map<string, () => void>()
    const deferredEntry = {
      id: 'entry-1',
      otps() {},
      password() {},
    }
    const showElement = createShowElementSignal<unknown>(deferredEntry, {emitOnSubscribe: true})

    setPassmanagerRoot({
      load: loadMock,
      showElement,
    } as never)

    setupPassmanagerReload(
      {
        on: (event: string, handler: () => void) => {
          handlers.set(event, handler)
        },
      } as never,
      {
        isShowPasswordManager: () => true,
        remoteSessionState: () => 'inactive',
      } as never,
      {
        getRevision: vi.fn(async () => 'rev-0'),
      } as never,
    )

    handlers.get('passmanager:changed')?.()
    await vi.advanceTimersByTimeAsync(150)

    expect(loadMock).not.toHaveBeenCalled()

    showElement.set(null)
    await Promise.resolve()

    expect(loadMock).toHaveBeenCalledTimes(1)
  })
})
