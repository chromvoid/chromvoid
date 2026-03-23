import {createMenu, type MenuModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import {CVMenuItem} from './cv-menu-item'

export interface CVMenuEventDetail {
  value: string | null
  activeId: string | null
  open: boolean
}

interface MenuItemRecord {
  id: string
  label: string
  disabled: boolean
  type: 'normal' | 'checkbox' | 'radio'
  checked: boolean
  hasSubmenu: boolean
  group?: string
  element: CVMenuItem
}

interface MenuSnapshot {
  value: string | null
  activeId: string | null
  open: boolean
}

const menuKeysToPrevent = new Set([
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

let cvMenuNonce = 0

export class CVMenu extends ReatomLitElement {
  static elementName = 'cv-menu'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      open: {type: Boolean, reflect: true},
      closeOnSelect: {type: Boolean, attribute: 'close-on-select', reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
    }
  }

  declare value: string
  declare open: boolean
  declare closeOnSelect: boolean
  declare ariaLabel: string

  private readonly idBase = `cv-menu-${++cvMenuNonce}`
  private itemRecords: MenuItemRecord[] = []
  private itemListeners = new WeakMap<CVMenuItem, {click: EventListener; focus: EventListener}>()
  private model?: MenuModel

  constructor() {
    super()
    this.value = ''
    this.open = false
    this.closeOnSelect = true
    this.ariaLabel = ''
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-menu-gap, var(--cv-space-1, 4px));
        padding: var(--cv-menu-padding, var(--cv-space-1, 4px));
        border-radius: var(--cv-menu-border-radius, var(--cv-radius-md, 10px));
        border: 1px solid var(--cv-menu-border-color, var(--cv-color-border, #2a3245));
        background: var(--cv-menu-background, var(--cv-color-surface-elevated, #1d2432));
        box-shadow: var(--cv-menu-shadow, var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24)));
        max-height: var(--cv-menu-max-height, none);
        min-inline-size: var(--cv-menu-min-inline-size, 180px);
        overflow-y: auto;
      }

      [part='base'][hidden] {
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
    if (!this.model) {
      this.rebuildModelFromSlot(false, false)
    }

    this.syncOutsidePointerListener()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.detachItemListeners()
    this.syncOutsidePointerListener(true)
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('closeOnSelect') || changedProperties.has('ariaLabel')) {
      this.rebuildModelFromSlot(true, false)
      return
    }

    if (!this.model) return

    if (changedProperties.has('value')) {
      const normalized = this.value.trim()
      if (this.value !== normalized) {
        this.value = normalized
      }

      if (normalized.length > 0 && this.model.state.selectedId() !== normalized) {
        const previous = this.captureState()
        const wasOpen = this.model.state.isOpen()
        this.model.actions.select(normalized)
        if (wasOpen && !this.model.state.isOpen()) {
          this.model.actions.open()
        }

        this.applyInteractionResult(previous)
      }
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
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    this.syncOutsidePointerListener()

    if (!changedProperties.has('value') && !changedProperties.has('open')) {
      this.syncItemElements()
    }
  }

  private getItemElements(): CVMenuItem[] {
    const items: CVMenuItem[] = []
    for (const child of Array.from(this.children)) {
      if (child.tagName.toLowerCase() === CVMenuItem.elementName) {
        items.push(child as CVMenuItem)
      } else if (child.tagName.toLowerCase() === 'cv-menu-group') {
        for (const groupChild of Array.from(child.children)) {
          if (groupChild.tagName.toLowerCase() === CVMenuItem.elementName) {
            items.push(groupChild as CVMenuItem)
          }
        }
      }
    }
    return items
  }

  private ensureItemValue(item: CVMenuItem, index: number): string {
    const normalized = item.value?.trim()
    if (normalized) return normalized

    const fallback = `item-${index + 1}`
    item.value = fallback
    return fallback
  }

  private rebuildModelFromSlot(preserveState: boolean, requestRender = true): void {
    const itemElements = this.getItemElements()
    const previous = preserveState ? this.captureState() : {activeId: null, open: this.open, value: this.value || null}

    this.detachItemListeners()

    this.itemRecords = itemElements.map((element, index) => {
      const id = this.ensureItemValue(element, index)
      const label = element.label?.trim() || element.textContent?.trim() || id
      const itemType = element.type || 'normal'
      const hasSubmenu = element.hasSubmenu || element.querySelector('[slot="submenu"]') != null

      // Inherit type from parent cv-menu-group if not explicitly set
      let groupType: 'normal' | 'checkbox' | 'radio' = 'normal'
      let groupId: string | undefined
      const parent = element.parentElement
      if (parent && parent.tagName.toLowerCase() === 'cv-menu-group') {
        const parentType = parent.getAttribute('type')
        if (parentType === 'checkbox' || parentType === 'radio') {
          groupType = parentType
          groupId = parent.getAttribute('label') || undefined
        }
      }

      const effectiveType = itemType !== 'normal' ? itemType : groupType

      return {
        id,
        label,
        disabled: element.disabled,
        type: effectiveType as 'normal' | 'checkbox' | 'radio',
        checked: element.checked,
        hasSubmenu,
        group: groupId,
        element,
      }
    })

    const enabledIds = new Set(this.itemRecords.filter((record) => !record.disabled).map((record) => record.id))
    const initialActiveId = previous.activeId && enabledIds.has(previous.activeId) ? previous.activeId : null

    this.model = createMenu({
      idBase: this.idBase,
      items: this.itemRecords.map((record) => ({
        id: record.id,
        label: record.label,
        disabled: record.disabled,
        type: record.type,
        checked: record.checked,
        hasSubmenu: record.hasSubmenu,
        group: record.group,
      })),
      initialOpen: previous.open,
      initialActiveId,
      closeOnSelect: this.closeOnSelect,
      ariaLabel: this.ariaLabel || undefined,
    })

    if (previous.value && enabledIds.has(previous.value)) {
      const wasOpen = this.model.state.isOpen()
      this.model.actions.select(previous.value)
      if (wasOpen && !this.model.state.isOpen()) {
        this.model.actions.open()
      }
    }

    if (initialActiveId) {
      this.model.actions.setActive(initialActiveId)
    }

    this.attachItemListeners()
    this.syncItemElements()

    this.value = this.model.state.selectedId() ?? ''
    this.open = this.model.state.isOpen()

    if (requestRender) {
      this.requestUpdate()
    }
  }

  private detachItemListeners(): void {
    for (const record of this.itemRecords) {
      const listeners = this.itemListeners.get(record.element)
      if (!listeners) continue

      record.element.removeEventListener('click', listeners.click)
      record.element.removeEventListener('focus', listeners.focus)
      this.itemListeners.delete(record.element)
    }
  }

  private attachItemListeners(): void {
    if (!this.model) return

    for (const record of this.itemRecords) {
      const click = (event: Event) => {
        event.preventDefault()
        this.handleItemClick(record.id)
      }

      const focus = () => {
        this.handleItemFocus(record.id)
      }

      record.element.addEventListener('click', click)
      record.element.addEventListener('focus', focus)
      this.itemListeners.set(record.element, {click, focus})
    }
  }

  private syncItemElements(): void {
    if (!this.model) return

    const selected = this.model.state.selectedId()

    for (const record of this.itemRecords) {
      const props = this.model.contracts.getItemProps(record.id)

      record.element.id = props.id
      record.element.setAttribute('role', props.role)
      record.element.setAttribute('tabindex', props.tabindex)

      if (props['aria-disabled']) {
        record.element.setAttribute('aria-disabled', props['aria-disabled'])
      } else {
        record.element.removeAttribute('aria-disabled')
      }

      record.element.setAttribute('data-active', props['data-active'])
      record.element.active = props['data-active'] === 'true'
      record.element.selected = selected === record.id
      record.element.disabled = props['aria-disabled'] === 'true'
      record.element.hidden = !this.open

      // Sync aria-checked for checkable items
      if (props['aria-checked'] != null) {
        record.element.setAttribute('aria-checked', props['aria-checked'])
        record.element.checked = props['aria-checked'] === 'true'
      } else {
        record.element.removeAttribute('aria-checked')
      }

      // Sync aria-haspopup and aria-expanded for submenu items
      if (props['aria-haspopup']) {
        record.element.setAttribute('aria-haspopup', props['aria-haspopup'])
      } else {
        record.element.removeAttribute('aria-haspopup')
      }

      if (props['aria-expanded'] != null) {
        record.element.setAttribute('aria-expanded', props['aria-expanded'])
      } else {
        record.element.removeAttribute('aria-expanded')
      }
    }
  }

  private captureState(): MenuSnapshot {
    return {
      value: this.model?.state.selectedId() ?? (this.value.trim() || null),
      activeId: this.model?.state.activeId() ?? null,
      open: this.model?.state.isOpen() ?? this.open,
    }
  }

  private dispatchInput(detail: CVMenuEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVMenuEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private focusActiveItem(): void {
    if (!this.model || !this.open) return

    const activeId = this.model.state.activeId()
    if (!activeId) return

    const activeRecord = this.itemRecords.find((record) => record.id === activeId)
    activeRecord?.element.focus()
  }

  private applyInteractionResult(previous: MenuSnapshot): void {
    if (!this.model) return

    const next = this.captureState()
    this.value = next.value ?? ''
    this.open = next.open
    this.syncItemElements()

    const valueChanged = previous.value !== next.value
    const activeChanged = previous.activeId !== next.activeId
    const openChanged = previous.open !== next.open

    if (valueChanged || activeChanged || openChanged) {
      const detail: CVMenuEventDetail = {
        value: next.value,
        activeId: next.activeId,
        open: next.open,
      }

      this.dispatchInput(detail)
      if (valueChanged) {
        this.dispatchChange(detail)
      }
    }

    if (activeChanged) {
      this.focusActiveItem()
    }
  }

  private handleItemFocus(id: string): void {
    if (!this.model) return

    const previous = this.captureState()
    this.model.actions.setActive(id)
    this.applyInteractionResult(previous)
  }

  private handleItemClick(id: string): void {
    if (!this.model) return
    const record = this.itemRecords.find((item) => item.id === id)
    if (!record || record.disabled) return

    const previous = this.captureState()
    this.model.actions.select(id)
    this.applyInteractionResult(previous)
  }

  private handleMenuKeyDown(event: KeyboardEvent) {
    if (!this.model) return

    if (menuKeysToPrevent.has(event.key)) {
      event.preventDefault()
    }

    const previous = this.captureState()

    this.model.actions.handleMenuKeyDown({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
    })

    this.applyInteractionResult(previous)
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
    if (!this.model || !this.model.state.isOpen()) return

    const path = event.composedPath()
    if (path.includes(this)) return

    const previous = this.captureState()
    this.model.actions.close()
    this.applyInteractionResult(previous)
  }

  private handleSlotChange() {
    this.rebuildModelFromSlot(true, true)
  }

  protected override render() {
    const menuProps = this.model?.contracts.getMenuProps() ?? {
      id: `${this.idBase}-menu`,
      role: 'menu' as const,
      tabindex: '-1' as const,
      'aria-label': this.ariaLabel || undefined,
    }

    return html`
      <div
        id=${menuProps.id}
        role=${menuProps.role}
        tabindex=${menuProps.tabindex}
        aria-label=${menuProps['aria-label'] ?? nothing}
        ?hidden=${!this.open}
        part="base"
        @keydown=${this.handleMenuKeyDown}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
    `
  }
}
