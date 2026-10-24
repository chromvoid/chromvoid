import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  getMediaInvalidationNodeIdFromCatalogEvent,
  releaseMediaSourcesForAppBackground,
  releaseMediaSourcesForSourceInvalidation,
  releaseMediaSourcesForVaultLock,
} from '../../src/features/media/models/media-lifecycle'
import {mediaPlaybackModel} from '../../src/features/media/models/media-playback.model'
import type {ResolvedAudioTrack} from '../../src/features/media/models/media-playback.model'
import {invalidateFileBlobCache} from '../../src/features/media/components/file-loader'
import {VideoPlayerModel} from '../../src/features/media/components/video-player.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import {resetMediaStreamOwnerRegistryForTests} from '../../src/features/media/models/media-stream-owner-registry'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
const originalMediaSource = globalThis.MediaSource

class LifecycleFakeMediaSource extends EventTarget {
  static isTypeSupported = vi.fn(() => true)

  readyState: 'closed' | 'open' | 'ended' = 'closed'
  addSourceBuffer = vi.fn()
  endOfStream = vi.fn()
}

function streamOf(...chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

function enableNativeAudio(): void {
  setRuntimeCapabilities({
    platform: 'ios',
    mobile: true,
    supports_native_audio_playback: true,
  })
  runtimeModeModel.setCoreMode('local')
}

function nativeAudioTrack(overrides: Partial<ResolvedAudioTrack> = {}): ResolvedAudioTrack {
  return {
    id: 705,
    name: 'private-track-name.mp3',
    path: '/private-track-name.mp3',
    mimeType: 'audio/mpeg',
    size: 1234,
    sourceRevision: 77,
    ...overrides,
  }
}

beforeEach(async () => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => 'blob:lifecycle-audio'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
  await mediaPlaybackModel.stopSession()
  resetMediaStreamOwnerRegistryForTests()
  resetRuntimeCapabilities()
  runtimeModeModel.handleTransportDisconnect()
  invalidateFileBlobCache(701)
  invalidateFileBlobCache(702)
  invalidateFileBlobCache(704)
  invalidateFileBlobCache(705)
  invalidateFileBlobCache(706)
})

afterEach(async () => {
  await mediaPlaybackModel.stopSession()
  resetMediaStreamOwnerRegistryForTests()
  resetRuntimeCapabilities()
  runtimeModeModel.handleTransportDisconnect()
  invalidateFileBlobCache(701)
  invalidateFileBlobCache(702)
  invalidateFileBlobCache(704)
  invalidateFileBlobCache(705)
  invalidateFileBlobCache(706)
  clearAppContext()
  vi.clearAllMocks()
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: originalCreateObjectURL,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: originalRevokeObjectURL,
  })
  Object.defineProperty(globalThis, 'MediaSource', {
    configurable: true,
    writable: true,
    value: originalMediaSource,
  })
})

describe('media lifecycle cleanup', () => {
  it('extracts invalidated node ids from catalog update and delete events', () => {
    expect(getMediaInvalidationNodeIdFromCatalogEvent({type: 'update', node_id: 701})).toBe(701)
    expect(getMediaInvalidationNodeIdFromCatalogEvent({type: 'delete', node_id: '702'})).toBe(702)
    expect(getMediaInvalidationNodeIdFromCatalogEvent({type: 'node_updated', nodeId: 701})).toBe(701)
    expect(getMediaInvalidationNodeIdFromCatalogEvent({type: 'create', node_id: 701})).toBeNull()
    expect(getMediaInvalidationNodeIdFromCatalogEvent({type: 'update', node_id: 0})).toBeNull()
  })

  it('releases the matching active audio source when catalog revision changes', async () => {
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const releaseMediaStream = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaStream: vi.fn().mockResolvedValue({
            kind: 'media-stream',
            streamId: 'lifecycle-stream',
            url: 'chromvoid-media://localhost/lifecycle-stream',
            name: 'track.mp3',
            mimeType: 'audio/mpeg',
            size: 100,
            sourceRevision: 9,
            expiresAt: 123456,
          }),
          releaseMediaStream,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession(
      [{id: 701, name: 'track.mp3', mimeType: 'audio/mpeg', size: 100}],
      0,
    )

    expect(mediaPlaybackModel.sourceKind()).toBe('media-stream')

    await releaseMediaSourcesForSourceInvalidation(701)

    expect(releaseMediaStream).toHaveBeenCalledTimes(1)
    expect(download).not.toHaveBeenCalled()
    expect(mediaPlaybackModel.sessionKind()).toBe('audio')
    expect(mediaPlaybackModel.sourceKind()).toBe('none')
    expect(mediaPlaybackModel.loadingState()).toBe('idle')
    expect(mediaPlaybackModel.playbackIntent()).toBe('pause')
  })

  it('stops the active audio session on vault lock cleanup', async () => {
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('audio')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'ws',
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession(
      [{id: 702, name: 'track.mp3', mimeType: 'audio/mpeg', size: 5}],
      0,
    )
    expect(mediaPlaybackModel.sessionKind()).toBe('audio')

    await releaseMediaSourcesForVaultLock()

    expect(mediaPlaybackModel.sessionKind()).toBe('none')
    expect(mediaPlaybackModel.sourceKind()).toBe('none')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:lifecycle-audio')
  })

  it('preserves the active audio stream source during app background cleanup when requested', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_media_stream_protocol: true,
    })
    runtimeModeModel.setCoreMode('local')
    const releaseMediaStream = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaStream: vi.fn().mockResolvedValue({
            kind: 'media-stream',
            streamId: 'background-audio-stream',
            url: 'chromvoid-media://localhost/background-audio-stream',
            name: 'track.mp3',
            mimeType: 'audio/mpeg',
            size: 100,
            sourceRevision: 9,
            expiresAt: 123456,
          }),
          releaseMediaStream,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    await mediaPlaybackModel.startAudioSession(
      [{id: 703, name: 'track.mp3', mimeType: 'audio/mpeg', size: 100}],
      0,
    )

    expect(mediaPlaybackModel.sourceKind()).toBe('media-stream')

    await releaseMediaSourcesForAppBackground({preserveAudioSession: true})

    expect(releaseMediaStream).not.toHaveBeenCalled()
    expect(mediaPlaybackModel.sessionKind()).toBe('audio')
    expect(mediaPlaybackModel.sourceKind()).toBe('media-stream')
  })

  it('releases the active native video source during app background cleanup', async () => {
    setRuntimeCapabilities({
      platform: 'ios',
      mobile: true,
      supports_native_video_playback: true,
      supports_mobile_native_video_playback: true,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaSource = vi.fn().mockResolvedValue({
      kind: 'video-source',
      streamId: 'background-video-stream',
      sourceToken: 'background-video-stream',
      platform: 'mobile',
      provider: 'mobile-local-catalog',
      deliveries: [
        {
          delivery: 'native-video',
          platform: 'mobile',
          nativeSourceToken: 'background-video-token',
        },
      ],
      name: 'background.mp4',
      mimeType: 'video/mp4',
      size: 100,
      sourceRevision: 12,
      mediaSourceGeneration: 1,
      appForegroundEpoch: 1,
      expiresAt: 123456,
    })
    const releaseMediaSource = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const model = new VideoPlayerModel()
    model.setFile({
      fileId: 704,
      fileName: 'background.mp4',
      mimeType: 'video/mp4',
      sourceSize: 100,
    })

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('video-source')
      expect(model.sourceDelivery()).toBe('native-video')
    })

    await releaseMediaSourcesForAppBackground()

    expect(releaseMediaSource).toHaveBeenCalledWith(
      expect.objectContaining({
        streamId: 'background-video-stream',
        sourceToken: 'background-video-stream',
      }),
    )
    expect(download).not.toHaveBeenCalled()
    expect(model.sourceKind()).toBe('none')
  })

  it('releases active MSE video source and object URL during app background cleanup', async () => {
    Object.defineProperty(globalThis, 'MediaSource', {
      configurable: true,
      writable: true,
      value: LifecycleFakeMediaSource,
    })
    setRuntimeCapabilities({
      platform: 'macos',
      desktop: true,
      supports_media_http_stream: true,
      supports_mse_video_playback: true,
    })
    runtimeModeModel.setCoreMode('local')
    const prepareMediaSource = vi.fn().mockResolvedValue({
      kind: 'video-source',
      streamId: 'background-mse-stream',
      sourceToken: 'background-mse-stream',
      platform: 'desktop',
      provider: 'local-catalog',
      deliveries: [
        {
          delivery: 'mse',
          platform: 'desktop',
          fetchUrl: 'http://127.0.0.1:49152/media/background-mse-stream',
          initSegment: {offset: 0, length: 128},
          mediaSegments: [{offset: 128, length: 256, timestampUs: 0}],
        },
      ],
      name: 'background-fragmented.mp4',
      mimeType: 'video/mp4',
      size: 100,
      sourceRevision: 12,
      mediaSourceGeneration: 1,
      appForegroundEpoch: 1,
      expiresAt: 123456,
    })
    const releaseMediaSource = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn().mockImplementation(async () => streamOf(new TextEncoder().encode('fallback')))
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          prepareMediaSource,
          releaseMediaSource,
        } as any,
        catalog: {
          api: {
            download,
          },
        } as any,
      }),
    )

    const model = new VideoPlayerModel()
    model.setFile({
      fileId: 704,
      fileName: 'background-fragmented.mp4',
      mimeType: 'video/mp4',
      mediaInfo: {
        kind: 'video',
        audioTracks: 1,
        videoTracks: 1,
        playbackMimeType: 'video/mp4',
        codecString: 'avc1.640028,mp4a.40.2',
        mseFragmented: true,
      },
      sourceSize: 100,
    })

    await vi.waitFor(() => {
      expect(model.sourceKind()).toBe('video-source')
      expect(model.sourceDelivery()).toBe('mse')
    })

    await releaseMediaSourcesForAppBackground()

    expect(releaseMediaSource).toHaveBeenCalledWith(
      expect.objectContaining({
        streamId: 'background-mse-stream',
        sourceToken: 'background-mse-stream',
      }),
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:lifecycle-audio')
    expect(download).not.toHaveBeenCalled()
    expect(model.sourceKind()).toBe('none')
  })

  it('stops native audio on vault lock cleanup', async () => {
    enableNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendNativeAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0)
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    sendNativeAudioCommand.mockClear()

    await releaseMediaSourcesForVaultLock()

    expect(sendNativeAudioCommand).toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId,
    })
    expect(mediaPlaybackModel.sessionKind()).toBe('none')
    expect(mediaPlaybackModel.driverKind()).toBe('web-audio-element')
    expect(mediaPlaybackModel.nativeSessionId()).toBeNull()
  })

  it('preserves native audio during app background cleanup', async () => {
    enableNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendNativeAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0)
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    mediaPlaybackModel.handleNativeAudioPlayerEvent({
      event: 'state',
      nativeSessionId,
      trackId: 705,
      sourceRevision: 77,
      index: 0,
      playbackState: 'paused',
      playbackIntent: 'pause',
      loadingState: 'loaded',
      positionMs: 0,
      durationMs: 60_000,
    })
    sendNativeAudioCommand.mockClear()

    await releaseMediaSourcesForAppBackground({preserveAudioSession: true})

    expect(sendNativeAudioCommand).not.toHaveBeenCalled()
    expect(mediaPlaybackModel.sessionKind()).toBe('audio')
    expect(mediaPlaybackModel.driverKind()).toBe('ios-avplayer')
    expect(mediaPlaybackModel.nativeSessionId()).toBe(nativeSessionId)
    expect(mediaPlaybackModel.loadingState()).toBe('loaded')
  })

  it('keeps native audio when an inactive source is invalidated', async () => {
    enableNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendNativeAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([nativeAudioTrack({id: 706})], 0)
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    sendNativeAudioCommand.mockClear()

    await releaseMediaSourcesForSourceInvalidation(999)

    expect(sendNativeAudioCommand).not.toHaveBeenCalled()
    expect(mediaPlaybackModel.driverKind()).toBe('ios-avplayer')
    expect(mediaPlaybackModel.nativeSessionId()).toBe(nativeSessionId)
  })

  it('repeated native audio release calls are idempotent', async () => {
    enableNativeAudio()
    const sendNativeAudioCommand = vi.fn().mockResolvedValue(undefined)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          sendNativeAudioCommand,
        } as any,
      }),
    )
    await mediaPlaybackModel.startAudioSession([nativeAudioTrack()], 0)
    const nativeSessionId = mediaPlaybackModel.nativeSessionId()
    sendNativeAudioCommand.mockClear()

    await mediaPlaybackModel.stopSession()
    await mediaPlaybackModel.stopSession()

    expect(sendNativeAudioCommand).toHaveBeenCalledTimes(1)
    expect(sendNativeAudioCommand).toHaveBeenCalledWith({
      command: 'stop',
      nativeSessionId,
    })
  })
})
