import DOMPurify from 'dompurify'
import type {Config} from 'dompurify'
import MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'

import {MarkdownRenderError} from './markdown-errors'

export type MarkdownRenderResult = {
  html: string
  imageRefs: MarkdownImageRef[]
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
}

const SANITIZE_CONFIG: Config = {
  USE_PROFILES: {html: true},
  ADD_ATTR: [
    'aria-label',
    'data-align',
    'data-cv-image-key',
    'data-cv-image-kind',
    'data-cv-image-ref',
    'data-source-line-end',
    'data-source-line-start',
    'role',
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

export function renderMarkdownSource(source: string): MarkdownRenderResult {
  try {
    const env: MarkdownRenderEnv = {imageRefs: []}
    const rendered = markdown.render(source, env)
    return {
      html: DOMPurify.sanitize(rendered, SANITIZE_CONFIG),
      imageRefs: env.imageRefs,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Markdown render failed'
    throw new MarkdownRenderError(message)
  }
}
