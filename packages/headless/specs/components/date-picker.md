# Date Picker Component Contract

## Purpose

`DatePicker` is a headless APG-aligned contract for a date+time input control with an editable text input and a popup calendar dialog. It combines combobox-style trigger behavior with dialog-based calendar and time selection. The component supports dual-mode commit: user edits to date/time are staged as draft state in the calendar/input and only pushed to committed value through explicit commit actions.

## Component Files

- `src/date-picker/index.ts` - model and public `createDatePicker` API
- `src/date-picker/date-picker.test.ts` - unit behavior tests

## Public API

### `createDatePicker(options)`

#### CreateDatePickerOptions

| Option           | Type                                                | Default                                        | Description                                                                 |
| ---------------- | --------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| `idBase`         | `string`                                            | `'date-picker'`                                | Prefix for generated IDs                                                    |
| `value`          | `string \| null`                                    | `null`                                         | Initial committed value in `YYYY-MM-DDTHH:mm` format (24-hour)              |
| `required`       | `boolean`                                           | `false`                                        | Required marker for input validation                                        |
| `disabled`       | `boolean`                                           | `false`                                        | Component disabled state                                                    |
| `readonly`       | `boolean`                                           | `false`                                        | Prevents user-driven changes                                                |
| `placeholder`    | `string`                                            | `'Select date and time'`                       | Placeholder for the input                                                   |
| `locale`         | `string`                                            | `'en-US'`                                      | Locale for label/date formatting                                            |
| `timeZone`       | `'local' \| 'utc'`                                  | `'local'`                                      | Formatting/parsing basis for value interpretation                           |
| `min`            | `string`                                            | `null`                                         | Inclusive minimum `YYYY-MM-DDTHH:mm` value                                  |
| `max`            | `string`                                            | `null`                                         | Inclusive maximum `YYYY-MM-DDTHH:mm` value                                  |
| `minuteStep`     | `number`                                            | `1`                                            | Minute granularity for draft time updates                                   |
| `hourCycle`      | `12 \| 24`                                          | `24`                                           | Hour input rendering format                                                 |
| `closeOnEscape`  | `boolean`                                           | `true`                                         | Whether Escape closes dialog                                                |
| `ariaLabel`      | `string`                                            | `'Select date and time'`                       | Dialog accessible label                                                     |
| `parseDateTime`  | `(value: string, locale: string) => ParsedDateTime  | null`                                          | default parser for `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`, and `YYYY-MM-DD HH:mm` | Hook to customize editable parsing   |
| `formatDateTime` | `(value: ParsedDateTime, locale: string) => string` | default formatter returning `YYYY-MM-DDTHH:mm` | Hook to control displayed input text                                        |
| `onInput`        | `(value: string) => void`                           | `undefined`                                    | Called after user typing changes input text                                 |
| `onCommit`       | `(value: string                                     | null) => void`                                 | `undefined`                                                                 | Called after committed value changes |
| `onClear`        | `() => void`                                        | `undefined`                                    | Called after `clear()` succeeds                                             |

#### Types

```ts
interface ParsedDateTime {
  date: string // YYYY-MM-DD
  time: string // HH:mm
  full: string // YYYY-MM-DDTHH:mm
}

interface CalendarDay {
  date: string // YYYY-MM-DD
  month: 'prev' | 'current' | 'next'
  inRange: boolean
  isToday: boolean
  disabled: boolean
}
```

## State Signals (signal-backed)

| Signal                    | Type                     | Derived | Description                                                                |
| ------------------------- | ------------------------ | ------- | -------------------------------------------------------------------------- |
| `inputValue()`            | `string`                 | No      | Current editable text shown in the input                                   |
| `isOpen()`                | `boolean`                | No      | Calendar dialog open state                                                 |
| `focusedDate()`           | `string \| null`         | No      | Focused day in the visible grid (YYYY-MM-DD)                               |
| `committedDate()`         | `string \| null`         | No      | Committed date part                                                        |
| `committedTime()`         | `string \| null`         | No      | Committed time part in `HH:mm`                                             |
| `draftDate()`             | `string \| null`         | No      | Working date value while dialog is open                                    |
| `draftTime()`             | `string \| null`         | No      | Working time value while dialog is open                                    |
| `displayedYear()`         | `number`                 | No      | Calendar year currently rendered                                           |
| `displayedMonth()`        | `number`                 | No      | Calendar month currently rendered (1-12)                                   |
| `isInputFocused()`        | `boolean`                | No      | Tracks whether combobox input is focused                                   |
| `isCalendarFocused()`     | `boolean`                | No      | Tracks whether calendar/time zone is focused                               |
| `disabled()`              | `boolean`                | No      | Reflects disabled mode                                                     |
| `readonly()`              | `boolean`                | No      | Reflects readonly mode                                                     |
| `required()`              | `boolean`                | No      | Reflects required mode                                                     |
| `placeholder()`           | `string`                 | No      | Current placeholder                                                        |
| `locale()`                | `string`                 | No      | Active locale                                                              |
| `timeZone()`              | `'local' \| 'utc'`       | No      | Active timezone mode                                                       |
| `min()`                   | `string \| null`         | No      | Lower bound                                                                |
| `max()`                   | `string \| null`         | No      | Upper bound                                                                |
| `minuteStep()`            | `number`                 | No      | Minute step                                                                |
| `hourCycle()`             | `12 \| 24`               | No      | Hour cycle                                                                 |
| `isDualCommit()`          | `boolean`                | Yes     | Always `true` for this component spec                                      |
| `hasCommittedSelection()` | `boolean`                | Yes     | `committedDate() !== null && committedTime() !== null`                     |
| `hasDraftSelection()`     | `boolean`                | Yes     | `draftDate() !== null && draftTime() !== null`                             |
| `committedValue()`        | `string \| null`         | Yes     | `hasCommittedSelection() ? `${committedDate()}T${committedTime()}` : null` |
| `draftValue()`            | `string \| null`         | Yes     | `hasDraftSelection() ? `${draftDate()}T${draftTime()}` : null`             |
| `canCommitInput()`        | `boolean`                | Yes     | `parsedValue() !== null`                                                   |
| `parsedValue()`           | `ParsedDateTime \| null` | Yes     | result of `parseDateTime(inputValue(), locale())`                          |
| `inputInvalid()`          | `boolean`                | Yes     | `inputValue().length > 0 && !canCommitInput()`                             |
| `visibleDays()`           | `readonly CalendarDay[]` | Yes     | full 6x7 visible matrix for current `displayedMonth`/`displayedYear`       |
| `today()`                 | `string`                 | Yes     | Local current date in `YYYY-MM-DD`                                         |
| `selectedCellId()`        | `string \| null`         | Yes     | `isOpen() ? draftDate() : committedDate()`                                 |

## Actions

- `open()` — opens dialog, initializes `draftDate/draftTime` from committed state and syncs focused date to first selectable cell
- `close()` — closes dialog, clears calendar focus and restores input focus logic
- `toggle()` — delegates to `open`/`close`
- `setInputValue(value: string)` — updates input text only (user typing); updates `inputInvalid` through derived parse result
- `commitInput()` — commits parsed `inputValue` into `committedDate/committedTime` when valid and in range
- `clear()` — clears input and both committed/draft values
- `setDisabled(value: boolean)` — updates disabled state (clears open popover)
- `setReadonly(value: boolean)` — updates readonly state
- `setRequired(value: boolean)` — updates required state
- `setPlaceholder(value: string)` — updates placeholder
- `setLocale(value: string)` — updates locale and re-renders formatted values
- `setTimeZone(value: 'local' | 'utc')` — updates timezone mode (affects `today()` and `jumpToNow()` sources)
- `setMin(value: string | null)` / `setMax(value: string | null)` — updates boundaries
- `setMinuteStep(value: number)` — updates minute grid/validation granularity
- `setHourCycle(value: 12 | 24)` — updates time parsing/formatting behavior
- `setDisplayedMonth(year: number, month: number)` — updates visible calendar month/year
- `moveMonth(offset: -1 | 1)` — prev/next month navigation
- `moveYear(offset: -1 | 1)` — prev/next year navigation
- `setFocusedDate(date: string | null)` — sets focused calendar day when valid
- `moveFocusPreviousDay()` / `moveFocusNextDay()` — keyboard date focus navigation
- `moveFocusPreviousWeek()` / `moveFocusNextWeek()` — keyboard date focus navigation
- `selectDraftDate(date: string)` — update draft date only (no commit in dual mode)
- `setDraftTime(time: string)` — set draft time only (format `HH:mm`); value is normalized by snapping to `minuteStep`
- `jumpToNow()` — sets draft to current local date/time and brings it into view (no commit)
- `commitDraft()` — explicit dual-mode commit from dialog (sets committed state and closes)
- `cancelDraft()` — discards draft and restores draft from committed state
- `handleInputKeyDown(event)` — keyboard routing on input target
- `handleDialogKeyDown(event)` — keyboard routing on dialog wrapper
- `handleCalendarKeyDown(event)` — keyboard routing on grid (day navigation/selection)
- `handleTimeKeyDown(event)` — keyboard routing for hour/minute controls
- `handleOutsidePointer()` — dialog dismissal hook from outside pointer events

## Contracts

### Contract Methods

- `getInputProps()` → `DatePickerInputProps`
- `getDialogProps()` → `DatePickerDialogProps`
- `getCalendarGridProps()` → `DatePickerCalendarGridProps`
- `getCalendarDayProps(date: string)` → `DatePickerCalendarDayProps`
- `getMonthNavButtonProps(direction: 'prev' | 'next')` → `DatePickerMonthNavButtonProps`
- `getYearNavButtonProps(direction: 'prev' | 'next')` → `DatePickerYearNavButtonProps`
- `getHourInputProps()` → `DatePickerTimeSegmentProps`
- `getMinuteInputProps()` → `DatePickerTimeSegmentProps`
- `getApplyButtonProps()` → `DatePickerButtonProps`
- `getCancelButtonProps()` → `DatePickerButtonProps`
- `getClearButtonProps()` → `DatePickerButtonProps`
- `getVisibleDays()` → `readonly CalendarDay[]`

### Contract Return Types

```ts
interface DatePickerInputProps {
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
  onKeyDown: (event: KeyboardEvent) => void
  onFocus: () => void
  onBlur: () => void
}

interface DatePickerDialogProps {
  id: string
  role: 'dialog'
  tabindex: '-1'
  hidden: boolean
  'aria-modal': 'true'
  'aria-label': string
  onKeyDown: (event: KeyboardEvent) => void
  onPointerDownOutside: () => void
}

interface DatePickerCalendarGridProps {
  id: string
  role: 'grid'
  tabindex: '-1'
  'aria-label': string
  onKeyDown: (event: KeyboardEvent) => void
}

interface DatePickerCalendarDayProps {
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

interface DatePickerMonthNavButtonProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-label': 'Previous month' | 'Next month'
  onClick: () => void
}

interface DatePickerYearNavButtonProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-label': 'Previous year' | 'Next year'
  onClick: () => void
}

interface DatePickerTimeSegmentProps {
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
  onKeyDown: (event: KeyboardEvent) => void
}

interface DatePickerButtonProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-label': string
  disabled: boolean
  onClick: () => void
}
```

> Calendar day ids are generated deterministically as `${idBase}-day-${date}`.

### APG and A11y Contract

- Input follows combobox conventions with popup trigger:
  - `role='combobox'`
  - `aria-haspopup='dialog'`
  - `aria-expanded`, `aria-controls`, `aria-activedescendant`
- Dialog:
  - `role='dialog'`, `aria-modal='true'`, `hidden` synced to `!isOpen()`
  - Note: the contract always provides `'aria-modal': 'true'`; `hidden` is the primary open/close signal.
- Calendar structure:
  - calendar uses `role='grid'`
  - day cells use `role='gridcell'`
  - one logical `aria-current='date'` on the current day when visible
- Required states conveyed via attributes:
  - `aria-invalid='true'` on input when parse fails or value out of range
  - `aria-required='true'` is set when required and no committed value is selected

## Behavior Contract

### Dual Commit Model

- Draft and committed state are separate by design.
- Day/time selection in dialog updates draft only.
- Input typing updates `inputValue` only.
- `commitInput()` or `commitDraft()` are the **only** ways that mutate committed state in non-disabled/ non-readonly mode.
- `close()` never commits draft in dual commit mode.

### Editable Input + Calendar

- Input is editable at all times (unless `readonly` / `disabled`).
- Typing updates `inputValue` immediately and emits `onInput` callback.
- Valid parsed input can be committed via `commitInput()` (typically on Enter).
- Invalid text does not change committed state and keeps `inputInvalid=true`.
- Enter in dialog footer applies draft through `commitDraft()`.

### Calendar Interaction

- Opening dialog sets `displayedMonth/displayedYear` to committed value month if present, otherwise current month.
- Focused day defaults to committed day if exists, otherwise today if selectable, otherwise first selectable day in visible month.
- Out-of-range and disabled dates are skipped by navigation and cannot be selected.
- `selectDraftDate` never mutates committed state in dual mode.
- `commitDraft` applies draft date/time and closes if successful.
- `cancelDraft` discards draft and reverts to committed value.

### Keyboard

#### Closed input state

- `ArrowDown` / `ArrowUp` / `Space` opens dialog and positions focus in calendar.
- `Enter` calls `commitInput()` (no-op if input is invalid / out of range).
- `Escape` has no effect when already closed.

#### Open dialog state

- `Escape` closes without commit when `closeOnEscape=true`.
- `Tab` cycles between calendar grid, hour input, minute input, and Apply/Cancel controls.
- Arrow navigation in grid follows APG calendar keyboard model:
  - Left/Right: previous/next day
  - Up/Down: previous/next week
  - PageUp/PageDown: previous/next month
  - Shift+PageUp/PageDown: previous/next year
- `Home`/`End`: first/last day in current week
- `Enter`/`Space` on focused day updates draft and sets `selectedCellId` but does not commit
- `Ctrl+Enter` or Enter on Apply button calls `commitDraft()`

## Transition Model

### Core State Transitions

| Event / action                  | Guards                                                                   | Next state                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `open()`                        | `!isOpen()` and `!disabled()`                                            | `isOpen=true`, `draftDate=committedDate`, `draftTime=committedTime`, `focusedDate` initialized                |
| `close()`                       | any                                                                      | `isOpen=false`, `draftDate=committedDate`, `draftTime=committedTime`                                          |
| `clear()`                       | `!disabled() && !readonly()`                                             | all value signals to `null`, `inputValue=''`, `isOpen` unchanged                                              |
| `setInputValue(v)`              | any                                                                      | `inputValue=v` only                                                                                           |
| `commitInput()`                 | `!disabled() && !readonly() && canCommitInput()` and within bounds       | `committedDate=parsed.date`, `committedTime=parsed.time`, `inputValue=formatDateTime(parsed)`, `isOpen=false` |
| `commitInput()`                 | input invalid or out of range                                            | no-op on committed state, `inputInvalid=true`                                                                 |
| `setDisplayedMonth(year,month)` | valid month/year                                                         | `displayedMonth/year` updated                                                                                 |
| `moveMonth(-1/1)`               | any                                                                      | `displayedMonth/year` shifted                                                                                 |
| `moveYear(-1/1)`                | any                                                                      | `displayedYear` shifted                                                                                       |
| `setFocusedDate(d)`             | valid, non-disabled date in current month view                           | `focusedDate=d`                                                                                               |
| `selectDraftDate(d)`            | date visible/selectable                                                  | `draftDate=d`                                                                                                 |
| `setDraftTime(t)`               | valid time format                                                        | `draftTime=normalizedToMinuteStep(t)`                                                                         |
| `commitDraft()`                 | `isOpen()` and `hasDraftSelection()` and both draft values within bounds | `committedDate=draftDate`, `committedTime=draftTime`, `inputValue=formatDateTime(draft)`, `isOpen=false`      |
| `commitDraft()`                 | draft invalid                                                            | no-op                                                                                                         |
| `cancelDraft()`                 | `isOpen()`                                                               | `draftDate=committedDate`, `draftTime=committedTime`, `inputInvalid=false`, `isOpen=true`                     |
| `jumpToNow()`                   | `!disabled() && !readonly()`                                             | `draftDate=today`, `draftTime=currentTimeAlignedToStep`, calendar month set to draft month                    |

### Keyboard Transitions

| Key context              | Action triggered                                                        |
| ------------------------ | ----------------------------------------------------------------------- |
| Closed, input focused    | `ArrowDown`/`ArrowUp`/`Space` -> `open()`; `Enter` -> `commitInput()`   |
| Open, calendar focus     | `ArrowRight`/`ArrowLeft` -> `moveFocusNextDay` / `moveFocusPreviousDay` |
| Open, calendar focus     | `ArrowDown`/`ArrowUp` -> `moveFocusNextWeek` / `moveFocusPreviousWeek`  |
| Open, calendar focus     | `PageDown`/`PageUp` -> `moveMonth(1)` / `moveMonth(-1)`                 |
| Open, calendar focus     | `Shift+PageDown`/`Shift+PageUp` -> `moveYear(1)` / `moveYear(-1)`       |
| Open, focused day        | `Enter`/`Space` -> `selectDraftDate(focusedDate)`                       |
| Open, draft form         | `Esc` -> `close()`                                                      |
| Open, focused time input | `Enter` -> `commitDraft()`                                              |

## Invariants

1. `isDualCommit()` is always `true` and never writable.
2. `committedValue` is `null` iff either `committedDate()` or `committedTime()` is `null`.
3. `draftDate()` and `draftTime()` are always restored from committed values when dialog closes without commit.
4. `visibleDays()` always contains day entries for exactly 6 calendar rows (42 cells).
5. For every entry in `visibleDays()`, `inRange === (min <= date && date <= max)` when min/max are provided; when min/max are absent, `inRange === true`.
6. Disabled/readonly modes are no-op for commit, commitInput, draft mutations, and keyboard-triggered selection.
7. Day selection cannot land on dates where `inRange === false`.
8. `inputInvalid` is `true` exactly when `inputValue` is non-empty and `parsedValue` is `null` or out of bounds.
9. `getInputProps().'aria-expanded'` equals `isOpen() ? 'true' : 'false'`.
10. `getDialogProps().hidden` is `!isOpen()`.
11. `onInput` callback is only invoked from `setInputValue`, never from programmatic `set` actions.
12. `onCommit` callback is invoked only from successful `commitInput` and `commitDraft`.
13. `commitDraft()` never commits invalid draft values.

## Adapter Expectations

UIKit (`cv-date-picker`) binds to the model as follows:

- Signals read:
  - `state.inputValue()` / `state.isOpen()` / `state.isInputFocused()` / `state.isCalendarFocused()`
  - `state.disabled()` / `state.readonly()` / `state.required()` / `state.placeholder()`
  - `state.visibleDays()` / `state.focusedDate()` / `state.displayedMonth()` / `state.displayedYear()`
  - `state.hasCommittedSelection()` / `state.committedValue()` / `state.canCommitInput()` / `state.inputInvalid()`
  - `state.min()` / `state.max()` / `state.hourCycle()` / `state.minuteStep()`

- Actions called:
  - `open()` / `close()` / `toggle()`
  - `setInputValue(value)` / `commitInput()` / `clear()`
  - `moveMonth()` / `moveYear()` / `setDisplayedMonth()` / `setFocusedDate()`
  - `moveFocusNextDay()` / `moveFocusPreviousDay()` / `moveFocusNextWeek()` / `moveFocusPreviousWeek()`
  - `selectDraftDate()` / `setDraftTime()` / `commitDraft()` / `cancelDraft()` / `jumpToNow()`
  - `handleInputKeyDown()` / `handleDialogKeyDown()` / `handleCalendarKeyDown()` / `handleTimeKeyDown()` / `handleOutsidePointer()`

- Contracts spread:
  - `contracts.getInputProps()` on the trigger input
  - `contracts.getDialogProps()` on the popup shell
  - `contracts.getCalendarGridProps()` on calendar body
  - `contracts.getCalendarDayProps(date)` for each visible day
  - `contracts.getMonthNavButtonProps()` and `contracts.getYearNavButtonProps()`
  - `contracts.getHourInputProps()` / `contracts.getMinuteInputProps()`
  - `contracts.getApplyButtonProps()` / `contracts.getCancelButtonProps()` / `contracts.getClearButtonProps()`

## Minimum Test Matrix

- open/close behavior, focus initialization, and outside-dismiss behavior
- editable input typing and validation flow
- dual commit path: dialog selection updates draft only
- apply/cancel path: commitDraft and cancelDraft semantics
- keyboard calendar navigation and focused-cell updates
- month/year navigation boundaries and disabled date skipping
- min/max boundary enforcement in input and draft selection
- minute-step rounding/validation behavior
- ARIA contract surfaces from all spread props
- disabled/readonly behavior blocking all mutating actions
