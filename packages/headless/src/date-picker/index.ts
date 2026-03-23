import {action, atom, computed, type Atom, type Computed} from '@reatom/core'

export type DatePickerTimeZone = 'local' | 'utc'

export interface ParsedDateTime {
  date: string
  time: string
  full: string
}

export interface CalendarDay {
  date: string
  month: 'prev' | 'current' | 'next'
  inRange: boolean
  isToday: boolean
  disabled: boolean
}

export interface CreateDatePickerOptions {
  idBase?: string
  value?: string | null
  required?: boolean
  disabled?: boolean
  readonly?: boolean
  placeholder?: string
  locale?: string
  timeZone?: DatePickerTimeZone
  min?: string | null
  max?: string | null
  minuteStep?: number
  hourCycle?: 12 | 24
  closeOnEscape?: boolean
  ariaLabel?: string
  parseDateTime?: (value: string, locale: string) => ParsedDateTime | null
  formatDateTime?: (value: ParsedDateTime, locale: string) => string
  onInput?: (value: string) => void
  onCommit?: (value: string | null) => void
  onClear?: () => void
}

export type DatePickerKeyboardEventLike = Pick<
  KeyboardEvent,
  'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey' | 'preventDefault'
>

export interface DatePickerState {
  inputValue: Atom<string>
  isOpen: Atom<boolean>
  focusedDate: Atom<string | null>
  committedDate: Atom<string | null>
  committedTime: Atom<string | null>
  draftDate: Atom<string | null>
  draftTime: Atom<string | null>
  displayedYear: Atom<number>
  displayedMonth: Atom<number>
  isInputFocused: Atom<boolean>
  isCalendarFocused: Atom<boolean>
  disabled: Atom<boolean>
  readonly: Atom<boolean>
  required: Atom<boolean>
  placeholder: Atom<string>
  locale: Atom<string>
  timeZone: Atom<DatePickerTimeZone>
  min: Atom<string | null>
  max: Atom<string | null>
  minuteStep: Atom<number>
  hourCycle: Atom<12 | 24>
  isDualCommit: Computed<boolean>
  hasCommittedSelection: Computed<boolean>
  hasDraftSelection: Computed<boolean>
  committedValue: Computed<string | null>
  draftValue: Computed<string | null>
  parsedValue: Computed<ParsedDateTime | null>
  canCommitInput: Computed<boolean>
  inputInvalid: Computed<boolean>
  visibleDays: Computed<CalendarDay[]>
  today: Computed<string>
  selectedCellId: Computed<string | null>
}

export interface DatePickerActions {
  open(): void
  close(): void
  toggle(): void
  setInputValue(value: string): void
  commitInput(): void
  clear(): void
  setDisabled(value: boolean): void
  setReadonly(value: boolean): void
  setRequired(value: boolean): void
  setPlaceholder(value: string): void
  setLocale(value: string): void
  setTimeZone(value: DatePickerTimeZone): void
  setMin(value: string | null): void
  setMax(value: string | null): void
  setMinuteStep(value: number): void
  setHourCycle(value: 12 | 24): void
  setDisplayedMonth(year: number, month: number): void
  moveMonth(offset: -1 | 1): void
  moveYear(offset: -1 | 1): void
  setFocusedDate(date: string | null): void
  moveFocusPreviousDay(): void
  moveFocusNextDay(): void
  moveFocusPreviousWeek(): void
  moveFocusNextWeek(): void
  selectDraftDate(date: string): void
  setDraftTime(time: string): void
  jumpToNow(): void
  commitDraft(): void
  cancelDraft(): void
  handleInputKeyDown(event: DatePickerKeyboardEventLike): void
  handleDialogKeyDown(event: DatePickerKeyboardEventLike): void
  handleCalendarKeyDown(event: DatePickerKeyboardEventLike): void
  handleTimeKeyDown(event: DatePickerKeyboardEventLike): void
  handleOutsidePointer(): void
}

export interface DatePickerInputProps {
  id: string
  role: 'combobox'
  tabindex: '0'
  autocomplete: 'off'
  disabled: boolean
  readonly?: true
  required?: true
  value: string
  placeholder: string
  'aria-haspopup': 'dialog'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string
  'aria-activedescendant'?: string
  'aria-invalid'?: 'true'
  'aria-label'?: string
  onInput: (value: string) => void
  onKeyDown: (event: DatePickerKeyboardEventLike) => void
  onFocus: () => void
  onBlur: () => void
}

export interface DatePickerDialogProps {
  id: string
  role: 'dialog'
  tabindex: '-1'
  hidden: boolean
  'aria-modal': 'true'
  'aria-label': string
  onKeyDown: (event: DatePickerKeyboardEventLike) => void
  onPointerDownOutside: () => void
}

export interface DatePickerCalendarGridProps {
  id: string
  role: 'grid'
  tabindex: '-1'
  'aria-label': string
  onKeyDown: (event: DatePickerKeyboardEventLike) => void
}

export interface DatePickerCalendarDayProps {
  id: string
  role: 'gridcell'
  tabindex: '0' | '-1'
  'aria-selected': 'true' | 'false'
  'aria-disabled'?: 'true'
  'aria-current'?: 'date'
  'data-date': string
  onClick: () => void
  onMouseEnter: () => void
}

export interface DatePickerMonthNavButtonProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-label': 'Previous month' | 'Next month'
  onClick: () => void
}

export interface DatePickerYearNavButtonProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-label': 'Previous year' | 'Next year'
  onClick: () => void
}

export interface DatePickerTimeSegmentProps {
  id: string
  type: 'text'
  inputmode: 'numeric'
  'aria-label': string
  value: string
  minlength: '2'
  maxlength: '2'
  disabled: boolean
  readonly: boolean
  onInput: (value: string) => void
  onKeyDown: (event: DatePickerKeyboardEventLike) => void
}

export interface DatePickerButtonProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-label': string
  disabled: boolean
  onClick: () => void
}

export interface DatePickerContracts {
  getInputProps(): DatePickerInputProps
  getDialogProps(): DatePickerDialogProps
  getCalendarGridProps(): DatePickerCalendarGridProps
  getCalendarDayProps(date: string): DatePickerCalendarDayProps
  getMonthNavButtonProps(direction: 'prev' | 'next'): DatePickerMonthNavButtonProps
  getYearNavButtonProps(direction: 'prev' | 'next'): DatePickerYearNavButtonProps
  getHourInputProps(): DatePickerTimeSegmentProps
  getMinuteInputProps(): DatePickerTimeSegmentProps
  getApplyButtonProps(): DatePickerButtonProps
  getCancelButtonProps(): DatePickerButtonProps
  getClearButtonProps(): DatePickerButtonProps
  getVisibleDays(): readonly CalendarDay[]
}

export interface DatePickerModel {
  readonly state: DatePickerState
  readonly actions: DatePickerActions
  readonly contracts: DatePickerContracts
}

interface DateParts {
  year: number
  month: number
  day: number
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})$/

const twoDigits = (value: number) => String(value).padStart(2, '0')

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const parseDateOnly = (value: string): DateParts | null => {
  const match = value.match(DATE_RE)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
  if (date.getUTCFullYear() !== year) return null
  if (date.getUTCMonth() + 1 !== month) return null
  if (date.getUTCDate() !== day) return null

  return {year, month, day}
}

const parseTimeOnly = (value: string): string | null => {
  const match = value.match(/^(\d{2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return `${twoDigits(hours)}:${twoDigits(minutes)}`
}

const parseDateTimeDefault = (value: string): ParsedDateTime | null => {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null

  const dtMatch = trimmed.match(DATETIME_RE)
  if (dtMatch) {
    const date = `${dtMatch[1]}-${dtMatch[2]}-${dtMatch[3]}`
    const time = `${dtMatch[4]}:${dtMatch[5]}`
    if (!parseDateOnly(date)) return null
    if (!parseTimeOnly(time)) return null
    return {date, time, full: `${date}T${time}`}
  }

  const dateParts = parseDateOnly(trimmed)
  if (!dateParts) return null
  const date = `${dateParts.year}-${twoDigits(dateParts.month)}-${twoDigits(dateParts.day)}`
  const time = '00:00'
  return {date, time, full: `${date}T${time}`}
}

const formatDateTimeDefault = (value: ParsedDateTime) => `${value.date}T${value.time}`

const splitDateTime = (value: string | null, parse: (input: string) => ParsedDateTime | null) => {
  if (!value) return {date: null as string | null, time: null as string | null}
  const parsed = parse(value)
  if (!parsed) return {date: null as string | null, time: null as string | null}
  return {date: parsed.date, time: parsed.time}
}

const normalizeYearMonth = (year: number, month: number) => {
  let nextYear = year
  let nextMonth = month

  while (nextMonth < 1) {
    nextMonth += 12
    nextYear -= 1
  }
  while (nextMonth > 12) {
    nextMonth -= 12
    nextYear += 1
  }

  return {year: nextYear, month: nextMonth}
}

const toDateStringUtc = (date: Date) =>
  `${date.getUTCFullYear()}-${twoDigits(date.getUTCMonth() + 1)}-${twoDigits(date.getUTCDate())}`

const getTodayDate = (timeZone: DatePickerTimeZone) => {
  const now = new Date()
  if (timeZone === 'utc') {
    return `${now.getUTCFullYear()}-${twoDigits(now.getUTCMonth() + 1)}-${twoDigits(now.getUTCDate())}`
  }
  return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`
}

const getNowTime = (timeZone: DatePickerTimeZone, minuteStep: number) => {
  const now = new Date()
  const rawHours = timeZone === 'utc' ? now.getUTCHours() : now.getHours()
  const rawMinutes = timeZone === 'utc' ? now.getUTCMinutes() : now.getMinutes()

  const step = clamp(Math.floor(minuteStep), 1, 60)
  let snappedMinutes = Math.round(rawMinutes / step) * step
  let hours = rawHours
  if (snappedMinutes >= 60) {
    snappedMinutes = 0
    hours = (hours + 1) % 24
  }

  return `${twoDigits(hours)}:${twoDigits(snappedMinutes)}`
}

const addDaysUtc = (date: string, delta: number): string | null => {
  const parts = parseDateOnly(date)
  if (!parts) return null
  const cursor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0))
  cursor.setUTCDate(cursor.getUTCDate() + delta)
  return toDateStringUtc(cursor)
}

const isDateWithinBounds = (date: string, min: string | null, max: string | null) => {
  const minDate = min?.slice(0, 10) ?? null
  const maxDate = max?.slice(0, 10) ?? null
  if (minDate && date < minDate) return false
  if (maxDate && date > maxDate) return false
  return true
}

const isDateTimeWithinBounds = (value: string, min: string | null, max: string | null) => {
  if (min && value < min) return false
  if (max && value > max) return false
  return true
}

const normalizeTime = (value: string, minuteStep: number): string | null => {
  const match = value.match(/^(\d{1,2}):(\d{1,2})$/)
  if (!match) return null

  let hours = Number(match[1])
  let minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23) return null
  if (minutes < 0 || minutes > 59) return null

  const step = clamp(Math.floor(minuteStep), 1, 60)
  let snappedMinutes = Math.round(minutes / step) * step
  if (snappedMinutes >= 60) {
    snappedMinutes = 0
    hours = (hours + 1) % 24
  }

  return `${twoDigits(hours)}:${twoDigits(snappedMinutes)}`
}

const buildVisibleDays = (
  year: number,
  month: number,
  today: string,
  min: string | null,
  max: string | null,
): CalendarDay[] => {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0))
  const firstWeekday = firstOfMonth.getUTCDay()
  const start = new Date(firstOfMonth)
  start.setUTCDate(start.getUTCDate() - firstWeekday)

  const days: CalendarDay[] = []
  for (let index = 0; index < 42; index += 1) {
    const cursor = new Date(start)
    cursor.setUTCDate(start.getUTCDate() + index)
    const date = toDateStringUtc(cursor)
    const cursorMonth = cursor.getUTCMonth() + 1
    const monthKind: CalendarDay['month'] =
      cursorMonth < month ? 'prev' : cursorMonth > month ? 'next' : 'current'
    const inRange = isDateWithinBounds(date, min, max)
    days.push({
      date,
      month: monthKind,
      inRange,
      isToday: date === today,
      disabled: !inRange,
    })
  }

  return days
}

export function createDatePicker(options: CreateDatePickerOptions = {}): DatePickerModel {
  const idBase = options.idBase ?? 'date-picker'
  const parseDateTime = options.parseDateTime ?? ((value: string) => parseDateTimeDefault(value))
  const formatDateTime = options.formatDateTime ?? ((value: ParsedDateTime) => formatDateTimeDefault(value))

  const localeAtom = atom(options.locale ?? 'en-US', `${idBase}.locale`)
  const timeZoneAtom = atom<DatePickerTimeZone>(options.timeZone ?? 'local', `${idBase}.timeZone`)
  const minuteStepAtom = atom(clamp(Math.floor(options.minuteStep ?? 1), 1, 60), `${idBase}.minuteStep`)

  const initial = splitDateTime(options.value ?? null, (input) => parseDateTime(input, localeAtom()))
  const initialDate = initial.date
  const initialTime = initial.time

  const today = getTodayDate(timeZoneAtom())
  const todayParts = parseDateOnly(today) ?? {year: 1970, month: 1, day: 1}
  const initialDisplayDate = initialDate ?? today
  const initialDisplayParts = parseDateOnly(initialDisplayDate) ?? todayParts

  const committedDateAtom = atom<string | null>(initialDate, `${idBase}.committedDate`)
  const committedTimeAtom = atom<string | null>(initialTime, `${idBase}.committedTime`)
  const draftDateAtom = atom<string | null>(initialDate, `${idBase}.draftDate`)
  const draftTimeAtom = atom<string | null>(initialTime, `${idBase}.draftTime`)

  const inputValueAtom = atom(
    initialDate && initialTime
      ? formatDateTime(
          {date: initialDate, time: initialTime, full: `${initialDate}T${initialTime}`},
          localeAtom(),
        )
      : '',
    `${idBase}.inputValue`,
  )
  const isOpenAtom = atom(false, `${idBase}.isOpen`)
  const focusedDateAtom = atom<string | null>(initialDate ?? today, `${idBase}.focusedDate`)
  const displayedYearAtom = atom(initialDisplayParts.year, `${idBase}.displayedYear`)
  const displayedMonthAtom = atom(initialDisplayParts.month, `${idBase}.displayedMonth`)
  const isInputFocusedAtom = atom(false, `${idBase}.isInputFocused`)
  const isCalendarFocusedAtom = atom(false, `${idBase}.isCalendarFocused`)

  const disabledAtom = atom(options.disabled ?? false, `${idBase}.disabled`)
  const readonlyAtom = atom(options.readonly ?? false, `${idBase}.readonly`)
  const requiredAtom = atom(options.required ?? false, `${idBase}.required`)
  const placeholderAtom = atom(options.placeholder ?? 'Select date and time', `${idBase}.placeholder`)
  const minAtom = atom<string | null>(options.min ?? null, `${idBase}.min`)
  const maxAtom = atom<string | null>(options.max ?? null, `${idBase}.max`)
  const hourCycleAtom = atom<12 | 24>(options.hourCycle ?? 24, `${idBase}.hourCycle`)

  const hasCommittedSelectionAtom = computed(
    () => committedDateAtom() != null && committedTimeAtom() != null,
    `${idBase}.hasCommittedSelection`,
  )
  const hasDraftSelectionAtom = computed(
    () => draftDateAtom() != null && draftTimeAtom() != null,
    `${idBase}.hasDraftSelection`,
  )

  const committedValueAtom = computed(() => {
    const date = committedDateAtom()
    const time = committedTimeAtom()
    return date && time ? `${date}T${time}` : null
  }, `${idBase}.committedValue`)

  const draftValueAtom = computed(() => {
    const date = draftDateAtom()
    const time = draftTimeAtom()
    return date && time ? `${date}T${time}` : null
  }, `${idBase}.draftValue`)

  const parsedValueAtom = computed(
    () => parseDateTime(inputValueAtom(), localeAtom()),
    `${idBase}.parsedValue`,
  )

  const canCommitInputAtom = computed(() => {
    const parsed = parsedValueAtom()
    if (!parsed) return false
    return isDateTimeWithinBounds(parsed.full, minAtom(), maxAtom())
  }, `${idBase}.canCommitInput`)

  const inputInvalidAtom = computed(() => {
    const value = inputValueAtom().trim()
    return value.length > 0 && !canCommitInputAtom()
  }, `${idBase}.inputInvalid`)

  const todayAtom = computed(() => getTodayDate(timeZoneAtom()), `${idBase}.today`)

  const visibleDaysAtom = computed(
    () => buildVisibleDays(displayedYearAtom(), displayedMonthAtom(), todayAtom(), minAtom(), maxAtom()),
    `${idBase}.visibleDays`,
  )

  const selectedCellIdAtom = computed(() => {
    const selected = isOpenAtom() ? draftDateAtom() : committedDateAtom()
    return selected ? `${idBase}-day-${selected}` : null
  }, `${idBase}.selectedCellId`)

  const isDualCommitAtom = computed(() => true, `${idBase}.isDualCommit`)

  const syncInputFromCommitted = () => {
    const date = committedDateAtom()
    const time = committedTimeAtom()
    if (date && time) {
      inputValueAtom.set(formatDateTime({date, time, full: `${date}T${time}`}, localeAtom()))
      return
    }
    inputValueAtom.set('')
  }

  const setCommitted = (parsed: ParsedDateTime | null) => {
    const previous = committedValueAtom()
    if (parsed) {
      committedDateAtom.set(parsed.date)
      committedTimeAtom.set(parsed.time)
    } else {
      committedDateAtom.set(null)
      committedTimeAtom.set(null)
    }
    const next = committedValueAtom()
    if (previous !== next) {
      options.onCommit?.(next)
    }
  }

  const ensureDisplayedFromDate = (date: string | null) => {
    const parsed = date ? parseDateOnly(date) : null
    if (!parsed) return
    displayedYearAtom.set(parsed.year)
    displayedMonthAtom.set(parsed.month)
  }

  const ensureFocusedDate = () => {
    const preferred = draftDateAtom() ?? committedDateAtom() ?? todayAtom()
    if (preferred && isDateWithinBounds(preferred, minAtom(), maxAtom())) {
      focusedDateAtom.set(preferred)
      return
    }
    const firstEnabled = visibleDaysAtom().find((day) => !day.disabled)
    focusedDateAtom.set(firstEnabled?.date ?? null)
  }

  const commitDraftInternal = () => {
    if (disabledAtom() || readonlyAtom()) return false
    const date = draftDateAtom()
    const time = draftTimeAtom()
    if (!date || !time) return false

    const full = `${date}T${time}`
    if (!isDateTimeWithinBounds(full, minAtom(), maxAtom())) {
      return false
    }

    const parsed: ParsedDateTime = {date, time, full}
    setCommitted(parsed)
    inputValueAtom.set(formatDateTime(parsed, localeAtom()))
    isOpenAtom.set(false)
    isCalendarFocusedAtom.set(false)
    focusedDateAtom.set(date)
    return true
  }

  const open = action(() => {
    if (disabledAtom()) return
    isOpenAtom.set(true)
    isCalendarFocusedAtom.set(true)

    const committedDate = committedDateAtom()
    const committedTime = committedTimeAtom()
    if (committedDate && committedTime) {
      draftDateAtom.set(committedDate)
      draftTimeAtom.set(committedTime)
    } else {
      const parsedInput = parsedValueAtom()
      if (parsedInput && isDateTimeWithinBounds(parsedInput.full, minAtom(), maxAtom())) {
        draftDateAtom.set(parsedInput.date)
        draftTimeAtom.set(parsedInput.time)
      } else {
        draftDateAtom.set(todayAtom())
        draftTimeAtom.set(getNowTime(timeZoneAtom(), minuteStepAtom()))
      }
    }

    ensureDisplayedFromDate(draftDateAtom())
    ensureFocusedDate()
  }, `${idBase}.open`)

  const close = action(() => {
    isOpenAtom.set(false)
    isCalendarFocusedAtom.set(false)
    draftDateAtom.set(committedDateAtom())
    draftTimeAtom.set(committedTimeAtom())
    syncInputFromCommitted()
  }, `${idBase}.close`)

  const toggle = action(() => {
    if (isOpenAtom()) {
      close()
      return
    }
    open()
  }, `${idBase}.toggle`)

  const setInputValue = action((value: string) => {
    if (disabledAtom() || readonlyAtom()) return
    inputValueAtom.set(value)
    options.onInput?.(value)
  }, `${idBase}.setInputValue`)

  const commitInput = action(() => {
    if (disabledAtom() || readonlyAtom()) return
    const parsed = parsedValueAtom()
    if (!parsed) return
    if (!isDateTimeWithinBounds(parsed.full, minAtom(), maxAtom())) return

    setCommitted(parsed)
    draftDateAtom.set(parsed.date)
    draftTimeAtom.set(parsed.time)
    inputValueAtom.set(formatDateTime(parsed, localeAtom()))
    ensureDisplayedFromDate(parsed.date)
    focusedDateAtom.set(parsed.date)
    isOpenAtom.set(false)
    isCalendarFocusedAtom.set(false)
  }, `${idBase}.commitInput`)

  const clear = action(() => {
    if (disabledAtom() || readonlyAtom()) return
    setCommitted(null)
    draftDateAtom.set(null)
    draftTimeAtom.set(null)
    focusedDateAtom.set(null)
    inputValueAtom.set('')
    options.onClear?.()
  }, `${idBase}.clear`)

  const setDisabled = action((value: boolean) => {
    disabledAtom.set(value)
    if (value) close()
  }, `${idBase}.setDisabled`)

  const setReadonly = action((value: boolean) => {
    readonlyAtom.set(value)
  }, `${idBase}.setReadonly`)

  const setRequired = action((value: boolean) => {
    requiredAtom.set(value)
  }, `${idBase}.setRequired`)

  const setPlaceholder = action((value: string) => {
    placeholderAtom.set(value)
  }, `${idBase}.setPlaceholder`)

  const setLocale = action((value: string) => {
    localeAtom.set(value)
    syncInputFromCommitted()
  }, `${idBase}.setLocale`)

  const setTimeZone = action((value: DatePickerTimeZone) => {
    timeZoneAtom.set(value)
  }, `${idBase}.setTimeZone`)

  const setMin = action((value: string | null) => {
    minAtom.set(value)
  }, `${idBase}.setMin`)

  const setMax = action((value: string | null) => {
    maxAtom.set(value)
  }, `${idBase}.setMax`)

  const setMinuteStep = action((value: number) => {
    minuteStepAtom.set(clamp(Math.floor(value), 1, 60))
    const currentDraft = draftTimeAtom()
    if (currentDraft) {
      const normalized = normalizeTime(currentDraft, minuteStepAtom())
      if (normalized) draftTimeAtom.set(normalized)
    }
    const currentCommitted = committedTimeAtom()
    if (currentCommitted) {
      const normalized = normalizeTime(currentCommitted, minuteStepAtom())
      if (normalized) committedTimeAtom.set(normalized)
    }
  }, `${idBase}.setMinuteStep`)

  const setHourCycle = action((value: 12 | 24) => {
    hourCycleAtom.set(value)
  }, `${idBase}.setHourCycle`)

  const setDisplayedMonth = action((year: number, month: number) => {
    const normalized = normalizeYearMonth(year, month)
    displayedYearAtom.set(normalized.year)
    displayedMonthAtom.set(normalized.month)
    ensureFocusedDate()
  }, `${idBase}.setDisplayedMonth`)

  const moveMonth = action((offset: -1 | 1) => {
    const normalized = normalizeYearMonth(displayedYearAtom(), displayedMonthAtom() + offset)
    displayedYearAtom.set(normalized.year)
    displayedMonthAtom.set(normalized.month)
    ensureFocusedDate()
  }, `${idBase}.moveMonth`)

  const moveYear = action((offset: -1 | 1) => {
    const normalized = normalizeYearMonth(displayedYearAtom() + offset, displayedMonthAtom())
    displayedYearAtom.set(normalized.year)
    displayedMonthAtom.set(normalized.month)
    ensureFocusedDate()
  }, `${idBase}.moveYear`)

  const setFocusedDate = action((date: string | null) => {
    if (date == null) {
      focusedDateAtom.set(null)
      return
    }
    if (!isDateWithinBounds(date, minAtom(), maxAtom())) return
    focusedDateAtom.set(date)
  }, `${idBase}.setFocusedDate`)

  const moveFocusedBy = (delta: number) => {
    const fallback = focusedDateAtom() ?? draftDateAtom() ?? committedDateAtom() ?? todayAtom()
    const next = addDaysUtc(fallback, delta)
    if (!next) return
    if (!isDateWithinBounds(next, minAtom(), maxAtom())) return
    focusedDateAtom.set(next)
    ensureDisplayedFromDate(next)
  }

  const moveFocusPreviousDay = action(() => {
    moveFocusedBy(-1)
  }, `${idBase}.moveFocusPreviousDay`)

  const moveFocusNextDay = action(() => {
    moveFocusedBy(1)
  }, `${idBase}.moveFocusNextDay`)

  const moveFocusPreviousWeek = action(() => {
    moveFocusedBy(-7)
  }, `${idBase}.moveFocusPreviousWeek`)

  const moveFocusNextWeek = action(() => {
    moveFocusedBy(7)
  }, `${idBase}.moveFocusNextWeek`)

  const selectDraftDate = action((date: string) => {
    if (disabledAtom() || readonlyAtom()) return
    if (!isDateWithinBounds(date, minAtom(), maxAtom())) return
    draftDateAtom.set(date)
    focusedDateAtom.set(date)
  }, `${idBase}.selectDraftDate`)

  const setDraftTime = action((time: string) => {
    if (disabledAtom() || readonlyAtom()) return
    const normalized = normalizeTime(time, minuteStepAtom())
    if (!normalized) return
    draftTimeAtom.set(normalized)
  }, `${idBase}.setDraftTime`)

  const jumpToNow = action(() => {
    if (disabledAtom() || readonlyAtom()) return
    const date = getTodayDate(timeZoneAtom())
    const time = getNowTime(timeZoneAtom(), minuteStepAtom())
    draftDateAtom.set(date)
    draftTimeAtom.set(time)
    focusedDateAtom.set(date)
    ensureDisplayedFromDate(date)
  }, `${idBase}.jumpToNow`)

  const commitDraft = action(() => {
    commitDraftInternal()
  }, `${idBase}.commitDraft`)

  const cancelDraft = action(() => {
    if (!isOpenAtom()) return
    draftDateAtom.set(committedDateAtom())
    draftTimeAtom.set(committedTimeAtom())
    focusedDateAtom.set(committedDateAtom())
    syncInputFromCommitted()
  }, `${idBase}.cancelDraft`)

  const handleInputKeyDown = action((event: DatePickerKeyboardEventLike) => {
    if (disabledAtom()) return

    if (event.key === 'Escape' && isOpenAtom() && (options.closeOnEscape ?? true)) {
      event.preventDefault?.()
      close()
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault?.()
      commitInput()
      return
    }

    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === ' ' ||
      event.key === 'Spacebar'
    ) {
      event.preventDefault?.()
      open()
    }
  }, `${idBase}.handleInputKeyDown`)

  const handleDialogKeyDown = action((event: DatePickerKeyboardEventLike) => {
    if (event.key === 'Escape' && (options.closeOnEscape ?? true)) {
      event.preventDefault?.()
      close()
    }
  }, `${idBase}.handleDialogKeyDown`)

  const handleCalendarKeyDown = action((event: DatePickerKeyboardEventLike) => {
    if (!isOpenAtom()) return

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault?.()
        moveFocusPreviousDay()
        return
      case 'ArrowRight':
        event.preventDefault?.()
        moveFocusNextDay()
        return
      case 'ArrowUp':
        event.preventDefault?.()
        moveFocusPreviousWeek()
        return
      case 'ArrowDown':
        event.preventDefault?.()
        moveFocusNextWeek()
        return
      case 'PageUp':
        event.preventDefault?.()
        if (event.shiftKey) {
          moveYear(-1)
        } else {
          moveMonth(-1)
        }
        return
      case 'PageDown':
        event.preventDefault?.()
        if (event.shiftKey) {
          moveYear(1)
        } else {
          moveMonth(1)
        }
        return
      case 'Home': {
        event.preventDefault?.()
        const focused = focusedDateAtom()
        if (!focused) return
        const parts = parseDateOnly(focused)
        if (!parts) return
        const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0))
        const weekday = date.getUTCDay()
        const next = addDaysUtc(focused, -weekday)
        if (next) setFocusedDate(next)
        return
      }
      case 'End': {
        event.preventDefault?.()
        const focused = focusedDateAtom()
        if (!focused) return
        const parts = parseDateOnly(focused)
        if (!parts) return
        const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0))
        const weekday = date.getUTCDay()
        const next = addDaysUtc(focused, 6 - weekday)
        if (next) setFocusedDate(next)
        return
      }
      case 'Enter': {
        event.preventDefault?.()

        if (event.ctrlKey) {
          commitDraft()
          return
        }

        const focused = focusedDateAtom()
        if (!focused) return
        selectDraftDate(focused)
        return
      }
      case ' ':
      case 'Spacebar': {
        event.preventDefault?.()
        const focused = focusedDateAtom()
        if (!focused) return
        selectDraftDate(focused)
        return
      }
      case 'Escape':
        if (options.closeOnEscape ?? true) {
          event.preventDefault?.()
          close()
        }
        return
      default:
        return
    }
  }, `${idBase}.handleCalendarKeyDown`)

  const handleTimeKeyDown = action((event: DatePickerKeyboardEventLike) => {
    if (event.key === 'Enter') {
      event.preventDefault?.()
      commitDraft()
      return
    }
    if (event.key === 'Escape' && (options.closeOnEscape ?? true)) {
      event.preventDefault?.()
      close()
    }
  }, `${idBase}.handleTimeKeyDown`)

  const handleOutsidePointer = action(() => {
    if (!isOpenAtom()) return
    close()
  }, `${idBase}.handleOutsidePointer`)

  const getDraftTimeOrDefault = () => draftTimeAtom() ?? committedTimeAtom() ?? '00:00'

  const updateHourSegment = (segment: string) => {
    const digits = segment.replace(/\D/g, '')
    if (digits.length === 0) return
    const hour = clamp(Number(digits.slice(-2)), 0, 23)
    const current = getDraftTimeOrDefault()
    const minute = current.split(':')[1] ?? '00'
    setDraftTime(`${twoDigits(hour)}:${minute}`)
  }

  const updateMinuteSegment = (segment: string) => {
    const digits = segment.replace(/\D/g, '')
    if (digits.length === 0) return
    const minute = clamp(Number(digits.slice(-2)), 0, 59)
    const current = getDraftTimeOrDefault()
    const hour = current.split(':')[0] ?? '00'
    setDraftTime(`${hour}:${twoDigits(minute)}`)
  }

  const contracts: DatePickerContracts = {
    getInputProps() {
      return {
        id: `${idBase}-input`,
        role: 'combobox',
        tabindex: '0',
        autocomplete: 'off',
        disabled: disabledAtom(),
        readonly: readonlyAtom() ? true : undefined,
        required: requiredAtom() ? true : undefined,
        value: inputValueAtom(),
        placeholder: placeholderAtom(),
        'aria-haspopup': 'dialog',
        'aria-expanded': isOpenAtom() ? 'true' : 'false',
        'aria-controls': `${idBase}-dialog`,
        'aria-activedescendant': isOpenAtom() ? (selectedCellIdAtom() ?? undefined) : undefined,
        'aria-invalid': inputInvalidAtom() ? 'true' : undefined,
        'aria-label': options.ariaLabel,
        onInput: setInputValue,
        onKeyDown: handleInputKeyDown,
        onFocus: () => {
          isInputFocusedAtom.set(true)
        },
        onBlur: () => {
          isInputFocusedAtom.set(false)
        },
      }
    },
    getDialogProps() {
      return {
        id: `${idBase}-dialog`,
        role: 'dialog',
        tabindex: '-1',
        hidden: !isOpenAtom(),
        'aria-modal': 'true',
        'aria-label': options.ariaLabel ?? 'Select date and time',
        onKeyDown: handleDialogKeyDown,
        onPointerDownOutside: handleOutsidePointer,
      }
    },
    getCalendarGridProps() {
      return {
        id: `${idBase}-grid`,
        role: 'grid',
        tabindex: '-1',
        'aria-label': 'Calendar',
        onKeyDown: handleCalendarKeyDown,
      }
    },
    getCalendarDayProps(date: string) {
      const day = visibleDaysAtom().find((item) => item.date === date)
      const dayDisabled = !day || day.disabled || disabledAtom() || readonlyAtom()
      return {
        id: `${idBase}-day-${date}`,
        role: 'gridcell',
        tabindex: focusedDateAtom() === date ? '0' : '-1',
        'aria-selected': draftDateAtom() === date ? 'true' : 'false',
        'aria-disabled': dayDisabled ? 'true' : undefined,
        'aria-current': day?.isToday ? 'date' : undefined,
        'data-date': date,
        onClick: () => {
          selectDraftDate(date)
        },
        onMouseEnter: () => {
          setFocusedDate(date)
        },
      }
    },
    getMonthNavButtonProps(direction: 'prev' | 'next') {
      return {
        id: `${idBase}-month-${direction}`,
        role: 'button',
        tabindex: '0',
        'aria-label': direction === 'prev' ? 'Previous month' : 'Next month',
        onClick: () => {
          moveMonth(direction === 'prev' ? -1 : 1)
        },
      }
    },
    getYearNavButtonProps(direction: 'prev' | 'next') {
      return {
        id: `${idBase}-year-${direction}`,
        role: 'button',
        tabindex: '0',
        'aria-label': direction === 'prev' ? 'Previous year' : 'Next year',
        onClick: () => {
          moveYear(direction === 'prev' ? -1 : 1)
        },
      }
    },
    getHourInputProps() {
      const [hour] = getDraftTimeOrDefault().split(':')
      return {
        id: `${idBase}-time-hour`,
        type: 'text',
        inputmode: 'numeric',
        'aria-label': 'Hours',
        value: hour ?? '00',
        minlength: '2',
        maxlength: '2',
        disabled: disabledAtom(),
        readonly: readonlyAtom(),
        onInput: updateHourSegment,
        onKeyDown: handleTimeKeyDown,
      }
    },
    getMinuteInputProps() {
      const [, minute] = getDraftTimeOrDefault().split(':')
      return {
        id: `${idBase}-time-minute`,
        type: 'text',
        inputmode: 'numeric',
        'aria-label': 'Minutes',
        value: minute ?? '00',
        minlength: '2',
        maxlength: '2',
        disabled: disabledAtom(),
        readonly: readonlyAtom(),
        onInput: updateMinuteSegment,
        onKeyDown: handleTimeKeyDown,
      }
    },
    getApplyButtonProps() {
      const draft = draftValueAtom()
      const valid = draft ? isDateTimeWithinBounds(draft, minAtom(), maxAtom()) : false
      return {
        id: `${idBase}-apply`,
        role: 'button',
        tabindex: '0',
        'aria-label': 'Apply',
        disabled: disabledAtom() || readonlyAtom() || !valid,
        onClick: () => {
          commitDraft()
        },
      }
    },
    getCancelButtonProps() {
      return {
        id: `${idBase}-cancel`,
        role: 'button',
        tabindex: '0',
        'aria-label': 'Cancel',
        disabled: disabledAtom(),
        onClick: () => {
          cancelDraft()
        },
      }
    },
    getClearButtonProps() {
      return {
        id: `${idBase}-clear`,
        role: 'button',
        tabindex: '0',
        'aria-label': 'Clear',
        disabled: disabledAtom() || readonlyAtom() || !hasCommittedSelectionAtom(),
        onClick: () => {
          clear()
        },
      }
    },
    getVisibleDays() {
      return visibleDaysAtom()
    },
  }

  const state: DatePickerState = {
    inputValue: inputValueAtom,
    isOpen: isOpenAtom,
    focusedDate: focusedDateAtom,
    committedDate: committedDateAtom,
    committedTime: committedTimeAtom,
    draftDate: draftDateAtom,
    draftTime: draftTimeAtom,
    displayedYear: displayedYearAtom,
    displayedMonth: displayedMonthAtom,
    isInputFocused: isInputFocusedAtom,
    isCalendarFocused: isCalendarFocusedAtom,
    disabled: disabledAtom,
    readonly: readonlyAtom,
    required: requiredAtom,
    placeholder: placeholderAtom,
    locale: localeAtom,
    timeZone: timeZoneAtom,
    min: minAtom,
    max: maxAtom,
    minuteStep: minuteStepAtom,
    hourCycle: hourCycleAtom,
    isDualCommit: isDualCommitAtom,
    hasCommittedSelection: hasCommittedSelectionAtom,
    hasDraftSelection: hasDraftSelectionAtom,
    committedValue: committedValueAtom,
    draftValue: draftValueAtom,
    parsedValue: parsedValueAtom,
    canCommitInput: canCommitInputAtom,
    inputInvalid: inputInvalidAtom,
    visibleDays: visibleDaysAtom,
    today: todayAtom,
    selectedCellId: selectedCellIdAtom,
  }

  const actions: DatePickerActions = {
    open,
    close,
    toggle,
    setInputValue,
    commitInput,
    clear,
    setDisabled,
    setReadonly,
    setRequired,
    setPlaceholder,
    setLocale,
    setTimeZone,
    setMin,
    setMax,
    setMinuteStep,
    setHourCycle,
    setDisplayedMonth,
    moveMonth,
    moveYear,
    setFocusedDate,
    moveFocusPreviousDay,
    moveFocusNextDay,
    moveFocusPreviousWeek,
    moveFocusNextWeek,
    selectDraftDate,
    setDraftTime,
    jumpToNow,
    commitDraft,
    cancelDraft,
    handleInputKeyDown,
    handleDialogKeyDown,
    handleCalendarKeyDown,
    handleTimeKeyDown,
    handleOutsidePointer,
  }

  return {
    state,
    actions,
    contracts,
  }
}
