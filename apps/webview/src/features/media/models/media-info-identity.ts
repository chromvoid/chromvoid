import type {
  FileMediaByteRange,
  FileMediaInfo,
  FileMediaSegmentRange,
} from 'root/core/catalog/media-info'

/**
 * Structural equality for FileMediaInfo descriptors. Catalog refreshes rebuild
 * node objects, so identity comparison of mediaInfo would restart playback for
 * files whose content did not change; this compares every carried field
 * (including init/media segment layout) instead.
 */
export function areFileMediaInfosEquivalent(
  a: FileMediaInfo | null | undefined,
  b: FileMediaInfo | null | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.kind === b.kind &&
    a.audioTracks === b.audioTracks &&
    a.videoTracks === b.videoTracks &&
    a.playbackMimeType === b.playbackMimeType &&
    a.codecString === b.codecString &&
    a.mseFragmented === b.mseFragmented &&
    a.durationMs === b.durationMs &&
    a.bitrateBps === b.bitrateBps &&
    a.width === b.width &&
    a.height === b.height &&
    a.fps === b.fps &&
    a.moovAtStart === b.moovAtStart &&
    sameByteRange(a.initSegment, b.initSegment) &&
    sameSegmentList(a.mediaSegments, b.mediaSegments)
  )
}

function sameByteRange(
  a: FileMediaByteRange | undefined,
  b: FileMediaByteRange | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.offset === b.offset && a.length === b.length
}

function sameSegmentList(
  a: FileMediaSegmentRange[] | undefined,
  b: FileMediaSegmentRange[] | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index]!
    const right = b[index]!
    if (
      left.offset !== right.offset ||
      left.length !== right.length ||
      left.timestampUs !== right.timestampUs
    ) {
      return false
    }
  }
  return true
}
