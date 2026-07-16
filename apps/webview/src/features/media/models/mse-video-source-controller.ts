import type {FileMediaInfo, FileMediaSegmentRange} from 'root/core/catalog/media-info'
import type {PreparedVideoDelivery} from 'root/core/transport/transport'

export type MseVideoSourceDescriptor = {
  fetchUrl: string
  contentType: string
  initSegment: {offset: number; length: number}
  mediaSegments: FileMediaSegmentRange[]
  startupBufferSeconds: number
  appendAheadSeconds: number
  seekBackBufferSeconds: number
}

export type MseVideoSourceControllerOptions = MseVideoSourceDescriptor & {
  signal?: AbortSignal
}

type MediaSourceGlobal = typeof MediaSource
export type MseVideoSourceErrorCode =
  | 'unsupported-mime'
  | 'missing-segment-metadata'
  | 'fetch-failed'
  | 'append-failed'
  | 'source-starved'
  | 'aborted'

const DEFAULT_STARTUP_BUFFER_SECONDS = 4
const DEFAULT_APPEND_AHEAD_SECONDS = 8
const DEFAULT_SEEK_BACK_BUFFER_SECONDS = 30

export class MseVideoSourceError extends Error {
  constructor(
    readonly code: MseVideoSourceErrorCode,
    message: string,
    options?: {cause?: unknown},
  ) {
    super(message)
    this.name = 'MseVideoSourceError'
    this.cause = options?.cause
  }
}

export function isMseVideoSourceAbortError(error: unknown): boolean {
  return (
    (error instanceof MseVideoSourceError && error.code === 'aborted') ||
    (error instanceof DOMException && error.name === 'AbortError')
  )
}

export function createMseVideoSourceDescriptor(input: {
  delivery: PreparedVideoDelivery
  mimeType: string
  mediaInfo?: FileMediaInfo | null
}): MseVideoSourceDescriptor | null {
  if (input.delivery.delivery !== 'mse') return null
  if (input.mediaInfo?.mseFragmented !== true) return null
  const fetchUrl = input.delivery.fetchUrl?.trim()
  const initSegment = input.delivery.initSegment
  const mediaSegments = input.delivery.mediaSegments ?? []
  if (!fetchUrl || !validByteRange(initSegment) || mediaSegments.length === 0) {
    return null
  }
  if (!mediaSegments.every(validSegmentRange)) {
    return null
  }

  return {
    fetchUrl,
    contentType: mseContentType(input.mimeType, input.mediaInfo),
    initSegment,
    mediaSegments,
    startupBufferSeconds: DEFAULT_STARTUP_BUFFER_SECONDS,
    appendAheadSeconds: DEFAULT_APPEND_AHEAD_SECONDS,
    seekBackBufferSeconds: DEFAULT_SEEK_BACK_BUFFER_SECONDS,
  }
}

export function isMseVideoSourceSelectable(input: {
  delivery: PreparedVideoDelivery
  mimeType: string
  mediaInfo?: FileMediaInfo | null
}): boolean {
  const descriptor = createMseVideoSourceDescriptor(input)
  return descriptor !== null && isMseContentTypeSupported(descriptor.contentType)
}

export function isMseContentTypeSupported(contentType: string): boolean {
  const mediaSource = getMediaSourceGlobal()
  return Boolean(
    mediaSource &&
      typeof mediaSource.isTypeSupported === 'function' &&
      mediaSource.isTypeSupported(contentType),
  )
}

export class MseVideoSourceController {
  readonly url: string

  private readonly mediaSource = new MediaSource()
  private readonly abortController = new AbortController()
  private sourceBuffer: SourceBuffer | null = null
  private released = false
  private operationQueue = Promise.resolve()
  private initAppended = false
  private latchedFailure: unknown = null
  private readonly appendedSegmentIndexes = new Set<number>()

  constructor(private readonly options: MseVideoSourceControllerOptions) {
    this.url = URL.createObjectURL(this.mediaSource)
    options.signal?.addEventListener('abort', this.handleExternalAbort, {once: true})
  }

  async start(): Promise<void> {
    await this.waitForSourceOpen()
    this.throwIfReleased()
    if (!isMseContentTypeSupported(this.options.contentType)) {
      throw new MseVideoSourceError(
        'unsupported-mime',
        'MSE content type is not supported by this runtime',
      )
    }
    const sourceBuffer = this.mediaSource.addSourceBuffer(this.options.contentType)
    this.sourceBuffer = sourceBuffer
    await this.enqueueOperation(async () => {
      await this.appendInitSegment(sourceBuffer)
      const appended = await this.appendSegmentsUntil(sourceBuffer, 0, this.options.startupBufferSeconds)
      if (appended === 0) {
        throw new MseVideoSourceError(
          'source-starved',
          'MSE startup segment metadata does not cover the startup buffer',
        )
      }
    })
  }

  async ensureBufferedForPlaybackPosition(currentTimeSeconds: number): Promise<void> {
    if (!Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) return
    await this.enqueueOperation(async () => {
      this.throwIfReleased()
      const sourceBuffer = this.requireSourceBuffer()
      await this.appendSegmentsUntil(
        sourceBuffer,
        currentTimeSeconds,
        currentTimeSeconds + this.options.appendAheadSeconds,
      )
      await this.evictBefore(sourceBuffer, currentTimeSeconds - this.options.seekBackBufferSeconds)
    })
  }

  release(): void {
    if (this.released) return
    this.released = true
    this.options.signal?.removeEventListener('abort', this.handleExternalAbort)
    this.abortController.abort()
    try {
      if (this.sourceBuffer && this.sourceBuffer.updating) {
        this.sourceBuffer.abort()
      }
    } catch {}
    URL.revokeObjectURL(this.url)
  }

  private async appendRange(
    sourceBuffer: SourceBuffer,
    range: {offset: number; length: number},
  ): Promise<void> {
    this.throwIfReleased()
    const bytes = await this.fetchRange(range)
    this.throwIfReleased()
    sourceBuffer.appendBuffer(bytes)
    await this.waitForUpdateEnd(sourceBuffer)
  }

  private async appendInitSegment(sourceBuffer: SourceBuffer): Promise<void> {
    if (this.initAppended) return
    await this.appendRange(sourceBuffer, this.options.initSegment)
    this.initAppended = true
  }

  /**
   * Appends every not-yet-appended media segment in the [fromSeconds, targetSeconds)
   * window, starting from the segment containing fromSeconds (never from index 0 on
   * seeks). fMP4 segments carry their own timestamps, so appending a later window
   * before an earlier one is safe. While segment N is appending, segment N+1's bytes
   * are prefetched (bounded to one segment ahead).
   */
  private async appendSegmentsUntil(
    sourceBuffer: SourceBuffer,
    fromSeconds: number,
    targetSeconds: number,
  ): Promise<number> {
    const segments = this.options.mediaSegments
    const pendingIndexes: number[] = []
    for (
      let index = this.segmentIndexForTime(Math.max(0, fromSeconds));
      index < segments.length;
      index += 1
    ) {
      const segment = segments[index]!
      if (segment.timestampUs / 1_000_000 >= targetSeconds) break
      if (this.appendedSegmentIndexes.has(index)) continue
      pendingIndexes.push(index)
    }

    let appended = 0
    let prefetchedBytes: Promise<ArrayBuffer> | null = null
    for (const [position, index] of pendingIndexes.entries()) {
      const bytes = await (prefetchedBytes ?? this.fetchRange(segments[index]!))
      this.throwIfReleased()
      const nextIndex = pendingIndexes[position + 1]
      prefetchedBytes = nextIndex === undefined ? null : this.prefetchRange(segments[nextIndex]!)
      sourceBuffer.appendBuffer(bytes)
      await this.waitForUpdateEnd(sourceBuffer)
      this.appendedSegmentIndexes.add(index)
      appended += 1
    }
    this.finalizeIfComplete(sourceBuffer)
    return appended
  }

  /** Index of the last segment whose timestamp is <= the given time (binary search). */
  private segmentIndexForTime(seconds: number): number {
    const segments = this.options.mediaSegments
    let low = 0
    let high = segments.length - 1
    let result = 0
    while (low <= high) {
      const mid = (low + high) >> 1
      if (segments[mid]!.timestampUs / 1_000_000 <= seconds) {
        result = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return result
  }

  private prefetchRange(range: {offset: number; length: number}): Promise<ArrayBuffer> {
    const bytes = this.fetchRange(range)
    // Keep a rejection of the prefetch from surfacing as unhandled when the
    // current append fails first; the rejection still propagates on await.
    bytes.catch(() => {})
    return bytes
  }

  /**
   * Once every media segment has been appended, pin the source duration to the
   * buffered end and signal end-of-stream so `ended` fires and the seek bar gets a
   * finite duration. Guarded so it only runs against an open, idle MediaSource.
   */
  private finalizeIfComplete(sourceBuffer: SourceBuffer): void {
    if (this.appendedSegmentIndexes.size < this.options.mediaSegments.length) return
    if (this.mediaSource.readyState !== 'open' || sourceBuffer.updating) return

    const lastSegment = this.options.mediaSegments[this.options.mediaSegments.length - 1]!
    let endSeconds = lastSegment.timestampUs / 1_000_000
    try {
      const buffered = sourceBuffer.buffered
      if (buffered.length > 0) {
        endSeconds = Math.max(endSeconds, buffered.end(buffered.length - 1))
      }
    } catch {}

    try {
      const duration = this.mediaSource.duration
      if (!Number.isFinite(duration) || duration < endSeconds) {
        this.mediaSource.duration = endSeconds
      }
      this.mediaSource.endOfStream()
    } catch {}
  }

  private async evictBefore(sourceBuffer: SourceBuffer, keepFromSeconds: number): Promise<void> {
    if (!Number.isFinite(keepFromSeconds) || keepFromSeconds <= 0) return
    const buffered = sourceBuffer.buffered
    for (let index = 0; index < buffered.length; index++) {
      const start = buffered.start(index)
      const end = buffered.end(index)
      const removeEnd = Math.min(end, keepFromSeconds)
      if (removeEnd <= start) continue
      this.throwIfReleased()
      sourceBuffer.remove(start, removeEnd)
      await this.waitForUpdateEnd(sourceBuffer)
    }
    this.pruneAppendedSegmentsBefore(keepFromSeconds)
  }

  /**
   * Reconciles the appended-segment bookkeeping with the eviction boundary so a
   * seek back into an evicted range re-fetches those segments instead of treating
   * them as already appended. A segment's end is the next segment's timestamp; the
   * final segment has no known end and is never pruned.
   */
  private pruneAppendedSegmentsBefore(keepFromSeconds: number): void {
    const segments = this.options.mediaSegments
    for (const index of [...this.appendedSegmentIndexes]) {
      const nextSegment = segments[index + 1]
      if (!nextSegment) continue
      if (nextSegment.timestampUs / 1_000_000 <= keepFromSeconds) {
        this.appendedSegmentIndexes.delete(index)
      }
    }
  }

  private async fetchRange(range: {offset: number; length: number}): Promise<ArrayBuffer> {
    const end = range.offset + range.length - 1
    let response: Response
    try {
      response = await fetch(this.options.fetchUrl, {
        headers: {
          Range: `bytes=${range.offset}-${end}`,
        },
        signal: this.abortController.signal,
      })
    } catch (cause) {
      const code = this.abortController.signal.aborted ? 'aborted' : 'fetch-failed'
      throw new MseVideoSourceError(code, 'MSE segment fetch failed', {cause})
    }
    if (response.status !== 206) {
      throw new MseVideoSourceError(
        'fetch-failed',
        `MSE segment fetch failed:${response.status}`,
      )
    }
    return await response.arrayBuffer()
  }

  private requireSourceBuffer(): SourceBuffer {
    if (!this.sourceBuffer) {
      throw new MseVideoSourceError('append-failed', 'MSE SourceBuffer is not ready')
    }
    return this.sourceBuffer
  }

  private async enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    // After a fatal (non-abort) failure the controller latches into a failed
    // state: queued and future operations reject with the original failure
    // instead of running against a broken SourceBuffer.
    const run = async (): Promise<T> => {
      if (this.latchedFailure !== null) {
        throw this.latchedFailure
      }
      try {
        return await operation()
      } catch (error) {
        if (!isMseVideoSourceAbortError(error)) {
          this.latchedFailure = error
        }
        throw error
      }
    }
    const next = this.operationQueue.then(run, run)
    this.operationQueue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  private async waitForSourceOpen(): Promise<void> {
    if (this.mediaSource.readyState === 'open') return
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.mediaSource.removeEventListener('sourceopen', handleOpen)
        this.abortController.signal.removeEventListener('abort', handleAbort)
      }
      const handleOpen = () => {
        cleanup()
        resolve()
      }
      const handleAbort = () => {
        cleanup()
        reject(new DOMException('Aborted', 'AbortError'))
      }
      this.mediaSource.addEventListener('sourceopen', handleOpen, {once: true})
      this.abortController.signal.addEventListener('abort', handleAbort, {once: true})
    })
  }

  private async waitForUpdateEnd(sourceBuffer: SourceBuffer): Promise<void> {
    if (!sourceBuffer.updating) return
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        sourceBuffer.removeEventListener('updateend', handleUpdateEnd)
        sourceBuffer.removeEventListener('error', handleError)
        this.abortController.signal.removeEventListener('abort', handleAbort)
      }
      const handleUpdateEnd = () => {
        cleanup()
        resolve()
      }
      const handleError = () => {
        cleanup()
        reject(new MseVideoSourceError('append-failed', 'MSE SourceBuffer operation failed'))
      }
      const handleAbort = () => {
        cleanup()
        reject(new MseVideoSourceError('aborted', 'MSE SourceBuffer operation aborted'))
      }
      sourceBuffer.addEventListener('updateend', handleUpdateEnd, {once: true})
      sourceBuffer.addEventListener('error', handleError, {once: true})
      this.abortController.signal.addEventListener('abort', handleAbort, {once: true})
    })
  }

  private throwIfReleased(): void {
    if (this.released || this.abortController.signal.aborted) {
      throw new MseVideoSourceError('aborted', 'MSE source was released')
    }
  }

  private readonly handleExternalAbort = () => {
    this.release()
  }
}

function mseContentType(mimeType: string, mediaInfo?: FileMediaInfo | null): string {
  const base = mediaInfo?.playbackMimeType?.trim() || mimeType.trim()
  const codecs = mediaInfo?.codecString?.trim()
  return codecs ? `${base}; codecs="${codecs}"` : base
}

function getMediaSourceGlobal(): MediaSourceGlobal | null {
  const candidate = (globalThis as {MediaSource?: MediaSourceGlobal}).MediaSource
  return typeof candidate === 'function' ? candidate : null
}

function validByteRange(value: unknown): value is {offset: number; length: number} {
  if (!value || typeof value !== 'object') return false
  const range = value as {offset?: unknown; length?: unknown}
  return (
    typeof range.offset === 'number' &&
    Number.isSafeInteger(range.offset) &&
    range.offset >= 0 &&
    typeof range.length === 'number' &&
    Number.isSafeInteger(range.length) &&
    range.length > 0
  )
}

function validSegmentRange(value: unknown): value is FileMediaSegmentRange {
  if (!validByteRange(value)) return false
  return (
    typeof (value as {timestampUs?: unknown}).timestampUs === 'number' &&
    Number.isSafeInteger((value as {timestampUs?: number}).timestampUs)
  )
}
