import {beforeEach, describe, expect, it, vi} from 'vitest'

import {TauriTransport} from '../../src/core/transport/tauri/tauri-transport'
import {
  prepareMediaStreamViaTauri,
  releaseMediaStreamViaTauri,
  sendAndroidAudioCommandViaTauri,
  sendNativeAudioCommandViaTauri,
  startAndroidVideoViaTauri,
  stopAndroidVideoViaTauri,
} from '../../src/core/transport/tauri/tauri-binary-ops'
import type {RuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import type {AndroidAudioPlayerEvent, MediaStreamErrorEvent, NativeAudioPlayerEvent} from '../../src/core/transport/transport'

const tauriInvoke = vi.fn()
const tauriListen = vi.fn()
const listenHandlers = new Map<string, (payload: unknown) => void>()

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}))

vi.mock('../../src/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
    tauriListen: (event: string, handler: (payload: unknown) => void) => tauriListen(event, handler),
  }
})

const capabilities: RuntimeCapabilities = {
  platform: 'macos',
  desktop: true,
  mobile: false,
  supports_native_path_io: true,
  supports_open_external: true,
  supports_native_share: false,
  supports_volume: true,
  supports_gateway: true,
  supports_network_remote: true,
  supports_biometric: false,
  supports_autofill: false,
  supports_media_stream_protocol: true,
  supports_native_audio_playback: false,
  supports_native_video_playback: false,
  supports_native_file_upload: false,
  supports_share_import: false,
  supports_native_otp_qr_scan: false,
  supports_mobile_backup_restore: false,
  supports_photo_library_save: false,
  supports_credential_provider_passkeys_lite: false,
  supports_android_native_video: false,
  android_native_audio_playback_rollout_enabled: false,
  supports_android_native_upload: false,
  supports_android_share_import: false,
  supports_android_native_otp_qr_scan: false,
  supports_storage_root_selection: true,
  supports_android_saf_backup_restore: false,
}

function installConnectInvokeMocks(): void {
  tauriInvoke.mockImplementation(async (command: string) => {
    if (command === 'init_local_storage') {
      return {ok: true, result: {storage_root: '/tmp/chromvoid'}}
    }
    if (command === 'runtime_capabilities') {
      return capabilities
    }
    if (command === 'mode_status') {
      return {mode: 'local', connection_state: 'disconnected', transport_type: null, remote_core_features: []}
    }
    if (command === 'get_current_mode') {
      return {ok: true, result: 'local'}
    }
    throw new Error(`unexpected tauri command: ${command}`)
  })
}

async function waitForConnected(transport: TauriTransport): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (transport.connected()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('transport did not connect')
}

describe('Tauri media stream transport', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    tauriListen.mockReset()
    listenHandlers.clear()
    tauriListen.mockImplementation(async (event: string, handler: (payload: unknown) => void) => {
      listenHandlers.set(event, handler)
      return () => {
        listenHandlers.delete(event)
      }
    })
  })

  it('prepares and releases native media stream sources through Tauri commands', async () => {
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'prepare_media_stream') {
        return {
          ok: true,
          result: {
            kind: 'media-stream',
            streamId: 'stream-1',
            url: 'chromvoid-media://localhost/stream-1',
            name: 'track.mp3',
            mimeType: 'audio/mpeg',
            size: 1234,
            sourceRevision: 77,
            expiresAt: 123456,
          },
        }
      }
      if (command === 'release_media_stream') {
        return {ok: true, result: null}
      }
      throw new Error(`unexpected tauri command: ${command}`)
    })

    const source = await prepareMediaStreamViaTauri(23, {
      fileName: 'track.mp3',
      mimeType: 'audio/mpeg',
      lastModified: 1000,
    })

    expect(source).toEqual({
      kind: 'media-stream',
      streamId: 'stream-1',
      url: 'chromvoid-media://localhost/stream-1',
      name: 'track.mp3',
      mimeType: 'audio/mpeg',
      size: 1234,
      sourceRevision: 77,
      expiresAt: 123456,
    })
    expect(tauriInvoke).toHaveBeenCalledWith('prepare_media_stream', {
      args: {
        nodeId: 23,
        fileName: 'track.mp3',
        mimeType: 'audio/mpeg',
        lastModified: 1000,
      },
    })

    await releaseMediaStreamViaTauri(source)

    expect(tauriInvoke).toHaveBeenCalledWith('release_media_stream', {
      args: {
        streamId: 'stream-1',
      },
    })
  })

  it('preserves stable prepare error codes on rejection', async () => {
    tauriInvoke.mockResolvedValue({
      ok: false,
      error: 'Media source is not playable',
      code: 'ERR_MEDIA_UNSUPPORTED',
    })

    const error = await prepareMediaStreamViaTauri(23, {
      fileName: 'track.flac',
      mimeType: 'audio/flac',
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      message: 'Media source is not playable (ERR_MEDIA_UNSUPPORTED)',
      code: 'ERR_MEDIA_UNSUPPORTED',
    })
  })

  it('starts and stops Android native video through Tauri commands', async () => {
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'android_video_start') {
        return {
          ok: true,
          result: {
            started: true,
            token: 'video-token-1',
            mimeType: 'video/mp4',
            size: 1234,
            sourceRevision: 77,
          },
        }
      }
      if (command === 'android_video_stop') {
        return {ok: true, result: null}
      }
      throw new Error(`unexpected tauri command: ${command}`)
    })

    const source = await startAndroidVideoViaTauri(23, {
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
      lastModified: 1000,
    })

    expect(source).toEqual({
      kind: 'android-native-video',
      token: 'video-token-1',
      mimeType: 'video/mp4',
      size: 1234,
      sourceRevision: 77,
    })
    expect(tauriInvoke).toHaveBeenCalledWith('android_video_start', {
      args: {
        nodeId: 23,
        fileName: 'clip.mp4',
        mimeType: 'video/mp4',
        lastModified: 1000,
      },
    })

    await stopAndroidVideoViaTauri(source)

    expect(tauriInvoke).toHaveBeenCalledWith('android_video_stop', {
      token: 'video-token-1',
    })
  })

  it('sends Android native audio commands through Tauri', async () => {
    tauriInvoke.mockResolvedValue({ok: true, result: null})

    await sendAndroidAudioCommandViaTauri({
      command: 'startSession',
      nativeSessionId: 'audio-session-1',
      tracks: [
        {
          trackId: 41,
          systemTitle: 'ChromVoid audio',
          mimeType: 'audio/mpeg',
          size: 1234,
          sourceRevision: 77,
        },
      ],
      index: 0,
      autoplay: true,
    })

    expect(tauriInvoke).toHaveBeenCalledWith('android_audio_session_command', {
      args: {
        command: 'startSession',
        nativeSessionId: 'audio-session-1',
        tracks: [
          {
            trackId: 41,
            systemTitle: 'ChromVoid audio',
            mimeType: 'audio/mpeg',
            size: 1234,
            sourceRevision: 77,
          },
        ],
        index: 0,
        autoplay: true,
      },
    })
  })

  it('sends neutral native audio commands through Tauri', async () => {
    tauriInvoke.mockResolvedValue({ok: true, result: null})

    await sendNativeAudioCommandViaTauri({
      command: 'pause',
      nativeSessionId: 'audio-session-1',
    })

    expect(tauriInvoke).toHaveBeenCalledWith('native_audio_session_command', {
      args: {
        command: 'pause',
        nativeSessionId: 'audio-session-1',
      },
    })
  })

  it('forwards native media stream errors through the transport event layer', async () => {
    installConnectInvokeMocks()
    const transport = new TauriTransport()
    const handler = vi.fn()
    transport.on('media-stream:error', handler)

    transport.connect()
    await waitForConnected(transport)

    const payload: MediaStreamErrorEvent = {
      streamId: 'stream-1',
      code: 'ERR_MEDIA_RANGE_REQUIRED',
      httpStatus: 416,
      nodeId: 23,
      sourceRevision: 77,
    }

    listenHandlers.get('media-stream:error')?.(payload)

    expect(handler).toHaveBeenCalledWith(undefined, payload)

    transport.disconnect()
  })

  it('forwards Android native audio player events through the transport event layer', async () => {
    installConnectInvokeMocks()
    const transport = new TauriTransport()
    const handler = vi.fn()
    transport.on('android-audio-player:event', handler)

    transport.connect()
    await waitForConnected(transport)

    const payload: AndroidAudioPlayerEvent = {
      event: 'state',
      nativeSessionId: 'audio-session-1',
      trackId: 41,
      sourceRevision: 77,
      index: 0,
      playbackState: 'playing',
      playbackIntent: 'play',
      loadingState: 'loaded',
      positionMs: 42_000,
      durationMs: 120_000,
    }

    listenHandlers.get('android-audio-player:event')?.(payload)

    expect(handler).toHaveBeenCalledWith(undefined, payload)

    transport.disconnect()
  })

  it('forwards neutral native audio player events through the transport event layer', async () => {
    installConnectInvokeMocks()
    const transport = new TauriTransport()
    const handler = vi.fn()
    transport.on('native-audio-player:event', handler)

    transport.connect()
    await waitForConnected(transport)

    const payload: NativeAudioPlayerEvent = {
      event: 'state',
      nativeSessionId: 'audio-session-1',
      trackId: 41,
      sourceRevision: 77,
      index: 0,
      playbackState: 'playing',
      playbackIntent: 'play',
      loadingState: 'loaded',
      positionMs: 42_000,
      durationMs: 120_000,
    }

    listenHandlers.get('native-audio-player:event')?.(payload)

    expect(handler).toHaveBeenCalledWith(undefined, payload)

    transport.disconnect()
  })
})
