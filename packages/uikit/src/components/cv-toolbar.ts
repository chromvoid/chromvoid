import {createToolbar, type ToolbarModel, type CompositeNavigationOrientation} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import {CVToolbarItem} from './cv-toolbar-item'
import {CVToolbarSeparator} from './cv-toolbar-separator'

export interface CVToolbarEventDetail {
  activeId: string | null
}

interface ToolbarItemRecord {
  id: string
  disabled: boolean
  element: CVToolbarItem
}

interface ToolbarSeparatorRecord {
  id: string
  element: CVToolbarSeparator
}

const toolbarKeysToPrevent = new Set(['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'])

let cvToolbarNonce = 0

export class CVToolbar extends ReatomLitElement {
  static elementName = 'cv-toolbar'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      orientation: {type: String, reflect: true},
      wrap: {type: Boolean, reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
    }
  }

  declare value: string
  declare orientation: CompositeNavigationOrientation
  declare wrap: boolean
  declare ariaLabel: string

  private readonly idBase = `cv-toolbar-${++cvToolbarNonce}`
  private itemRecords: ToolbarItemRecord[] = []
  private separatorRecords: ToolbarSeparatorRecord[] = []
  private itemListeners = new WeakMap<CVToolbarItem, {focus: EventListener; click: EventListener}>()
  private hasFocus = false
  private model: ToolbarModel

  constructor() {
    super()
    this.value = ''
    this.orientation = 'horizontal'
    this.wrap = true
    this.ariaLabel = ''
    this.model = createToolbar({
      idBase: this.idBase,
      items: [],
      orientation: this.orientation,
      wrap: this.wrap,
      ariaLabel: undefined,
      initialActiveId: null,
    })
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      [part='base'] {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--cv-toolbar-gap, var(--cv-space-1, 4px));
        padding: var(--cv-toolbar-padding, var(--cv-space-1, 4px));
        border-radius: var(--cv-toolbar-border-radius, var(--cv-radius-md, 10px));
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
      }

      :host([orientation='vertical']) [part='base'] {
        flex-direction: column;
        align-items: stretch;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
    CVToolbarSeparator.define()
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.rebuildModelFromSlot(false, false)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.detachItemListeners()
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('orientation') || changedProperties.has('wrap') || changedProperties.has('ariaLabel')) {
      this.rebuildModelFromSlot(true, false)
      return
    }

    if (changedProperties.has('value')) {
      const next = this.value.trim()
      if (next && this.model.state.activeId() !== next) {
        const previous = this.model.state.activeId()
        this.model.actions.setActive(next)
        this.applyInteractionResult(previous)
      }
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    if (!changedProperties.has('value')) {
      this.syncItemElements()
      this.syncSeparatorElements()
    }
  }

  private getItemElements(): CVToolbarItem[] {
    return Array.from(this.children).filter(
      (element): element is CVToolbarItem => element.tagName.toLowerCase() === CVToolbarItem.elementName,
    )
  }

  private getSeparatorElements(): CVToolbarSeparator[] {
    return Array.from(this.children).filter(
      (element): element is CVToolbarSeparator => element.tagName.toLowerCase() === CVToolbarSeparator.elementName,
    )
  }

  private ensureItemValue(item: CVToolbarItem, index: number): string {
    const normalized = item.value?.trim()
    if (normalized) return normalized

    const fallback = `item-${index + 1}`
    item.value = fallback
    return fallback
  }

  private ensureSeparatorValue(sep: CVToolbarSeparator, index: number): string {
    const normalized = sep.value?.trim()
    if (normalized) return normalized

    const fallback = `sep-${index + 1}`
    sep.value = fallback
    return fallback
  }

  private rebuildModelFromSlot(preserveState: boolean, requestRender = true): void {
    const itemElements = this.getItemElements()
    const separatorElements = this.getSeparatorElements()
    const previousActiveId = preserveState ? this.model.state.activeId() : this.value.trim() || null

    this.detachItemListeners()

    this.itemRecords = itemElements.map((element, index) => ({
      id: this.ensureItemValue(element, index),
      disabled: element.disabled,
      element,
    }))

    this.separatorRecords = separatorElements.map((element, index) => ({
      id: this.ensureSeparatorValue(element, index),
      element,
    }))

    // Build ordered items list (items + separators) preserving DOM order
    const allHeadlessItems: Array<{id: string; disabled?: boolean; separator?: boolean}> = []
    for (const child of Array.from(this.children)) {
      const tag = child.tagName.toLowerCase()
      if (tag === CVToolbarItem.elementName) {
        const record = this.itemRecords.find((r) => r.element === child)
        if (record) allHeadlessItems.push({id: record.id, disabled: record.disabled})
      } else if (tag === CVToolbarSeparator.elementName) {
        const record = this.separatorRecords.find((r) => r.element === child)
        if (record) allHeadlessItems.push({id: record.id, separator: true})
      }
    }

    this.model = createToolbar({
      idBase: this.idBase,
      items: allHeadlessItems,
      orientation: this.orientation,
      wrap: this.wrap,
      ariaLabel: this.ariaLabel || undefined,
      initialActiveId: previousActiveId,
    })

    this.attachItemListeners()
    this.syncItemElements()
    this.syncSeparatorElements()
    this.value = this.model.state.activeId() ?? ''

    if (requestRender) {
      this.requestUpdate()
    }
  }

  private detachItemListeners(): void {
    for (const record of this.itemRecords) {
      const listeners = this.itemListeners.get(record.element)
      if (!listeners) continue

      record.element.removeEventListener('focus', listeners.focus)
      record.element.removeEventListener('click', listeners.click)
      this.itemListeners.delete(record.element)
    }
  }

  private attachItemListeners(): void {
    for (const record of this.itemRecords) {
      const focus = () => {
        this.handleItemFocus(record.id)
      }

      const click = () => {
        this.handleItemFocus(record.id)
      }

      record.element.addEventListener('focus', focus)
      record.element.addEventListener('click', click)
      this.itemListeners.set(record.element, {focus, click})
    }
  }

  private syncItemElements(): void {
    for (const record of this.itemRecords) {
      const props = this.model.contracts.getItemProps(record.id)
      record.element.id = props.id
      record.element.tabIndex = Number(props.tabindex)
      if (props['aria-disabled']) {
        record.element.setAttribute('aria-disabled', props['aria-disabled'])
      } else {
        record.element.removeAttribute('aria-disabled')
      }

      record.element.setAttribute('data-active', props['data-active'])
      record.element.active = props['data-active'] === 'true'
      record.element.disabled = props['aria-disabled'] === 'true'
    }
  }

  private syncSeparatorElements(): void {
    for (const record of this.separatorRecords) {
      const props = this.model.contracts.getSeparatorProps(record.id)
      record.element.id = props.id
      record.element.separatorRole = props.role
      record.element.separatorOrientation = props['aria-orientation']
    }
  }

  private dispatchInput(detail: CVToolbarEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVToolbarEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private focusActiveItem(): void {
    const activeId = this.model.state.activeId()
    if (!activeId) return

    const activeRecord = this.itemRecords.find((record) => record.id === activeId)
    activeRecord?.element.focus()
  }

  private applyInteractionResult(previousActiveId: string | null): void {
    this.syncItemElements()

    const nextActiveId = this.model.state.activeId()
    this.value = nextActiveId ?? ''
    if (nextActiveId === previousActiveId) return

    const detail = {activeId: nextActiveId}
    this.dispatchInput(detail)
    this.dispatchChange(detail)
    this.focusActiveItem()
  }

  private handleItemFocus(id: string): void {
    const previous = this.model.state.activeId()
    this.model.actions.setActive(id)
    this.applyInteractionResult(previous)
  }

  private handleToolbarKeyDown(event: KeyboardEvent) {
    if (toolbarKeysToPrevent.has(event.key)) {
      event.preventDefault()
    }

    const previous = this.model.state.activeId()
    this.model.actions.handleKeyDown({key: event.key})
    this.applyInteractionResult(previous)
  }

  private handleSlotChange() {
    this.rebuildModelFromSlot(true, true)
  }

  private handleFocusIn() {
    if (!this.hasFocus) {
      this.hasFocus = true
      this.model.actions.handleToolbarFocus()
      this.syncItemElements()
      this.value = this.model.state.activeId() ?? ''
    }
  }

  private handleFocusOut(event: FocusEvent) {
    const related = event.relatedTarget as Node | null
    if (!related || !this.contains(related)) {
      this.hasFocus = false
      this.model.actions.handleToolbarBlur()
    }
  }

  protected override render() {
    const rootProps = this.model.contracts.getRootProps()

    return html`
      <div
        id=${rootProps.id}
        role=${rootProps.role}
        aria-orientation=${rootProps['aria-orientation']}
        aria-label=${rootProps['aria-label'] ?? nothing}
        part="base"
        @keydown=${this.handleToolbarKeyDown}
        @focusin=${this.handleFocusIn}
        @focusout=${this.handleFocusOut}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
    `
  }
}
