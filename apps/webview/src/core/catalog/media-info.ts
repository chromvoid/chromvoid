export type FileMediaKind = 'audio' | 'video'

export type FileMediaInfo = {
  kind: FileMediaKind
  audioTracks: number
  videoTracks: number
  playbackMimeType?: string
  codecString?: string
  mseFragmented?: boolean
  durationMs?: number
  bitrateBps?: number
  width?: number
  height?: number
  fps?: number
  moovAtStart?: boolean
  initSegment?: FileMediaByteRange
  mediaSegments?: FileMediaSegmentRange[]
}

export type FileMediaByteRange = {
  offset: number
  length: number
}

export type FileMediaSegmentRange = FileMediaByteRange & {
  timestampUs: number
}

export type CompactFileMediaInfo = {
  k?: unknown
  a?: unknown
  v?: unknown
  m?: unknown
  c?: unknown
  f?: unknown
  s?: unknown
}

function toMediaTrackCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }
  return Math.floor(value)
}

function toPositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }
  return Math.floor(value)
}

function toMediaByteRange(value: unknown): FileMediaByteRange | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const offset = toPositiveNumber(record['offset'] ?? record['o'])
  const length = toPositiveNumber(record['length'] ?? record['l'])
  return offset !== null && length !== null ? {offset, length} : null
}

function toMediaSegmentRange(value: unknown): FileMediaSegmentRange | null {
  const range = toMediaByteRange(value)
  if (!range || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const timestampUs = toPositiveNumber(record['timestampUs'] ?? record['timestamp_us'] ?? record['t'])
  return timestampUs !== null ? {...range, timestampUs} : null
}

function toMediaKind(value: unknown): FileMediaKind | null {
  if (value === 'audio' || value === 'video') {
    return value
  }
  return null
}

export function normalizeFileMediaInfo(value: unknown): FileMediaInfo | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const kind = toMediaKind(record['kind'] ?? record['k'])
  const audioTracks = toMediaTrackCount(record['audioTracks'] ?? record['audio_tracks'] ?? record['a'])
  const videoTracks = toMediaTrackCount(record['videoTracks'] ?? record['video_tracks'] ?? record['v'])
  if (!kind || audioTracks === null || videoTracks === null) {
    return null
  }

  const rawPlaybackMimeType = record['playbackMimeType'] ?? record['playback_mime_type'] ?? record['m']
  const playbackMimeType = typeof rawPlaybackMimeType === 'string' ? rawPlaybackMimeType.trim() : ''
  const rawCodecString = record['codecString'] ?? record['codec_string'] ?? record['c']
  const codecString = typeof rawCodecString === 'string' ? rawCodecString.trim() : ''
  const rawMseFragmented = record['mseFragmented'] ?? record['mse_fragmented'] ?? record['f']
  const mseFragmented = typeof rawMseFragmented === 'boolean' ? rawMseFragmented : null
  const rawStreamingMetadata =
    record['streamingMetadata'] ?? record['streaming_metadata'] ?? record['s'] ?? {}
  const streamingMetadata =
    rawStreamingMetadata && typeof rawStreamingMetadata === 'object'
      ? (rawStreamingMetadata as Record<string, unknown>)
      : {}
  const durationMs = toPositiveNumber(
    record['durationMs'] ?? record['duration_ms'] ?? streamingMetadata['durationMs'] ?? streamingMetadata['duration_ms'] ?? streamingMetadata['d'],
  )
  const bitrateBps = toPositiveNumber(
    record['bitrateBps'] ?? record['bitrate_bps'] ?? streamingMetadata['bitrateBps'] ?? streamingMetadata['bitrate_bps'] ?? streamingMetadata['b'],
  )
  const width = toPositiveNumber(record['width'] ?? streamingMetadata['width'] ?? streamingMetadata['w'])
  const height = toPositiveNumber(record['height'] ?? streamingMetadata['height'] ?? streamingMetadata['h'])
  const rawFpsMillis =
    record['fpsMillis'] ?? record['fps_millis'] ?? streamingMetadata['fpsMillis'] ?? streamingMetadata['fps_millis'] ?? streamingMetadata['p']
  const fpsMillis = toPositiveNumber(rawFpsMillis)
  const rawMoovAtStart =
    record['moovAtStart'] ?? record['moov_at_start'] ?? streamingMetadata['moovAtStart'] ?? streamingMetadata['moov_at_start'] ?? streamingMetadata['o']
  const moovAtStart = typeof rawMoovAtStart === 'boolean' ? rawMoovAtStart : null
  const initSegment = toMediaByteRange(
    record['initSegment'] ?? record['init_segment'] ?? streamingMetadata['initSegment'] ?? streamingMetadata['init_segment'] ?? streamingMetadata['i'],
  )
  const rawSegments =
    record['mediaSegments'] ?? record['media_segments'] ?? streamingMetadata['mediaSegments'] ?? streamingMetadata['media_segments'] ?? streamingMetadata['g']
  const mediaSegments = Array.isArray(rawSegments)
    ? rawSegments.map(toMediaSegmentRange).filter((segment): segment is FileMediaSegmentRange => segment !== null)
    : null

  return {
    kind,
    audioTracks,
    videoTracks,
    ...(playbackMimeType ? {playbackMimeType} : {}),
    ...(codecString ? {codecString} : {}),
    ...(mseFragmented !== null ? {mseFragmented} : {}),
    ...(durationMs !== null ? {durationMs} : {}),
    ...(bitrateBps !== null ? {bitrateBps} : {}),
    ...(width !== null ? {width} : {}),
    ...(height !== null ? {height} : {}),
    ...(fpsMillis !== null ? {fps: fpsMillis / 1000} : {}),
    ...(moovAtStart !== null ? {moovAtStart} : {}),
    ...(initSegment ? {initSegment} : {}),
    ...(mediaSegments && mediaSegments.length > 0 ? {mediaSegments} : {}),
  }
}

export function toCompactFileMediaInfo(value: FileMediaInfo): CompactFileMediaInfo {
  const streamingMetadata = {
    ...(typeof value.durationMs === 'number' ? {d: value.durationMs} : {}),
    ...(typeof value.bitrateBps === 'number' ? {b: value.bitrateBps} : {}),
    ...(typeof value.width === 'number' ? {w: value.width} : {}),
    ...(typeof value.height === 'number' ? {h: value.height} : {}),
    ...(typeof value.fps === 'number' ? {p: Math.round(value.fps * 1000)} : {}),
    ...(typeof value.moovAtStart === 'boolean' ? {o: value.moovAtStart} : {}),
    ...(value.initSegment ? {i: {o: value.initSegment.offset, l: value.initSegment.length}} : {}),
    ...(value.mediaSegments && value.mediaSegments.length > 0
      ? {
          g: value.mediaSegments.map((segment) => ({
            o: segment.offset,
            l: segment.length,
            t: segment.timestampUs,
          })),
        }
      : {}),
  }
  return {
    k: value.kind,
    a: value.audioTracks,
    v: value.videoTracks,
    ...(value.playbackMimeType ? {m: value.playbackMimeType} : {}),
    ...(value.codecString ? {c: value.codecString} : {}),
    ...(typeof value.mseFragmented === 'boolean' ? {f: value.mseFragmented} : {}),
    ...(Object.keys(streamingMetadata).length > 0 ? {s: streamingMetadata} : {}),
  }
}
