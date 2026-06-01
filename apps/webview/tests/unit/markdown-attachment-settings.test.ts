import {describe, expect, it} from 'vitest'

import {
  DEFAULT_MARKDOWN_ATTACHMENT_FOLDER_PATH,
  getMarkdownAttachmentFolderPath,
  normalizeMarkdownAttachmentFolderPath,
} from '../../src/features/file-manager/services/markdown-attachment-settings'

describe('Markdown attachment settings', () => {
  it('normalizes absolute catalog folder paths', () => {
    expect(normalizeMarkdownAttachmentFolderPath(' /notes//assets/ ')).toEqual({
      ok: true,
      path: '/notes/assets',
    })
  })

  it.each(['attachments', '/', '/notes/../assets', '/notes/./assets'])(
    'rejects invalid folder path %s',
    (path) => {
      expect(normalizeMarkdownAttachmentFolderPath(path).ok).toBe(false)
    },
  )

  it('falls back to the default folder for missing or invalid saved values', () => {
    expect(getMarkdownAttachmentFolderPath(undefined)).toBe(DEFAULT_MARKDOWN_ATTACHMENT_FOLDER_PATH)
    expect(getMarkdownAttachmentFolderPath('relative')).toBe(DEFAULT_MARKDOWN_ATTACHMENT_FOLDER_PATH)
  })
})
