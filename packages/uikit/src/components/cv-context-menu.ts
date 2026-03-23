import {createContextMenu, type ContextMenuModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import {CVMenuItem} from './cv-menu-item'

export interface CVContextMenuEventDetail {
  value: string | null
  activeId: string | null
  open: boolean
  anchorX: number
  anchorY: number
  openedBy: string | null
}

interface MenuItemRecord {
  id: string
  label: string
  disabled: boolean
  element: CVMenuItem
}

interface ContextMenuSnapshot {
  value: string | null
  activeId: string | null
  open: boolean
  anchorX: number
  anchorY: number
  openedBy: string | null
  restoreTargetId: string | null
}

const contextMenuKeysToPrevent = new Set([
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

let cvContextMenuNonce = 0

export class CVContextMenu extends ReatomLitElement {
  static elementName = 'cv-context-menu'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      open: {type: Boolean, reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
      closeOnSelect: {type: Boolean, attribute: 'close-on-select', reflect: true},
      closeOnOutsidePointer: {type: Boolean, attribute: 'close-on-outside-pointer', reflect: true},
      anchorX: {type: Number, attribute: 'anchor-x', reflect: true},
      anchorY: {type: Number, attribute: 'anchor-y', reflect: true},
    }
  }

  declare value: string
  declare open: boolean
  declare ariaLabel: string
  declare closeOnSelect: boolean
  declare closeOnOutsidePointer: boolean
  declare anchorX: number
  declare anchorY: number

  private readonly idBase = `cv-context-menu-${++cvContextMenuNonce}`
  private itemRecords: MenuItemRecord[] = []
  private itemListeners = new WeakMap<CVMenuItem, {click: EventListener}>()
  private model?: ContextMenuModel
  /**
   * Context menus open with no visually-active item; the first arrow key press
   * activates the first (ArrowDown) or last (ArrowUp) enabled item.
   * The headless menu always sets an initial active on open, so the UIKit layer
   * suppresses the visual active state until the first navigation key is pressed.
   */
  private _suppressActiveUntilNav = false
  /**
   * Guards against duplicate willUpdate processing when value was already
   * applied by an interaction handler (click, keyboard, imperative).
   */
  private _valueAppliedByInteraction = false

  constructor() {
    super()
    this.value = ''
    this.open = false
    this.ariaLabel = ''
    this.closeOnSelect = true
    this.closeOnOutsidePointer = true
    this.anchorX = 0
    this.anchorY = 0
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      [part='target'] {
        display: block;
        min-inline-size: 1px;
        min-block-size: 1px;
        outline: none;
      }

      [part='target']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 2px;
      }

      [part='menu'] {
        position: fixed;
        inset-inline-start: var(--cv-context-menu-x, 0px);
        inset-block-start: var(--cv-context-menu-y, 0px);
        z-index: var(--cv-context-menu-z-index, 80);
        min-inline-size: var(--cv-context-menu-min-inline-size, 180px);
        display: grid;
        gap: var(--cv-context-menu-gap, var(--cv-space-1, 4px));
        padding: var(--cv-context-menu-padding, var(--cv-space-1, 4px));
        border-radius: var(--cv-context-menu-border-radius, var(--cv-radius-md, 10px));
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        box-shadow: var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24));
      }

      [part='menu'][hidden] {
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

    if (changedProperties.has('ariaLabel') || changedProperties.has('closeOnSelect') || changedProperties.has('closeOnOutsidePointer')) {
      this.rebuildModelFromSlot(true, false)
      return
    }

    if (!this.model) return

    if (changedProperties.has('open') && this.model.state.isOpen() !== this.open) {
      const previous = this.captureState()
      if (this.open) {
        this.model.actions.openAt(this.anchorX, this.anchorY)
      } else {
        this.model.actions.close()
      }

      this.applyInteractionResult(previous)
    }

    if (changedProperties.has('value')) {
      // Skip if the value was already applied by an interaction handler.
      if (this._valueAppliedByInteraction) {
        this._valueAppliedByInteraction = false
        return
      }

      const normalized = this.value.trim()
      if (this.value !== normalized) {
        this.value = normalized
      }

      const oldValue = (changedProperties.get('value') as string | undefined)?.trim() || null

      if (normalized.length > 0 && normalized !== (oldValue ?? '')) {
        const previous = this.captureState()
        // Override previous.value with the actual old value since captureState
        // reads this.value which already holds the new value at willUpdate time.
        previous.value = oldValue
        const wasOpen = this.model.state.isOpen()
        this.model.actions.select(normalized)
        if (wasOpen && !this.model.state.isOpen()) {
          this.model.actions.openAt(previous.anchorX, previous.anchorY)
        }

        this.applyInteractionResult(previous, normalized)
      }
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    this.syncOutsidePointerListener()

    if (!changedProperties.has('open') && !changedProperties.has('value')) {
      this.syncItemElements()
    }
  }

  openAt(x: number, y: number): void {
    if (!this.model) return

    const previous = this.captureState()
    this.model.actions.openAt(x, y)
    this.applyInteractionResult(previous)
  }

  close(): void {
    if (!this.model) return

    const previous = this.captureState()
    this.model.actions.close()
    this.applyInteractionResult(previous)
  }

  private getItemElements(): CVMenuItem[] {
    return Array.from(this.children).filter(
      (element): element is CVMenuItem => element.tagName.toLowerCase() === CVMenuItem.elementName,
    )
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
    const previous = preserveState
      ? this.captureState()
      : {
          value: this.value.trim() || null,
          activeId: null,
          open: this.open,
          anchorX: this.anchorX,
          anchorY: this.anchorY,
          openedBy: null,
          restoreTargetId: null,
        }

    this.detachItemListeners()

    this.itemRecords = itemElements.map((element, index) => {
      const id = this.ensureItemValue(element, index)
      const label = element.textContent?.trim() || id

      return {
        id,
        label,
        disabled: element.disabled,
        element,
      }
    })

    const enabledIds = new Set(this.itemRecords.filter((record) => !record.disabled).map((record) => record.id))
    const initialValue = previous.value && enabledIds.has(previous.value) ? previous.value : null

    this.model = createContextMenu({
      idBase: this.idBase,
      items: this.itemRecords.map((record) => ({
        id: record.id,
        label: record.label,
        disabled: record.disabled,
      })),
      ariaLabel: this.ariaLabel || undefined,
      closeOnSelect: this.closeOnSelect,
      closeOnOutsidePointer: this.closeOnOutsidePointer,
    })

    if (previous.open) {
      this.model.actions.openAt(previous.anchorX, previous.anchorY)
      if (previous.activeId) {
        const key = this.itemRecords[0]?.id === previous.activeId ? 'Home' : 'End'
        this.model.actions.handleKeyDown({key})
      }
    }

    if (initialValue) {
      const wasOpen = this.model.state.isOpen()
      this.model.actions.select(initialValue)
      if (wasOpen && !this.model.state.isOpen()) {
        this.model.actions.openAt(previous.anchorX, previous.anchorY)
      }
    }

    this.attachItemListeners()
    this.syncItemElements()

    this.value = initialValue ?? ''
    this.open = this.model.state.isOpen()
    this.anchorX = this.model.state.anchorX()
    this.anchorY = this.model.state.anchorY()

    if (requestRender) {
      this.requestUpdate()
    }
  }

  private detachItemListeners(): void {
    for (const record of this.itemRecords) {
      const listeners = this.itemListeners.get(record.element)
      if (!listeners) continue

      record.element.removeEventListener('click', listeners.click)
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

      record.element.addEventListener('click', click)
      this.itemListeners.set(record.element, {click})
    }
  }

  private syncItemElements(): void {
    if (!this.model) return

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

      const isActive = this._suppressActiveUntilNav ? false : props['data-active'] === 'true'
      record.element.setAttribute('data-active', isActive ? 'true' : 'false')
      record.element.active = isActive
      record.element.selected = this.value === record.id
      record.element.disabled = props['aria-disabled'] === 'true'
      record.element.hidden = !this.open
    }
  }

  private captureState(): ContextMenuSnapshot {
    return {
      value: this.value.trim() || null,
      activeId: this.model?.state.activeId() ?? null,
      open: this.model?.state.isOpen() ?? this.open,
      anchorX: this.model?.state.anchorX() ?? this.anchorX,
      anchorY: this.model?.state.anchorY() ?? this.anchorY,
      openedBy: this.model?.state.openedBy() ?? null,
      restoreTargetId: this.model?.state.restoreTargetId() ?? null,
    }
  }

  private dispatchInput(detail: CVContextMenuEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVContextMenuEventDetail): void {
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

  private applyInteractionResult(previous: ContextMenuSnapshot, nextSelectedValue?: string | null): void {
    if (!this.model) return

    const next = this.captureState()
    const nextValue = nextSelectedValue === undefined ? previous.value : nextSelectedValue

    const prevValue = this.value
    this.value = nextValue ?? ''
    if (this.value !== prevValue) {
      this._valueAppliedByInteraction = true
    }
    this.open = next.open
    this.anchorX = next.anchorX
    this.anchorY = next.anchorY
    this.syncItemElements()

    const valueChanged = previous.value !== nextValue
    const activeChanged = previous.activeId !== next.activeId
    const openChanged = previous.open !== next.open
    const anchorChanged = previous.anchorX !== next.anchorX || previous.anchorY !== next.anchorY

    if (valueChanged || activeChanged || openChanged || anchorChanged) {
      const detail: CVContextMenuEventDetail = {
        value: nextValue,
        activeId: next.activeId,
        open: next.open,
        anchorX: next.anchorX,
        anchorY: next.anchorY,
        openedBy: next.openedBy,
      }

      this.dispatchInput(detail)
      if (valueChanged) {
        this.dispatchChange(detail)
      }
    }

    if (openChanged && next.open) {
      this._suppressActiveUntilNav = true
    }

    if (openChanged || activeChanged) {
      this.focusActiveItem()
    }

    if (!next.open && next.restoreTargetId && previous.restoreTargetId !== next.restoreTargetId) {
      const target = this.shadowRoot?.querySelector(`[id="${next.restoreTargetId}"]`) as HTMLElement | null
      target?.focus()
    }
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
    this.model.actions.handleOutsidePointer()
    this.applyInteractionResult(previous)
  }

  private handleTargetContextMenu(event: MouseEvent) {
    if (!this.model) return

    const previous = this.captureState()
    this.model.contracts.getTargetProps().onContextMenu({
      clientX: event.clientX,
      clientY: event.clientY,
      preventDefault: () => event.preventDefault(),
    })

    this.applyInteractionResult(previous)
  }

  private handleTargetKeyDown(event: KeyboardEvent) {
    if (!this.model) return

    const isContextKey = event.key === 'ContextMenu'
    const isShiftF10 = event.key === 'F10' && event.shiftKey
    if (isContextKey || isShiftF10) {
      event.preventDefault()
    }

    const previous = this.captureState()
    this.model.contracts.getTargetProps().onKeyDown({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
    })

    this.applyInteractionResult(previous)
  }

  private handleMenuKeyDown(event: KeyboardEvent) {
    if (!this.model) return

    if (contextMenuKeysToPrevent.has(event.key)) {
      event.preventDefault()
    }

    const previous = this.captureState()
    const isSelectionKey = event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar'
    const isNavKey = event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End'

    // When the menu just opened, the first navigation key should move to the
    // first or last item (not advance from the headless-set initial active).
    if (this._suppressActiveUntilNav && isNavKey) {
      this._suppressActiveUntilNav = false
      const remappedKey = event.key === 'ArrowDown' || event.key === 'Home' ? 'Home' : 'End'
      this.model.actions.handleKeyDown({
        key: remappedKey,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
      })
      this.applyInteractionResult(previous)
      return
    }

    if (isNavKey || isSelectionKey) {
      this._suppressActiveUntilNav = false
    }

    // For Space/Spacebar the headless menu maps to TOGGLE_SELECTION (a no-op
    // for context menus), so we handle selection explicitly at the UIKit layer.
    if ((event.key === ' ' || event.key === 'Spacebar') && this.model.state.activeId()) {
      const activeId = this.model.state.activeId()!
      this.model.actions.select(activeId)
      this.applyInteractionResult(previous, activeId)
      return
    }

    const selectedCandidate =
      event.key === 'Enter' ? this.model.state.activeId() : undefined

    this.model.actions.handleKeyDown({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
    })

    this.applyInteractionResult(previous, selectedCandidate)
  }

  private handleItemClick(id: string): void {
    if (!this.model) return

    const record = this.itemRecords.find((item) => item.id === id)
    if (!record || record.disabled) return

    const previous = this.captureState()
    this.model.contracts.getItemProps(id).onClick()
    this.applyInteractionResult(previous, id)
  }

  private handleSlotChange() {
    this.rebuildModelFromSlot(true, true)
  }

  protected override render() {
    const targetProps = this.model?.contracts.getTargetProps() ?? {
      id: `${this.idBase}-target`,
    }

    const menuProps = this.model?.contracts.getMenuProps() ?? {
      id: `${this.idBase}-menu`,
      role: 'menu' as const,
      tabindex: '-1' as const,
      hidden: !this.open,
      'aria-label': this.ariaLabel || undefined,
      'data-anchor-x': String(this.anchorX),
      'data-anchor-y': String(this.anchorY),
    }

    return html`
      <div
        id=${targetProps.id}
        tabindex="0"
        part="target"
        @contextmenu=${this.handleTargetContextMenu}
        @keydown=${this.handleTargetKeyDown}
      >
        <slot name="target"></slot>
      </div>

      <div
        id=${menuProps.id}
        role=${menuProps.role}
        tabindex=${menuProps.tabindex}
        aria-label=${menuProps['aria-label'] ?? nothing}
        data-anchor-x=${menuProps['data-anchor-x']}
        data-anchor-y=${menuProps['data-anchor-y']}
        style=${`--cv-context-menu-x:${this.anchorX}px; --cv-context-menu-y:${this.anchorY}px;`}
        ?hidden=${menuProps.hidden}
        part="menu"
        @keydown=${this.handleMenuKeyDown}
      >
        <slot @slotchange=${this.handleSlotChange}></slot>
      </div>
    `
  }
}
