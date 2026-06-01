import {describe, expect, it} from 'vitest'

import {FileLoadError} from '../../src/features/file-manager/services/text-file-io'
import {getMarkdownErrorKey, MarkdownRenderError} from '../../src/features/file-manager/services/markdown-errors'
import {renderMarkdownSource} from '../../src/features/file-manager/services/markdown-renderer'

describe('markdown renderer', () => {
  it('renders Markdown to sanitized HTML', () => {
    const result = renderMarkdownSource('# Notes\n\nVisit https://example.com\n\n**bold**')

    expect(result.html).toContain('<h1')
    expect(result.html).toContain('data-source-line-start="0"')
    expect(result.html).toContain('data-source-line-end="1"')
    expect(result.html).toContain('>Notes</h1>')
    expect(result.html).toContain('<strong>bold</strong>')
    expect(result.html).toContain('<a href="https://example.com">')
  })

  it('renders GitHub-flavored Markdown tables', () => {
    const result = renderMarkdownSource('| Metric | Budget |\n| --- | ---: |\n| Inline styles | 11 |')

    expect(result.html).toContain('<table')
    expect(result.html).toContain('<th>Metric</th>')
    expect(result.html).toContain('<th data-align="right">Budget</th>')
    expect(result.html).toContain('<td data-align="right">11</td>')
    expect(result.html).not.toContain('style=')
  })

  it('preserves block source line data without allowing inline styles', () => {
    const result = renderMarkdownSource(
      'First paragraph\n\n- One\n- Two\n\n| Metric | Budget |\n| --- | ---: |\n| Styled | 11 |',
    )

    expect(result.html).toContain('<p data-source-line-start="0" data-source-line-end="1">')
    expect(result.html).toContain('<ul data-source-line-start="2" data-source-line-end="5">')
    expect(result.html).toContain('<table data-source-line-start="5" data-source-line-end="8">')
    expect(result.html).toContain('data-align="right"')
    expect(result.html).not.toContain('style=')
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
