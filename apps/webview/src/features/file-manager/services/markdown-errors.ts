import {FileLoadError} from './text-file-io'

export type MarkdownErrorKey =
  | 'markdown:error:load-failed'
  | 'markdown:error:render-failed'
  | 'markdown:error:save-failed'
  | 'markdown:error:format-failed'
  | 'markdown:error:text-too-large'
  | 'markdown:error:text-invalid-encoding'
  | 'markdown:error:source-mismatch'
  | 'markdown:error:stale-source'
  | 'markdown:error:read-only'
  | 'markdown:error:not-found'
  | 'markdown:error:not-file'
  | 'markdown:error:access-denied'
  | 'markdown:error:attachment-upload-failed'
  | 'markdown:error:attachment-folder-invalid'
  | 'markdown:error:attachment-not-image'

export class MarkdownRenderError extends Error {
  readonly key: MarkdownErrorKey = 'markdown:error:render-failed'

  constructor(message = 'Markdown render failed') {
    super(message)
  }
}

export function getMarkdownErrorKey(error: unknown, fallback: MarkdownErrorKey): MarkdownErrorKey {
  if (error instanceof MarkdownRenderError) {
    return error.key
  }

  if (error instanceof FileLoadError) {
    switch (error.code) {
      case 'TEXT_TOO_LARGE':
        return 'markdown:error:text-too-large'
      case 'TEXT_INVALID_UTF8':
        return 'markdown:error:text-invalid-encoding'
      case 'TEXT_SOURCE_MISMATCH':
        return 'markdown:error:source-mismatch'
      case 'TEXT_STALE_SOURCE':
        return 'markdown:error:stale-source'
      case 'TEXT_WRITE_UNAVAILABLE':
        return 'markdown:error:read-only'
      case 'TEXT_NOT_FOUND':
        return 'markdown:error:not-found'
      case 'TEXT_NOT_FILE':
        return 'markdown:error:not-file'
      case 'TEXT_ACCESS_DENIED':
        return 'markdown:error:access-denied'
      case 'TEXT_SAVE_FAILED':
        return 'markdown:error:save-failed'
      case 'TEXT_LOAD_FAILED':
        return 'markdown:error:load-failed'
      default:
        return fallback
    }
  }

  return fallback
}
