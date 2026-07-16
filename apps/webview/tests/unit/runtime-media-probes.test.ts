import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  peekVideoDecodeSupport,
  probeVideoDecodeSupport,
  resetRuntimeMediaProbeState,
  setRuntimeMediaProbeState,
} from '../../src/core/runtime/runtime-media-probes'

const originalMediaCapabilities = Object.getOwnPropertyDescriptor(
  globalThis.navigator,
  'mediaCapabilities',
)

function installDecodingInfo(decodingInfo: ReturnType<typeof vi.fn>) {
  Object.defineProperty(globalThis.navigator, 'mediaCapabilities', {
    configurable: true,
    value: {decodingInfo},
  })
}

afterEach(() => {
  resetRuntimeMediaProbeState()
  if (originalMediaCapabilities) {
    Object.defineProperty(globalThis.navigator, 'mediaCapabilities', originalMediaCapabilities)
  } else {
    delete (globalThis.navigator as {mediaCapabilities?: unknown}).mediaCapabilities
  }
  vi.restoreAllMocks()
})

describe('runtime-media-probes video decode cache', () => {
  it('caches decodingInfo verdicts per content type and codec string', async () => {
    const decodingInfo = vi.fn(async () => ({supported: true}))
    installDecodingInfo(decodingInfo)

    const input = {
      mimeType: 'video/mp4',
      mediaInfo: {
        kind: 'video' as const,
        audioTracks: 1,
        videoTracks: 1,
        codecString: 'avc1.640028',
      },
    }

    expect(peekVideoDecodeSupport(input)).toBeNull()
    await expect(probeVideoDecodeSupport(input)).resolves.toEqual({supported: true})
    expect(decodingInfo).toHaveBeenCalledTimes(1)

    // Second probe for the same (contentType, codec) is served from the cache.
    await expect(probeVideoDecodeSupport(input)).resolves.toEqual({supported: true})
    expect(decodingInfo).toHaveBeenCalledTimes(1)
    expect(peekVideoDecodeSupport(input)).toEqual({supported: true})

    // A different codec string is a different cache entry.
    const otherCodec = {
      ...input,
      mediaInfo: {...input.mediaInfo, codecString: 'hvc1.1.6.L93.B0'},
    }
    await probeVideoDecodeSupport(otherCodec)
    expect(decodingInfo).toHaveBeenCalledTimes(2)

    // Resetting the probe state clears the cache.
    resetRuntimeMediaProbeState()
    installDecodingInfo(decodingInfo)
    await probeVideoDecodeSupport(input)
    expect(decodingInfo).toHaveBeenCalledTimes(3)
  })

  it('caches unsupported verdicts and surfaces them synchronously via peek', async () => {
    const decodingInfo = vi.fn(async () => ({supported: false}))
    installDecodingInfo(decodingInfo)

    const input = {
      mimeType: 'video/mp4',
      mediaInfo: {
        kind: 'video' as const,
        audioTracks: 1,
        videoTracks: 1,
        codecString: 'vp09.00.10.08',
      },
    }

    await expect(probeVideoDecodeSupport(input)).resolves.toEqual({
      supported: false,
      reason: 'unsupported-codec',
    })
    expect(peekVideoDecodeSupport(input)).toEqual({
      supported: false,
      reason: 'unsupported-codec',
    })
    await expect(probeVideoDecodeSupport(input)).resolves.toEqual({
      supported: false,
      reason: 'unsupported-codec',
    })
    expect(decodingInfo).toHaveBeenCalledTimes(1)
  })

  it('resolves synchronously for forced probe states without touching decodingInfo', async () => {
    const decodingInfo = vi.fn(async () => ({supported: true}))
    installDecodingInfo(decodingInfo)
    setRuntimeMediaProbeState({videoDecode: 'unsupported'})

    const input = {mimeType: 'video/mp4'}
    expect(peekVideoDecodeSupport(input)).toEqual({
      supported: false,
      reason: 'unsupported-codec',
    })
    await expect(probeVideoDecodeSupport(input)).resolves.toEqual({
      supported: false,
      reason: 'unsupported-codec',
    })
    expect(decodingInfo).not.toHaveBeenCalled()
  })
})
