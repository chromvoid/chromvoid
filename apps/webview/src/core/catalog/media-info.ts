export type FileMediaKind = 'audio' | 'video'

export type FileMediaInfo = {
  kind: FileMediaKind
  audioTracks: number
  videoTracks: number
  playbackMimeType?: string
}

export type CompactFileMediaInfo = {
  k?: unknown
  a?: unknown
  v?: unknown
  m?: unknown
}

function toMediaTrackCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }
  return Math.floor(value)
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

  return {
    kind,
    audioTracks,
    videoTracks,
    ...(playbackMimeType ? {playbackMimeType} : {}),
  }
}

export function toCompactFileMediaInfo(value: FileMediaInfo): CompactFileMediaInfo {
  return {
    k: value.kind,
    a: value.audioTracks,
    v: value.videoTracks,
    ...(value.playbackMimeType ? {m: value.playbackMimeType} : {}),
  }
}
