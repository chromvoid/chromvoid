export type MarkdownTaskListMarker = {
  checked: boolean
  line: number
  markerStart: number
  markerEnd: number
}

const TASK_MARKER_PATTERN = /^(\s*)(?:[-+*]|\d+[.)])(\s+)\[([ xX])\](\s+)/
const INLINE_TASK_MARKER_PATTERN = /^\[([ xX])\]\s+/

export function findMarkdownTaskMarkerInLine(lineText: string, line: number): MarkdownTaskListMarker | null {
  const match = TASK_MARKER_PATTERN.exec(lineText)
  if (!match || match.index !== 0) {
    return null
  }

  const markerStart = match[0].indexOf('[')
  return {
    checked: match[3]?.toLowerCase() === 'x',
    line,
    markerStart,
    markerEnd: markerStart + 3,
  }
}

export function findMarkdownTaskMarkerInInlineContent(
  content: string,
  line: number,
): MarkdownTaskListMarker | null {
  const match = INLINE_TASK_MARKER_PATTERN.exec(content)
  if (!match) {
    return null
  }

  return {
    checked: match[1]?.toLowerCase() === 'x',
    line,
    markerStart: 0,
    markerEnd: match[0].length,
  }
}

export function toggleMarkdownTaskListItemAtLine(
  source: string,
  line: number,
): {source: string; checked: boolean} | null {
  if (!Number.isInteger(line) || line < 0) {
    return null
  }

  const lineStart = getMarkdownSourceOffsetForLine(source, line)
  if (lineStart === null) {
    return null
  }

  const lineEnd = getMarkdownSourceLineEnd(source, lineStart)
  const lineText = source.slice(lineStart, lineEnd)
  const marker = findMarkdownTaskMarkerInLine(lineText, line)
  if (!marker) {
    return null
  }

  const checked = !marker.checked
  const replacement = checked ? '[x]' : '[ ]'
  return {
    source:
      source.slice(0, lineStart + marker.markerStart) +
      replacement +
      source.slice(lineStart + marker.markerEnd),
    checked,
  }
}

export function getMarkdownTaskListItemCheckedAtLine(source: string, line: number): boolean | null {
  if (!Number.isInteger(line) || line < 0) {
    return null
  }

  const lineStart = getMarkdownSourceOffsetForLine(source, line)
  if (lineStart === null) {
    return null
  }

  const lineEnd = getMarkdownSourceLineEnd(source, lineStart)
  const marker = findMarkdownTaskMarkerInLine(source.slice(lineStart, lineEnd), line)
  return marker?.checked ?? null
}

export function getMarkdownSourceOffsetForLine(source: string, line: number): number | null {
  if (line === 0) {
    return 0
  }

  let currentLine = 0
  let offset = 0
  while (currentLine < line && offset < source.length) {
    const nextLineBreak = source.indexOf('\n', offset)
    if (nextLineBreak === -1) {
      return null
    }
    offset = nextLineBreak + 1
    currentLine += 1
  }

  return currentLine === line ? offset : null
}

function getMarkdownSourceLineEnd(source: string, lineStart: number): number {
  const lineBreak = source.indexOf('\n', lineStart)
  return lineBreak === -1 ? source.length : lineBreak
}
