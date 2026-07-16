import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  dispatchAndroidVideoPlayerEvent,
  dispatchMediaStreamError,
  getInFlightMediaStreamLoadCountForTests,
  getMediaStreamOwnerCountForTests,
  isAndroidVideoPlayerEvent,
  registerInFlightMediaStreamLoad,
  releaseAllMediaStreamOwnersForLifecycle,
  registerMediaStreamOwner,
  resetMediaStreamOwnerRegistryForTests,
  setupMediaStreamErrorDispatch,
} from '../../src/features/media/models/media-stream-owner-registry'
import type {TransportEventHandler, TransportLike} from '../../src/core/transport/transport'

afterEach(() => {
  resetMediaStreamOwnerRegistryForTests()
  vi.restoreAllMocks()
})

describe('media-stream owner registry', () => {
  it('dispatches native stream errors only to the active owner', () => {
    const firstOwner = {handleNativeStreamError: vi.fn()}
    const secondOwner = {handleNativeStreamError: vi.fn()}
    const unregisterFirst = registerMediaStreamOwner('stream-1', firstOwner)
    registerMediaStreamOwner('stream-2', secondOwner)

    dispatchMediaStreamError({
      streamId: 'stream-1',
      code: 'ERR_MEDIA_RANGE_REQUIRED',
      httpStatus: 416,
      nodeId: 23,
      sourceRevision: 77,
    })
    unregisterFirst()
    dispatchMediaStreamError({
      streamId: 'stream-1',
      code: 'ERR_MEDIA_STREAM_STALE',
    })
    dispatchMediaStreamError({
      streamId: 'stream-2',
      code: 'ERR_MEDIA_RANGE_READ_FAILED',
      httpStatus: 500,
    })

    expect(firstOwner.handleNativeStreamError).toHaveBeenCalledTimes(1)
    expect(firstOwner.handleNativeStreamError).toHaveBeenCalledWith(
      expect.objectContaining({streamId: 'stream-1', code: 'ERR_MEDIA_RANGE_REQUIRED'}),
    )
    expect(secondOwner.handleNativeStreamError).toHaveBeenCalledTimes(1)
    expect(getMediaStreamOwnerCountForTests()).toBe(1)
  })

  it('asks active owners to release native sources for lifecycle cleanup', async () => {
    const owner = {
      handleNativeStreamError: vi.fn(),
      releaseNativeStreamForLifecycle: vi.fn(),
    }
    registerMediaStreamOwner('stream-1', owner)

    await releaseAllMediaStreamOwnersForLifecycle('source-invalidated', {nodeId: 23})

    expect(owner.releaseNativeStreamForLifecycle).toHaveBeenCalledWith('source-invalidated', {
      nodeId: 23,
    })
  })

  it('aborts matching in-flight loads during lifecycle release', async () => {
    const excludedOwner = {handleNativeStreamError: vi.fn()}
    const matchingController = new AbortController()
    const otherNodeController = new AbortController()
    const excludedController = new AbortController()
    const unregisteredController = new AbortController()

    registerInFlightMediaStreamLoad(matchingController, {nodeId: 5})
    registerInFlightMediaStreamLoad(otherNodeController, {nodeId: 6})
    registerInFlightMediaStreamLoad(excludedController, {owner: excludedOwner})
    const unregister = registerInFlightMediaStreamLoad(unregisteredController, {nodeId: 5})
    unregister()
    expect(getInFlightMediaStreamLoadCountForTests()).toBe(3)

    await releaseAllMediaStreamOwnersForLifecycle(
      'vault-lock',
      {nodeId: 5},
      {excludeOwner: excludedOwner},
    )

    expect(matchingController.signal.aborted).toBe(true)
    expect(otherNodeController.signal.aborted).toBe(false)
    expect(excludedController.signal.aborted).toBe(false)
    expect(unregisteredController.signal.aborted).toBe(false)

    // Without a nodeId context every non-excluded in-flight load is aborted.
    await releaseAllMediaStreamOwnersForLifecycle('vault-lock')

    expect(otherNodeController.signal.aborted).toBe(true)
    expect(excludedController.signal.aborted).toBe(true)
    expect(unregisteredController.signal.aborted).toBe(false)
  })

  it('wires the transport event into validated registry dispatch', () => {
    const handlers = new Map<string, TransportEventHandler>()
    const ws = {
      on: vi.fn((event: string, handler: TransportEventHandler) => {
        handlers.set(event, handler)
      }),
      off: vi.fn((event: string, handler: TransportEventHandler) => {
        if (handlers.get(event) === handler) handlers.delete(event)
      }),
    } as unknown as TransportLike
    const owner = {handleNativeStreamError: vi.fn()}
    registerMediaStreamOwner('stream-1', owner)

    const teardown = setupMediaStreamErrorDispatch(ws)

    handlers.get('media-stream:error')?.(undefined, {
      streamId: 'stream-1',
      code: 'ERR_MEDIA_STREAM_LOCKED',
      httpStatus: 403,
    })
    handlers.get('media-stream:error')?.(undefined, {
      streamId: 'stream-1',
      code: 'UNKNOWN',
    })
    teardown()

    expect(owner.handleNativeStreamError).toHaveBeenCalledTimes(1)
    expect(owner.handleNativeStreamError).toHaveBeenCalledWith(
      expect.objectContaining({streamId: 'stream-1', code: 'ERR_MEDIA_STREAM_LOCKED'}),
    )
    expect(ws.off).toHaveBeenCalledWith('media-stream:error', expect.any(Function))
    expect(handlers.has('media-stream:error')).toBe(false)
  })

  it('normalizes Android video events by native source token', () => {
    const owner = {handleNativeStreamError: vi.fn(), handleAndroidVideoPlayerEvent: vi.fn()}
    registerMediaStreamOwner('native-source-token', owner, {
      mediaSourceGeneration: 3,
      sourceRevision: 77,
      transportSessionGeneration: 12,
      appForegroundEpoch: 4,
    })

    expect(
      isAndroidVideoPlayerEvent({
        nativeSourceToken: 'native-source-token',
        event: 'ready',
        mediaSourceGeneration: 3,
        sourceRevision: 77,
        transportSessionGeneration: 12,
        appForegroundEpoch: 4,
      }),
    ).toBe(true)

    dispatchAndroidVideoPlayerEvent({
      nativeSourceToken: 'native-source-token',
      event: 'ready',
      mediaSourceGeneration: 3,
      sourceRevision: 77,
      transportSessionGeneration: 12,
      appForegroundEpoch: 4,
    })
    dispatchAndroidVideoPlayerEvent({
      nativeSourceToken: 'native-source-token',
      event: 'ready',
      mediaSourceGeneration: 2,
      sourceRevision: 77,
      transportSessionGeneration: 12,
      appForegroundEpoch: 4,
    })
    dispatchAndroidVideoPlayerEvent({
      token: 'legacy-native-source-token',
      event: 'ready',
    })

    expect(owner.handleAndroidVideoPlayerEvent).toHaveBeenCalledTimes(1)
    expect(owner.handleAndroidVideoPlayerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        nativeSourceToken: 'native-source-token',
        token: 'native-source-token',
        event: 'ready',
        mediaSourceGeneration: 3,
        sourceRevision: 77,
        transportSessionGeneration: 12,
        appForegroundEpoch: 4,
      }),
    )
  })
})
