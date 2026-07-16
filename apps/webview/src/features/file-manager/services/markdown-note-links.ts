import {parentPath as getParentPath} from 'root/app/navigation/navigation-snapshot'

import type {CatalogMarkdownNote} from './catalog-notes'

export type MarkdownNoteLinkSyntax = 'wikilink' | 'markdown'

export type MarkdownNoteLinkCandidate = {
  id: string
  syntax: MarkdownNoteLinkSyntax
  rawTarget: string
  targetPath: string
  anchor: string | null
  label: string
  sourceStart: number | null
  sourceEnd: number | null
}

export type MarkdownNoteContext = {
  fileId: number
  fileName: string
  path: string | null
  parentPath: string | null
  sourceRevision: number | null
}

export type MarkdownNoteLinkCompletion = {
  label: string
  detail: string
  target: string
}

export type MarkdownWikilinkCompletionMatch = {
  from: number
  to: number
  query: string
}

const MARKDOWN_EXTENSION_PATTERN = /\.(?:md|markdown)$/i
const EXPLICIT_EXTENSION_PATTERN = /\/?[^/]+\.[^/]+$/i
const UNSUPPORTED_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function splitMarkdownNoteTarget(rawTarget: string): {targetPath: string; anchor: string | null} {
  const trimmed = rawTarget.trim()
  const hashIndex = trimmed.indexOf('#')
  if (hashIndex < 0) {
    return {targetPath: safeDecodeUriComponent(trimmed), anchor: null}
  }

  const targetPath = safeDecodeUriComponent(trimmed.slice(0, hashIndex))
  const rawAnchor = trimmed.slice(hashIndex + 1).trim()
  return {
    targetPath,
    anchor: rawAnchor ? safeDecodeUriComponent(rawAnchor) : null,
  }
}

export function hasUnsupportedMarkdownLinkScheme(rawTarget: string): boolean {
  const trimmed = rawTarget.trim()
  return trimmed.startsWith('//') || UNSUPPORTED_SCHEME_PATTERN.test(trimmed)
}

export function isMarkdownNoteHref(rawTarget: string): boolean {
  if (!rawTarget.trim() || hasUnsupportedMarkdownLinkScheme(rawTarget)) {
    return false
  }

  const {targetPath, anchor} = splitMarkdownNoteTarget(rawTarget)
  if (!targetPath) {
    return Boolean(anchor)
  }

  return MARKDOWN_EXTENSION_PATTERN.test(targetPath)
}

export function createWikilinkCandidate(input: {
  id: string
  rawTarget: string
  sourceStart?: number | null
  sourceEnd?: number | null
}): MarkdownNoteLinkCandidate | null {
  const rawTarget = input.rawTarget.trim()
  if (!rawTarget || hasUnsupportedMarkdownLinkScheme(rawTarget)) {
    return null
  }

  const separatorIndex = rawTarget.indexOf('|')
  const linkTarget = separatorIndex >= 0 ? rawTarget.slice(0, separatorIndex).trim() : rawTarget
  const alias = separatorIndex >= 0 ? rawTarget.slice(separatorIndex + 1).trim() : ''
  const {targetPath, anchor} = splitMarkdownNoteTarget(linkTarget)
  const label = alias || getMarkdownNoteTargetLabel(targetPath, anchor) || linkTarget

  return {
    id: input.id,
    syntax: 'wikilink',
    rawTarget,
    targetPath,
    anchor,
    label,
    sourceStart: input.sourceStart ?? null,
    sourceEnd: input.sourceEnd ?? null,
  }
}

export function createMarkdownLinkCandidate(input: {
  id: string
  rawTarget: string
  label: string
  sourceStart?: number | null
  sourceEnd?: number | null
}): MarkdownNoteLinkCandidate | null {
  if (!isMarkdownNoteHref(input.rawTarget)) {
    return null
  }

  const {targetPath, anchor} = splitMarkdownNoteTarget(input.rawTarget)
  return {
    id: input.id,
    syntax: 'markdown',
    rawTarget: input.rawTarget.trim(),
    targetPath,
    anchor,
    label: input.label || getMarkdownNoteTargetLabel(targetPath, anchor) || input.rawTarget.trim(),
    sourceStart: input.sourceStart ?? null,
    sourceEnd: input.sourceEnd ?? null,
  }
}

export function normalizeHeadingSlug(value: string): string {
  const slug = value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

  return slug || 'section'
}

export function createHeadingSlugger(): (value: string) => string {
  const counts = new Map<string, number>()
  return (value: string) => {
    const base = normalizeHeadingSlug(value)
    const count = counts.get(base) ?? 0
    counts.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  }
}

export function normalizeMarkdownAnchor(rawAnchor: string): string {
  const decoded = safeDecodeUriComponent(rawAnchor.trim())
  return decoded.startsWith('#') ? normalizeHeadingSlug(decoded.slice(1)) : normalizeHeadingSlug(decoded)
}

export function getMarkdownNoteTargetLabel(targetPath: string, anchor: string | null): string {
  const pathLabel = targetPath ? removeMarkdownExtension(getPathBasename(targetPath)) : ''
  if (pathLabel && anchor) {
    return `${pathLabel} #${anchor}`
  }
  return pathLabel || (anchor ? `#${anchor}` : '')
}

export function removeMarkdownExtension(value: string): string {
  return value.replace(MARKDOWN_EXTENSION_PATTERN, '')
}

export function getPathBasename(path: string): string {
  const normalized = path.replace(/\/+$/g, '')
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

export function normalizeCatalogNotePath(path: string): string | null {
  if (!path.startsWith('/') || path.startsWith('//')) {
    return null
  }

  const segments = path.split('/').filter(Boolean)
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return null
  }

  return `/${segments.join('/')}`
}

export function normalizeRelativeNotePath(parentPath: string, targetPath: string): string | null {
  if (!targetPath || targetPath.startsWith('/')) {
    return normalizeCatalogNotePath(targetPath)
  }

  const baseSegments = parentPath.split('/').filter(Boolean)
  const targetSegments = targetPath.split('/').filter(Boolean)
  for (const segment of targetSegments) {
    if (segment === '.') {
      continue
    }
    if (segment === '..') {
      baseSegments.pop()
      continue
    }
    baseSegments.push(segment)
  }

  return normalizeCatalogNotePath(`/${baseSegments.join('/')}`)
}

export function withMarkdownPathVariants(path: string): string[] {
  if (!path) {
    return []
  }

  const normalized = path.replace(/\/+/g, '/')
  if (MARKDOWN_EXTENSION_PATTERN.test(normalized) || !EXPLICIT_EXTENSION_PATTERN.test(normalized)) {
    const withoutExtension = removeMarkdownExtension(normalized)
    return MARKDOWN_EXTENSION_PATTERN.test(normalized)
      ? [normalized]
      : [`${withoutExtension}.md`, `${withoutExtension}.markdown`]
  }

  return [normalized]
}

export function createMarkdownNoteContext(input: {
  fileId: number
  fileName: string
  path?: string
  parentPath?: string
  sourceRevision?: number | null
}): MarkdownNoteContext {
  const normalizedPath = input.path ? normalizeCatalogNotePath(input.path) : null
  return {
    fileId: input.fileId,
    fileName: input.fileName,
    path: normalizedPath,
    parentPath: input.parentPath ?? (normalizedPath ? getParentPath(normalizedPath) : null),
    sourceRevision: input.sourceRevision ?? null,
  }
}

export function getWikilinkCompletionMatch(source: string, position: number): MarkdownWikilinkCompletionMatch | null {
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
    from: openIndex,
    to: clampedPosition,
    query,
  }
}

export function formatWikilinkInsertion(target: string, alias?: string): string {
  const safeTarget = sanitizeWikilinkPart(target)
  const safeAlias = alias ? sanitizeWikilinkPart(alias) : ''
  return safeAlias ? `[[${safeTarget}|${safeAlias}]]` : `[[${safeTarget}]]`
}

export function getSelectedMarkdownText(source: string, selection: {selectionStart: number; selectionEnd: number}): string {
  const start = Math.min(selection.selectionStart, selection.selectionEnd)
  const end = Math.max(selection.selectionStart, selection.selectionEnd)
  if (start === end) {
    return ''
  }
  return source.slice(start, end).replace(/\s+/g, ' ').trim()
}

export function buildWikilinkCompletionTarget(
  note: CatalogMarkdownNote,
  duplicateStemCount: number,
): string {
  const stem = removeMarkdownExtension(note.fileName)
  if (duplicateStemCount <= 1) {
    return stem
  }

  return removeMarkdownExtension(note.path.replace(/^\/+/, ''))
}

function sanitizeWikilinkPart(value: string): string {
  return value.replace(/[\]\n\r]/g, '').replace(/\|/g, '-').trim()
}
