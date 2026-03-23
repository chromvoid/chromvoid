import {PASS_DIR, sanitizeName} from './pass-utils'

const GROUP_PATH_LIMITS = {
  MAX_DEPTH: 10,
  MAX_SEGMENT_LENGTH: 100,
  MAX_PATH_LENGTH: 500,
} as const

/**
 * В отличие от sanitizeName():
 * - не подставляет 'untitled'
 * - предназначен для отдельных сегментов groupPath (не для полного пути)
 */
export function sanitizePathSegment(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
}

/**
 * Нормализует путь группы.
 *
 * Root entry кодируется только как undefined.
 */
export function normalizeGroupPath(raw?: string): string | undefined {
  const input = String(raw ?? '').trim()
  if (!input) return undefined

  const segments = input
    .replace(/\\/g, '/')
    .split('/')
    .map(sanitizePathSegment)
    .filter(Boolean)

  if (segments.length === 0) return undefined

  // Не "лечим" traversal, а считаем это ошибкой.
  if (segments.some((s) => s === '.' || s === '..')) {
    throw new Error('Invalid groupPath: traversal segments are not allowed')
  }

  if (segments.length > GROUP_PATH_LIMITS.MAX_DEPTH) {
    throw new Error(`Invalid groupPath: depth ${segments.length} > ${GROUP_PATH_LIMITS.MAX_DEPTH}`)
  }
  if (segments.some((s) => s.length > GROUP_PATH_LIMITS.MAX_SEGMENT_LENGTH)) {
    throw new Error('Invalid groupPath: segment too long')
  }

  const out = segments.join('/')
  if (out.length > GROUP_PATH_LIMITS.MAX_PATH_LENGTH) {
    throw new Error('Invalid groupPath: path too long')
  }
  return out
}

/**
 * Построить путь директории группы (директории, содержащей entries).
 * - undefined → PASS_DIR (root)
 * - 'Banking' → PASS_DIR/Banking
 * - 'Work/Jira' → PASS_DIR/Work/Jira
 */
export function buildGroupDirPath(groupPath?: string): string {
  if (!groupPath) return PASS_DIR
  return `${PASS_DIR}/${groupPath}`
}

/**
 * Построить имя директории записи: <sanitizedTitle>
 * (без добавления суффикса по id — title уникален внутри группы)
 */
export function buildEntryDirName(title: string | undefined, _id: string): string {
  const safeTitle = sanitizeName(title || _id)
  return `${safeTitle}`
}

/**
 * Построить полный путь директории записи.
 */
export function buildEntryPath(groupPath: string | undefined, title: string | undefined, id: string): string {
  const entryDirName = buildEntryDirName(title, id)
  const groupDir = buildGroupDirPath(groupPath)
  return `${groupDir}/${entryDirName}`
}

/**
 * Извлечь groupPath из полного пути entry.
 * '/.passmanager/entry' → undefined
 * '/.passmanager/Banking/entry' → 'Banking'
 * '/.passmanager/Work/Jira/entry' → 'Work/Jira'
 */
export function extractGroupPathFromEntryPath(entryPath: string): string | undefined {
  const safePath = String(entryPath ?? '')
  const withoutLead = safePath.startsWith('/') ? safePath.slice(1) : safePath
  const parts = withoutLead.split('/').filter(Boolean)

  const passRoot = PASS_DIR.startsWith('/') ? PASS_DIR.slice(1) : PASS_DIR
  const idx = parts.indexOf(passRoot)
  if (idx < 0) return undefined

  const after = parts.slice(idx + 1).filter(Boolean)
  if (after.length < 2) return undefined
  return after.slice(0, -1).join('/')
}
