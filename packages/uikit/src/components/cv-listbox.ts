import {createListbox, type ListboxModel, type ListboxGroup} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import {CVListboxGroup} from './cv-listbox-group'
import {CVOption} from './cv-option'

export interface CVListboxEventDetail {
  selectedValues: string[]
  activeValue: string | null
}

interface OptionRecord {
  id: string
  label: string
  disabled: boolean
  groupId?: string
  element: CVOption
}

type CVSelectionMode = 'single' | 'multiple'
type CVOrientation = 'vertical' | 'horizontal'
type CVFocusStrategy = 'roving-tabindex' | 'aria-activedescendant'

let cvListboxNonce = 0

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function shouldPreventDefaultForKey(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey'>): boolean {
  if (event.key.toLowerCase() === 'a' && (event.ctrlKey || event.metaKey)) {
    return true
  }

  return [
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End',
    'Enter',
    ' ',
    'Spacebar',
    'Escape',
  ].includes(event.key)
}

export class CVListbox extends ReatomLitElement {
  static elementName = 'cv-listbox'

  static get properties() {
    return {
      selectionMode: {type: String, attribute: 'selection-mode', reflect: true},
      orientation: {type: String, reflect: true},
      focusStrategy: {type: String, attribute: 'focus-strategy', reflect: true},
      selectionFollowsFocus: {type: Boolean, attribute: 'selection-follows-focus'},
      rangeSelection: {type: Boolean, attribute: 'range-selection'},
      typeahead: {type: Boolean},
      ariaLabel: {type: String, attribute: 'aria-label'},
    }
  }

  declare selectionMode: CVSelectionMode
  declare orientation: CVOrientation
  declare focusStrategy: CVFocusStrategy
  declare selectionFollowsFocus: boolean
  declare rangeSelection: boolean
  declare typeahead: boolean
  declare ariaLabel: string

  private readonly idBase = `cv-listbox-${++cvListboxNonce}`
  private optionRecords: OptionRecord[] = []
  private optionListeners = new WeakMap<CVOption, {click: EventListener; keydown: EventListener}>()
  private model?: ListboxModel

  constructor() {
    super()
    this.selectionMode = 'single'
    this.orientation = 'vertical'
    this.focusStrategy = 'aria-activedescendant'
    this.selectionFollowsFocus = false
    this.rangeSelection = false
    this.typeahead = true
    this.ariaLabel = ''
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-listbox-gap, var(--cv-space-1, 4px));
        padding: var(--cv-listbox-padding, var(--cv-space-1, 4px));
        border-radius: var(--cv-listbox-border-radius, var(--cv-radius-md, 10px));
        border: 1px solid var(--cv-listbox-border-color, var(--cv-color-border, #2a3245));
        background: var(--cv-listbox-background, var(--cv-color-surface, #141923));
      }

      [part='base']:focus-visible {
        outline: 2px solid var(--cv-listbox-focus-outline-color, var(--cv-color-primary, #65d7ff));
        outline-offset: 1px;
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
    if (!this.model) {
      this.rebuildModelFromSlot(false, false)
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.detachOptionListeners()
  }

  get value(): string | null {
    if (!this.model) return null
    return this.model.state.selectedIds()[0] ?? null
  }

  set value(next: string | null) {
    if (!this.model) return

    if (next == null) {
      this.model.actions.clearSelected()
      this.syncOptionElements()
      return
    }

    this.model.actions.selectOnly(next)
    this.syncOptionElements()
  }

  get selectedValues(): string[] {
    if (!this.model) return []
    return [...this.model.state.selectedIds()]
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (
      changedProperties.has('selectionMode') ||
      changedProperties.has('orientation') ||
      changedProperties.has('focusStrategy') ||
      changedProperties.has('selectionFollowsFocus') ||
      changedProperties.has('rangeSelection') ||
      changedProperties.has('typeahead') ||
      changedProperties.has('ariaLabel')
    ) {
      this.rebuildModelFromSlot(true, false)
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)

    this.syncOptionElements()
  }

  private getAllOptionElements(): CVOption[] {
    const options: CVOption[] = []
    for (const child of Array.from(this.children)) {
      if (child.tagName.toLowerCase() === CVOption.elementName) {
        options.push(child as CVOption)
      } else if (child.tagName.toLowerCase() === CVListboxGroup.elementName) {
        for (const groupChild of Array.from(child.children)) {
          if (groupChild.tagName.toLowerCase() === CVOption.elementName) {
            options.push(groupChild as CVOption)
          }
        }
      }
    }
    return options
  }

  private scanGroups(): {groups: ListboxGroup[]; optionGroupMap: Map<CVOption, string>} {
    const groups: ListboxGroup[] = []
    const optionGroupMap = new Map<CVOption, string>()
    let groupIndex = 0

    for (const child of Array.from(this.children)) {
      if (child.tagName.toLowerCase() === CVListboxGroup.elementName) {
        const groupElement = child as CVListboxGroup
        const groupId = `group-${groupIndex++}`
        groups.push({id: groupId, label: groupElement.label || ''})

        for (const groupChild of Array.from(child.children)) {
          if (groupChild.tagName.toLowerCase() === CVOption.elementName) {
            optionGroupMap.set(groupChild as CVOption, groupId)
          }
        }
      }
    }

    return {groups, optionGroupMap}
  }

  private getInitialSelectedFromOptions(optionElements: CVOption[]): string[] {
    return optionElements
      .filter((option) => option.selected && !option.disabled)
      .map((option, index) => this.ensureOptionValue(option, index))
  }

  private ensureOptionValue(option: CVOption, index: number): string {
    const normalized = option.value?.trim()
    if (normalized) return normalized

    const fallback = `option-${index + 1}`
    option.value = fallback
    return fallback
  }

  private rebuildModelFromSlot(preserveSelection: boolean, requestRender = true): void {
    const optionElements = this.getAllOptionElements()
    const {groups, optionGroupMap} = this.scanGroups()

    const previousSelected = preserveSelection
      ? this.model?.state.selectedIds() ?? this.getInitialSelectedFromOptions(optionElements)
      : this.getInitialSelectedFromOptions(optionElements)

    const previousActive = preserveSelection ? this.model?.state.activeId() ?? null : null

    this.detachOptionListeners()

    this.optionRecords = optionElements.map((element, index) => {
      const id = this.ensureOptionValue(element, index)
      const label = element.textContent?.trim() || id
      const disabled = element.disabled
      const groupId = optionGroupMap.get(element)

      return {
        id,
        label,
        disabled,
        groupId,
        element,
      }
    })

    const selectableIds = new Set(this.optionRecords.filter((record) => !record.disabled).map((record) => record.id))

    const initialSelectedIds = previousSelected.filter((id) => selectableIds.has(id))
    const initialActiveId = previousActive && selectableIds.has(previousActive) ? previousActive : null

    this.model = createListbox({
      idBase: this.idBase,
      options: this.optionRecords.map((record) => ({
        id: record.id,
        label: record.label,
        disabled: record.disabled,
        groupId: record.groupId,
      })),
      groups,
      selectionMode: this.selectionMode,
      orientation: this.orientation,
      focusStrategy: this.focusStrategy,
      selectionFollowsFocus: this.selectionFollowsFocus,
      rangeSelection: this.rangeSelection,
      typeahead: this.typeahead,
      ariaLabel: this.ariaLabel || undefined,
      initialSelectedIds,
      initialActiveId,
    })

    this.attachOptionListeners()
    this.syncOptionElements()
    if (requestRender) {
      this.requestUpdate()
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
    if (!this.model) return

    for (const record of this.optionRecords) {
      const click = () => {
        this.handleOptionPointerSelect(record.id)
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
    if (!this.model) return

    for (const record of this.optionRecords) {
      const props = this.model.contracts.getOptionProps(record.id)
      const ariaSelected = props['aria-selected'] ?? 'false'

      record.element.id = props.id
      record.element.setAttribute('role', props.role)
      record.element.setAttribute('tabindex', props.tabindex)
      record.element.setAttribute('aria-selected', ariaSelected)
      record.element.setAttribute('aria-setsize', props['aria-setsize'])
      record.element.setAttribute('aria-posinset', props['aria-posinset'])

      if (props['aria-disabled']) {
        record.element.setAttribute('aria-disabled', props['aria-disabled'])
      } else {
        record.element.removeAttribute('aria-disabled')
      }

      if (props['data-active'] === 'true') {
        record.element.setAttribute('data-active', 'true')
        record.element.active = true
      } else {
        record.element.removeAttribute('data-active')
        record.element.active = false
      }

      record.element.selected = ariaSelected === 'true'
      record.element.disabled = record.disabled
    }
  }

  private focusActiveOption(): void {
    if (!this.model || this.focusStrategy !== 'roving-tabindex') return

    const activeId = this.model.state.activeId()
    if (!activeId) return

    const activeRecord = this.optionRecords.find((record) => record.id === activeId)
    activeRecord?.element.focus()
  }

  private dispatchInput(detail: CVListboxEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVListboxEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private applyInteractionResult(previousSelected: readonly string[], previousActive: string | null): void {
    if (!this.model) return

    this.syncOptionElements()

    const nextSelected = this.model.state.selectedIds()
    const nextActive = this.model.state.activeId()

    const selectedChanged = !arraysEqual(previousSelected, nextSelected)
    const activeChanged = previousActive !== nextActive

    if (activeChanged || selectedChanged) {
      this.dispatchInput({
        selectedValues: [...nextSelected],
        activeValue: nextActive,
      })
    }

    if (selectedChanged) {
      this.dispatchChange({
        selectedValues: [...nextSelected],
        activeValue: nextActive,
      })
    }

    if (activeChanged) {
      this.focusActiveOption()
    }
  }

  private handleOptionPointerSelect(id: string): void {
    if (!this.model) return

    const previousSelected = this.model.state.selectedIds()
    const previousActive = this.model.state.activeId()

    this.model.actions.setActive(id)
    if (this.selectionMode === 'multiple') {
      this.model.actions.toggleSelected(id)
    } else {
      this.model.actions.selectOnly(id)
    }

    this.applyInteractionResult(previousSelected, previousActive)
  }

  private handleListboxKeyDown(event: KeyboardEvent) {
    if (!this.model) return
    const rootElement = this.shadowRoot?.querySelector('[part="base"]')
    if (this.focusStrategy === 'roving-tabindex' && event.currentTarget === rootElement) {
      return
    }

    if (shouldPreventDefaultForKey(event)) {
      event.preventDefault()
    }

    const previousSelected = this.model.state.selectedIds()
    const previousActive = this.model.state.activeId()

    this.model.actions.handleKeyDown({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
    })

    this.applyInteractionResult(previousSelected, previousActive)
  }

  private handleSlotChange() {
    this.rebuildModelFromSlot(true, true)
  }

  protected override render() {
    const rootProps = this.model?.contracts.getRootProps() ?? {
      role: 'listbox' as const,
      tabindex: this.focusStrategy === 'aria-activedescendant' ? '0' : '-1',
      'aria-orientation': this.orientation,
      'aria-label': this.ariaLabel || undefined,
      'aria-multiselectable': this.selectionMode === 'multiple' ? 'true' : undefined,
      'aria-activedescendant': undefined,
    }

    return html`
      <div
        role=${rootProps.role}
        tabindex=${rootProps.tabindex}
        aria-orientation=${rootProps['aria-orientation']}
        aria-label=${rootProps['aria-label'] ?? nothing}
        aria-multiselectable=${rootProps['aria-multiselectable'] ?? nothing}
        aria-activedescendant=${rootProps['aria-activedescendant'] ?? nothing}
        part="base"
        @keydown=${this.handleListboxKeyDown}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
    `
  }
}
