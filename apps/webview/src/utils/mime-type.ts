/**
 * Get MIME type from file extension
 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()

  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'bmp':
      return 'image/bmp'
    case 'ico':
      return 'image/x-icon'
    case 'mp4':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    case 'mov':
      return 'video/quicktime'
    case 'avi':
      return 'video/x-msvideo'
    case 'mkv':
      return 'video/x-matroska'
    case 'wmv':
      return 'video/x-ms-wmv'
    case 'flv':
      return 'video/x-flv'
    default:
      return 'application/octet-stream'
  }
}

/**
 * Check if file is an image based on extension
 */
export function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']
  return imageExtensions.includes(ext || '')
}

/**
 * Check if file is a video based on extension
 */
export function isVideoFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  const videoExtensions = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'webm', 'flv']
  return videoExtensions.includes(ext || '')
}

/**
 * Check if video file can be played in HTML5 <video> element.
 * mp4, webm are universally supported; mov works in WKWebView/Safari and usually in Chromium with H.264.
 */
export function isPlayableVideoFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  const playableExtensions = ['mp4', 'webm', 'mov']
  return playableExtensions.includes(ext || '')
}
