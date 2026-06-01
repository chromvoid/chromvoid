export const DEFAULT_MARKDOWN_ATTACHMENT_FOLDER_PATH = '/attachments'

export type MarkdownAttachmentFolderPathErrorKey =
  | 'markdown:attachments:error:absolute-path'
  | 'markdown:attachments:error:non-root'
  | 'markdown:attachments:error:invalid-segment'

export type MarkdownAttachmentFolderPathResult =
  | {ok: true; path: string}
  | {ok: false; errorKey: MarkdownAttachmentFolderPathErrorKey}

export function normalizeMarkdownAttachmentFolderPath(
  value: string,
): MarkdownAttachmentFolderPathResult {
  const trimmed = value.trim()
  if (!trimmed.startsWith('/')) {
    return {ok: false, errorKey: 'markdown:attachments:error:absolute-path'}
  }

  const collapsed = trimmed.replace(/\/+/g, '/')
  const normalized = collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed
  if (normalized === '/') {
    return {ok: false, errorKey: 'markdown:attachments:error:non-root'}
  }

  const segments = normalized.slice(1).split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) {
    return {ok: false, errorKey: 'markdown:attachments:error:invalid-segment'}
  }

  return {ok: true, path: normalized}
}

export function getMarkdownAttachmentFolderPath(value: string | null | undefined): string {
  const normalized = normalizeMarkdownAttachmentFolderPath(
    value ?? DEFAULT_MARKDOWN_ATTACHMENT_FOLDER_PATH,
  )

  return normalized.ok ? normalized.path : DEFAULT_MARKDOWN_ATTACHMENT_FOLDER_PATH
}
