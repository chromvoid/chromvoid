import {getLang, i18n} from './i18n'

const PASSWORD_STRENGTH_LABEL_KEYS = [
  'password:strength:very_weak',
  'password:strength:weak',
  'password:strength:medium',
  'password:strength:good',
  'password:strength:strong',
] as const

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
  // Protection from clearly incorrect values and zeros
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

/*** Format for list of records:
* - < 24 hours: time (hours: min)
* - < 7d: day of the week (short)
* - otherwise: date (day.month or local equivalent)
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
  // A short date without a year
  const locale = getLocale()
  try {
    return new Intl.DateTimeFormat(locale, {day: '2-digit', month: '2-digit'}).format(date)
  } catch {
    return date.toLocaleDateString(locale, {day: '2-digit', month: '2-digit'})
  }
}

export function formatPasswordStrengthLabel(score: 0 | 1 | 2 | 3 | 4): string {
  return i18n(PASSWORD_STRENGTH_LABEL_KEYS[score] as never)
}
