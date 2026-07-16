import {describe, expect, it} from 'vitest'

import {
  createHeadingSlugger,
  createMarkdownLinkCandidate,
  createWikilinkCandidate,
  formatWikilinkInsertion,
  getSelectedMarkdownText,
  getWikilinkCompletionMatch,
  hasUnsupportedMarkdownLinkScheme,
  isMarkdownNoteHref,
  normalizeMarkdownAnchor,
} from '../../src/features/file-manager/services/markdown-note-links'

describe('markdown note-link helpers', () => {
  it('parses wikilinks with aliases and anchors', () => {
    expect(createWikilinkCandidate({id: 'link-1', rawTarget: 'Docs/Plan#Next|Roadmap'})).toMatchObject({
      id: 'link-1',
      syntax: 'wikilink',
      targetPath: 'Docs/Plan',
      anchor: 'Next',
      label: 'Roadmap',
    })
  })

  it('detects internal Markdown hrefs without accepting external schemes', () => {
    expect(isMarkdownNoteHref('./Sibling.md')).toBe(true)
    expect(isMarkdownNoteHref('../Folder/Sibling.markdown#Intro')).toBe(true)
    expect(isMarkdownNoteHref('#Intro')).toBe(true)
    expect(isMarkdownNoteHref('https://example.test/Sibling.md')).toBe(false)
    expect(isMarkdownNoteHref('javascript:alert(1)')).toBe(false)
    expect(hasUnsupportedMarkdownLinkScheme('//example.test/Sibling.md')).toBe(true)
  })

  it('creates Markdown link candidates only for internal note hrefs', () => {
    expect(
      createMarkdownLinkCandidate({
        id: 'link-1',
        rawTarget: './Sibling.md#Intro',
        label: 'Sibling intro',
      }),
    ).toMatchObject({
      id: 'link-1',
      syntax: 'markdown',
      targetPath: './Sibling.md',
      anchor: 'Intro',
      label: 'Sibling intro',
    })

    expect(
      createMarkdownLinkCandidate({
        id: 'external',
        rawTarget: 'https://example.test/Sibling.md',
        label: 'External',
      }),
    ).toBeNull()
  })

  it('normalizes deterministic heading anchors with duplicate suffixes', () => {
    const slug = createHeadingSlugger()

    expect(slug('Intro & Scope')).toBe('intro-scope')
    expect(slug('Intro Scope')).toBe('intro-scope-1')
    expect(normalizeMarkdownAnchor('#Intro Scope')).toBe('intro-scope')
  })

  it('detects wikilink completion ranges and formats selected aliases', () => {
    const source = 'Before [[Sib'

    expect(getWikilinkCompletionMatch(source, source.length)).toEqual({
      from: 7,
      to: source.length,
      query: 'Sib',
    })
    expect(getWikilinkCompletionMatch('Before [link](url)', 'Before [link](url)'.length)).toBeNull()
    expect(formatWikilinkInsertion('Folder/Sibling', 'selected text')).toBe(
      '[[Folder/Sibling|selected text]]',
    )
    expect(getSelectedMarkdownText('Alpha selected text omega', {selectionStart: 6, selectionEnd: 19})).toBe(
      'selected text',
    )
  })
})
