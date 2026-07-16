import type {CatalogFileLinkItem} from '../../../core/catalog/local-catalog/types'

export type MarkdownFileLinkCandidate = {
  id: string
  rawTarget: string
  targetPath: string
  label: string
  sourceStart: number | null
  sourceEnd: number | null
}

export type MarkdownFileLinkCompletionMatch = {
  from: number
  to: number
  query: string
  labelFrom: number
  labelTo: number
  label: string
}

export type MarkdownFileLinkShortcutCompletionMatch = {
  kind: 'wikilink-shortcut'
  from: number
  to: number
  query: string
  labelFrom: number
  labelTo: number
  label: string
}

export type AnyMarkdownFileLinkCompletionMatch =
  | MarkdownFileLinkCompletionMatch
  | MarkdownFileLinkShortcutCompletionMatch

const UNSUPPORTED_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function markdownLinkLabel(source: string, openParenIndex: number): {from: number; to: number} | null {
  const closeBracketIndex = openParenIndex - 1
  if (source.charAt(closeBracketIndex) !== ']') {
    return null
  }

  const openBracketIndex = source.lastIndexOf('[', closeBracketIndex - 1)
  if (openBracketIndex < 0) {
    return null
  }
  if (openBracketIndex > 0 && source.charAt(openBracketIndex - 1) === '!') {
    return null
  }

  const label = source.slice(openBracketIndex + 1, closeBracketIndex)
  if (label.includes('\n')) {
    return null
  }

  return {from: openBracketIndex, to: closeBracketIndex + 1}
}

export function decodeMarkdownFileLinkTarget(rawTarget: string): string {
  return safeDecodeUriComponent(rawTarget.trim())
}

export function normalizeCatalogFileLinkTarget(rawTarget: string): string | null {
  const decoded = decodeMarkdownFileLinkTarget(rawTarget)
  if (!decoded || decoded.startsWith('//') || UNSUPPORTED_SCHEME_PATTERN.test(decoded)) {
    return null
  }
  if (!decoded.startsWith('/') || decoded === '/') {
    return null
  }

  const segments = decoded.split('/').slice(1)
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    return null
  }

  return `/${segments.join('/')}`
}

export function encodeCatalogFileLinkTarget(path: string): string {
  const normalized = normalizeCatalogFileLinkTarget(path)
  if (!normalized) {
    return ''
  }

  return `/${normalized
    .split('/')
    .slice(1)
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`
}

export function getMarkdownFileLinkCompletionMatch(
  source: string,
  position: number,
): MarkdownFileLinkCompletionMatch | null {
  const clampedPosition = Math.min(source.length, Math.max(0, Math.floor(position)))
  const beforeCursor = source.slice(0, clampedPosition)
  const openParenIndex = beforeCursor.lastIndexOf('](')
  if (openParenIndex < 0) {
    return null
  }

  const targetFrom = openParenIndex + 2
  const query = beforeCursor.slice(targetFrom)
  if (query.includes('\n') || query.includes(')')) {
    return null
  }
  const label = markdownLinkLabel(source, openParenIndex + 1)
  if (!label) {
    return null
  }

  return {
    from: targetFrom,
    to: clampedPosition,
    query,
    labelFrom: label.from,
    labelTo: label.to,
    label: source.slice(label.from + 1, label.to - 1),
  }
}

export function getMarkdownFileLinkShortcutCompletionMatch(
  source: string,
  position: number,
): MarkdownFileLinkShortcutCompletionMatch | null {
  const clampedPosition = Math.min(source.length, Math.max(0, Math.floor(position)))
  const beforeCursor = source.slice(0, clampedPosition)
  const openIndex = beforeCursor.lastIndexOf('[[')
  if (openIndex < 0) {
    return null
  }

  const query = beforeCursor.slice(openIndex + 2)
  if (query.includes('\n') || query.includes(']')) {
    return null
  }

  return {
    kind: 'wikilink-shortcut',
    from: openIndex + 2,
    to: clampedPosition,
    query,
    labelFrom: openIndex,
    labelTo: openIndex + 2,
    label: '',
  }
}

export function getAnyMarkdownFileLinkCompletionMatch(
  source: string,
  position: number,
): AnyMarkdownFileLinkCompletionMatch | null {
  return (
    getMarkdownFileLinkCompletionMatch(source, position) ??
    getMarkdownFileLinkShortcutCompletionMatch(source, position)
  )
}

export function getMarkdownFileLinkCompletionReplacementRange(
  source: string,
  match: AnyMarkdownFileLinkCompletionMatch,
): {from: number; to: number} {
  const isShortcut = 'kind' in match && match.kind === 'wikilink-shortcut'
  const trailingCloseLength = isShortcut
    ? source.slice(match.to, match.to + 2) === ']]'
      ? 2
      : 0
    : source.charAt(match.to) === ')'
      ? 1
      : 0

  return {
    from: match.labelFrom,
    to: match.to + trailingCloseLength,
  }
}

export function createMarkdownFileLinkCandidate(input: {
  id: string
  rawTarget: string
  label: string
  sourceStart?: number | null
  sourceEnd?: number | null
}): MarkdownFileLinkCandidate | null {
  const targetPath = normalizeCatalogFileLinkTarget(input.rawTarget)
  if (!targetPath) {
    return null
  }

  return {
    id: input.id,
    rawTarget: input.rawTarget.trim(),
    targetPath,
    label: input.label || getCatalogFileLinkLabel(targetPath),
    sourceStart: input.sourceStart ?? null,
    sourceEnd: input.sourceEnd ?? null,
  }
}

export function getCatalogFileLinkLabel(path: string): string {
  const normalized = normalizeCatalogFileLinkTarget(path)
  if (!normalized) {
    return ''
  }
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

function escapeMarkdownLinkLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim().replace(/[\\[\]]/g, '\\$&')
}

export function formatMarkdownFileLinkInsertion(item: CatalogFileLinkItem, alias?: string): string {
  const target = encodeCatalogFileLinkTarget(item.path)
  const label = escapeMarkdownLinkLabel(alias || item.name || getCatalogFileLinkLabel(item.path))
  return `[${label}](${target})`
}

export function formatMarkdownFileLinkCompletionTarget(item: CatalogFileLinkItem): string {
  return encodeCatalogFileLinkTarget(item.path)
}
