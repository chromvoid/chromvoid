import {
  createDatePicker,
  type DatePickerKeyboardEventLike,
  type DatePickerModel,
  type DatePickerTimeZone,
} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {FormAssociatedReatomElement} from '../form-associated/FormAssociatedReatomElement'
import type {FormAssociatedValidity} from '../form-associated/withFormAssociated'

export interface CVDatePickerInputEventDetail {
  value: string
  inputValue: string
  open: boolean
  invalid: boolean
}

export interface CVDatePickerChangeEventDetail {
  value: string
  previousValue: string
  source: 'input' | 'dialog'
}

type CVDatePickerSize = 'small' | 'medium' | 'large'

let cvDatePickerNonce = 0

export class CVDatePicker extends FormAssociatedReatomElement {
  static elementName = 'cv-date-picker'

  static get properties() {
    return {
      name: {type: String},
      value: {type: String, reflect: true},
      open: {type: Boolean, reflect: true},
      disabled: {type: Boolean, reflect: true},
      readonly: {type: Boolean, reflect: true},
      required: {type: Boolean, reflect: true},
      placeholder: {type: String},
      size: {type: String, reflect: true},
      locale: {type: String},
      timeZone: {type: String, attribute: 'time-zone', reflect: true},
      min: {type: String},
      max: {type: String},
      minuteStep: {type: Number, attribute: 'minute-step'},
      hourCycle: {type: Number, attribute: 'hour-cycle'},
      closeOnEscape: {type: Boolean, attribute: 'close-on-escape', reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
      inputInvalid: {type: Boolean, attribute: 'input-invalid', reflect: true},
      hasValue: {type: Boolean, attribute: 'has-value', reflect: true},
    }
  }

  declare name: string
  declare value: string
  declare open: boolean
  declare disabled: boolean
  declare readonly: boolean
  declare required: boolean
  declare placeholder: string
  declare size: CVDatePickerSize
  declare locale: string
  declare timeZone: DatePickerTimeZone
  declare min: string
  declare max: string
  declare minuteStep: number
  declare hourCycle: 12 | 24
  declare closeOnEscape: boolean
  declare ariaLabel: string
  declare inputInvalid: boolean
  declare hasValue: boolean

  private readonly idBase = `cv-date-picker-${++cvDatePickerNonce}`
  private model: DatePickerModel
  private pendingCommitSource: 'input' | 'dialog' = 'input'
  private readonly documentPointerDownListener: (event: Event) => void
  private defaultValue = ''
  private didCaptureDefaultValue = false

  constructor() {
    super()

    this.name = ''
    this.value = ''
    this.open = false
    this.disabled = false
    this.readonly = false
    this.required = false
    this.placeholder = 'Select date and time'
    this.size = 'medium'
    this.locale = 'en-US'
    this.timeZone = 'local'
    this.min = ''
    this.max = ''
    this.minuteStep = 1
    this.hourCycle = 24
    this.closeOnEscape = true
    this.ariaLabel = ''
    this.inputInvalid = false
    this.hasValue = false

    this.model = this.createModel()
    this.documentPointerDownListener = this.handleDocumentPointerDown.bind(this)
    this.syncHostStateFromModel()
  }

  static styles = [
    css`
      :host {
        display: inline-block;
        inline-size: var(--cv-date-picker-min-width, 260px);
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-space-2, 8px);
      }

      [part='input-wrap'] {
        display: flex;
        align-items: center;
        gap: var(--cv-space-2, 8px);
        min-block-size: var(--cv-date-picker-input-min-height, 36px);
        padding: var(--cv-date-picker-input-padding-block, var(--cv-space-2, 8px))
          var(--cv-date-picker-input-padding-inline, var(--cv-space-3, 12px));
        border: 1px solid var(--cv-color-border, #2a3245);
        border-radius: var(--cv-date-picker-border-radius, var(--cv-radius-md, 10px));
        background: var(--cv-color-surface, #141923);
      }

      [part='prefix'],
      [part='suffix'] {
        display: inline-flex;
        align-items: center;
      }

      [part='label'] {
        flex: 1;
        min-inline-size: 0;
        display: inline-flex;
      }

      [part='input'] {
        inline-size: 100%;
        border: none;
        outline: none;
        background: transparent;
        color: var(--cv-color-text, #e8ecf6);
        font: inherit;
      }

      [part='clear-button'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        color: var(--cv-color-text-muted, #9aa6bf);
        cursor: pointer;
        padding: 0;
      }

      [part='dialog'] {
        inline-size: var(--cv-date-picker-dialog-width, min(560px, calc(100vw - 32px)));
        display: grid;
        gap: var(--cv-space-2, 8px);
        padding: var(--cv-space-3, 12px);
        border-radius: var(--cv-date-picker-border-radius, var(--cv-radius-md, 10px));
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
      }

      [part='dialog'][hidden] {
        display: none;
      }

      [part='calendar-shell'] {
        display: grid;
        grid-template-columns: auto auto 1fr auto auto;
        align-items: center;
        gap: var(--cv-space-2, 8px);
      }

      [part='month-label'] {
        justify-self: center;
      }

      [part='month-nav-button'],
      [part='year-nav-button'],
      [part='apply-button'],
      [part='cancel-button'] {
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        border-radius: var(--cv-radius-sm, 6px);
        cursor: pointer;
      }

      [part='calendar-grid'] {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: var(--cv-date-picker-day-gap, var(--cv-space-1, 4px));
      }

      [part='calendar-day'] {
        min-block-size: var(--cv-date-picker-day-size, 34px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: transparent;
        color: var(--cv-color-text, #e8ecf6);
        border-radius: var(--cv-radius-sm, 6px);
        cursor: pointer;
      }

      [part='calendar-day'][data-month='prev'],
      [part='calendar-day'][data-month='next'] {
        color: var(--cv-color-text-muted, #9aa6bf);
      }

      [part='calendar-day'][aria-selected='true'] {
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 22%, transparent);
      }

      [part='time-row'] {
        display: inline-flex;
        align-items: center;
        gap: var(--cv-space-2, 8px);
      }

      [part='hour-input'],
      [part='minute-input'] {
        inline-size: 3.5ch;
        text-align: center;
      }

      [part='actions'] {
        display: inline-flex;
        justify-content: flex-end;
        gap: var(--cv-date-picker-button-gap, var(--cv-space-2, 8px));
      }

      [part='dialog-caption'] {
        color: var(--cv-color-text-muted, #9aa6bf);
        font-size: 0.85em;
      }

      :host([size='small']) {
        --cv-date-picker-input-min-height: 30px;
        --cv-date-picker-input-padding-inline: var(--cv-space-2, 8px);
        --cv-date-picker-input-padding-block: var(--cv-space-1, 4px);
      }

      :host([size='large']) {
        --cv-date-picker-input-min-height: 42px;
        --cv-date-picker-input-padding-inline: var(--cv-space-4, 16px);
        --cv-date-picker-input-padding-block: var(--cv-space-2, 8px);
      }

      :host([disabled]) {
        opacity: 0.55;
      }

      :host([disabled]) [part='input-wrap'],
      :host([disabled]) [part='dialog'] {
        pointer-events: none;
      }

      :host([input-invalid]) [part='input-wrap'] {
        border-color: var(--cv-color-danger, #ff6b6b);
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.syncOutsidePointerListener()
    if (!this.didCaptureDefaultValue) {
      this.defaultValue = this.value
      this.didCaptureDefaultValue = true
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.syncOutsidePointerListener(true)
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('ariaLabel') || changedProperties.has('closeOnEscape')) {
      this.rebuildModel()
      return
    }

    if (changedProperties.has('disabled') && this.model.state.disabled() !== this.disabled) {
      this.model.actions.setDisabled(this.isEffectivelyDisabled())
    }

    if (changedProperties.has('readonly') && this.model.state.readonly() !== this.readonly) {
      this.model.actions.setReadonly(this.readonly)
    }

    if (changedProperties.has('required') && this.model.state.required() !== this.required) {
      this.model.actions.setRequired(this.required)
    }

    if (changedProperties.has('placeholder') && this.model.state.placeholder() !== this.placeholder) {
      this.model.actions.setPlaceholder(this.placeholder)
    }

    if (changedProperties.has('locale') && this.model.state.locale() !== this.locale) {
      this.model.actions.setLocale(this.locale)
    }

    if (changedProperties.has('timeZone')) {
      const normalizedTimeZone: DatePickerTimeZone = this.timeZone === 'utc' ? 'utc' : 'local'
      if (this.model.state.timeZone() !== normalizedTimeZone) {
        this.model.actions.setTimeZone(normalizedTimeZone)
      }
    }

    if (changedProperties.has('min') && this.model.state.min() !== this.toNullable(this.min)) {
      this.model.actions.setMin(this.toNullable(this.min))
    }

    if (changedProperties.has('max') && this.model.state.max() !== this.toNullable(this.max)) {
      this.model.actions.setMax(this.toNullable(this.max))
    }

    if (changedProperties.has('minuteStep') && this.model.state.minuteStep() !== this.minuteStep) {
      this.model.actions.setMinuteStep(this.minuteStep)
    }

    if (changedProperties.has('hourCycle') && this.model.state.hourCycle() !== this.hourCycle) {
      this.model.actions.setHourCycle(this.hourCycle)
    }

    if (changedProperties.has('value')) {
      this.syncModelFromExternalValue()
    }

    if (changedProperties.has('open') && this.model.state.isOpen() !== this.open) {
      if (this.open) {
        this.model.actions.open()
      } else {
        this.model.actions.close()
      }
    }

    this.syncHostStateFromModel()
    this.syncFormAssociatedState()
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    this.syncOutsidePointerListener()

    if (changedProperties.has('size')) {
      this.requestUpdate()
    }
  }

  private createModel(initialValue = this.value): DatePickerModel {
    return createDatePicker({
      idBase: this.idBase,
      value: this.toNullable(initialValue),
      required: this.required,
      disabled: this.isEffectivelyDisabled(),
      readonly: this.readonly,
      placeholder: this.placeholder,
      locale: this.locale,
      timeZone: this.timeZone === 'utc' ? 'utc' : 'local',
      min: this.toNullable(this.min),
      max: this.toNullable(this.max),
      minuteStep: this.minuteStep,
      hourCycle: this.hourCycle,
      closeOnEscape: this.closeOnEscape,
      ariaLabel: this.ariaLabel || undefined,
      onInput: (inputValue) => {
        this.handleHeadlessInput(inputValue)
      },
      onCommit: (nextValue) => {
        this.handleHeadlessCommit(nextValue)
      },
      onClear: () => {
        this.syncHostStateFromModel()
      },
    })
  }

  private rebuildModel(): void {
    const currentValue = this.model.state.committedValue() ?? this.value
    const isOpen = this.model.state.isOpen()

    this.model = this.createModel(currentValue)

    if (isOpen) {
      this.model.actions.open()
    }

    this.syncHostStateFromModel()
  }

  private toNullable(value: string): string | null {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  private syncModelFromExternalValue(): void {
    const nextValue = this.value.trim()
    const committedValue = this.model.state.committedValue() ?? ''
    if (nextValue === committedValue) return

    if (nextValue.length === 0) {
      this.pendingCommitSource = 'input'
      this.model.actions.clear()
      return
    }

    this.model.actions.setInputValue(nextValue)
    this.pendingCommitSource = 'input'
    this.model.actions.commitInput()
  }

  private syncHostStateFromModel(): void {
    const committedValue = this.model.state.committedValue() ?? ''
    const isOpen = this.model.state.isOpen()
    const inputInvalid = this.model.state.inputInvalid()
    const hasValue = this.model.state.hasCommittedSelection()

    if (this.value !== committedValue) {
      this.value = committedValue
    }

    if (this.open !== isOpen) {
      this.open = isOpen
    }

    if (this.inputInvalid !== inputInvalid) {
      this.inputInvalid = inputInvalid
    }

    if (this.hasValue !== hasValue) {
      this.hasValue = hasValue
    }

    this.syncFormAssociatedState()
  }

  private dispatchInput(detail: CVDatePickerInputEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVDatePickerChangeEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleHeadlessInput(inputValue: string): void {
    this.dispatchInput({
      value: this.model.state.committedValue() ?? '',
      inputValue,
      open: this.model.state.isOpen(),
      invalid: this.model.state.inputInvalid(),
    })

    this.syncHostStateFromModel()
  }

  private handleHeadlessCommit(nextValue: string | null): void {
    const previousValue = this.value
    const normalizedValue = nextValue ?? ''
    const source = this.pendingCommitSource

    this.pendingCommitSource = 'input'
    this.syncHostStateFromModel()

    if (previousValue !== normalizedValue) {
      this.dispatchChange({
        value: normalizedValue,
        previousValue,
        source,
      })
    }
  }

  private syncOutsidePointerListener(forceOff = false): void {
    const shouldListen = !forceOff && this.model.state.isOpen()
    if (shouldListen) {
      document.addEventListener('pointerdown', this.documentPointerDownListener)
    } else {
      document.removeEventListener('pointerdown', this.documentPointerDownListener)
    }
  }

  private handleDocumentPointerDown(event: Event): void {
    if (!this.model.state.isOpen()) return

    const path = event.composedPath()
    if (path.includes(this)) return

    this.model.contracts.getDialogProps().onPointerDownOutside()
    this.syncHostStateFromModel()
  }

  private handleInputEvent(event: Event): void {
    const value = (event.currentTarget as HTMLInputElement).value
    this.model.contracts.getInputProps().onInput(value)
    this.syncHostStateFromModel()
  }

  private handleInputKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.pendingCommitSource = 'input'
    }

    this.model.contracts.getInputProps().onKeyDown(event as DatePickerKeyboardEventLike)
    this.syncHostStateFromModel()
  }

  private handleInputFocus(): void {
    this.model.contracts.getInputProps().onFocus()
    this.syncHostStateFromModel()
  }

  private handleInputBlur(): void {
    this.model.contracts.getInputProps().onBlur()
    this.syncHostStateFromModel()
  }

  private handleDialogKeyDown(event: KeyboardEvent): void {
    this.model.contracts.getDialogProps().onKeyDown(event as DatePickerKeyboardEventLike)
    this.syncHostStateFromModel()
  }

  private handleGridKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && event.ctrlKey) {
      this.pendingCommitSource = 'dialog'
    }

    this.model.contracts.getCalendarGridProps().onKeyDown(event as DatePickerKeyboardEventLike)
    this.syncHostStateFromModel()
  }

  private handleDayClick(event: Event): void {
    const target = event.currentTarget as HTMLElement
    const date = target.getAttribute('data-date')
    if (!date) return

    this.model.contracts.getCalendarDayProps(date).onClick()
    this.syncHostStateFromModel()
  }

  private handleDayMouseEnter(event: Event): void {
    const target = event.currentTarget as HTMLElement
    const date = target.getAttribute('data-date')
    if (!date) return

    this.model.contracts.getCalendarDayProps(date).onMouseEnter()
    this.syncHostStateFromModel()
  }

  private handleMonthPrevClick(): void {
    this.model.contracts.getMonthNavButtonProps('prev').onClick()
    this.syncHostStateFromModel()
  }

  private handleMonthNextClick(): void {
    this.model.contracts.getMonthNavButtonProps('next').onClick()
    this.syncHostStateFromModel()
  }

  private handleYearPrevClick(): void {
    this.model.contracts.getYearNavButtonProps('prev').onClick()
    this.syncHostStateFromModel()
  }

  private handleYearNextClick(): void {
    this.model.contracts.getYearNavButtonProps('next').onClick()
    this.syncHostStateFromModel()
  }

  private handleTimeInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement
    const segment = target.getAttribute('data-segment')
    if (segment === 'hour') {
      this.model.contracts.getHourInputProps().onInput(target.value)
    } else {
      this.model.contracts.getMinuteInputProps().onInput(target.value)
    }

    this.syncHostStateFromModel()
  }

  private handleTimeKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.pendingCommitSource = 'dialog'
    }

    const target = event.currentTarget as HTMLInputElement
    const segment = target.getAttribute('data-segment')
    if (segment === 'hour') {
      this.model.contracts.getHourInputProps().onKeyDown(event as DatePickerKeyboardEventLike)
    } else {
      this.model.contracts.getMinuteInputProps().onKeyDown(event as DatePickerKeyboardEventLike)
    }

    this.syncHostStateFromModel()
  }

  private handleApplyClick(): void {
    this.pendingCommitSource = 'dialog'
    this.model.contracts.getApplyButtonProps().onClick()
    this.syncHostStateFromModel()
  }

  private handleCancelClick(): void {
    this.model.contracts.getCancelButtonProps().onClick()
    this.syncHostStateFromModel()
  }

  private handleClearClick(): void {
    this.pendingCommitSource = 'input'
    this.model.contracts.getClearButtonProps().onClick()
    this.syncHostStateFromModel()
  }

  protected override onFormDisabledChanged(_disabled: boolean): void {
    this.model.actions.setDisabled(this.isEffectivelyDisabled())
  }

  protected override onFormReset(): void {
    this.pendingCommitSource = 'input'
    this.value = this.defaultValue
    this.syncModelFromExternalValue()
    this.syncHostStateFromModel()
  }

  protected override onFormStateRestore(state: string | File | FormData | null): void {
    if (typeof state !== 'string') return
    this.pendingCommitSource = 'input'
    this.value = state
    this.syncModelFromExternalValue()
    this.syncHostStateFromModel()
  }

  protected override isFormAssociatedDisabled(): boolean {
    return this.isEffectivelyDisabled()
  }

  protected override getFormAssociatedValue(): string | File | FormData | null {
    return this.value || null
  }

  protected override getFormAssociatedValidity(): FormAssociatedValidity {
    if (this.inputInvalid) {
      return {
        flags: {badInput: true},
        message: 'Please enter a valid date and time.',
      }
    }

    if (this.required && this.value.length === 0) {
      return {
        flags: {valueMissing: true},
        message: 'Please fill out this field.',
      }
    }

    return {flags: {}}
  }

  private isEffectivelyDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  private formatMonthLabel(year: number, month: number): string {
    const date = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0))
    try {
      return new Intl.DateTimeFormat(this.locale, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date)
    } catch {
      return `${year}-${String(month).padStart(2, '0')}`
    }
  }

  protected override render() {
    const inputProps = this.model.contracts.getInputProps()
    const dialogProps = this.model.contracts.getDialogProps()
    const gridProps = this.model.contracts.getCalendarGridProps()

    const monthPrevProps = this.model.contracts.getMonthNavButtonProps('prev')
    const monthNextProps = this.model.contracts.getMonthNavButtonProps('next')
    const yearPrevProps = this.model.contracts.getYearNavButtonProps('prev')
    const yearNextProps = this.model.contracts.getYearNavButtonProps('next')

    const hourInputProps = this.model.contracts.getHourInputProps()
    const minuteInputProps = this.model.contracts.getMinuteInputProps()
    const applyButtonProps = this.model.contracts.getApplyButtonProps()
    const cancelButtonProps = this.model.contracts.getCancelButtonProps()
    const clearButtonProps = this.model.contracts.getClearButtonProps()

    const displayedYear = this.model.state.displayedYear()
    const displayedMonth = this.model.state.displayedMonth()
    const monthLabel = this.formatMonthLabel(displayedYear, displayedMonth)
    const visibleDays = this.model.contracts.getVisibleDays()

    return html`
      <div part="base">
        <div part="input-wrap">
          <span part="prefix"><slot name="prefix"></slot></span>
          <span part="label">
            <input
              part="input"
              id=${inputProps.id}
              role=${inputProps.role}
              tabindex=${inputProps.tabindex}
              autocomplete=${inputProps.autocomplete}
              .value=${inputProps.value}
              ?disabled=${inputProps.disabled}
              ?readonly=${Boolean(inputProps.readonly)}
              ?required=${Boolean(inputProps.required)}
              name=${this.name || nothing}
              placeholder=${inputProps.placeholder}
              aria-haspopup=${inputProps['aria-haspopup']}
              aria-expanded=${inputProps['aria-expanded']}
              aria-controls=${inputProps['aria-controls']}
              aria-activedescendant=${inputProps['aria-activedescendant'] ?? nothing}
              aria-invalid=${inputProps['aria-invalid'] ?? nothing}
              aria-required=${inputProps.required ? 'true' : nothing}
              aria-label=${inputProps['aria-label'] ?? nothing}
              @input=${this.handleInputEvent}
              @keydown=${this.handleInputKeyDown}
              @focus=${this.handleInputFocus}
              @blur=${this.handleInputBlur}
            />
          </span>
          <span part="suffix"><slot name="suffix"></slot></span>
          <button
            part="clear-button"
            id=${clearButtonProps.id}
            role=${clearButtonProps.role}
            tabindex=${clearButtonProps.tabindex}
            aria-label=${clearButtonProps['aria-label']}
            ?disabled=${clearButtonProps.disabled}
            ?hidden=${!this.hasValue}
            @click=${this.handleClearClick}
          >
            <slot name="clear-icon">&times;</slot>
          </button>
        </div>

        <div
          part="dialog"
          id=${dialogProps.id}
          role=${dialogProps.role}
          tabindex=${dialogProps.tabindex}
          ?hidden=${dialogProps.hidden}
          aria-modal=${dialogProps['aria-modal']}
          aria-label=${dialogProps['aria-label']}
          @keydown=${this.handleDialogKeyDown}
        >
          <div part="calendar-shell">
            <button
              part="year-nav-button"
              id=${yearPrevProps.id}
              role=${yearPrevProps.role}
              tabindex=${yearPrevProps.tabindex}
              aria-label=${yearPrevProps['aria-label']}
              data-dir="prev"
              @click=${this.handleYearPrevClick}
            >
              <slot name="year-prev">&laquo;</slot>
            </button>
            <button
              part="month-nav-button"
              id=${monthPrevProps.id}
              role=${monthPrevProps.role}
              tabindex=${monthPrevProps.tabindex}
              aria-label=${monthPrevProps['aria-label']}
              data-dir="prev"
              @click=${this.handleMonthPrevClick}
            >
              <slot name="month-prev">&lsaquo;</slot>
            </button>
            <span part="month-label">${monthLabel}</span>
            <button
              part="month-nav-button"
              id=${monthNextProps.id}
              role=${monthNextProps.role}
              tabindex=${monthNextProps.tabindex}
              aria-label=${monthNextProps['aria-label']}
              data-dir="next"
              @click=${this.handleMonthNextClick}
            >
              <slot name="month-next">&rsaquo;</slot>
            </button>
            <button
              part="year-nav-button"
              id=${yearNextProps.id}
              role=${yearNextProps.role}
              tabindex=${yearNextProps.tabindex}
              aria-label=${yearNextProps['aria-label']}
              data-dir="next"
              @click=${this.handleYearNextClick}
            >
              <slot name="year-next">&raquo;</slot>
            </button>
          </div>

          <div
            part="calendar-grid"
            id=${gridProps.id}
            role=${gridProps.role}
            tabindex=${gridProps.tabindex}
            aria-label=${gridProps['aria-label']}
            @keydown=${this.handleGridKeyDown}
          >
            ${visibleDays.map((day) => {
              const dayProps = this.model.contracts.getCalendarDayProps(day.date)
              const dayText = Number(day.date.slice(8, 10))

              return html`
                <button
                  part="calendar-day"
                  id=${dayProps.id}
                  role=${dayProps.role}
                  tabindex=${dayProps.tabindex}
                  aria-selected=${dayProps['aria-selected']}
                  aria-disabled=${dayProps['aria-disabled'] ?? nothing}
                  aria-current=${dayProps['aria-current'] ?? nothing}
                  data-date=${dayProps['data-date']}
                  data-month=${day.month}
                  ?disabled=${day.disabled}
                  @click=${this.handleDayClick}
                  @mouseenter=${this.handleDayMouseEnter}
                >
                  ${dayText}
                </button>
              `
            })}
          </div>

          <div part="time-row">
            <input
              part="hour-input"
              id=${hourInputProps.id}
              type=${hourInputProps.type}
              inputmode=${hourInputProps.inputmode}
              aria-label=${hourInputProps['aria-label']}
              .value=${hourInputProps.value}
              minlength=${hourInputProps.minlength}
              maxlength=${hourInputProps.maxlength}
              ?disabled=${hourInputProps.disabled}
              ?readonly=${hourInputProps.readonly}
              data-segment="hour"
              @input=${this.handleTimeInput}
              @keydown=${this.handleTimeKeyDown}
            />
            <span part="time-separator">:</span>
            <input
              part="minute-input"
              id=${minuteInputProps.id}
              type=${minuteInputProps.type}
              inputmode=${minuteInputProps.inputmode}
              aria-label=${minuteInputProps['aria-label']}
              .value=${minuteInputProps.value}
              minlength=${minuteInputProps.minlength}
              maxlength=${minuteInputProps.maxlength}
              ?disabled=${minuteInputProps.disabled}
              ?readonly=${minuteInputProps.readonly}
              data-segment="minute"
              @input=${this.handleTimeInput}
              @keydown=${this.handleTimeKeyDown}
            />
          </div>

          <div part="actions">
            <button
              part="apply-button"
              id=${applyButtonProps.id}
              role=${applyButtonProps.role}
              tabindex=${applyButtonProps.tabindex}
              aria-label=${applyButtonProps['aria-label']}
              ?disabled=${applyButtonProps.disabled}
              @click=${this.handleApplyClick}
            >
              <slot name="apply-label">Apply</slot>
            </button>
            <button
              part="cancel-button"
              id=${cancelButtonProps.id}
              role=${cancelButtonProps.role}
              tabindex=${cancelButtonProps.tabindex}
              aria-label=${cancelButtonProps['aria-label']}
              ?disabled=${cancelButtonProps.disabled}
              @click=${this.handleCancelClick}
            >
              <slot name="cancel-label">Cancel</slot>
            </button>
          </div>

          <span part="dialog-caption">
            <slot name="dialog-caption">Use calendar keys and Enter to apply.</slot>
          </span>
        </div>
      </div>
    `
  }
}
