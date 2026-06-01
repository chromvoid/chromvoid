import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  dispatchMediaStreamError,
  getMediaStreamOwnerCountForTests,
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
})
