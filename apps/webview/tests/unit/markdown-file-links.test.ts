import {describe, expect, it} from 'vitest'

import type {CatalogFileLinkItem} from '../../src/core/catalog/local-catalog/types'
import {
  createMarkdownFileLinkCandidate,
  decodeMarkdownFileLinkTarget,
  encodeCatalogFileLinkTarget,
  formatMarkdownFileLinkCompletionTarget,
  formatMarkdownFileLinkInsertion,
  getAnyMarkdownFileLinkCompletionMatch,
  getMarkdownFileLinkCompletionMatch,
  getMarkdownFileLinkCompletionReplacementRange,
  getMarkdownFileLinkShortcutCompletionMatch,
  normalizeCatalogFileLinkTarget,
} from '../../src/features/file-manager/services/markdown-file-links'

const fileItem = (path: string, name = path.split('/').pop() ?? 'file.md'): CatalogFileLinkItem => ({
  node_id: 1,
  name,
  path,
  parent_path: '/Docs',
  size: 10,
  mime_type: 'text/markdown',
  source_revision: 1,
  created_at: 1,
  updated_at: 1,
})

describe('markdown file-link helpers', () => {
  it('detects Markdown link target completion ranges', () => {
    const source = 'Before [Guide](/Docs/Gui'

    expect(getMarkdownFileLinkCompletionMatch(source, source.length)).toEqual({
      labelFrom: 7,
      labelTo: 14,
      label: 'Guide',
      from: 15,
      to: source.length,
      query: '/Docs/Gui',
    })
    expect(getMarkdownFileLinkCompletionMatch('Before [Guide](/Docs/Guide.md)', 31)).toBeNull()
    expect(getMarkdownFileLinkCompletionMatch('Before ![Guide](/Docs/Gui', 25)).toBeNull()
    expect(getMarkdownFileLinkCompletionMatch('Before [[Guide', 14)).toBeNull()
  })

  it('detects wikilink-style file completion shortcuts', () => {
    const source = 'Before [[Gui'
    const shortcutFrom = 'Before '.length
    const queryFrom = shortcutFrom + '[['.length
    const shortcutWithClosing = 'Before [[Gui]] after'
    const match = getMarkdownFileLinkShortcutCompletionMatch(source, source.length)

    expect(match).toEqual({
      from: queryFrom,
      kind: 'wikilink-shortcut',
      label: '',
      labelFrom: shortcutFrom,
      labelTo: queryFrom,
      query: 'Gui',
      to: source.length,
    })
    expect(getAnyMarkdownFileLinkCompletionMatch(source, source.length)).toEqual(match)
    expect(getMarkdownFileLinkCompletionReplacementRange(shortcutWithClosing, match!)).toEqual({
      from: shortcutFrom,
      to: source.length + ']]'.length,
    })
  })

  it('normalizes absolute catalog targets without accepting relative or external links', () => {
    expect(decodeMarkdownFileLinkTarget('/Docs/My%20Guide.md')).toBe('/Docs/My Guide.md')
    expect(normalizeCatalogFileLinkTarget('/Docs/My%20Guide.md')).toBe('/Docs/My Guide.md')
    expect(normalizeCatalogFileLinkTarget('Docs/My Guide.md')).toBeNull()
    expect(normalizeCatalogFileLinkTarget('/')).toBeNull()
    expect(normalizeCatalogFileLinkTarget('/Docs/../Guide.md')).toBeNull()
    expect(normalizeCatalogFileLinkTarget('file:///Users/me/Guide.md')).toBeNull()
    expect(normalizeCatalogFileLinkTarget('https://example.test/Guide.md')).toBeNull()
  })

  it('creates rendered link candidates only for absolute catalog file targets', () => {
    expect(
      createMarkdownFileLinkCandidate({
        id: 'file-link-1',
        rawTarget: '/Docs/Guide.md',
        label: 'Guide',
      }),
    ).toMatchObject({
      id: 'file-link-1',
      targetPath: '/Docs/Guide.md',
      label: 'Guide',
    })

    expect(
      createMarkdownFileLinkCandidate({
        id: 'relative',
        rawTarget: './Guide.md',
        label: 'Guide',
      }),
    ).toBeNull()
  })

  it('formats insertions with encoded catalog targets and escaped labels', () => {
    const item = fileItem('/Docs/My Guide (draft)#1.md', 'My Guide [draft].md')

    expect(encodeCatalogFileLinkTarget(item.path)).toBe('/Docs/My%20Guide%20(draft)%231.md')
    expect(formatMarkdownFileLinkCompletionTarget(item)).toBe('/Docs/My%20Guide%20(draft)%231.md')
    expect(formatMarkdownFileLinkInsertion(item, 'Selected [text]')).toBe(
      '[Selected \\[text\\]](/Docs/My%20Guide%20(draft)%231.md)',
    )
  })
})
