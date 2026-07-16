import DOMPurify from 'dompurify'
import type {Config} from 'dompurify'
import MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'
import type Token from 'markdown-it/lib/token.mjs'

import {MarkdownRenderError} from './markdown-errors'
import {createMarkdownFileLinkCandidate, type MarkdownFileLinkCandidate} from './markdown-file-links'
import {
  createHeadingSlugger,
  createMarkdownLinkCandidate,
  createWikilinkCandidate,
  type MarkdownNoteLinkCandidate,
} from './markdown-note-links'
import {findMarkdownTaskMarkerInInlineContent} from './markdown-task-lists'

export type MarkdownRenderResult = {
  html: string
  imageRefs: MarkdownImageRef[]
  fileLinks: MarkdownFileLinkCandidate[]
  noteLinks: MarkdownNoteLinkCandidate[]
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
})

markdown.validateLink = () => true

const TABLE_CELL_OPEN_RULES = ['th_open', 'td_open'] as const
type TableAlignment = 'left' | 'center' | 'right'
export type MarkdownImageRefKind = 'catalog-absolute' | 'external-blocked' | 'unsupported'

export type MarkdownImageRef = {
  key: string
  rawRef: string
  altText: string
  kind: MarkdownImageRefKind
}

type MarkdownRenderEnv = {
  imageRefs: MarkdownImageRef[]
  fileLinks: MarkdownFileLinkCandidate[]
  noteLinks: MarkdownNoteLinkCandidate[]
  headingSlug: (value: string) => string
}

const SANITIZE_CONFIG: Config = {
  USE_PROFILES: {html: true},
  ADD_ATTR: [
    'aria-label',
    'aria-checked',
    'data-align',
    'data-cv-image-key',
    'data-cv-image-kind',
    'data-cv-image-ref',
    'data-cv-file-link-id',
    'data-cv-file-link-state',
    'data-cv-heading-anchor',
    'data-cv-note-link-id',
    'data-cv-note-link-state',
    'data-cv-note-link-syntax',
    'data-cv-task-checked',
    'data-cv-task-line',
    'data-source-line-end',
    'data-source-line-start',
    'role',
    'tabindex',
  ],
  FORBID_TAGS: [
    'button',
    'embed',
    'form',
    'iframe',
    'input',
    'object',
    'script',
    'select',
    'style',
    'textarea',
  ],
  FORBID_ATTR: ['style'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|\/(?!\/)|#|[^a-z/]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
}

function isNormalizedAbsoluteCatalogPath(ref: string): boolean {
  if (!ref.startsWith('/') || ref.startsWith('//') || ref === '/') {
    return false
  }

  const segments = ref.slice(1).split('/')
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

function classifyImageRef(rawRef: string): MarkdownImageRefKind {
  if (!rawRef) {
    return 'unsupported'
  }

  if (rawRef.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(rawRef)) {
    return 'external-blocked'
  }

  return isNormalizedAbsoluteCatalogPath(rawRef) ? 'catalog-absolute' : 'unsupported'
}

function escapeAttribute(value: string): string {
  return markdown.utils.escapeHtml(value)
}

function renderNoteLinkCandidate(candidate: MarkdownNoteLinkCandidate): string {
  return [
    '<span',
    ' class="cv-markdown-note-link"',
    ' role="link"',
    ' tabindex="0"',
    ' data-cv-note-link-state="pending"',
    ` data-cv-note-link-id="${escapeAttribute(candidate.id)}"`,
    ` data-cv-note-link-syntax="${escapeAttribute(candidate.syntax)}"`,
    ` aria-label="${escapeAttribute(candidate.label)}"`,
    '>',
    markdown.utils.escapeHtml(candidate.label),
    '</span>',
  ].join('')
}

function renderImagePlaceholder(
  key: string,
  rawRef: string,
  altText: string,
  kind: MarkdownImageRefKind,
): string {
  const label = altText || rawRef
  const className = `cv-markdown-image cv-markdown-image--${kind}`

  return [
    '<span',
    ` class="${className}"`,
    ' role="img"',
    ` aria-label="${escapeAttribute(label)}"`,
    ` data-cv-image-key="${escapeAttribute(key)}"`,
    ` data-cv-image-ref="${escapeAttribute(rawRef)}"`,
    ` data-cv-image-kind="${kind}"`,
    '>',
    markdown.utils.escapeHtml(label),
    '</span>',
  ].join('')
}

function renderTaskCheckbox(line: number, checked: boolean): string {
  const label = checked ? 'Completed task' : 'Incomplete task'
  return [
    '<span',
    ' class="cv-markdown-task-checkbox"',
    ' role="checkbox"',
    ' tabindex="0"',
    ` aria-checked="${checked ? 'true' : 'false'}"`,
    ` aria-label="${label}"`,
    ` data-cv-task-line="${line}"`,
    ` data-cv-task-checked="${checked ? 'true' : 'false'}"`,
    '></span>',
  ].join('')
}

function annotateSourceLines(state: StateCore): void {
  for (const token of state.tokens) {
    if (token.nesting !== 1 || !token.block || !token.map) {
      continue
    }

    token.attrSet('data-source-line-start', String(token.map[0]))
    token.attrSet('data-source-line-end', String(token.map[1]))
  }
}

markdown.core.ruler.push('source_lines', annotateSourceLines)

function renderHeadingAnchors(state: StateCore): void {
  const renderEnv = state.env as MarkdownRenderEnv
  for (let index = 0; index < state.tokens.length; index += 1) {
    const token = state.tokens[index]
    if (!token || token.type !== 'heading_open') {
      continue
    }

    const inline = state.tokens[index + 1]
    if (!inline || inline.type !== 'inline') {
      continue
    }

    const slug = renderEnv.headingSlug(inline.content)
    token.attrSet('id', slug)
    token.attrSet('data-cv-heading-anchor', slug)
  }
}

markdown.core.ruler.after('inline', 'heading_anchors', renderHeadingAnchors)

function renderTaskListMarkers(state: StateCore): void {
  for (const token of state.tokens) {
    if (token.type !== 'inline' || !token.children || !token.map) {
      continue
    }

    const marker = findMarkdownTaskMarkerInInlineContent(token.content, token.map[0])
    const firstChild = token.children[0]
    if (!marker || !firstChild || firstChild.type !== 'text') {
      continue
    }

    token.content = token.content.slice(marker.markerEnd)
    firstChild.content = firstChild.content.slice(marker.markerEnd)

    const checkbox = new state.Token('html_inline', '', 0)
    checkbox.content = renderTaskCheckbox(marker.line, marker.checked)
    token.children.unshift(checkbox)
  }
}

markdown.core.ruler.after('inline', 'task_list_markers', renderTaskListMarkers)

function wikilinkRule(state: StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== '[' || state.src[state.pos + 1] !== '[') {
    return false
  }

  const end = state.src.indexOf(']]', state.pos + 2)
  if (end < 0) {
    return false
  }

  const rawTarget = state.src.slice(state.pos + 2, end)
  const renderEnv = state.env as MarkdownRenderEnv
  const candidate = createWikilinkCandidate({
    id: `note-link-${renderEnv.noteLinks.length}`,
    rawTarget,
    sourceStart: state.pos,
    sourceEnd: end + 2,
  })
  if (!candidate) {
    return false
  }

  if (!silent) {
    renderEnv.noteLinks.push(candidate)
    const token = state.push('html_inline', '', 0)
    token.content = renderNoteLinkCandidate(candidate)
  }

  state.pos = end + 2
  return true
}

markdown.inline.ruler.before('link', 'wikilink', wikilinkRule)

function normalizeTableAlignment(style: string | null): TableAlignment | null {
  const match = /^text-align:\s*(left|center|right)\s*;?$/i.exec(style ?? '')
  const alignment = match?.[1]?.toLowerCase()

  if (alignment === 'left' || alignment === 'center' || alignment === 'right') {
    return alignment
  }

  return null
}

for (const ruleName of TABLE_CELL_OPEN_RULES) {
  markdown.renderer.rules[ruleName] = (tokens, index, options, _env, self) => {
    const token = tokens[index]
    if (!token) {
      return ''
    }

    const styleIndex = token.attrIndex('style')
    const attrs = token.attrs

    if (styleIndex >= 0 && attrs) {
      const alignment = normalizeTableAlignment(attrs[styleIndex]?.[1] ?? null)
      attrs.splice(styleIndex, 1)

      if (alignment) {
        token.attrSet('data-align', alignment)
      }
    }

    return self.renderToken(tokens, index, options)
  }
}

markdown.renderer.rules.image = (tokens, index, _options, env) => {
  const token = tokens[index]
  if (!token) {
    return ''
  }

  const renderEnv = env as MarkdownRenderEnv
  const rawRef = token.attrGet('src')?.trim() ?? ''
  const altText = token.content ?? ''
  const key = `image-${renderEnv.imageRefs.length}`
  const kind = classifyImageRef(rawRef)

  renderEnv.imageRefs.push({
    key,
    rawRef,
    altText,
    kind,
  })

  return renderImagePlaceholder(key, rawRef, altText, kind)
}

const defaultLinkOpenRenderer = markdown.renderer.rules['link_open']

function readLinkLabel(tokens: readonly Token[], index: number): string {
  const inline = tokens[index + 1]
  if (!inline) {
    return ''
  }

  if (inline.type === 'text') {
    return inline.content
  }

  if (inline.type === 'inline') {
    return inline.content
  }

  return ''
}

markdown.renderer.rules['link_open'] = (tokens, index, options, env, self) => {
  const token = tokens[index]
  if (!token) {
    return ''
  }

  const rawTarget = token.attrGet('href') ?? ''
  const renderEnv = env as MarkdownRenderEnv
  const fileLink = createMarkdownFileLinkCandidate({
    id: `file-link-${renderEnv.fileLinks.length}`,
    rawTarget,
    label: readLinkLabel(tokens, index),
  })
  const candidate = fileLink
    ? null
    : createMarkdownLinkCandidate({
        id: `note-link-${renderEnv.noteLinks.length}`,
        rawTarget,
        label: readLinkLabel(tokens, index),
      })

  if (fileLink) {
    renderEnv.fileLinks.push(fileLink)
    token.attrSet('data-cv-file-link-id', fileLink.id)
    token.attrSet('data-cv-file-link-state', 'pending')
    token.attrSet('aria-label', fileLink.label)
    token.attrSet('tabindex', '0')
  }

  if (candidate) {
    renderEnv.noteLinks.push(candidate)
    token.attrSet('data-cv-note-link-id', candidate.id)
    token.attrSet('data-cv-note-link-state', 'pending')
    token.attrSet('data-cv-note-link-syntax', candidate.syntax)
    token.attrSet('aria-label', candidate.label)
    token.attrSet('tabindex', '0')
  }

  return defaultLinkOpenRenderer
    ? defaultLinkOpenRenderer(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options)
}

export function renderMarkdownSource(source: string): MarkdownRenderResult {
  try {
    const env: MarkdownRenderEnv = {
      imageRefs: [],
      fileLinks: [],
      noteLinks: [],
      headingSlug: createHeadingSlugger(),
    }
    const rendered = markdown.render(source, env)
    return {
      html: DOMPurify.sanitize(rendered, SANITIZE_CONFIG),
      imageRefs: env.imageRefs,
      fileLinks: env.fileLinks,
      noteLinks: env.noteLinks,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Markdown render failed'
    throw new MarkdownRenderError(message)
  }
}
