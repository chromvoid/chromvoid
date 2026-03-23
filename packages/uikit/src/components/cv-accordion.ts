import {createAccordion, type AccordionModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import {CVAccordionItem} from './cv-accordion-item'

export interface CVAccordionEventDetail {
  value: string | null
  values: string[]
  activeId: string | null
}

interface AccordionItemRecord {
  id: string
  disabled: boolean
  element: CVAccordionItem
}

interface AccordionSnapshot {
  values: string[]
  activeId: string | null
}

const accordionKeysToPrevent = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Spacebar'])

const arraysEqual = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

let cvAccordionNonce = 0

export class CVAccordion extends ReatomLitElement {
  static elementName = 'cv-accordion'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      expandedValues: {attribute: false},
      allowMultiple: {type: Boolean, attribute: 'allow-multiple', reflect: true},
      allowZeroExpanded: {type: Boolean, attribute: 'allow-zero-expanded', reflect: true},
      headingLevel: {type: Number, attribute: 'heading-level', reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
      revealExpanded: {type: Boolean, attribute: 'reveal-expanded'},
    }
  }

  declare value: string
  declare expandedValues: string[]
  declare allowMultiple: boolean
  declare allowZeroExpanded: boolean
  declare headingLevel: number
  declare ariaLabel: string
  declare revealExpanded: boolean

  private readonly idBase = `cv-accordion-${++cvAccordionNonce}`
  private itemRecords: AccordionItemRecord[] = []
  private itemListeners = new WeakMap<CVAccordionItem, {click: EventListener; focus: EventListener; keydown: EventListener}>()
  private readonly model: AccordionModel

  constructor() {
    super()
    this.value = ''
    this.expandedValues = []
    this.allowMultiple = false
    this.allowZeroExpanded = true
    this.headingLevel = 3
    this.ariaLabel = ''
    this.revealExpanded = false
    this.model = createAccordion({idBase: this.idBase, sections: []})
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-accordion-gap, var(--cv-space-2, 8px));
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
    this.model.actions.setAllowMultiple(this.allowMultiple)
    this.model.actions.setAllowZeroExpanded(this.allowZeroExpanded)
    this.model.actions.setHeadingLevel(this.headingLevel)
    this.model.actions.setAriaLabel(this.ariaLabel || undefined)
    this.syncFromSlot(false)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.detachItemListeners()
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    const configChanged =
      changedProperties.has('allowMultiple') ||
      changedProperties.has('allowZeroExpanded') ||
      changedProperties.has('ariaLabel') ||
      changedProperties.has('headingLevel')

    if (changedProperties.has('allowMultiple')) {
      this.model.actions.setAllowMultiple(this.allowMultiple)
    }
    if (changedProperties.has('allowZeroExpanded')) {
      this.model.actions.setAllowZeroExpanded(this.allowZeroExpanded)
    }
    if (changedProperties.has('ariaLabel')) {
      this.model.actions.setAriaLabel(this.ariaLabel || undefined)
    }
    if (changedProperties.has('headingLevel')) {
      this.model.actions.setHeadingLevel(this.headingLevel)
    }

    if (configChanged) {
      this.syncItemElements()
      this.syncControlledValuesFromModel()
      return
    }

    if (changedProperties.has('value') && !this.allowMultiple) {
      const previous = this.captureSnapshot()
      const normalized = this.value.trim()
      this.model.actions.setExpandedIds(normalized ? [normalized] : [])
      this.applyInteractionResult(previous)
    }

    if (changedProperties.has('expandedValues') && this.allowMultiple) {
      const previous = this.captureSnapshot()
      this.model.actions.setExpandedIds(this.expandedValues)
      this.applyInteractionResult(previous)
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)

    if (!changedProperties.has('value') && !changedProperties.has('expandedValues')) {
      this.syncItemElements()
    }
  }

  private getItemElements(): CVAccordionItem[] {
    return Array.from(this.children).filter(
      (element): element is CVAccordionItem => element.tagName.toLowerCase() === CVAccordionItem.elementName,
    )
  }

  private ensureItemValue(item: CVAccordionItem, index: number): string {
    const normalized = item.value?.trim()
    if (normalized) return normalized

    const fallback = `section-${index + 1}`
    item.value = fallback
    return fallback
  }

  private resolveConfiguredExpandedIds(itemRecords: AccordionItemRecord[]): string[] {
    if (this.allowMultiple) {
      const fromProperty = this.expandedValues
        .map((value) => value.trim())
        .filter((value) => value.length > 0)

      if (fromProperty.length > 0) return fromProperty

      return itemRecords.filter((record) => record.element.expanded).map((record) => record.id)
    }

    const fromValue = this.value.trim()
    if (fromValue) return [fromValue]

    const expandedRecord = itemRecords.find((record) => record.element.expanded)
    return expandedRecord ? [expandedRecord.id] : []
  }

  private syncFromSlot(preserveState: boolean): void {
    const itemElements = this.getItemElements()

    this.detachItemListeners()

    this.itemRecords = itemElements.map((element, index) => ({
      id: this.ensureItemValue(element, index),
      disabled: element.disabled,
      element,
    }))

    this.model.actions.setSections(
      this.itemRecords.map((record) => ({
        id: record.id,
        disabled: record.disabled,
      })),
    )

    if (!preserveState) {
      const expandedIds = this.resolveConfiguredExpandedIds(this.itemRecords)
      if (expandedIds.length > 0) {
        this.model.actions.setExpandedIds(expandedIds)
      }
    }

    this.attachItemListeners()
    this.syncItemElements()
    this.syncControlledValuesFromModel()
  }

  private detachItemListeners(): void {
    for (const record of this.itemRecords) {
      const listeners = this.itemListeners.get(record.element)
      if (!listeners) continue

      record.element.removeEventListener('cv-accordion-item-trigger-click', listeners.click)
      record.element.removeEventListener('cv-accordion-item-trigger-focus', listeners.focus)
      record.element.removeEventListener('cv-accordion-item-trigger-keydown', listeners.keydown)
      this.itemListeners.delete(record.element)
    }
  }

  private attachItemListeners(): void {
    for (const record of this.itemRecords) {
      const click = () => {
        this.handleItemTriggerClick(record.id)
      }

      const focus = () => {
        this.handleItemTriggerFocus(record.id)
      }

      const keydown = (event: Event) => {
        this.handleItemTriggerKeyDown(record.id, event as CustomEvent<{key: string}>)
      }

      record.element.addEventListener('cv-accordion-item-trigger-click', click)
      record.element.addEventListener('cv-accordion-item-trigger-focus', focus)
      record.element.addEventListener('cv-accordion-item-trigger-keydown', keydown)
      this.itemListeners.set(record.element, {click, focus, keydown})
    }
  }

  private syncItemElements(): void {
    for (const record of this.itemRecords) {
      const headerProps = this.model.contracts.getHeaderProps(record.id)
      const triggerProps = this.model.contracts.getTriggerProps(record.id)
      const panelProps = this.model.contracts.getPanelProps(record.id)

      record.element.applyContracts({
        headerId: headerProps.id,
        trigger: {
          id: triggerProps.id,
          role: triggerProps.role,
          tabindex: triggerProps.tabindex,
          ariaExpanded: triggerProps['aria-expanded'],
          ariaControls: triggerProps['aria-controls'],
          ariaDisabled: triggerProps['aria-disabled'],
        },
        panel: {
          id: panelProps.id,
          role: panelProps.role,
          ariaLabelledBy: panelProps['aria-labelledby'],
          hidden: panelProps.hidden,
        },
      })
    }
  }

  private syncControlledValuesFromModel(): void {
    this.expandedValues = this.model.state.expandedValues()
    this.value = this.model.state.value() ?? ''
  }

  private captureSnapshot(): AccordionSnapshot {
    return {
      values: this.model.state.expandedValues(),
      activeId: this.model.state.focusedId(),
    }
  }

  private focusActiveItem(): void {
    const activeId = this.model.state.focusedId()
    if (!activeId) return

    const activeRecord = this.itemRecords.find((record) => record.id === activeId)
    activeRecord?.element.focusTrigger()
  }

  private dispatchInput(detail: CVAccordionEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVAccordionEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private revealExpandedItem(id: string): void {
    const record = this.itemRecords.find((itemRecord) => itemRecord.id === id)
    if (!record) return

    void record.element.updateComplete.then(() => {
      if (!record.element.isConnected || !record.element.expanded) return
      if (typeof record.element.scrollIntoView !== 'function') return
      record.element.scrollIntoView({block: 'nearest', inline: 'nearest'})
    })
  }

  private applyInteractionResult(previous: AccordionSnapshot, expandedIdToReveal?: string): void {
    this.syncItemElements()

    const next = this.captureSnapshot()
    const valuesChanged = !arraysEqual(previous.values, next.values)
    const activeChanged = previous.activeId !== next.activeId
    const shouldRevealExpandedItem =
      this.revealExpanded &&
      expandedIdToReveal != null &&
      !previous.values.includes(expandedIdToReveal) &&
      next.values.includes(expandedIdToReveal)

    this.syncControlledValuesFromModel()

    if (shouldRevealExpandedItem) {
      this.revealExpandedItem(expandedIdToReveal)
    }

    if (!valuesChanged && !activeChanged) return

    const detail: CVAccordionEventDetail = {
      value: this.value || null,
      values: [...this.expandedValues],
      activeId: next.activeId,
    }

    this.dispatchInput(detail)
    if (valuesChanged) {
      this.dispatchChange(detail)
    }

    if (activeChanged) {
      this.focusActiveItem()
    }
  }

  private handleItemTriggerClick(id: string): void {
    const previous = this.captureSnapshot()
    this.model.actions.toggle(id)
    this.applyInteractionResult(previous, id)
  }

  private handleItemTriggerFocus(id: string): void {
    const previous = this.captureSnapshot()
    this.model.actions.setFocused(id)
    this.applyInteractionResult(previous)
  }

  private handleItemTriggerKeyDown(id: string, event: CustomEvent<{key: string}>): void {
    const {key} = event.detail
    if (accordionKeysToPrevent.has(key)) {
      event.preventDefault()
    }

    const previous = this.captureSnapshot()
    this.model.actions.setFocused(id)
    this.model.actions.handleKeyDown({key})
    const shouldRevealExpandedItem = key === 'Enter' || key === ' ' || key === 'Spacebar'
    this.applyInteractionResult(previous, shouldRevealExpandedItem ? id : undefined)
  }

  private handleSlotChange() {
    this.syncFromSlot(true)
    this.requestUpdate()
  }

  protected override render() {
    const rootProps = this.model.contracts.getRootProps()

    return html`
      <section id=${rootProps.id} aria-label=${rootProps['aria-label'] ?? nothing} part="base">
        <slot @slotchange=${this.handleSlotChange}></slot>
      </section>
    `
  }
}
