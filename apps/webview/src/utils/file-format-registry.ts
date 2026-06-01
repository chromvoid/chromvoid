import type {FileMediaInfo} from 'root/core/catalog/media-info'

export type FileFilterGroup = 'images' | 'documents' | 'videos' | 'audio' | 'archives' | 'code'

export type FilePreviewMode = 'audio' | 'text' | 'image' | 'fallback'
export type FileTypeLabelKey =
  | 'node:file'
  | 'node:dir'
  | 'file-type:image'
  | 'file-type:video'
  | 'file-type:audio'
  | 'file-type:text'
  | 'file-type:code'
  | 'file-type:document'
  | 'file-type:spreadsheet'
  | 'file-type:presentation'
  | 'file-type:archive'
export type FileOpenActionLabelKey = 'button:open' | 'button:preview' | 'button:play'

export type FileOpenBehavior =
  | {kind: 'folder'}
  | {kind: 'document'; mode: 'markdown'}
  | {kind: 'gallery'}
  | {kind: 'video'}
  | {kind: 'audio'}
  | {kind: 'preview'; mode: FilePreviewMode}

export type FileFormatDescriptor = {
  extension: string
  displayExtension: string
  mimeType: string
  fileTypeLabelKey: FileTypeLabelKey
  icon: string
  cssClass: string
  filterGroups: readonly FileFilterGroup[]
  openBehavior: FileOpenBehavior
}

export type FileFormatInput = {
  name: string
  mimeType?: string | null
  mediaInfo?: FileMediaInfo | null
  isDir?: boolean
}

const HEIF_IMAGE_EXTENSIONS = ['heic', 'heif'] as const
const GALLERY_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', ...HEIF_IMAGE_EXTENSIONS] as const
const IMAGE_PREVIEW_EXTENSIONS = ['tif', 'tiff'] as const
const PLAYABLE_VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov'] as const
const VIDEO_FALLBACK_EXTENSIONS = ['avi', 'mkv', 'wmv', 'flv'] as const
const PLAYABLE_AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'aac'] as const
const AUDIO_FALLBACK_EXTENSIONS = ['flac', 'wma'] as const
const AUDIO_EXTENSIONS = [...PLAYABLE_AUDIO_EXTENSIONS, ...AUDIO_FALLBACK_EXTENSIONS] as const
const MARKDOWN_EXTENSIONS = ['md', 'markdown'] as const
const TEXT_DOCUMENT_EXTENSIONS = ['txt', 'csv', 'log'] as const
const CODE_TEXT_EXTENSIONS = [
  'json',
  'xml',
  'html',
  'css',
  'js',
  'ts',
  'jsx',
  'tsx',
  'scss',
  'less',
  'py',
  'java',
  'cpp',
  'c',
  'h',
  'go',
  'rs',
  'php',
  'rb',
  'swift',
  'kt',
  'yaml',
  'yml',
  'toml',
  'ini',
  'sh',
  'bash',
] as const
const DOCUMENT_EXTENSIONS = ['pdf', 'doc', 'docx', 'rtf', 'odt'] as const
const SPREADSHEET_EXTENSIONS = ['xls', 'xlsx'] as const
const PRESENTATION_EXTENSIONS = ['ppt', 'pptx'] as const
const ARCHIVE_EXTENSIONS = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'dmg', 'iso'] as const

const FILTER_GROUP_EXTENSIONS: Record<FileFilterGroup, readonly string[]> = {
  images: [...GALLERY_IMAGE_EXTENSIONS, ...IMAGE_PREVIEW_EXTENSIONS],
  documents: [
    ...MARKDOWN_EXTENSIONS,
    ...TEXT_DOCUMENT_EXTENSIONS,
    ...DOCUMENT_EXTENSIONS,
    ...SPREADSHEET_EXTENSIONS,
    ...PRESENTATION_EXTENSIONS,
  ],
  videos: [...PLAYABLE_VIDEO_EXTENSIONS, ...VIDEO_FALLBACK_EXTENSIONS],
  audio: AUDIO_EXTENSIONS,
  archives: ARCHIVE_EXTENSIONS,
  code: CODE_TEXT_EXTENSIONS,
}

const galleryImageExtensions = new Set<string>(GALLERY_IMAGE_EXTENSIONS)
const heifImageExtensions = new Set<string>(HEIF_IMAGE_EXTENSIONS)
const imagePreviewExtensions = new Set<string>(IMAGE_PREVIEW_EXTENSIONS)
const playableVideoExtensions = new Set<string>(PLAYABLE_VIDEO_EXTENSIONS)
const videoFallbackExtensions = new Set<string>(VIDEO_FALLBACK_EXTENSIONS)
const playableAudioExtensions = new Set<string>(PLAYABLE_AUDIO_EXTENSIONS)
const audioExtensions = new Set<string>(AUDIO_EXTENSIONS)
const markdownExtensions = new Set<string>(MARKDOWN_EXTENSIONS)
const textDocumentExtensions = new Set<string>(TEXT_DOCUMENT_EXTENSIONS)
const codeTextExtensions = new Set<string>(CODE_TEXT_EXTENSIONS)
const documentExtensions = new Set<string>(DOCUMENT_EXTENSIONS)
const spreadsheetExtensions = new Set<string>(SPREADSHEET_EXTENSIONS)
const presentationExtensions = new Set<string>(PRESENTATION_EXTENSIONS)
const archiveExtensions = new Set<string>(ARCHIVE_EXTENSIONS)

const PLAYABLE_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
const PLAYABLE_AUDIO_MIME_TYPES = new Set(['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac'])
const ISO_BMFF_MEDIA_EXTENSIONS = new Set(['mp4', 'm4a', 'mov'])
const ISO_BMFF_MEDIA_MIME_TYPES = new Set(['video/mp4', 'audio/mp4', 'video/quicktime'])
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/ld+json',
  'application/xml',
  'application/x-yaml',
  'application/yaml',
  'application/toml',
  'application/x-sh',
  'application/javascript',
  'application/x-javascript',
  'text/csv',
])

const DEFAULT_DESCRIPTOR: Omit<FileFormatDescriptor, 'extension' | 'displayExtension' | 'mimeType'> = {
  fileTypeLabelKey: 'node:file',
  icon: 'file-earmark',
  cssClass: 'file-default',
  filterGroups: [],
  openBehavior: {kind: 'preview', mode: 'fallback'},
}

const FOLDER_DESCRIPTOR: FileFormatDescriptor = {
  extension: '',
  displayExtension: '',
  mimeType: 'inode/directory',
  fileTypeLabelKey: 'node:dir',
  icon: 'folder-fill',
  cssClass: 'folder',
  filterGroups: [],
  openBehavior: {kind: 'folder'},
}

const trimMimeType = (mimeType?: string | null): string => {
  if (!mimeType) return ''
  return mimeType.split(';', 1)[0]!.trim().toLowerCase()
}

export const getFileExtension = (name: string): string => {
  const lastDot = name.lastIndexOf('.')
  return lastDot > 0 ? name.slice(lastDot + 1).toLowerCase() : ''
}

export const getDisplayFileExtension = (name: string): string => {
  const ext = getFileExtension(name)
  return ext.toUpperCase()
}

export function getFilterExtensions(group: FileFilterGroup): readonly string[] {
  return FILTER_GROUP_EXTENSIONS[group]
}

export function isBrowserSafeImageFile(name: string, mimeType?: string | null): boolean {
  if (isHeifImageFile(name, mimeType)) return false
  const ext = getFileExtension(name)
  if (galleryImageExtensions.has(ext)) return true
  const normalizedMime = trimMimeType(mimeType)
  return normalizedMime !== '' && normalizedMime.startsWith('image/') && !isImagePreviewCandidate(name, mimeType)
}

export function isImagePreviewCandidate(name: string, mimeType?: string | null): boolean {
  const ext = getFileExtension(name)
  if (imagePreviewExtensions.has(ext)) return true
  const normalizedMime = trimMimeType(mimeType)
  return normalizedMime === 'image/heic' || normalizedMime === 'image/heif' || normalizedMime === 'image/tiff'
}

export function isHeifImageFile(name: string, mimeType?: string | null): boolean {
  const ext = getFileExtension(name)
  if (heifImageExtensions.has(ext)) return true
  const normalizedMime = trimMimeType(mimeType)
  return normalizedMime === 'image/heic' || normalizedMime === 'image/heif'
}

export function isImageFile(name: string, mimeType?: string | null): boolean {
  const ext = getFileExtension(name)
  if (galleryImageExtensions.has(ext) || imagePreviewExtensions.has(ext)) return true
  const normalizedMime = trimMimeType(mimeType)
  return normalizedMime.startsWith('image/')
}

export function isPlayableVideoFile(name: string, mimeType?: string | null): boolean {
  const ext = getFileExtension(name)
  if (playableVideoExtensions.has(ext)) return true
  if (videoFallbackExtensions.has(ext)) return false
  return PLAYABLE_VIDEO_MIME_TYPES.has(trimMimeType(mimeType))
}

export function isVideoFile(name: string, mimeType?: string | null): boolean {
  const ext = getFileExtension(name)
  if (playableVideoExtensions.has(ext) || videoFallbackExtensions.has(ext)) return true
  const normalizedMime = trimMimeType(mimeType)
  return normalizedMime.startsWith('video/')
}

export function isAudioFile(name: string, mimeType?: string | null): boolean {
  const ext = getFileExtension(name)
  if (audioExtensions.has(ext)) return true
  const normalizedMime = trimMimeType(mimeType)
  return normalizedMime.startsWith('audio/')
}

export function isPlayableAudioFile(name: string, mimeType?: string | null): boolean {
  const ext = getFileExtension(name)
  if (playableAudioExtensions.has(ext)) return true
  if (audioExtensions.has(ext)) return false
  return PLAYABLE_AUDIO_MIME_TYPES.has(trimMimeType(mimeType))
}

export function isIsoBmffMediaCandidate(name: string, mimeType?: string | null): boolean {
  const ext = getFileExtension(name)
  if (ISO_BMFF_MEDIA_EXTENSIONS.has(ext)) return true
  return ISO_BMFF_MEDIA_MIME_TYPES.has(trimMimeType(mimeType))
}

export function resolveMediaPlaybackKind(input: FileFormatInput): 'audio' | 'video' | null {
  if (input.mediaInfo?.kind === 'audio') return 'audio'
  if (input.mediaInfo?.kind === 'video') return 'video'
  if (isPlayableAudioFile(input.name, input.mimeType)) return 'audio'
  if (isPlayableVideoFile(input.name, input.mimeType)) return 'video'
  return null
}

export function isPlayableAudioMediaFile(input: FileFormatInput): boolean {
  return resolveMediaPlaybackKind(input) === 'audio'
}

export function isPlayableVideoMediaFile(input: FileFormatInput): boolean {
  return resolveMediaPlaybackKind(input) === 'video'
}

export function isMarkdownFile(name: string, mimeType?: string | null): boolean {
  const ext = getFileExtension(name)
  if (markdownExtensions.has(ext)) return true
  return trimMimeType(mimeType) === 'text/markdown'
}

export function isTextPreviewFile(name: string, mimeType?: string | null): boolean {
  if (isMarkdownFile(name, mimeType)) return false
  const ext = getFileExtension(name)
  if (textDocumentExtensions.has(ext) || codeTextExtensions.has(ext)) return true
  const normalizedMime = trimMimeType(mimeType)
  return (
    normalizedMime.startsWith('text/') ||
    TEXT_MIME_TYPES.has(normalizedMime) ||
    normalizedMime.endsWith('+json') ||
    normalizedMime.endsWith('+xml')
  )
}

function getMimeTypeFromExtension(ext: string): string {
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
    case 'avif':
      return 'image/avif'
    case 'heic':
      return 'image/heic'
    case 'heif':
      return 'image/heif'
    case 'tif':
    case 'tiff':
      return 'image/tiff'
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
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'flac':
      return 'audio/flac'
    case 'aac':
      return 'audio/aac'
    case 'ogg':
      return 'audio/ogg'
    case 'wma':
      return 'audio/x-ms-wma'
    case 'm4a':
      return 'audio/mp4'
    case 'txt':
    case 'log':
      return 'text/plain'
    case 'md':
    case 'markdown':
      return 'text/markdown'
    case 'csv':
      return 'text/csv'
    case 'json':
      return 'application/json'
    case 'xml':
      return 'application/xml'
    case 'yaml':
    case 'yml':
      return 'application/yaml'
    case 'toml':
      return 'application/toml'
    case 'html':
      return 'text/html'
    case 'css':
      return 'text/css'
    case 'js':
      return 'application/javascript'
    case 'ts':
    case 'tsx':
      return 'text/plain'
    case 'jsx':
      return 'text/jsx'
    case 'pdf':
      return 'application/pdf'
    default:
      return 'application/octet-stream'
  }
}

function resolveByExtension(ext: string): Omit<FileFormatDescriptor, 'extension' | 'displayExtension' | 'mimeType'> {
  if (galleryImageExtensions.has(ext)) {
    return {
      fileTypeLabelKey: 'file-type:image',
      icon: 'file-earmark-image',
      cssClass: 'file-image',
      filterGroups: ['images'],
      openBehavior: {kind: 'gallery'},
    }
  }

  if (imagePreviewExtensions.has(ext)) {
    return {
      fileTypeLabelKey: 'file-type:image',
      icon: 'file-earmark-image',
      cssClass: 'file-image',
      filterGroups: ['images'],
      openBehavior: {kind: 'preview', mode: 'image'},
    }
  }

  if (playableVideoExtensions.has(ext)) {
    return {
      fileTypeLabelKey: 'file-type:video',
      icon: 'file-earmark-play',
      cssClass: 'file-media',
      filterGroups: ['videos'],
      openBehavior: {kind: 'video'},
    }
  }

  if (videoFallbackExtensions.has(ext)) {
    return {
      fileTypeLabelKey: 'file-type:video',
      icon: 'file-earmark-play',
      cssClass: 'file-media',
      filterGroups: ['videos'],
      openBehavior: {kind: 'preview', mode: 'fallback'},
    }
  }

  if (audioExtensions.has(ext)) {
    return {
      fileTypeLabelKey: 'file-type:audio',
      icon: 'file-earmark-music',
      cssClass: 'file-media',
      filterGroups: ['audio'],
      openBehavior: playableAudioExtensions.has(ext) ? {kind: 'audio'} : {kind: 'preview', mode: 'fallback'},
    }
  }

  if (markdownExtensions.has(ext)) {
    return {
      fileTypeLabelKey: 'file-type:text',
      icon: 'file-earmark-text',
      cssClass: 'file-document',
      filterGroups: ['documents'],
      openBehavior: {kind: 'document', mode: 'markdown'},
    }
  }

  if (textDocumentExtensions.has(ext)) {
    return {
      fileTypeLabelKey: 'file-type:text',
      icon: 'file-earmark-text',
      cssClass: 'file-document',
      filterGroups: ['documents'],
      openBehavior: {kind: 'preview', mode: 'text'},
    }
  }

  if (codeTextExtensions.has(ext)) {
    return {
      fileTypeLabelKey: 'file-type:code',
      icon: 'file-earmark-code',
      cssClass: 'file-code',
      filterGroups: ['code'],
      openBehavior: {kind: 'preview', mode: 'text'},
    }
  }

  if (documentExtensions.has(ext)) {
    return {
      fileTypeLabelKey: 'file-type:document',
      icon: ext === 'pdf' ? 'file-earmark-pdf' : 'file-earmark-word',
      cssClass: 'file-document',
      filterGroups: ['documents'],
      openBehavior: {kind: 'preview', mode: 'fallback'},
    }
  }

  if (spreadsheetExtensions.has(ext)) {
    return {
      fileTypeLabelKey: 'file-type:spreadsheet',
      icon: 'file-earmark-excel',
      cssClass: 'file-document',
      filterGroups: ['documents'],
      openBehavior: {kind: 'preview', mode: 'fallback'},
    }
  }

  if (presentationExtensions.has(ext)) {
    return {
      fileTypeLabelKey: 'file-type:presentation',
      icon: 'file-earmark-ppt',
      cssClass: 'file-document',
      filterGroups: ['documents'],
      openBehavior: {kind: 'preview', mode: 'fallback'},
    }
  }

  if (archiveExtensions.has(ext)) {
    return {
      fileTypeLabelKey: 'file-type:archive',
      icon: 'file-earmark-zip',
      cssClass: 'file-archive',
      filterGroups: ['archives'],
      openBehavior: {kind: 'preview', mode: 'fallback'},
    }
  }

  return DEFAULT_DESCRIPTOR
}

function resolveByMediaInfo(
  mediaInfo: FileMediaInfo | null | undefined,
): Omit<FileFormatDescriptor, 'extension' | 'displayExtension' | 'mimeType'> | null {
  if (mediaInfo?.kind === 'audio') {
    return {
      fileTypeLabelKey: 'file-type:audio',
      icon: 'file-earmark-music',
      cssClass: 'file-media',
      filterGroups: ['audio'],
      openBehavior: {kind: 'audio'},
    }
  }

  if (mediaInfo?.kind === 'video') {
    return {
      fileTypeLabelKey: 'file-type:video',
      icon: 'file-earmark-play',
      cssClass: 'file-media',
      filterGroups: ['videos'],
      openBehavior: {kind: 'video'},
    }
  }

  return null
}

function resolveByMimeType(mimeType: string): Omit<FileFormatDescriptor, 'extension' | 'displayExtension' | 'mimeType'> {
  if (mimeType === 'text/markdown') {
    return {
      fileTypeLabelKey: 'file-type:text',
      icon: 'file-earmark-text',
      cssClass: 'file-document',
      filterGroups: ['documents'],
      openBehavior: {kind: 'document', mode: 'markdown'},
    }
  }

  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    return {
      fileTypeLabelKey: 'file-type:image',
      icon: 'file-earmark-image',
      cssClass: 'file-image',
      filterGroups: ['images'],
      openBehavior: {kind: 'gallery'},
    }
  }

  if (mimeType.startsWith('image/')) {
    return {
      fileTypeLabelKey: 'file-type:image',
      icon: 'file-earmark-image',
      cssClass: 'file-image',
      filterGroups: ['images'],
      openBehavior: {kind: 'preview', mode: 'image'},
    }
  }

  if (PLAYABLE_VIDEO_MIME_TYPES.has(mimeType)) {
    return {
      fileTypeLabelKey: 'file-type:video',
      icon: 'file-earmark-play',
      cssClass: 'file-media',
      filterGroups: ['videos'],
      openBehavior: {kind: 'video'},
    }
  }

  if (mimeType.startsWith('video/')) {
    return {
      fileTypeLabelKey: 'file-type:video',
      icon: 'file-earmark-play',
      cssClass: 'file-media',
      filterGroups: ['videos'],
      openBehavior: {kind: 'preview', mode: 'fallback'},
    }
  }

  if (PLAYABLE_AUDIO_MIME_TYPES.has(mimeType)) {
    return {
      fileTypeLabelKey: 'file-type:audio',
      icon: 'file-earmark-music',
      cssClass: 'file-media',
      filterGroups: ['audio'],
      openBehavior: {kind: 'audio'},
    }
  }

  if (mimeType.startsWith('audio/')) {
    return {
      fileTypeLabelKey: 'file-type:audio',
      icon: 'file-earmark-music',
      cssClass: 'file-media',
      filterGroups: ['audio'],
      openBehavior: {kind: 'preview', mode: 'fallback'},
    }
  }

  if (
    mimeType.startsWith('text/') ||
    TEXT_MIME_TYPES.has(mimeType) ||
    mimeType.endsWith('+json') ||
    mimeType.endsWith('+xml')
  ) {
    return {
      fileTypeLabelKey: 'file-type:text',
      icon: 'file-earmark-text',
      cssClass: 'file-document',
      filterGroups: ['documents'],
      openBehavior: {kind: 'preview', mode: 'text'},
    }
  }

  if (mimeType === 'application/pdf') {
    return {
      fileTypeLabelKey: 'file-type:document',
      icon: 'file-earmark-pdf',
      cssClass: 'file-document',
      filterGroups: ['documents'],
      openBehavior: {kind: 'preview', mode: 'fallback'},
    }
  }

  return DEFAULT_DESCRIPTOR
}

export function resolveFileFormat(input: FileFormatInput): FileFormatDescriptor {
  if (input.isDir) {
    return FOLDER_DESCRIPTOR
  }

  const extension = getFileExtension(input.name)
  const normalizedMime = trimMimeType(input.mimeType)
  const mediaInfoDescriptor = resolveByMediaInfo(input.mediaInfo)
  const descriptor =
    mediaInfoDescriptor ??
    (isMarkdownFile(input.name, normalizedMime)
      ? resolveByMimeType('text/markdown')
      : extension !== ''
      ? resolveByExtension(extension)
      : normalizedMime !== ''
        ? resolveByMimeType(normalizedMime)
        : DEFAULT_DESCRIPTOR)

  const byMimeType =
    descriptor === DEFAULT_DESCRIPTOR && normalizedMime !== '' ? resolveByMimeType(normalizedMime) : descriptor
  const playbackMime = input.mediaInfo?.playbackMimeType?.trim()

  return {
    extension,
    displayExtension: extension.toUpperCase(),
    mimeType: playbackMime || normalizedMime || getMimeTypeFromExtension(extension),
    ...byMimeType,
  }
}

export function getOpenActionPresentation(
  format: FileFormatDescriptor,
): {icon: string; labelKey: FileOpenActionLabelKey} {
  if (format.openBehavior.kind === 'folder') {
    return {icon: 'folder-open', labelKey: 'button:open'}
  }

  if (format.openBehavior.kind === 'gallery') {
    return {icon: 'eye', labelKey: 'button:preview'}
  }

  if (format.openBehavior.kind === 'document') {
    return {icon: 'eye', labelKey: 'button:preview'}
  }

  if (format.openBehavior.kind === 'video' || format.openBehavior.kind === 'audio') {
    return {icon: 'play-circle', labelKey: 'button:play'}
  }

  switch (format.openBehavior.mode) {
    case 'audio':
      return {icon: 'play-circle', labelKey: 'button:play'}
    case 'text':
    case 'image':
      return {icon: 'eye', labelKey: 'button:preview'}
    default:
      return {icon: 'box-arrow-up-right', labelKey: 'button:open'}
  }
}
