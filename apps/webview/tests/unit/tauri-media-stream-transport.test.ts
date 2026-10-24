import {beforeEach, describe, expect, it, vi} from 'vitest'

import {TauriTransport} from '../../src/core/transport/tauri/tauri-transport'
import {
  prepareMediaStreamViaTauri,
  prepareMediaSourceViaTauri,
  releaseMediaStreamViaTauri,
  releaseMediaSourceViaTauri,
  sendNativeAudioCommandViaTauri,
} from '../../src/core/transport/tauri/tauri-binary-ops'
import type {RuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import type {MediaStreamErrorEvent, NativeAudioPlayerEvent} from '../../src/core/transport/transport'

const tauriInvoke = vi.fn()
const tauriListen = vi.fn()
const listenHandlers = new Map<string, (payload: unknown) => void>()

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
  supports_media_http_stream: true,
  supports_mse_video_playback: true,
  supports_desktop_native_video_playback: true,
  supports_mobile_native_video_playback: false,
  supports_native_audio_playback: false,
  supports_native_video_playback: false,
  supports_native_file_upload: false,
  supports_share_import: false,
  supports_native_otp_qr_scan: false,
  supports_mobile_backup_restore: false,
  supports_photo_library_save: false,
  supports_credential_provider_passkeys_lite: false,
  supports_storage_root_selection: true,
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
      fallbackUrl: undefined,
      delivery: 'custom-scheme',
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

  it('parses loopback HTTP media stream delivery metadata', async () => {
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'prepare_media_stream') {
        return {
          ok: true,
          result: {
            kind: 'media-stream',
            streamId: 'stream-http',
            url: 'http://127.0.0.1:49152/media/stream-http',
            fallbackUrl: 'chromvoid-media://localhost/stream-http',
            delivery: 'loopback-http',
            name: 'clip.mp4',
            mimeType: 'video/mp4',
            size: 2048,
            sourceRevision: 88,
            expiresAt: 654321,
          },
        }
      }
      throw new Error(`unexpected tauri command: ${command}`)
    })

    const source = await prepareMediaStreamViaTauri(24, {
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
    })

    expect(source).toEqual({
      kind: 'media-stream',
      streamId: 'stream-http',
      url: 'http://127.0.0.1:49152/media/stream-http',
      fallbackUrl: 'chromvoid-media://localhost/stream-http',
      delivery: 'loopback-http',
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      size: 2048,
      sourceRevision: 88,
      expiresAt: 654321,
    })
  })

  it('prepares and releases generic video sources through Tauri commands', async () => {
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'prepare_media_source') {
        return {
          ok: true,
          result: {
            kind: 'video-source',
            streamId: 'stream-231',
            sourceToken: 'stream-231',
            platform: 'desktop',
            provider: 'local-catalog',
            deliveries: [
              {
                delivery: 'loopback-http',
                platform: 'desktop',
                url: 'http://127.0.0.1:49152/media/stream-231',
              },
            ],
            name: 'clip.mp4',
            mimeType: 'video/mp4',
            size: 2048,
            sourceRevision: 88,
            mediaSourceGeneration: 1,
            expiresAt: 654321,
          },
        }
      }
      if (command === 'release_media_source') {
        return {ok: true, result: null}
      }
      throw new Error(`unexpected tauri command: ${command}`)
    })

    const source = await prepareMediaSourceViaTauri({
      kind: 'video',
      nodeId: 24,
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
      lastModified: 1000,
    })

    expect(source).toEqual({
      kind: 'video-source',
      streamId: 'stream-231',
      sourceToken: 'stream-231',
      platform: 'desktop',
      provider: 'local-catalog',
      deliveries: [
        {
          delivery: 'loopback-http',
          platform: 'desktop',
          url: 'http://127.0.0.1:49152/media/stream-231',
        },
      ],
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      size: 2048,
      sourceRevision: 88,
      mediaSourceGeneration: 1,
      appForegroundEpoch: 1,
      expiresAt: 654321,
    })
    expect(tauriInvoke).toHaveBeenCalledWith('prepare_media_source', {
      args: {
        kind: 'video',
        nodeId: 24,
        sourceRevision: null,
        ownerToken: null,
        fileName: 'clip.mp4',
        mimeType: 'video/mp4',
        lastModified: 1000,
      },
    })

    await releaseMediaSourceViaTauri(source)

    expect(tauriInvoke).toHaveBeenCalledWith('release_media_source', {
      args: {
        streamId: 'stream-231',
        sourceToken: 'stream-231',
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

  it('normalizes native video delivery through generic media source commands', async () => {
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'prepare_media_source') {
        return {
          ok: true,
          result: {
            kind: 'video-source',
            streamId: 'stream-android-1',
            sourceToken: 'video-token-1',
            platform: 'mobile',
            provider: 'mobile-local-catalog',
            deliveries: [
              {
                delivery: 'native-video',
                platform: 'mobile',
                nativeSourceToken: 'native-video-token-1',
              },
            ],
            name: 'clip.mp4',
            mimeType: 'video/mp4',
            size: 1234,
            sourceRevision: 77,
            mediaSourceGeneration: 3,
            transportSessionGeneration: 9,
            appForegroundEpoch: 5,
            expiresAt: 654321,
          },
        }
      }
      throw new Error(`unexpected tauri command: ${command}`)
    })

    const source = await prepareMediaSourceViaTauri({
      kind: 'video',
      nodeId: 23,
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
      lastModified: 1000,
    })

    expect(source).toEqual({
      kind: 'video-source',
      streamId: 'stream-android-1',
      sourceToken: 'video-token-1',
      platform: 'mobile',
      provider: 'mobile-local-catalog',
      deliveries: [
        {
          delivery: 'native-video',
          platform: 'mobile',
          nativeSourceToken: 'native-video-token-1',
        },
      ],
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      size: 1234,
      sourceRevision: 77,
      mediaSourceGeneration: 3,
      transportSessionGeneration: 9,
      appForegroundEpoch: 5,
      expiresAt: 654321,
    })
    expect(tauriInvoke).toHaveBeenCalledWith('prepare_media_source', {
      args: {
        kind: 'video',
        nodeId: 23,
        sourceRevision: null,
        ownerToken: null,
        fileName: 'clip.mp4',
        mimeType: 'video/mp4',
        lastModified: 1000,
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

  it('skips desktop mode_status during mobile transport connect', async () => {
    const mobileCapabilities: RuntimeCapabilities = {
      ...capabilities,
      platform: 'ios',
      desktop: false,
      mobile: true,
      supports_native_path_io: false,
      supports_volume: false,
      supports_gateway: false,
      supports_mobile_usb_remote: false,
    }
    tauriInvoke.mockImplementation(async (command: string) => {
      if (command === 'init_local_storage') {
        return {ok: true, result: {storage_root: '/tmp/chromvoid'}}
      }
      if (command === 'runtime_capabilities') {
        return mobileCapabilities
      }
      if (command === 'get_current_mode') {
        return {ok: true, result: 'local'}
      }
      throw new Error(`unexpected tauri command: ${command}`)
    })

    const transport = new TauriTransport()
    transport.connect()
    await waitForConnected(transport)

    expect(tauriInvoke).not.toHaveBeenCalledWith('mode_status')
    expect(tauriInvoke).toHaveBeenCalledWith('get_current_mode')

    transport.disconnect()
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
