import {atom} from '@reatom/core'
import type {FileMediaInfo} from 'root/core/catalog/media-info'

export type RuntimeMediaProbeValue = 'unknown' | 'supported' | 'unsupported'

export type RuntimeMediaProbeState = {
  loopbackHttp: RuntimeMediaProbeValue
  connectSrc: RuntimeMediaProbeValue
  desktopNativeVideo: RuntimeMediaProbeValue
  mobileNativeVideo: RuntimeMediaProbeValue
  mseController: RuntimeMediaProbeValue
  videoDecode: RuntimeMediaProbeValue
}

export type VideoDecodeProbeInput = {
  mimeType: string
  mediaInfo?: FileMediaInfo | null
  signal?: AbortSignal
}

export type VideoDecodeProbeResult = {
  supported: boolean
  reason?: 'unsupported-codec' | 'unsupported-container'
}

const DEFAULT_MEDIA_PROBES: RuntimeMediaProbeState = {
  loopbackHttp: 'unknown',
  connectSrc: 'unknown',
  desktopNativeVideo: 'unknown',
  mobileNativeVideo: 'unknown',
  mseController: 'unknown',
  videoDecode: 'unknown',
}

let currentMediaProbes: RuntimeMediaProbeState = {...DEFAULT_MEDIA_PROBES}
const videoDecodeProbeCache = new Map<string, VideoDecodeProbeResult>()

export const runtimeMediaProbeStateAtom = atom<RuntimeMediaProbeState>(
  currentMediaProbes,
  'runtime.mediaProbeState',
)

export function getRuntimeMediaProbeState(): RuntimeMediaProbeState {
  return currentMediaProbes
}

export function setRuntimeMediaProbeState(
  next: Partial<RuntimeMediaProbeState> | null | undefined,
): RuntimeMediaProbeState {
  currentMediaProbes = {
    ...currentMediaProbes,
    ...(next ?? {}),
  }
  runtimeMediaProbeStateAtom.set(currentMediaProbes)
  return currentMediaProbes
}

export function resetRuntimeMediaProbeState(): void {
  currentMediaProbes = {...DEFAULT_MEDIA_PROBES}
  videoDecodeProbeCache.clear()
  runtimeMediaProbeStateAtom.set(currentMediaProbes)
}

export function mediaProbeAllows(value: RuntimeMediaProbeValue): boolean {
  return value !== 'unsupported'
}

export function loopbackHttpProbeAllows(state = currentMediaProbes): boolean {
  return mediaProbeAllows(state.loopbackHttp) && mediaProbeAllows(state.connectSrc)
}

export function mseControllerProbeAllows(state = currentMediaProbes): boolean {
  return mediaProbeAllows(state.mseController)
}

export function desktopNativeVideoProbeAllows(state = currentMediaProbes): boolean {
  return mediaProbeAllows(state.desktopNativeVideo)
}

export function mobileNativeVideoProbeAllows(state = currentMediaProbes): boolean {
  return mediaProbeAllows(state.mobileNativeVideo)
}

/**
 * Returns the decode-support verdict when it is synchronously decidable
 * (forced probe state, non-video content type, missing MediaCapabilities API,
 * or a cached result for the same content type / codec / stream shape).
 * Returns null when only the async `decodingInfo` probe can decide.
 */
export function peekVideoDecodeSupport({
  mimeType,
  mediaInfo,
}: Omit<VideoDecodeProbeInput, 'signal'>): VideoDecodeProbeResult | null {
  const forcedProbe = currentMediaProbes.videoDecode
  if (forcedProbe === 'unsupported') {
    return {supported: false, reason: 'unsupported-codec'}
  }
  if (forcedProbe === 'supported') {
    return {supported: true}
  }

  const contentType = videoContentType(mimeType, mediaInfo)
  if (!contentType.startsWith('video/')) {
    return {supported: false, reason: 'unsupported-container'}
  }

  const cached = videoDecodeProbeCache.get(videoDecodeProbeCacheKey(contentType, mediaInfo))
  if (cached) {
    return cached
  }

  const mediaCapabilities = globalThis.navigator?.mediaCapabilities
  if (typeof mediaCapabilities?.decodingInfo !== 'function') {
    return {supported: true}
  }

  return null
}

export async function probeVideoDecodeSupport({
  mimeType,
  mediaInfo,
  signal,
}: VideoDecodeProbeInput): Promise<VideoDecodeProbeResult> {
  throwIfAborted(signal)

  const immediate = peekVideoDecodeSupport({mimeType, mediaInfo})
  if (immediate) {
    return immediate
  }

  const contentType = videoContentType(mimeType, mediaInfo)
  const mediaCapabilities = globalThis.navigator?.mediaCapabilities
  if (typeof mediaCapabilities?.decodingInfo !== 'function') {
    return {supported: true}
  }

  try {
    const result = await mediaCapabilities.decodingInfo({
      type: 'file',
      video: {
        contentType,
        width: mediaInfo?.width ?? 1920,
        height: mediaInfo?.height ?? 1080,
        bitrate: mediaInfo?.bitrateBps ?? 2_500_000,
        framerate: mediaInfo?.fps ?? 30,
      },
    })
    throwIfAborted(signal)
    const probeResult: VideoDecodeProbeResult = result.supported
      ? {supported: true}
      : {supported: false, reason: 'unsupported-codec'}
    videoDecodeProbeCache.set(videoDecodeProbeCacheKey(contentType, mediaInfo), probeResult)
    return probeResult
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    return {supported: true}
  }
}

function videoDecodeProbeCacheKey(
  contentType: string,
  mediaInfo?: FileMediaInfo | null,
): string {
  return [
    contentType,
    mediaInfo?.width ?? 1920,
    mediaInfo?.height ?? 1080,
    mediaInfo?.bitrateBps ?? 2_500_000,
    mediaInfo?.fps ?? 30,
  ].join('|')
}

function videoContentType(mimeType: string, mediaInfo?: FileMediaInfo | null): string {
  const trimmedMimeType = mediaInfo?.playbackMimeType?.trim() || mimeType.trim()
  const codecString = mediaInfo?.codecString?.trim()
  if (!codecString) {
    return trimmedMimeType
  }
  return `${trimmedMimeType}; codecs="${codecString}"`
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === 'AbortError'
}
