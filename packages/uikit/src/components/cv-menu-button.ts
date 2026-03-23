import {createMenuButton, type MenuButtonModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import {CVIcon} from './cv-icon'
import {CVMenuItem} from './cv-menu-item'

export interface CVMenuButtonEventDetail {
  value: string | null
  activeId: string | null
  open: boolean
}

export type CVMenuButtonInputEvent = CustomEvent<CVMenuButtonEventDetail>
export type CVMenuButtonChangeEvent = CustomEvent<CVMenuButtonEventDetail>
export type CVMenuButtonActionEvent = CustomEvent<Record<string, never>>

export interface CVMenuButtonEventMap {
  'cv-input': CVMenuButtonInputEvent
  'cv-change': CVMenuButtonChangeEvent
  'cv-action': CVMenuButtonActionEvent
}

interface MenuItemRecord {
  id: string
  label: string
  disabled: boolean
  element: CVMenuItem
}

const menuButtonKeysToPrevent = new Set([
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

let cvMenuButtonNonce = 0

export class CVMenuButton extends ReatomLitElement {
  static elementName = 'cv-menu-button'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      open: {type: Boolean, reflect: true},
      disabled: {type: Boolean, reflect: true},
      split: {type: Boolean, reflect: true},
      size: {type: String, reflect: true},
      variant: {type: String, reflect: true},
      closeOnSelect: {type: Boolean, attribute: 'close-on-select', reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
    }
  }

  declare value: string
  declare open: boolean
  declare disabled: boolean
  declare split: boolean
  declare size: 'small' | 'medium' | 'large'
  declare variant: 'default' | 'primary' | 'danger' | 'ghost'
  declare closeOnSelect: boolean
  declare ariaLabel: string

  private readonly idBase = `cv-menu-button-${++cvMenuButtonNonce}`
  private itemRecords: MenuItemRecord[] = []
  private itemListeners = new WeakMap<CVMenuItem, {click: EventListener; keydown: EventListener}>()
  private hasPrefixContent = false
  private hasLabelContent = false
  private hasSuffixContent = false
  private model?: MenuButtonModel
  private hasLayoutListeners = false
  private layoutFrame = -1

  constructor() {
    super()
    this.value = ''
    this.open = false
    this.disabled = false
    this.split = false
    this.size = 'medium'
    this.variant = 'default'
    this.closeOnSelect = true
    this.ariaLabel = ''
  }

  static styles = [
    css`
      :host {
        display: inline-block;
        --cv-menu-button-min-height: 36px;
        --cv-menu-button-padding-inline: var(--cv-space-3, 12px);
        --cv-menu-button-padding-block: var(--cv-space-2, 8px);
        --cv-menu-button-border-radius: var(--cv-radius-sm, 6px);
        --cv-menu-button-gap: var(--cv-space-2, 8px);
        --cv-menu-button-font-size: inherit;
        --cv-menu-button-menu-offset: var(--cv-space-1, 4px);
        --cv-menu-button-menu-min-inline-size: 180px;
        --cv-menu-button-menu-z-index: 20;
      }

      [part='base'] {
        position: relative;
        display: inline-flex;
      }

      /* --- shared button styles --- */
      [part='trigger'],
      [part='action'],
      [part='dropdown'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--cv-menu-button-gap);
        min-block-size: var(--cv-menu-button-min-height);
        padding: var(--cv-menu-button-padding-block) var(--cv-menu-button-padding-inline);
        font-size: var(--cv-menu-button-font-size);
        border-radius: var(--cv-menu-button-border-radius);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        cursor: pointer;
        font: inherit;
      }

      [part='trigger']:focus-visible,
      [part='action']:focus-visible,
      [part='dropdown']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      /* --- label / prefix / suffix / dropdown-icon --- */
      [part='label'] {
        display: inline-flex;
        align-items: center;
      }

      [part='prefix'],
      [part='suffix'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      [part='prefix'][hidden],
      [part='label'][hidden],
      [part='suffix'][hidden] {
        display: none;
      }

      [part='dropdown-icon'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      [part='dropdown-icon'] svg {
        width: 12px;
        height: 12px;
        fill: currentColor;
      }

      /* --- menu popup --- */
      [part='menu'] {
        position: absolute;
        left: 0;
        top: calc(100% + var(--cv-menu-button-menu-offset));
        z-index: var(--cv-menu-button-menu-z-index);
        box-sizing: border-box;
        inline-size: fit-content;
        min-inline-size: var(--cv-menu-button-menu-min-inline-size);
        max-inline-size: var(--cv-menu-button-menu-max-inline-size, calc(100vw - 16px));
        max-block-size: var(--cv-menu-button-menu-max-block-size, calc(100dvh - 16px));
        display: inline-grid;
        gap: var(--cv-space-1, 4px);
        align-content: start;
        padding: var(--cv-space-1, 4px);
        border-radius: var(--cv-radius-md, 10px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        box-shadow: var(--cv-shadow-1, 0 2px 8px rgba(0, 0, 0, 0.24));
        overflow-y: auto;
      }

      [part='menu'][hidden] {
        display: none;
      }

      ::slotted([slot='menu']) {
        display: block;
      }

      /* --- :host([open]) --- */
      :host([open]) [part='trigger'],
      :host([open]) [part='dropdown'] {
        border-color: var(--cv-color-primary, #65d7ff);
      }

      /* --- :host([disabled]) --- */
      :host([disabled]) {
        opacity: 0.55;
        pointer-events: none;
        cursor: not-allowed;
      }

      /* --- :host([split]) --- */
      :host([split]) [part='base'] {
        display: inline-flex;
      }

      :host([split]) [part='action'] {
        border-start-end-radius: 0;
        border-end-end-radius: 0;
        border-inline-end: none;
      }

      :host([split]) [part='dropdown'] {
        border-start-start-radius: 0;
        border-end-start-radius: 0;
        padding-inline: var(--cv-space-2, 8px);
      }

      /* --- sizes --- */
      :host([size='small']) {
        --cv-menu-button-min-height: 30px;
        --cv-menu-button-padding-inline: var(--cv-space-2, 8px);
        --cv-menu-button-padding-block: var(--cv-space-1, 4px);
      }

      :host([size='large']) {
        --cv-menu-button-min-height: 42px;
        --cv-menu-button-padding-inline: var(--cv-space-4, 16px);
        --cv-menu-button-padding-block: var(--cv-space-2, 8px);
      }

      /* --- variant: default --- */
      :host([variant='default']) [part='trigger'],
      :host([variant='default']) [part='action'],
      :host([variant='default']) [part='dropdown'] {
        border-color: var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
      }

      /* --- variant: primary --- */
      :host([variant='primary']) [part='trigger'],
      :host([variant='primary']) [part='action'],
      :host([variant='primary']) [part='dropdown'] {
        border-color: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 22%, var(--cv-color-surface, #141923));
      }

      /* --- variant: danger --- */
      :host([variant='danger']) [part='trigger'],
      :host([variant='danger']) [part='action'],
      :host([variant='danger']) [part='dropdown'] {
        border-color: color-mix(in oklab, var(--cv-color-danger, #ff7d86) 52%, var(--cv-color-border, #2a3245));
        background: color-mix(in oklab, var(--cv-color-danger, #ff7d86) 22%, var(--cv-color-surface, #141923));
      }

      /* --- variant: ghost --- */
      :host([variant='ghost']) [part='trigger'],
      :host([variant='ghost']) [part='action'],
      :host([variant='ghost']) [part='dropdown'] {
        background: transparent;
        border-color: transparent;
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
    this.syncContentParts()
    if (!this.model) {
      this.rebuildModelFromSlot(false, false)
    }

    this.syncOutsidePointerListener()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.detachItemListeners()
    this.syncOutsidePointerListener(true)
    this.toggleLayoutListeners(false)
    this.cancelLayoutFrame()
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('closeOnSelect') || changedProperties.has('ariaLabel') || changedProperties.has('split')) {
      this.rebuildModelFromSlot(true, false)
      return
    }

    if (!this.model) return

    if (changedProperties.has('value')) {
      const next = this.value.trim()
      if (next.length > 0 && this.value !== next) {
        this.value = next
      }

      if (next.length > 0) {
        const record = this.itemRecords.find((item) => item.id === next)
        if (record && !record.disabled) {
          const previous = this.captureState()
          this.model.actions.select(next)
          this.applyInteractionResult(previous, next)
        }
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

    const shouldTrackLayout = this.open
    this.toggleLayoutListeners(shouldTrackLayout)

    if (this.open) {
      const menu = this.getMenuElement()
      if (menu) {
        menu.style.visibility = 'hidden'
      }
      this.scheduleLayout()
    } else {
      this.cancelLayoutFrame()
      const menu = this.getMenuElement()
      if (menu) {
        this.clearInlineLayout(menu)
      }
    }

    if (!changedProperties.has('value') && !changedProperties.has('open')) {
      this.syncItemElements()
    }
  }

  private getMenuElement(): HTMLElement | null {
    return this.shadowRoot?.querySelector('[part="menu"]') as HTMLElement | null
  }

  private getBaseElement(): HTMLElement | null {
    return this.shadowRoot?.querySelector('[part="base"]') as HTMLElement | null
  }

  private clearInlineLayout(menu: HTMLElement): void {
    menu.style.position = ''
    menu.style.top = ''
    menu.style.left = ''
    menu.style.bottom = ''
    menu.style.right = ''
    menu.style.transform = ''
    menu.style.translate = ''
    menu.style.minWidth = ''
    menu.style.visibility = ''
  }

  private getMenuOffset(): number {
    const raw = getComputedStyle(this).getPropertyValue('--cv-menu-button-menu-offset').trim()
    const parsed = Number.parseFloat(raw)
    return Number.isFinite(parsed) ? parsed : 4
  }

  private getMenuMinInlineSize(): number {
    const raw = getComputedStyle(this).getPropertyValue('--cv-menu-button-menu-min-inline-size').trim()
    const parsed = Number.parseFloat(raw)
    return Number.isFinite(parsed) ? parsed : 180
  }

  private applyMenuLayout(menu: HTMLElement, base: HTMLElement): void {
    const baseRect = base.getBoundingClientRect()
    const minWidth = Math.max(this.getMenuMinInlineSize(), Math.ceil(baseRect.width))

    menu.style.position = 'absolute'
    menu.style.minWidth = `${minWidth}px`
    menu.style.top = '0px'
    menu.style.left = '0px'
    menu.style.bottom = 'auto'
    menu.style.right = 'auto'
    menu.style.transform = 'none'
    menu.style.translate = 'none'
    menu.style.visibility = 'hidden'

    const menuRect = menu.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const gap = this.getMenuOffset()
    const viewportPadding = 8

    const spaceAbove = Math.max(0, baseRect.top - viewportPadding - gap)
    const spaceBelow = Math.max(0, viewportHeight - baseRect.bottom - viewportPadding - gap)
    const placeAbove = spaceBelow < menuRect.height + gap && spaceAbove > spaceBelow

    let top = placeAbove ? baseRect.top - menuRect.height - gap : baseRect.bottom + gap
    let left = baseRect.left

    const maxLeft = Math.max(viewportPadding, viewportWidth - menuRect.width - viewportPadding)
    const maxTop = Math.max(viewportPadding, viewportHeight - menuRect.height - viewportPadding)

    left = Math.min(Math.max(left, viewportPadding), maxLeft)
    top = Math.min(Math.max(top, viewportPadding), maxTop)

    menu.style.position = 'absolute'
    menu.style.top = `${top - baseRect.top}px`
    menu.style.left = `${left - baseRect.left}px`
    menu.style.bottom = 'auto'
    menu.style.right = 'auto'
    menu.style.transform = 'none'
    menu.style.translate = 'none'
    menu.style.visibility = 'visible'
  }

  private syncMenuLayout(): void {
    const menu = this.getMenuElement()
    const base = this.getBaseElement()
    if (!menu || !base) return

    this.applyMenuLayout(menu, base)
  }

  private cancelLayoutFrame(): void {
    if (this.layoutFrame === -1) return
    cancelAnimationFrame(this.layoutFrame)
    this.layoutFrame = -1
  }

  private scheduleLayout(): void {
    this.cancelLayoutFrame()
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = -1
      this.syncMenuLayout()
    })
  }

  private toggleLayoutListeners(nextState: boolean): void {
    if (this.hasLayoutListeners === nextState) return

    this.hasLayoutListeners = nextState
    if (nextState) {
      window.addEventListener('resize', this.handleViewportChange)
      window.addEventListener('scroll', this.handleViewportChange, true)
      return
    }

    window.removeEventListener('resize', this.handleViewportChange)
    window.removeEventListener('scroll', this.handleViewportChange, true)
  }

  private handleViewportChange = () => {
    if (!this.open) return
    this.scheduleLayout()
  }

  private getItemElements(): CVMenuItem[] {
    return Array.from(this.querySelectorAll(':scope > [slot="menu"]')).filter(
      (element): element is CVMenuItem => element.tagName.toLowerCase() === CVMenuItem.elementName,
    )
  }

  private syncContentParts(): boolean {
    const nextPrefixContent = this.hasNamedSlotContent('prefix')
    const nextLabelContent = this.hasDefaultSlotContent()
    const nextSuffixContent = this.hasNamedSlotContent('suffix')

    const changed =
      this.hasPrefixContent !== nextPrefixContent ||
      this.hasLabelContent !== nextLabelContent ||
      this.hasSuffixContent !== nextSuffixContent

    this.hasPrefixContent = nextPrefixContent
    this.hasLabelContent = nextLabelContent
    this.hasSuffixContent = nextSuffixContent

    return changed
  }

  private hasNamedSlotContent(slotName: string): boolean {
    return Array.from(this.children).some((node) => node.getAttribute('slot') === slotName)
  }

  private hasDefaultSlotContent(): boolean {
    for (const node of this.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        return true
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        continue
      }

      const element = node as Element
      const slotName = element.getAttribute('slot')
      if (!slotName) {
        return true
      }
    }

    return false
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
      const label = element.textContent?.trim() || id

      return {
        id,
        label,
        disabled: element.disabled,
        element,
      }
    })

    const enabledIds = new Set(this.itemRecords.filter((record) => !record.disabled).map((record) => record.id))
    const initialActiveId = previous.activeId && enabledIds.has(previous.activeId) ? previous.activeId : null

    this.model = createMenuButton({
      idBase: this.idBase,
      items: this.itemRecords.map((record) => ({
        id: record.id,
        label: record.label,
        disabled: record.disabled,
      })),
      ariaLabel: this.ariaLabel || undefined,
      initialOpen: previous.open,
      initialActiveId,
      closeOnSelect: this.closeOnSelect,
    })

    this.value = previous.value ?? ''
    this.open = this.model.state.isOpen()
    this.prefetchMenuIcons()
    this.attachItemListeners()
    this.syncItemElements()

    if (requestRender) {
      this.requestUpdate()
    }
  }

  private prefetchMenuIcons(): void {
    const names: string[] = []
    for (const record of this.itemRecords) {
      const icons = record.element.querySelectorAll<HTMLElement>(CVIcon.elementName)
      for (const icon of icons) {
        const name = icon.getAttribute('name')
        if (name) names.push(name)
      }
    }
    if (names.length > 0) {
      CVIcon.prefetch(names)
    }
  }

  private detachItemListeners(): void {
    for (const record of this.itemRecords) {
      const listeners = this.itemListeners.get(record.element)
      if (!listeners) continue

      record.element.removeEventListener('click', listeners.click)
      record.element.removeEventListener('keydown', listeners.keydown)
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

      const keydown = (event: Event) => {
        event.stopPropagation()
        this.handleKeyDown(event as KeyboardEvent)
      }

      record.element.addEventListener('click', click)
      record.element.addEventListener('keydown', keydown)
      this.itemListeners.set(record.element, {click, keydown})
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

      record.element.setAttribute('data-active', props['data-active'])
      record.element.active = props['data-active'] === 'true'
      record.element.selected = this.value === record.id
      record.element.disabled = props['aria-disabled'] === 'true'
      record.element.hidden = !this.open
    }
  }

  private captureState() {
    return {
      value: this.value.trim() || null,
      activeId: this.model?.state.activeId() ?? null,
      open: this.model?.state.isOpen() ?? this.open,
      restoreTargetId: this.model?.state.restoreTargetId() ?? null,
    }
  }

  private dispatchInput(detail: CVMenuButtonEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVMenuButtonEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchAction(): void {
    this.dispatchEvent(
      new CustomEvent<CVMenuButtonActionEvent['detail']>('cv-action', {
        detail: {},
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

  private applyInteractionResult(
    previous: {value: string | null; activeId: string | null; open: boolean; restoreTargetId: string | null},
    nextSelectedValue?: string | null,
  ): void {
    if (!this.model) return

    const next = this.captureState()
    const value = nextSelectedValue === undefined ? previous.value : nextSelectedValue

    this.value = value ?? ''
    this.open = next.open
    this.syncItemElements()

    const valueChanged = previous.value !== value
    const activeChanged = previous.activeId !== next.activeId
    const openChanged = previous.open !== next.open

    if (valueChanged || activeChanged || openChanged) {
      const detail: CVMenuButtonEventDetail = {
        value,
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

    if (next.restoreTargetId) {
      const trigger = this.shadowRoot?.querySelector(`[id="${next.restoreTargetId}"]`) as HTMLElement | null
      trigger?.focus()
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

  private handleItemClick(id: string): void {
    if (!this.model) return
    const record = this.itemRecords.find((item) => item.id === id)
    if (!record || record.disabled) return

    const previous = this.captureState()
    this.model.actions.select(id)
    this.applyInteractionResult(previous, id)
  }

  private handleTriggerClick() {
    if (this.disabled || !this.model) return

    const previous = this.captureState()
    this.model.contracts.getTriggerProps().onClick()
    this.applyInteractionResult(previous)
  }

  private handleActionClick() {
    if (this.disabled) return
    this.dispatchAction()
  }

  private handleDropdownClick() {
    if (this.disabled || !this.model) return

    const previous = this.captureState()
    this.model.contracts.getTriggerProps().onClick()
    this.applyInteractionResult(previous)
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (!this.model) return

    if (menuButtonKeysToPrevent.has(event.key)) {
      event.preventDefault()
    }

    const previous = this.captureState()
    const selectedCandidate =
      this.model.state.isOpen() && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')
        ? this.model.state.activeId()
        : previous.value

    this.model.actions.handleKeyDown({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
    })

    this.applyInteractionResult(previous, selectedCandidate)
  }

  private handleMenuSlotChange() {
    this.rebuildModelFromSlot(true, true)
  }

  private handleContentSlotChange() {
    if (this.syncContentParts()) {
      this.requestUpdate()
    }
  }

  private renderDropdownIcon() {
    return html`<span part="dropdown-icon" aria-hidden="true"
      ><svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
        <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg></span
    >`
  }

  private renderSplitMode() {
    const triggerProps = this.model?.contracts.getTriggerProps()

    const menuProps = this.model?.contracts.getMenuProps() ?? {
      id: `${this.idBase}-menu`,
      role: 'menu' as const,
      tabindex: '-1' as const,
      'aria-label': this.ariaLabel || undefined,
      hidden: !this.open,
    }

    return html`
      <div part="base">
        <button
          type="button"
          part="action"
          ?disabled=${this.disabled}
          @click=${this.handleActionClick}
        >
          <span part="prefix" ?hidden=${!this.hasPrefixContent}
            ><slot name="prefix" @slotchange=${this.handleContentSlotChange}></slot
          ></span>
          <span part="label" ?hidden=${!this.hasLabelContent}
            ><slot @slotchange=${this.handleContentSlotChange}></slot
          ></span>
          <span part="suffix" ?hidden=${!this.hasSuffixContent}
            ><slot name="suffix" @slotchange=${this.handleContentSlotChange}></slot
          ></span>
        </button>

        <button
          id=${triggerProps?.id ?? `${this.idBase}-trigger`}
          type="button"
          part="dropdown"
          tabindex=${triggerProps?.tabindex ?? '0'}
          aria-haspopup=${triggerProps?.['aria-haspopup'] ?? 'menu'}
          aria-expanded=${triggerProps?.['aria-expanded'] ?? (this.open ? 'true' : 'false')}
          aria-controls=${triggerProps?.['aria-controls'] ?? `${this.idBase}-menu`}
          aria-label=${triggerProps?.['aria-label'] ?? 'More options'}
          ?disabled=${this.disabled}
          @click=${this.handleDropdownClick}
          @keydown=${this.handleKeyDown}
        >
          ${this.renderDropdownIcon()}
        </button>

        <div
          id=${menuProps.id}
          role=${menuProps.role}
          tabindex=${menuProps.tabindex}
          aria-label=${menuProps['aria-label'] ?? nothing}
          ?hidden=${menuProps.hidden}
          part="menu"
          @keydown=${this.handleKeyDown}
        >
          <slot name="menu" @slotchange=${this.handleMenuSlotChange}></slot>
        </div>
      </div>
    `
  }

  private renderStandardMode() {
    const triggerProps = this.model?.contracts.getTriggerProps() ?? {
      id: `${this.idBase}-trigger`,
      role: 'button' as const,
      tabindex: '0' as const,
      'aria-haspopup': 'menu' as const,
      'aria-expanded': this.open ? 'true' : 'false',
      'aria-controls': `${this.idBase}-menu`,
      'aria-label': this.ariaLabel || undefined,
    }

    const menuProps = this.model?.contracts.getMenuProps() ?? {
      id: `${this.idBase}-menu`,
      role: 'menu' as const,
      tabindex: '-1' as const,
      'aria-label': this.ariaLabel || undefined,
      hidden: !this.open,
    }

    return html`
      <div part="base">
        <button
          id=${triggerProps.id}
          role=${triggerProps.role}
          tabindex=${triggerProps.tabindex}
          aria-haspopup=${triggerProps['aria-haspopup']}
          aria-expanded=${triggerProps['aria-expanded']}
          aria-controls=${triggerProps['aria-controls']}
          aria-label=${triggerProps['aria-label'] ?? nothing}
          type="button"
          part="trigger"
          ?disabled=${this.disabled}
          @click=${this.handleTriggerClick}
          @keydown=${this.handleKeyDown}
        >
          <span part="prefix" ?hidden=${!this.hasPrefixContent}
            ><slot name="prefix" @slotchange=${this.handleContentSlotChange}></slot
          ></span>
          <span part="label" ?hidden=${!this.hasLabelContent}
            ><slot @slotchange=${this.handleContentSlotChange}></slot
          ></span>
          <span part="suffix" ?hidden=${!this.hasSuffixContent}
            ><slot name="suffix" @slotchange=${this.handleContentSlotChange}></slot
          ></span>
          ${this.renderDropdownIcon()}
        </button>

        <div
          id=${menuProps.id}
          role=${menuProps.role}
          tabindex=${menuProps.tabindex}
          aria-label=${menuProps['aria-label'] ?? nothing}
          ?hidden=${menuProps.hidden}
          part="menu"
          @keydown=${this.handleKeyDown}
        >
          <slot name="menu" @slotchange=${this.handleMenuSlotChange}></slot>
        </div>
      </div>
    `
  }

  protected override render() {
    if (this.split) {
      return this.renderSplitMode()
    }
    return this.renderStandardMode()
  }
}
