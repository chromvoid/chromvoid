import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {tauriInvokeMock} = vi.hoisted(() => ({
  tauriInvokeMock: vi.fn(() => Promise.resolve({ok: true, result: {}})),
}))

vi.mock('../../src/core/transport/tauri/ipc', () => ({
  tauriInvoke: tauriInvokeMock,
}))

import {setupAndroidMediaSessionBridge} from '../../src/app/bootstrap/android-media-session'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import type {TransportEventHandler, TransportLike} from '../../src/core/transport/transport'
import {ANDROID_MEDIA_SESSION_CONTROL_EVENT} from '../../src/features/media/models/android-media-session-events'
import {mediaPlaybackModel} from '../../src/features/media/models/media-playback.model'

class TestTransport implements Pick<TransportLike, 'kind' | 'on' | 'off'> {
  readonly kind = 'tauri' as const
  private readonly handlers = new Map<string, Set<TransportEventHandler>>()

  on(event: string, handler: TransportEventHandler): void {
    const handlers = this.handlers.get(event) ?? new Set()
    handlers.add(handler)
    this.handlers.set(event, handlers)
  }

  off(event: string, handler: TransportEventHandler): void {
    this.handlers.get(event)?.delete(handler)
  }

  emit(event: string, payload: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(undefined, payload)
    }
  }
}

async function flushBridge(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function setAndroidRuntime(): void {
  setRuntimeCapabilities({
    platform: 'android',
    mobile: true,
  })
}

function setLoadedAudioSession(): void {
  mediaPlaybackModel.sessionKind.set('audio')
  mediaPlaybackModel.tracks.set([{id: 41, name: 'song.mp3', mimeType: 'audio/mpeg', size: 100}])
  mediaPlaybackModel.currentIndex.set(0)
  mediaPlaybackModel.loadingState.set('loaded')
  mediaPlaybackModel.playbackState.set('paused')
  mediaPlaybackModel.currentTime.set(12)
  mediaPlaybackModel.duration.set(60)
}

describe('android media session bridge', () => {
  let transport: TestTransport
  let teardown: (() => void) | undefined

  beforeEach(async () => {
    transport = new TestTransport()
    resetRuntimeCapabilities()
    await mediaPlaybackModel.stopSession()
    tauriInvokeMock.mockClear()
  })

  afterEach(async () => {
    teardown?.()
    teardown = undefined
    await mediaPlaybackModel.stopSession()
    resetRuntimeCapabilities()
    vi.restoreAllMocks()
    tauriInvokeMock.mockClear()
  })

  it('sends native media updates when Android audio playback state changes', async () => {
    setAndroidRuntime()
    teardown = setupAndroidMediaSessionBridge(transport as unknown as TransportLike)

    setLoadedAudioSession()
    await flushBridge()

    expect(tauriInvokeMock).toHaveBeenCalledTimes(1)
    expect(tauriInvokeMock).toHaveBeenLastCalledWith('android_media_session_update', {
      snapshot: expect.objectContaining({
        active: true,
        trackId: 41,
        title: 'song.mp3',
        playbackState: 'paused',
        positionMs: 12_000,
        durationMs: 60_000,
        canSeek: true,
      }),
    })

    mediaPlaybackModel.playbackState.set('playing')
    await flushBridge()

    expect(tauriInvokeMock).toHaveBeenLastCalledWith('android_media_session_update', {
      snapshot: expect.objectContaining({
        playbackState: 'playing',
      }),
    })
  })

  it('does not send native media updates for passive playback time ticks', async () => {
    setAndroidRuntime()
    teardown = setupAndroidMediaSessionBridge(transport as unknown as TransportLike)

    setLoadedAudioSession()
    await flushBridge()
    tauriInvokeMock.mockClear()

    mediaPlaybackModel.handleMediaTimeUpdate(13, 60)
    await flushBridge()

    expect(tauriInvokeMock).not.toHaveBeenCalled()

    mediaPlaybackModel.seekTo(30)
    await flushBridge()

    expect(tauriInvokeMock).toHaveBeenLastCalledWith('android_media_session_update', {
      snapshot: expect.objectContaining({
        positionMs: 30_000,
      }),
    })
  })

  it('stops native controls when the audio session enters an unavailable state', async () => {
    setAndroidRuntime()
    teardown = setupAndroidMediaSessionBridge(transport as unknown as TransportLike)
    setLoadedAudioSession()
    await flushBridge()
    tauriInvokeMock.mockClear()

    mediaPlaybackModel.loadingState.set('fallback-limited')
    await flushBridge()

    expect(tauriInvokeMock).toHaveBeenCalledWith('android_media_session_stop')
  })

  it('stops native controls when the audio source is released for lifecycle', async () => {
    setAndroidRuntime()
    teardown = setupAndroidMediaSessionBridge(transport as unknown as TransportLike)
    setLoadedAudioSession()
    await flushBridge()
    tauriInvokeMock.mockClear()

    mediaPlaybackModel.loadingState.set('idle')
    mediaPlaybackModel.playbackState.set('paused')
    await flushBridge()

    expect(tauriInvokeMock).toHaveBeenCalledWith('android_media_session_stop')
  })

  it('stops and suppresses legacy media session updates while Android Media3 owns playback', async () => {
    setAndroidRuntime()
    teardown = setupAndroidMediaSessionBridge(transport as unknown as TransportLike)
    setLoadedAudioSession()
    await flushBridge()
    tauriInvokeMock.mockClear()

    mediaPlaybackModel.driverKind.set('android-media3')
    mediaPlaybackModel.nativeSessionId.set('native-session-1')
    await flushBridge()

    expect(tauriInvokeMock).toHaveBeenCalledWith('android_media_session_stop')

    tauriInvokeMock.mockClear()
    mediaPlaybackModel.playbackState.set('playing')
    mediaPlaybackModel.seekTo(30)
    await flushBridge()

    expect(tauriInvokeMock).not.toHaveBeenCalled()
  })

  it('ignores legacy native actions while Android Media3 owns playback', () => {
    teardown = setupAndroidMediaSessionBridge(transport as unknown as TransportLike)
    mediaPlaybackModel.driverKind.set('android-media3')
    mediaPlaybackModel.nativeSessionId.set('native-session-1')
    const requestPlay = vi.spyOn(mediaPlaybackModel, 'requestPlay').mockImplementation(() => {})
    const requestPause = vi.spyOn(mediaPlaybackModel, 'requestPause').mockImplementation(() => {})
    const stopSession = vi.spyOn(mediaPlaybackModel, 'stopSession').mockResolvedValue(undefined)
    const nextTrack = vi.spyOn(mediaPlaybackModel, 'nextTrack').mockResolvedValue(undefined)
    const previousTrack = vi.spyOn(mediaPlaybackModel, 'previousTrack').mockResolvedValue(undefined)
    const seekTo = vi.spyOn(mediaPlaybackModel, 'seekTo').mockImplementation(() => {})
    const dispatchEvent = vi.spyOn(globalThis, 'dispatchEvent')

    transport.emit('android-media-session:action', {action: 'play'})
    transport.emit('android-media-session:action', {action: 'pause'})
    transport.emit('android-media-session:action', {action: 'stop'})
    transport.emit('android-media-session:action', {action: 'next'})
    transport.emit('android-media-session:action', {action: 'previous'})
    transport.emit('android-media-session:action', {action: 'seekTo', positionMs: 42_500})

    expect(requestPlay).not.toHaveBeenCalled()
    expect(requestPause).not.toHaveBeenCalled()
    expect(stopSession).not.toHaveBeenCalled()
    expect(nextTrack).not.toHaveBeenCalled()
    expect(previousTrack).not.toHaveBeenCalled()
    expect(seekTo).not.toHaveBeenCalled()
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('maps native media actions to playback model methods', () => {
    teardown = setupAndroidMediaSessionBridge(transport as unknown as TransportLike)
    const requestPlay = vi.spyOn(mediaPlaybackModel, 'requestPlay').mockImplementation(() => {})
    const requestPause = vi.spyOn(mediaPlaybackModel, 'requestPause').mockImplementation(() => {})
    const stopSession = vi.spyOn(mediaPlaybackModel, 'stopSession').mockResolvedValue(undefined)
    const nextTrack = vi.spyOn(mediaPlaybackModel, 'nextTrack').mockResolvedValue(undefined)
    const previousTrack = vi.spyOn(mediaPlaybackModel, 'previousTrack').mockResolvedValue(undefined)
    const seekTo = vi.spyOn(mediaPlaybackModel, 'seekTo').mockImplementation(() => {})
    const dispatchEvent = vi.spyOn(globalThis, 'dispatchEvent')

    transport.emit('android-media-session:action', {action: 'play'})
    transport.emit('android-media-session:action', {action: 'pause'})
    transport.emit('android-media-session:action', {action: 'stop'})
    transport.emit('android-media-session:action', {action: 'next'})
    transport.emit('android-media-session:action', {action: 'previous'})
    transport.emit('android-media-session:action', {action: 'seekTo', positionMs: 42_500})

    expect(requestPlay).toHaveBeenCalledTimes(1)
    expect(requestPause).toHaveBeenCalledTimes(1)
    expect(stopSession).toHaveBeenCalledTimes(1)
    expect(nextTrack).toHaveBeenCalledTimes(1)
    expect(previousTrack).toHaveBeenCalledTimes(1)
    expect(seekTo).toHaveBeenCalledWith(42.5)
    expect(dispatchEvent).toHaveBeenCalledTimes(3)
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: ANDROID_MEDIA_SESSION_CONTROL_EVENT,
    }))
  })
})
