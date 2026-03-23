import {getLang, i18n} from './i18n'

function getLocale(): string {
  try {
    const lang = getLang()
    return typeof lang === 'string' && lang.length > 0 ? lang : 'en'
  } catch {
    return 'en'
  }
}

function isInvalidTimestamp(timestamp: unknown): boolean {
  if (typeof timestamp !== 'number') return true
  if (!Number.isFinite(timestamp)) return true
  // защита от явно неверных значений и нулей
  if (timestamp <= 0) return true
  const d = new Date(timestamp)
  return Number.isNaN(d.getTime())
}

function unknownLabel(): string {
  try {
    return i18n('ts:unknown')
  } catch {
    return '—'
  }
}

export function formatDateTime(timestamp: number): string {
  if (isInvalidTimestamp(timestamp)) return unknownLabel()
  const locale = getLocale()
  const date = new Date(timestamp)
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    return date.toLocaleString(locale)
  }
}

export function formatDate(timestamp: number): string {
  if (isInvalidTimestamp(timestamp)) return unknownLabel()
  const locale = getLocale()
  const date = new Date(timestamp)
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return date.toLocaleDateString(locale)
  }
}

export function formatTime(timestamp: number): string {
  if (isInvalidTimestamp(timestamp)) return unknownLabel()
  const locale = getLocale()
  const date = new Date(timestamp)
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    return date.toLocaleTimeString(locale, {hour: '2-digit', minute: '2-digit'})
  }
}

export function formatWeekdayShort(timestamp: number): string {
  if (isInvalidTimestamp(timestamp)) return unknownLabel()
  const locale = getLocale()
  const date = new Date(timestamp)
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
    }).format(date)
  } catch {
    return date.toLocaleDateString(locale, {weekday: 'short'})
  }
}

/**
 * Формат для списка записей:
 * - < 24ч: время (часы:мин)
 * - < 7д: день недели (коротко)
 * - иначе: дата (день.месяц или локальный эквивалент)
 */
export function formatModifiedForList(timestamp: number): string {
  if (isInvalidTimestamp(timestamp)) return unknownLabel()
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()

  const DAY = 24 * 60 * 60 * 1000
  const WEEK = 7 * DAY

  if (diffMs < DAY) return formatTime(timestamp)
  if (diffMs < WEEK) return formatWeekdayShort(timestamp)
  // Короткая дата без года
  const locale = getLocale()
  try {
    return new Intl.DateTimeFormat(locale, {day: '2-digit', month: '2-digit'}).format(date)
  } catch {
    return date.toLocaleDateString(locale, {day: '2-digit', month: '2-digit'})
  }
}
