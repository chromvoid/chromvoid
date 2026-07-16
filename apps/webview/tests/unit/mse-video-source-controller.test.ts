import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  type MseVideoSourceError,
  MseVideoSourceController,
  isMseVideoSourceSelectable,
} from '../../src/features/media/models/mse-video-source-controller'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
const originalFetch = globalThis.fetch
const originalMediaSource = globalThis.MediaSource

class FakeSourceBuffer extends EventTarget {
  updating = false
  appendedLengths: number[] = []
  bufferedRanges: Array<[number, number]> = []
  removedRanges: Array<[number, number]> = []
  abort = vi.fn()

  get buffered() {
    const ranges = this.bufferedRanges
    return {
      length: ranges.length,
      start: (index: number) => ranges[index]?.[0] ?? 0,
      end: (index: number) => ranges[index]?.[1] ?? 0,
    }
  }

  appendBuffer(bytes: ArrayBuffer) {
    this.updating = true
    this.appendedLengths.push(bytes.byteLength)
    queueMicrotask(() => {
      this.updating = false
      this.dispatchEvent(new Event('updateend'))
    })
  }

  remove(start: number, end: number) {
    this.updating = true
    this.removedRanges.push([start, end])
    queueMicrotask(() => {
      this.updating = false
      this.dispatchEvent(new Event('updateend'))
    })
  }
}

class FakeMediaSource extends EventTarget {
  static instances: FakeMediaSource[] = []
  static isTypeSupported = vi.fn(() => true)

  readyState: 'closed' | 'open' | 'ended' = 'closed'
  readonly sourceBuffer = new FakeSourceBuffer()
  readonly addSourceBuffer = vi.fn(() => this.sourceBuffer)
  readonly endOfStream = vi.fn(() => {
    this.readyState = 'ended'
  })

  constructor() {
    super()
    FakeMediaSource.instances.push(this)
  }

  open() {
    this.readyState = 'open'
    this.dispatchEvent(new Event('sourceopen'))
  }
}

afterEach(() => {
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
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: originalFetch,
  })
  Object.defineProperty(globalThis, 'MediaSource', {
    configurable: true,
    writable: true,
    value: originalMediaSource,
  })
  FakeMediaSource.instances = []
  FakeMediaSource.isTypeSupported.mockClear()
})

function installFakeMediaSource() {
  Object.defineProperty(globalThis, 'MediaSource', {
    configurable: true,
    writable: true,
    value: FakeMediaSource,
  })
}

function installObjectUrlMocks() {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => 'blob:mse-video-source'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
}

function createDefaultController() {
  return new MseVideoSourceController({
    fetchUrl: 'http://127.0.0.1:49152/media/source',
    contentType: 'video/mp4',
    initSegment: {offset: 0, length: 4},
    mediaSegments: [{offset: 4, length: 8, timestampUs: 0}],
    startupBufferSeconds: 4,
    appendAheadSeconds: 8,
    seekBackBufferSeconds: 30,
  })
}

function installPendingFetchUntilAbort() {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          {once: true},
        )
      }),
    ),
  })
}

describe('mse-video-source-controller', () => {
  it('accepts only supported MSE delivery descriptors', () => {
    Object.defineProperty(globalThis, 'MediaSource', {
      configurable: true,
      writable: true,
      value: FakeMediaSource,
    })

    expect(
      isMseVideoSourceSelectable({
        delivery: {
          delivery: 'mse',
          platform: 'desktop',
          fetchUrl: 'http://127.0.0.1:49152/media/source',
          initSegment: {offset: 0, length: 4},
          mediaSegments: [{offset: 4, length: 8, timestampUs: 0}],
        },
        mimeType: 'video/mp4',
        mediaInfo: {
          kind: 'video',
          audioTracks: 1,
          videoTracks: 1,
          codecString: 'avc1.640028,mp4a.40.2',
          mseFragmented: true,
        },
      }),
    ).toBe(true)

    expect(
      isMseVideoSourceSelectable({
        delivery: {
          delivery: 'mse',
          platform: 'desktop',
          fetchUrl: 'http://127.0.0.1:49152/media/source',
        },
        mimeType: 'video/mp4',
      }),
    ).toBe(false)

    expect(
      isMseVideoSourceSelectable({
        delivery: {
          delivery: 'mse',
          platform: 'desktop',
          fetchUrl: 'http://127.0.0.1:49152/media/source',
          initSegment: {offset: 0, length: 4},
          mediaSegments: [{offset: 4, length: 8, timestampUs: 0}],
        },
        mimeType: 'video/mp4',
        mediaInfo: {
          kind: 'video',
          audioTracks: 1,
          videoTracks: 1,
          codecString: 'avc1.640028,mp4a.40.2',
          mseFragmented: false,
        },
      }),
    ).toBe(false)
  })

  it('starts with the configured startup budget and appends later segments near playback', async () => {
    Object.defineProperty(globalThis, 'MediaSource', {
      configurable: true,
      writable: true,
      value: FakeMediaSource,
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:mse-video-source'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const range = init?.headers instanceof Headers
        ? init.headers.get('Range')
        : (init?.headers as Record<string, string> | undefined)?.Range
      const length = range === 'bytes=0-3' ? 4 : 8
      return {
        status: 206,
        arrayBuffer: async () => new ArrayBuffer(length),
      } as Response
    })
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    })

    const controller = new MseVideoSourceController({
      fetchUrl: 'http://127.0.0.1:49152/media/source',
      contentType: 'video/mp4; codecs="avc1.640028,mp4a.40.2"',
      initSegment: {offset: 0, length: 4},
      mediaSegments: [
        {offset: 4, length: 8, timestampUs: 0},
        {offset: 12, length: 8, timestampUs: 2_000_000},
        {offset: 20, length: 8, timestampUs: 4_000_000},
      ],
      startupBufferSeconds: 4,
      appendAheadSeconds: 8,
      seekBackBufferSeconds: 30,
    })

    const start = controller.start()
    FakeMediaSource.instances[0]?.open()
    await start

    const mediaSource = FakeMediaSource.instances[0]
    expect(URL.createObjectURL).toHaveBeenCalledWith(mediaSource)
    expect(mediaSource.addSourceBuffer).toHaveBeenCalledWith(
      'video/mp4; codecs="avc1.640028,mp4a.40.2"',
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:49152/media/source',
      expect.objectContaining({headers: {Range: 'bytes=0-3'}}),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:49152/media/source',
      expect.objectContaining({headers: {Range: 'bytes=4-11'}}),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:49152/media/source',
      expect.objectContaining({headers: {Range: 'bytes=12-19'}}),
    )
    expect(mediaSource.sourceBuffer.appendedLengths).toEqual([4, 8, 8])
    expect(mediaSource.endOfStream).not.toHaveBeenCalled()

    await controller.ensureBufferedForPlaybackPosition(3)

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://127.0.0.1:49152/media/source',
      expect.objectContaining({headers: {Range: 'bytes=20-27'}}),
    )
    expect(mediaSource.sourceBuffer.appendedLengths).toEqual([4, 8, 8, 8])
    expect(mediaSource.endOfStream).toHaveBeenCalledTimes(1)

    controller.release()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mse-video-source')
  })

  it('appends from the segment containing the seek target instead of index 0', async () => {
    installFakeMediaSource()
    installObjectUrlMocks()
    const requestedRanges: string[] = []
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: vi.fn(async (_url: string, init?: RequestInit) => {
        requestedRanges.push((init?.headers as Record<string, string>).Range)
        return {
          status: 206,
          arrayBuffer: async () => new ArrayBuffer(8),
        } as Response
      }),
    })

    const mediaSegments = Array.from({length: 11}, (_, index) => ({
      offset: 8 + index * 8,
      length: 8,
      timestampUs: index * 2_000_000,
    }))
    const controller = new MseVideoSourceController({
      fetchUrl: 'http://127.0.0.1:49152/media/source',
      contentType: 'video/mp4',
      initSegment: {offset: 0, length: 8},
      mediaSegments,
      startupBufferSeconds: 4,
      appendAheadSeconds: 8,
      seekBackBufferSeconds: 30,
    })

    const start = controller.start()
    FakeMediaSource.instances[0]?.open()
    await start

    // init + segments at 0s and 2s only
    expect(requestedRanges).toEqual(['bytes=0-7', 'bytes=8-15', 'bytes=16-23'])

    // Seek forward to 16s: append [segment@16s, 16s + appendAhead) only, never
    // re-walking segments 2..7.
    await controller.ensureBufferedForPlaybackPosition(16)

    expect(requestedRanges.slice(3)).toEqual([
      'bytes=72-79', // 16s (index 8)
      'bytes=80-87', // 18s (index 9)
      'bytes=88-95', // 20s (index 10)
    ])
  })

  it('re-fetches segments evicted behind the seek-back window on seek-back', async () => {
    installFakeMediaSource()
    installObjectUrlMocks()
    const requestedRanges: string[] = []
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: vi.fn(async (_url: string, init?: RequestInit) => {
        requestedRanges.push((init?.headers as Record<string, string>).Range)
        return {
          status: 206,
          arrayBuffer: async () => new ArrayBuffer(8),
        } as Response
      }),
    })

    const controller = new MseVideoSourceController({
      fetchUrl: 'http://127.0.0.1:49152/media/source',
      contentType: 'video/mp4',
      initSegment: {offset: 0, length: 8},
      mediaSegments: [
        {offset: 8, length: 8, timestampUs: 0},
        {offset: 16, length: 8, timestampUs: 2_000_000},
        {offset: 24, length: 8, timestampUs: 4_000_000},
      ],
      startupBufferSeconds: 10,
      appendAheadSeconds: 8,
      seekBackBufferSeconds: 30,
    })

    const start = controller.start()
    FakeMediaSource.instances[0]?.open()
    await start
    expect(requestedRanges).toHaveLength(4)

    const sourceBuffer = FakeMediaSource.instances[0]!.sourceBuffer
    sourceBuffer.bufferedRanges = [[0, 40]]

    // Playback at 35s evicts everything before 5s and must drop the eviction
    // range from the appended-segment bookkeeping.
    await controller.ensureBufferedForPlaybackPosition(35)
    expect(sourceBuffer.removedRanges).toEqual([[0, 5]])

    // Seeking back to 0 must re-fetch the evicted segments instead of skipping
    // them as already appended.
    await controller.ensureBufferedForPlaybackPosition(0)
    expect(requestedRanges.slice(4)).toEqual(['bytes=8-15', 'bytes=16-23'])
  })

  it('finalizes duration and signals end of stream once all segments are appended', async () => {
    installFakeMediaSource()
    installObjectUrlMocks()
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: vi.fn(async () => ({
        status: 206,
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as Response),
    })

    const controller = new MseVideoSourceController({
      fetchUrl: 'http://127.0.0.1:49152/media/source',
      contentType: 'video/mp4',
      initSegment: {offset: 0, length: 8},
      mediaSegments: [
        {offset: 8, length: 8, timestampUs: 0},
        {offset: 16, length: 8, timestampUs: 2_000_000},
      ],
      startupBufferSeconds: 4,
      appendAheadSeconds: 8,
      seekBackBufferSeconds: 30,
    })

    const start = controller.start()
    const mediaSource = FakeMediaSource.instances[0]!
    mediaSource.sourceBuffer.bufferedRanges = [[0, 4]]
    mediaSource.open()
    await start

    expect((mediaSource as unknown as {duration?: number}).duration).toBe(4)
    expect(mediaSource.endOfStream).toHaveBeenCalledTimes(1)
    expect(mediaSource.readyState).toBe('ended')

    controller.release()
  })

  it('latches into a failed state after a fatal operation failure', async () => {
    installFakeMediaSource()
    installObjectUrlMocks()
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const range = (init?.headers as Record<string, string>).Range
      if (range === 'bytes=16-23') {
        return {status: 500, arrayBuffer: async () => new ArrayBuffer(0)} as Response
      }
      return {status: 206, arrayBuffer: async () => new ArrayBuffer(8)} as Response
    })
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    })

    const controller = new MseVideoSourceController({
      fetchUrl: 'http://127.0.0.1:49152/media/source',
      contentType: 'video/mp4',
      initSegment: {offset: 0, length: 8},
      mediaSegments: [
        {offset: 8, length: 8, timestampUs: 0},
        {offset: 16, length: 8, timestampUs: 2_000_000},
      ],
      startupBufferSeconds: 4,
      appendAheadSeconds: 8,
      seekBackBufferSeconds: 30,
    })

    const start = controller.start()
    FakeMediaSource.instances[0]?.open()
    await expect(start).rejects.toMatchObject({
      name: 'MseVideoSourceError',
      code: 'fetch-failed',
    } satisfies Partial<MseVideoSourceError>)

    const callsAfterFailure = fetchMock.mock.calls.length

    // Subsequent operations must reject with the latched failure instead of
    // chaining new work onto a broken SourceBuffer.
    await expect(controller.ensureBufferedForPlaybackPosition(0)).rejects.toMatchObject({
      name: 'MseVideoSourceError',
      code: 'fetch-failed',
    } satisfies Partial<MseVideoSourceError>)
    expect(fetchMock.mock.calls.length).toBe(callsAfterFailure)
  })

  it('rejects non-partial segment fetches', async () => {
    Object.defineProperty(globalThis, 'MediaSource', {
      configurable: true,
      writable: true,
      value: FakeMediaSource,
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:mse-video-source'),
    })
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: vi.fn(async () => ({
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(4),
      }) as Response),
    })

    const controller = new MseVideoSourceController({
      fetchUrl: 'http://127.0.0.1:49152/media/source',
      contentType: 'video/mp4',
      initSegment: {offset: 0, length: 4},
      mediaSegments: [{offset: 4, length: 8, timestampUs: 0}],
      startupBufferSeconds: 4,
      appendAheadSeconds: 8,
      seekBackBufferSeconds: 30,
    })

    const start = controller.start()
    FakeMediaSource.instances[0]?.open()

    await expect(start).rejects.toMatchObject({
      name: 'MseVideoSourceError',
      code: 'fetch-failed',
    } satisfies Partial<MseVideoSourceError>)
  })

  it('evicts SourceBuffer ranges behind the configured seek-back budget', async () => {
    Object.defineProperty(globalThis, 'MediaSource', {
      configurable: true,
      writable: true,
      value: FakeMediaSource,
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:mse-video-source'),
    })
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: vi.fn(async () => ({
        status: 206,
        arrayBuffer: async () => new ArrayBuffer(4),
      }) as Response),
    })

    const controller = new MseVideoSourceController({
      fetchUrl: 'http://127.0.0.1:49152/media/source',
      contentType: 'video/mp4',
      initSegment: {offset: 0, length: 4},
      mediaSegments: [{offset: 4, length: 8, timestampUs: 0}],
      startupBufferSeconds: 4,
      appendAheadSeconds: 8,
      seekBackBufferSeconds: 30,
    })

    const start = controller.start()
    FakeMediaSource.instances[0]?.open()
    await start

    const sourceBuffer = FakeMediaSource.instances[0]!.sourceBuffer
    sourceBuffer.bufferedRanges = [[0, 40]]

    await controller.ensureBufferedForPlaybackPosition(35)

    expect(sourceBuffer.removedRanges).toEqual([[0, 5]])
  })

  it('aborts pending segment fetches on release', async () => {
    installFakeMediaSource()
    installObjectUrlMocks()
    installPendingFetchUntilAbort()

    const controller = createDefaultController()
    const start = controller.start()
    FakeMediaSource.instances[0]?.open()
    await Promise.resolve()
    controller.release()

    await expect(start).rejects.toMatchObject({
      name: 'MseVideoSourceError',
      code: 'aborted',
    } satisfies Partial<MseVideoSourceError>)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mse-video-source')
  })
})
