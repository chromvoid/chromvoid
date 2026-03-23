import {createSelect, type SelectModel, type ListboxSelectionMode} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {FormAssociatedReatomElement} from '../form-associated/FormAssociatedReatomElement'
import type {FormAssociatedValidity} from '../form-associated/withFormAssociated'
import {CVSelectGroup} from './cv-select-group'
import {CVSelectOption} from './cv-select-option'

export interface CVSelectEventDetail {
  value: string | null
  values: string[]
  activeId: string | null
  open: boolean
}

export type CVSelectInputEvent = CustomEvent<CVSelectEventDetail>
export type CVSelectChangeEvent = CustomEvent<CVSelectEventDetail>

export interface CVSelectEventMap {
  'cv-input': CVSelectInputEvent
  'cv-change': CVSelectChangeEvent
}

interface SelectOptionRecord {
  id: string
  label: string
  disabled: boolean
  element: CVSelectOption
  groupId: string | null
}

interface SelectGroupRecord {
  id: string
  label: string
  element: CVSelectGroup
  optionIds: string[]
}

interface SelectSnapshot {
  selectedIds: string[]
  activeId: string | null
  isOpen: boolean
}

const selectKeysToPrevent = new Set([
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'Enter',
  ' ',
  'Spacebar',
  'Escape',
  'Tab',
])

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

let cvSelectNonce = 0

export class CVSelect extends FormAssociatedReatomElement {
  static elementName = 'cv-select'

  static get properties() {
    return {
      name: {type: String},
      value: {type: String, reflect: true},
      selectedValues: {attribute: false},
      open: {type: Boolean, reflect: true},
      selectionMode: {type: String, attribute: 'selection-mode', reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
      closeOnSelect: {type: Boolean, attribute: 'close-on-select', reflect: true},
      placeholder: {type: String},
      disabled: {type: Boolean, reflect: true},
      required: {type: Boolean, reflect: true},
      clearable: {type: Boolean, reflect: true},
      size: {type: String, reflect: true},
    }
  }

  declare name: string
  declare value: string
  declare selectedValues: string[]
  declare open: boolean
  declare selectionMode: ListboxSelectionMode
  declare ariaLabel: string
  declare closeOnSelect: boolean
  declare placeholder: string
  declare disabled: boolean
  declare required: boolean
  declare clearable: boolean
  declare size: 'small' | 'medium' | 'large'

  private readonly idBase = `cv-select-${++cvSelectNonce}`
  private optionRecords: SelectOptionRecord[] = []
  private groupRecords: SelectGroupRecord[] = []
  private optionListeners = new WeakMap<CVSelectOption, {click: EventListener; keydown: EventListener}>()
  private model: SelectModel
  private defaultSelectedValues: string[] = []
  private didCaptureDefaultSelection = false

  constructor() {
    super()
    this.name = ''
    this.value = ''
    this.selectedValues = []
    this.open = false
    this.selectionMode = 'single'
    this.ariaLabel = ''
    this.closeOnSelect = true
    this.placeholder = ''
    this.disabled = false
    this.required = false
    this.clearable = false
    this.size = 'medium'
    this.model = createSelect({
      options: [],
      idBase: this.idBase,
      selectionMode: this.selectionMode,
      closeOnSelect: this.closeOnSelect,
      placeholder: this.placeholder,
      disabled: this.isEffectivelyDisabled(),
      required: this.required,
    })
  }

  static styles = [
    css`
      :host {
        display: inline-block;
        inline-size: var(--cv-select-inline-size, 260px);
      }

      :host([disabled]) {
        opacity: 0.55;
        cursor: not-allowed;
        pointer-events: none;
      }

      [part='base'] {
        position: relative;
        display: grid;
        gap: var(--cv-space-1, 4px);
      }

      [part='trigger'] {
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--cv-space-2, 8px);
        min-block-size: var(--cv-select-min-height, 36px);
        padding: var(--cv-select-padding-block, var(--cv-space-2, 8px))
          var(--cv-select-padding-inline, var(--cv-space-3, 12px));
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        cursor: pointer;
      }

      [part='trigger']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      :host([size='small']) {
        --cv-select-min-height: 30px;
        --cv-select-padding-inline: var(--cv-space-2, 8px);
        --cv-select-padding-block: var(--cv-space-1, 4px);
      }

      :host([size='large']) {
        --cv-select-min-height: 42px;
        --cv-select-padding-inline: var(--cv-space-4, 16px);
        --cv-select-padding-block: var(--cv-space-2, 8px);
      }

      [part='chevron'] {
        opacity: 0.72;
      }

      [part='clear-button'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
        padding: 0;
        opacity: 0.55;
        font-size: 0.85em;
      }

      [part='clear-button']:hover {
        opacity: 1;
      }

      [part='listbox'] {
        position: absolute;
        inset-inline-start: 0;
        inset-block-start: calc(100% + var(--cv-space-1, 4px));
        z-index: 20;
        min-inline-size: 100%;
        max-block-size: 240px;
        overflow: auto;
        display: grid;
        gap: var(--cv-space-1, 4px);
        padding: var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-md, 10px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        box-shadow: var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24));
      }

      [part='listbox'][hidden] {
        display: none;
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
    this.rebuildModelFromSlot(false, false)
    this.syncOutsidePointerListener()
    if (!this.didCaptureDefaultSelection) {
      this.defaultSelectedValues = [...this.model.state.selectedIds()]
      this.didCaptureDefaultSelection = true
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.detachOptionListeners()
    this.syncOutsidePointerListener(true)
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (
      changedProperties.has('selectionMode') ||
      changedProperties.has('ariaLabel') ||
      changedProperties.has('closeOnSelect') ||
      changedProperties.has('placeholder')
    ) {
      this.rebuildModelFromSlot(true, false)
      this.syncFormAssociatedState()
      return
    }

    if (changedProperties.has('disabled')) {
      this.model.actions.setDisabled(this.isEffectivelyDisabled())
    }

    if (changedProperties.has('required')) {
      this.model.actions.setRequired(this.required)
    }

    if (changedProperties.has('value')) {
      const next = this.value.trim()
      const previous = this.captureState()

      if (this.selectionMode === 'single') {
        if (next.length === 0) {
          this.model.actions.clear()
        } else {
          this.model.actions.select(next)
        }
      }

      this.applyInteractionResult(previous)
    }

    if (changedProperties.has('selectedValues') && this.selectionMode === 'multiple') {
      const previous = this.captureState()
      this.setSelectedIdsInModel(this.selectedValues)
      this.applyInteractionResult(previous)
    }

    if (changedProperties.has('open') && this.model.state.isOpen() !== this.open) {
      const previous = this.captureState()
      if (this.open) {
        this.model.actions.open()
      } else {
        this.model.actions.close()
      }
      this.applyInteractionResult(previous)
    }

    if (
      changedProperties.has('value') ||
      changedProperties.has('selectedValues') ||
      changedProperties.has('open') ||
      changedProperties.has('disabled') ||
      changedProperties.has('required') ||
      changedProperties.has('name')
    ) {
      this.syncFormAssociatedState()
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    this.syncOutsidePointerListener()

    if (
      !changedProperties.has('value') &&
      !changedProperties.has('selectedValues') &&
      !changedProperties.has('open')
    ) {
      this.syncOptionElements()
    }
  }

  private getOptionElementsWithinGroup(group: CVSelectGroup): CVSelectOption[] {
    return Array.from(group.children).filter(
      (element): element is CVSelectOption => element.tagName.toLowerCase() === CVSelectOption.elementName,
    )
  }

  private ensureOptionValue(option: CVSelectOption, index: number): string {
    const normalized = option.value?.trim()
    if (normalized) return normalized

    const fallback = `option-${index + 1}`
    option.value = fallback
    return fallback
  }

  private parseStructure(): {options: SelectOptionRecord[]; groups: SelectGroupRecord[]} {
    const options: SelectOptionRecord[] = []
    const groups: SelectGroupRecord[] = []

    let optionIndex = 0
    let groupIndex = 0

    for (const child of Array.from(this.children)) {
      const tag = child.tagName.toLowerCase()

      if (tag === CVSelectGroup.elementName) {
        const group = child as CVSelectGroup
        groupIndex += 1

        const groupId = group.id || `${this.idBase}-group-${groupIndex}`
        group.id = groupId

        const label = group.label || group.getAttribute('label') || `Group ${groupIndex}`
        group.label = label

        const optionIds: string[] = []
        const groupOptions = this.getOptionElementsWithinGroup(group)

        for (const option of groupOptions) {
          optionIndex += 1
          const id = this.ensureOptionValue(option, optionIndex)
          optionIds.push(id)

          options.push({
            id,
            label: option.textContent?.trim() || id,
            disabled: option.disabled,
            element: option,
            groupId,
          })
        }

        groups.push({
          id: groupId,
          label,
          element: group,
          optionIds,
        })
        continue
      }

      if (tag === CVSelectOption.elementName) {
        const option = child as CVSelectOption
        optionIndex += 1
        const id = this.ensureOptionValue(option, optionIndex)

        options.push({
          id,
          label: option.textContent?.trim() || id,
          disabled: option.disabled,
          element: option,
          groupId: null,
        })
      }
    }

    return {options, groups}
  }

  private resolveInitialSelectedFromOptions(optionRecords: SelectOptionRecord[]): string[] {
    const selectableIds = new Set(
      optionRecords.filter((record) => !record.disabled).map((record) => record.id),
    )

    if (this.selectionMode === 'single') {
      const fromValue = this.value.trim()
      if (fromValue && selectableIds.has(fromValue)) {
        return [fromValue]
      }

      const fromValues = this.selectedValues.find((id) => selectableIds.has(id))
      if (fromValues) {
        return [fromValues]
      }

      for (const record of optionRecords) {
        if (record.element.selected && !record.disabled) {
          return [record.id]
        }
      }

      return []
    }

    const normalized = new Set<string>()

    for (const id of this.selectedValues) {
      if (selectableIds.has(id)) {
        normalized.add(id)
      }
    }

    if (normalized.size === 0) {
      const fromValue = this.value.trim()
      if (fromValue && selectableIds.has(fromValue)) {
        normalized.add(fromValue)
      }
    }

    if (normalized.size === 0) {
      for (const record of optionRecords) {
        if (record.element.selected && !record.disabled) {
          normalized.add(record.id)
        }
      }
    }

    return [...normalized]
  }

  private rebuildModelFromSlot(preserveState: boolean, requestRender = true): void {
    const structure = this.parseStructure()

    const previous = preserveState
      ? this.captureState()
      : {
          selectedIds: this.resolveInitialSelectedFromOptions(structure.options),
          activeId: null,
          isOpen: this.open,
        }

    this.detachOptionListeners()

    this.optionRecords = structure.options
    this.groupRecords = structure.groups

    const selectableIds = new Set(
      this.optionRecords.filter((record) => !record.disabled).map((record) => record.id),
    )
    const initialSelectedIds = previous.selectedIds.filter((id) => selectableIds.has(id))

    this.model = createSelect({
      idBase: this.idBase,
      options: this.optionRecords.map((record) => ({
        id: record.id,
        label: record.label,
        disabled: record.disabled,
      })),
      selectionMode: this.selectionMode,
      closeOnSelect: this.closeOnSelect,
      placeholder: this.placeholder,
      ariaLabel: this.ariaLabel || undefined,
      initialSelectedIds,
      disabled: this.isEffectivelyDisabled(),
      required: this.required,
    })

    if (previous.isOpen) {
      this.model.actions.open()
    }

    this.attachOptionListeners()
    this.syncOptionElements()

    this.syncStateFromModel()

    if (requestRender) {
      this.requestUpdate()
    }
  }

  private setSelectedIdsInModel(ids: readonly string[]): void {
    const allowed = new Set(
      this.optionRecords.filter((record) => !record.disabled).map((record) => record.id),
    )
    const normalized = [...new Set(ids)].filter((id) => allowed.has(id))

    this.model.actions.clear()
    for (const id of normalized) {
      this.model.actions.select(id)
    }
  }

  private detachOptionListeners(): void {
    for (const record of this.optionRecords) {
      const listeners = this.optionListeners.get(record.element)
      if (!listeners) continue

      record.element.removeEventListener('click', listeners.click)
      record.element.removeEventListener('keydown', listeners.keydown)
      this.optionListeners.delete(record.element)
    }
  }

  private attachOptionListeners(): void {
    for (const record of this.optionRecords) {
      const click = (event: Event) => {
        event.preventDefault()
        this.handleOptionClick(record.id)
      }

      const keydown = (event: Event) => {
        event.stopPropagation()
        this.handleListboxKeyDown(event as KeyboardEvent)
      }

      record.element.addEventListener('click', click)
      record.element.addEventListener('keydown', keydown)
      this.optionListeners.set(record.element, {click, keydown})
    }
  }

  private syncOptionElements(): void {
    const isOpen = this.model.state.isOpen()

    for (const record of this.optionRecords) {
      const props = this.model.contracts.getOptionProps(record.id)

      record.element.id = props.id
      record.element.setAttribute('role', props.role)
      record.element.setAttribute('tabindex', props.tabindex)
      const ariaSelected = props['aria-selected']
      const dataActive = props['data-active']

      record.element.setAttribute('aria-selected', ariaSelected)

      if (props['aria-disabled']) {
        record.element.setAttribute('aria-disabled', props['aria-disabled'])
      } else {
        record.element.removeAttribute('aria-disabled')
      }

      record.element.setAttribute('data-active', dataActive)
      record.element.active = dataActive === 'true'
      record.element.selected = ariaSelected === 'true'
      record.element.disabled = props['aria-disabled'] === 'true'
      record.element.hidden = !isOpen
    }

    for (const group of this.groupRecords) {
      group.element.setAttribute('role', 'group')
      group.element.setAttribute('aria-label', group.label)
      group.element.hidden = !isOpen
    }
  }

  private captureState(): SelectSnapshot {
    return {
      selectedIds: [...this.model.state.selectedIds()],
      activeId: this.model.state.activeId(),
      isOpen: this.model.state.isOpen(),
    }
  }

  private dispatchInput(detail: CVSelectEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVSelectEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private focusTrigger(): void {
    const trigger = this.shadowRoot?.querySelector('[part="trigger"]') as HTMLElement | null
    trigger?.focus()
  }

  private applyInteractionResult(previous: SelectSnapshot): void {
    const next = this.captureState()

    this.syncStateFromModel()

    const selectedChanged = !arraysEqual(previous.selectedIds, next.selectedIds)
    const activeChanged = previous.activeId !== next.activeId
    const openChanged = previous.isOpen !== next.isOpen

    if (selectedChanged || activeChanged || openChanged) {
      const detail: CVSelectEventDetail = {
        value: next.selectedIds[0] ?? null,
        values: [...next.selectedIds],
        activeId: next.activeId,
        open: next.isOpen,
      }

      this.dispatchInput(detail)
      if (selectedChanged) {
        this.dispatchChange(detail)
      }
    }

    if (previous.isOpen && !next.isOpen) {
      this.focusTrigger()
    }
  }

  protected override onFormDisabledChanged(_disabled: boolean): void {
    this.model.actions.setDisabled(this.isEffectivelyDisabled())
  }

  protected override onFormReset(): void {
    this.restoreSelectedIds(this.defaultSelectedValues)
  }

  protected override onFormStateRestore(state: string | File | FormData | null): void {
    if (state instanceof FormData) {
      this.restoreSelectedIds(state.getAll(this.name).filter((value): value is string => typeof value === 'string'))
      return
    }

    if (typeof state === 'string') {
      this.restoreSelectedIds(this.selectionMode === 'multiple' ? state.split(/\s+/).filter(Boolean) : [state])
      return
    }

    this.restoreSelectedIds([])
  }

  protected override isFormAssociatedDisabled(): boolean {
    return this.isEffectivelyDisabled()
  }

  protected override getFormAssociatedValue(): string | File | FormData | null {
    const selectedIds = this.model.state.selectedIds()
    if (selectedIds.length === 0) {
      return null
    }

    if (this.selectionMode !== 'multiple') {
      return selectedIds[0] ?? null
    }

    if (this.name.trim().length === 0) {
      return null
    }

    const formData = new FormData()
    for (const id of selectedIds) {
      formData.append(this.name, id)
    }
    return formData
  }

  protected override getFormAssociatedValidity(): FormAssociatedValidity {
    if (this.required && this.model.state.selectedIds().length === 0) {
      return {
        flags: {valueMissing: true},
        message: 'Please select an option.',
      }
    }

    return {flags: {}}
  }

  private isEffectivelyDisabled(): boolean {
    return this.disabled || this.formDisabled
  }

  private syncStateFromModel(): void {
    const selectedIds = this.model.state.selectedIds()
    this.value = selectedIds[0] ?? ''
    this.selectedValues = [...selectedIds]
    this.open = this.model.state.isOpen()
    this.syncOptionElements()
    this.syncFormAssociatedState()
  }

  private restoreSelectedIds(ids: readonly string[]): void {
    this.setSelectedIdsInModel(ids)
    this.model.actions.close()
    this.syncStateFromModel()
  }

  private syncOutsidePointerListener(forceOff = false): void {
    const shouldListen = !forceOff && this.open
    if (shouldListen) {
      document.addEventListener('pointerdown', this.handleDocumentPointerDown)
    } else {
      document.removeEventListener('pointerdown', this.handleDocumentPointerDown)
    }
  }

  private handleDocumentPointerDown = (event: Event) => {
    if (!this.model.state.isOpen()) return

    const path = event.composedPath()
    if (path.includes(this)) return

    const previous = this.captureState()
    this.model.actions.close()
    this.applyInteractionResult(previous)
  }

  private handleTriggerClick() {
    const previous = this.captureState()
    this.model.actions.toggle()
    this.applyInteractionResult(previous)
  }

  private handleTriggerKeyDown(event: KeyboardEvent) {
    if (selectKeysToPrevent.has(event.key)) {
      event.preventDefault()
    }
    const previous = this.captureState()
    this.model.actions.handleTriggerKeyDown({key: event.key})
    this.applyInteractionResult(previous)
  }

  private handleListboxKeyDown(event: KeyboardEvent) {
    if (!this.model.state.isOpen()) return

    if (selectKeysToPrevent.has(event.key)) {
      event.preventDefault()
    }

    const previous = this.captureState()
    this.model.actions.handleListboxKeyDown({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
    })
    this.applyInteractionResult(previous)
  }

  private handleOptionClick(id: string): void {
    const record = this.optionRecords.find((option) => option.id === id)
    if (!record || record.disabled) return

    const previous = this.captureState()
    this.model.actions.select(id)
    this.applyInteractionResult(previous)
  }

  private handleClearClick(event: Event) {
    event.stopPropagation()
    const previous = this.captureState()
    this.model.actions.clear()
    this.applyInteractionResult(previous)
  }

  private handleSlotChange() {
    this.rebuildModelFromSlot(true, true)
  }

  private getValueText(): string {
    return this.model.contracts.getValueText() || 'Select...'
  }

  protected override render() {
    const triggerProps = this.model.contracts.getTriggerProps()
    const listboxProps = this.model.contracts.getListboxProps()
    const hasValue = this.value !== ''
    const showClear = this.clearable && hasValue

    return html`
      <div part="base">
        <div
          id=${triggerProps.id}
          role=${triggerProps.role}
          tabindex=${triggerProps.tabindex}
          aria-haspopup=${triggerProps['aria-haspopup']}
          aria-expanded=${triggerProps['aria-expanded']}
          aria-controls=${triggerProps['aria-controls']}
          aria-activedescendant=${triggerProps['aria-activedescendant'] ?? nothing}
          aria-label=${triggerProps['aria-label'] ?? nothing}
          aria-disabled=${triggerProps['aria-disabled'] ?? nothing}
          aria-required=${triggerProps['aria-required'] ?? nothing}
          data-selected-id=${triggerProps['data-selected-id'] ?? nothing}
          data-selected-label=${triggerProps['data-selected-label'] ?? nothing}
          part="trigger"
          @click=${this.handleTriggerClick}
          @keydown=${this.handleTriggerKeyDown}
        >
          <slot name="trigger">${this.getValueText()}</slot>
          ${showClear
            ? html`
                <button part="clear-button" aria-hidden="true" tabindex="-1" @click=${this.handleClearClick}>
                  ✕
                </button>
              `
            : nothing}
          <span part="chevron" aria-hidden="true">▾</span>
        </div>

        <div
          id=${listboxProps.id}
          role=${listboxProps.role}
          tabindex=${listboxProps.tabindex}
          aria-label=${listboxProps['aria-label'] ?? nothing}
          aria-multiselectable=${listboxProps['aria-multiselectable'] ?? nothing}
          aria-activedescendant=${listboxProps['aria-activedescendant'] ?? nothing}
          ?hidden=${listboxProps.hidden}
          part="listbox"
          @keydown=${this.handleListboxKeyDown}
        >
          <slot @slotchange=${this.handleSlotChange}></slot>
        </div>
      </div>
    `
  }
}
