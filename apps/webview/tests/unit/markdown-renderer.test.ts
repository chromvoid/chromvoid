import {describe, expect, it} from 'vitest'

import {FileLoadError} from '../../src/features/file-manager/services/text-file-io'
import {getMarkdownErrorKey, MarkdownRenderError} from '../../src/features/file-manager/services/markdown-errors'
import {renderMarkdownSource} from '../../src/features/file-manager/services/markdown-renderer'

describe('markdown renderer', () => {
  it('renders Markdown to sanitized HTML', () => {
    const result = renderMarkdownSource('# Notes\n\nVisit https://example.com\n\n**bold**')

    expect(result.html).toContain('<h1')
    expect(result.html).toContain('id="notes"')
    expect(result.html).toContain('data-cv-heading-anchor="notes"')
    expect(result.html).toContain('data-source-line-start="0"')
    expect(result.html).toContain('data-source-line-end="1"')
    expect(result.html).toContain('>Notes</h1>')
    expect(result.html).toContain('<strong>bold</strong>')
    expect(result.html).toContain('<a href="https://example.com">')
    expect(result.fileLinks).toEqual([])
    expect(result.noteLinks).toEqual([])
  })

  it('renders wikilinks as sanitized note-link candidates', () => {
    const result = renderMarkdownSource('See [[Sibling#Intro|Sibling intro]]')

    expect(result.noteLinks).toEqual([
      expect.objectContaining({
        id: 'note-link-0',
        syntax: 'wikilink',
        targetPath: 'Sibling',
        anchor: 'Intro',
        label: 'Sibling intro',
      }),
    ])
    expect(result.html).toContain('class="cv-markdown-note-link"')
    expect(result.html).toContain('role="link"')
    expect(result.html).toContain('tabindex="0"')
    expect(result.html).toContain('data-cv-note-link-id="note-link-0"')
    expect(result.html).toContain('data-cv-note-link-state="pending"')
    expect(result.html).toContain('Sibling intro')
  })

  it('marks internal Markdown note links as app-owned candidates', () => {
    const result = renderMarkdownSource('[Sibling](./Sibling.md#Intro) [Web](https://example.com)')

    expect(result.noteLinks).toEqual([
      expect.objectContaining({
        id: 'note-link-0',
        syntax: 'markdown',
        targetPath: './Sibling.md',
        anchor: 'Intro',
        label: 'Sibling',
      }),
    ])
    expect(result.html).toContain('<a href="./Sibling.md#Intro"')
    expect(result.html).toContain('data-cv-note-link-id="note-link-0"')
    expect(result.html).not.toContain('data-cv-note-link-id="note-link-1"')
  })

  it('marks absolute catalog file links as app-owned candidates', () => {
    const result = renderMarkdownSource('[Guide](/Docs/Guide.pdf) [Note](./Note.md)')

    expect(result.fileLinks).toEqual([
      expect.objectContaining({
        id: 'file-link-0',
        targetPath: '/Docs/Guide.pdf',
        label: 'Guide',
      }),
    ])
    expect(result.noteLinks).toEqual([
      expect.objectContaining({
        id: 'note-link-0',
        targetPath: './Note.md',
      }),
    ])
    expect(result.html).toContain('data-cv-file-link-id="file-link-0"')
    expect(result.html).toContain('data-cv-file-link-state="pending"')
  })

  it('uses deterministic duplicate heading anchors', () => {
    const result = renderMarkdownSource('## Intro\n\n## Intro')

    expect(result.html).toContain('<h2 id="intro"')
    expect(result.html).toContain('<h2 id="intro-1"')
  })

  it('renders GitHub-flavored Markdown tables', () => {
    const result = renderMarkdownSource('| Metric | Budget |\n| --- | ---: |\n| Inline data | 11 |')

    expect(result.html).toContain('<table')
    expect(result.html).toContain('<th>Metric</th>')
    expect(result.html).toContain('<th data-align="right">Budget</th>')
    expect(result.html).toContain('<td data-align="right">11</td>')
  })

  it('preserves block source line data', () => {
    const result = renderMarkdownSource(
      'First paragraph\n\n- One\n- Two\n\n| Metric | Budget |\n| --- | ---: |\n| Labeled | 11 |',
    )

    expect(result.html).toContain('<p data-source-line-start="0" data-source-line-end="1">')
    expect(result.html).toContain('<ul data-source-line-start="2" data-source-line-end="5">')
    expect(result.html).toContain('<table data-source-line-start="5" data-source-line-end="8">')
    expect(result.html).toContain('data-align="right"')
  })

  it('renders Markdown task list items as inert checkbox controls', () => {
    const result = renderMarkdownSource('- [ ] Todo\n- [x] Done')

    expect(result.html).toContain('class="cv-markdown-task-checkbox"')
    expect(result.html).toContain('role="checkbox"')
    expect(result.html).toContain('aria-checked="false"')
    expect(result.html).toContain('aria-checked="true"')
    expect(result.html).toContain('data-cv-task-line="0"')
    expect(result.html).toContain('data-cv-task-line="1"')
    expect(result.html).not.toContain('<input')
    expect(result.html).not.toContain('[ ]')
    expect(result.html).not.toContain('[x]')
  })

  it('does not render raw HTML from the source', () => {
    const result = renderMarkdownSource('<script>alert(1)</script>\n<img src=x onerror=alert(1)>')

    expect(result.html).not.toContain('<script')
    expect(result.html).not.toContain('<img')
    expect(result.html).toContain('&lt;script&gt;')
    expect(result.html).toContain('&lt;img')
  })

  it('renders Markdown image syntax as inert catalog placeholders', () => {
    const result = renderMarkdownSource('![Screenshot](/attachments/image.png)')

    expect(result.imageRefs).toEqual([
      {
        key: 'image-0',
        rawRef: '/attachments/image.png',
        altText: 'Screenshot',
        kind: 'catalog-absolute',
      },
    ])
    expect(result.html).toContain('data-cv-image-key="image-0"')
    expect(result.html).toContain('data-cv-image-ref="/attachments/image.png"')
    expect(result.html).toContain('data-cv-image-kind="catalog-absolute"')
    expect(result.html).not.toContain('<img')
    expect(result.html).not.toContain('src=')
  })

  it.each([
    'javascript:alert(1)',
    'https://example.com/a.png',
    'data:image/png;base64,AAAA',
    'blob:https://example.com/id',
    'file:///tmp/a.png',
    '//example.com/a.png',
  ])('blocks loadable Markdown image refs for %s', (ref) => {
    const result = renderMarkdownSource(`![x](${ref})`)

    expect(result.html).not.toContain('<img')
    expect(result.html).not.toContain('src=')
    expect(result.imageRefs[0]?.kind).toBe('external-blocked')
  })

  it('marks relative or non-normalized image refs unsupported without producing src', () => {
    const result = renderMarkdownSource('![a](relative.png)\n![b](/a/../b.png)')

    expect(result.imageRefs.map((ref) => ref.kind)).toEqual(['unsupported', 'unsupported'])
    expect(result.html).not.toContain('<img')
    expect(result.html).not.toContain('src=')
  })

  it('strips unsafe link targets while preserving safe links', () => {
    const result = renderMarkdownSource(
      '[bad](javascript:alert(1)) [protocol](//example.com) [ok](https://example.com/docs)',
    )

    expect(result.noteLinks).toEqual([])
    expect(result.html).not.toContain('href="javascript:')
    expect(result.html).not.toContain('href="//example.com"')
    expect(result.html).toContain('href="https://example.com/docs"')
  })
})

describe('markdown errors', () => {
  it('maps text I/O errors to Markdown i18n keys', () => {
    expect(getMarkdownErrorKey(new FileLoadError('TEXT_STALE_SOURCE', 'stale'), 'markdown:error:load-failed')).toBe(
      'markdown:error:stale-source',
    )
    expect(
      getMarkdownErrorKey(new FileLoadError('TEXT_INVALID_UTF8', 'invalid'), 'markdown:error:load-failed'),
    ).toBe('markdown:error:text-invalid-encoding')
  })

  it('maps render errors and unknown errors', () => {
    expect(getMarkdownErrorKey(new MarkdownRenderError(), 'markdown:error:load-failed')).toBe(
      'markdown:error:render-failed',
    )
    expect(getMarkdownErrorKey(new Error('unknown'), 'markdown:error:save-failed')).toBe(
      'markdown:error:save-failed',
    )
  })
})
