import {state} from '@statx/core'
import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {i18n} from 'root/i18n'
import {sharedStyles} from 'root/shared/ui/shared-styles'

export type ContextMenuItem = {
  id: string
  label: string
  icon: string
  action: () => void
  disabled?: boolean
  separator?: boolean
  shortcut?: string
}

export class ContextMenu extends XLitElement {
  static define() {
    customElements.define('context-menu', this)
  }

  static get properties() {
    return {
      visible: {type: Boolean, reflect: true},
      x: {type: Number},
      y: {type: Number},
      items: {type: Array},
    }
  }

  declare visible: boolean
  declare x: number
  declare y: number
  declare items: ContextMenuItem[]

  constructor() {
    super()
    this.visible = false
    this.x = 0
    this.y = 0
    this.items = []
  }

  private activeIndex = state(-1)
  private previousFocus: HTMLElement | null = null

  private static supportsPopover(): boolean {
    try {
      return typeof (HTMLElement.prototype as any).showPopover === 'function'
    } catch {
      return false
    }
  }

  private static supportsAnchorPositioning(): boolean {
    try {
      return (
        typeof CSS !== 'undefined' &&
        typeof (CSS as any).supports === 'function' &&
        CSS.supports('anchor-name: --a') &&
        CSS.supports('position-anchor: --a') &&
        CSS.supports('position-area: bottom right')
      )
    } catch {
      return false
    }
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        inline-size: 0;
        block-size: 0;
      }

      .anchor {
        position: fixed;
        left: var(--context-menu-x, 0px);
        top: var(--context-menu-y, 0px);
        inline-size: 1px;
        block-size: 1px;
        pointer-events: none;
      }

      .context-menu {
        position: fixed;
        left: var(--context-menu-x, 0px);
        top: var(--context-menu-y, 0px);
        z-index: 10000;
        margin: 0;
        inset: auto;
        background: var(--cv-color-surface);
        border-radius: var(--cv-radius-2);
        box-shadow: var(--cv-shadow-2);
        border: 1px solid var(--cv-color-border);
        padding-block: 8px;
        padding-inline: 0;
        min-inline-size: 200px;
        max-block-size: calc(100dvh - 16px);
        overflow-y: auto;
        opacity: 0;
        transform: scale(0.9) translateY(-10px);
        transition:
          transform var(--cv-duration-fast) var(--cv-easing-standard),
          opacity var(--cv-duration-fast) var(--cv-easing-standard);
        will-change: transform, opacity;
        transform-origin: top left;

        &.visible,
        &:popover-open {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      @supports (anchor-name: --a) and (position-anchor: --a) and (position-area: bottom right) {
        .anchor {
          anchor-name: --context-menu-anchor;
        }

        .context-menu {
          left: auto;
          top: auto;
          position-anchor: --context-menu-anchor;
          position-area: bottom right;
        }
      }

      @supports (position-try-fallbacks: flip-block) {
        .context-menu {
          /* Prefer "bottom right" from the anchor point and flip when constrained. */
          position-try-fallbacks:
            flip-block,
            flip-inline,
            flip-block flip-inline;
        }
      }

      .menu-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding-block: 10px;
        padding-inline: 16px;
        cursor: pointer;
        color: var(--cv-color-text);
        font-size: 0.9em;
        transition:
          background-color var(--cv-duration-fast) var(--cv-easing-standard),
          color var(--cv-duration-fast) var(--cv-easing-standard);
        position: relative;

        &:hover:not(.disabled),
        &.active:not(.disabled) {
          background: var(--cv-color-surface-2);
          color: var(--cv-color-primary);
        }

        &.disabled {
          color: color-mix(in oklch, var(--cv-color-text-muted), transparent 30%);
          cursor: not-allowed;
        }

        &.danger {
          &:hover:not(.disabled),
          &.active:not(.disabled) {
            background: color-mix(in oklch, var(--cv-color-danger), transparent 92%);
            color: var(--cv-color-danger);
          }

          .menu-icon {
            color: var(--cv-color-danger);
          }
        }
      }

      .menu-icon {
        font-size: 16px;
        inline-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--cv-color-text-muted);
      }

      .menu-label {
        flex: 1;
        font-weight: 500;
      }

      .menu-shortcut {
        font-size: 0.8em;
        color: var(--cv-color-text-muted);
        font-family: monospace;
      }

      .menu-separator {
        block-size: 1px;
        background: var(--cv-color-border);
        margin-block: 8px;
      }

      .ripple {
        position: absolute;
        border-radius: 50%;
        background: color-mix(in oklch, var(--cv-color-primary), transparent 70%);
        transform: scale(0);
        animation: ripple 0.6s linear;
        pointer-events: none;
      }

      @keyframes ripple {
        to {
          transform: scale(4);
          opacity: 0;
        }
      }
    `,
  ]

  connectedCallback() {
    super.connectedCallback()
    // Programmatically focusable for keyboard navigation; not a tab stop.
    this.setAttribute('tabindex', '-1')
    document.addEventListener('pointerdown', this.handleDocumentPointerDown, {capture: true})
    document.addEventListener('keydown', this.handleKeyDown, {capture: true})
    document.addEventListener('scroll', this.handleDocumentScroll, true)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown, {capture: true} as any)
    document.removeEventListener('keydown', this.handleKeyDown, {capture: true} as any)
    document.removeEventListener('scroll', this.handleDocumentScroll, true)
  }

  private handleDocumentPointerDown = (e: Event) => {
    if (!this.visible) return

    const path =
      typeof (e as any).composedPath === 'function' ? ((e as any).composedPath() as EventTarget[]) : []
    if (path.includes(this)) return

    const target = e.target as Node | null
    if (target && this.contains(target)) return

    this.hide({restoreFocus: false})
  }

  private handleDocumentScroll = () => {
    if (this.visible) {
      this.hide({restoreFocus: false})
    }
  }

  private getDeepActiveElement(): HTMLElement | null {
    let active: Element | null = typeof document !== 'undefined' ? document.activeElement : null
    while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement
    }
    return active instanceof HTMLElement ? active : null
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.visible) return

    // Capture all keypresses while the menu is open to avoid triggering handlers
    // in other components (e.g. list navigation).
    e.stopImmediatePropagation()

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        this.hide()
        break
      case 'F2':
        e.preventDefault()
        this.activateItemById('rename')
        break
      case 'Delete':
      case 'Del':
      case 'Backspace':
        e.preventDefault()
        this.activateItemById('delete')
        break
      case 'Tab':
        this.hide({restoreFocus: false})
        break
      case 'ArrowDown':
        e.preventDefault()
        this.moveSelection(1)
        this.focusActiveItem()
        break
      case 'ArrowUp':
        e.preventDefault()
        this.moveSelection(-1)
        this.focusActiveItem()
        break
      case 'Enter':
        e.preventDefault()
        this.activateCurrentItem()
        break
      default:
        if ((e.code === 'KeyO' || e.key === 'o' || e.key === 'O') && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          this.activateItemById('open-external')
          break
        }
        // Prevent e.g. Space/PageDown from scrolling the underlying list.
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault()
        }
        break
    }
  }

  private moveSelection(direction: number) {
    const selectableItems = this.items.filter((item) => !item.disabled && !item.separator)
    if (selectableItems.length === 0) return

    let newIndex = this.activeIndex() + direction
    if (newIndex < 0) newIndex = selectableItems.length - 1
    if (newIndex >= selectableItems.length) newIndex = 0

    this.activeIndex.set(newIndex)
  }

  private focusActiveItem() {
    const idx = this.activeIndex()
    if (idx < 0) return
    // Focus the currently active (selectable) menu item for screen readers.
    void this.updateComplete.then(() => {
      const el = this.renderRoot.querySelector<HTMLElement>(`.menu-item[data-selectable-index="${idx}"]`)
      el?.focus?.()
    })
  }

  private activateCurrentItem() {
    const selectableItems = this.items.filter((item) => !item.disabled && !item.separator)
    const currentItem = selectableItems[this.activeIndex()]
    if (currentItem) {
      this.handleItemClick(currentItem)
    }
  }

  private activateItemById(id: string) {
    const item = this.items.find(
      (candidate) => candidate.id === id && !candidate.disabled && !candidate.separator,
    )
    if (!item) return

    const selectableItems = this.items.filter((candidate) => !candidate.disabled && !candidate.separator)
    const selectableIndex = selectableItems.findIndex((candidate) => candidate.id === id)
    if (selectableIndex >= 0) {
      this.activeIndex.set(selectableIndex)
    }

    this.handleItemClick(item)
  }

  private handleItemClick = (item: ContextMenuItem, e?: Event) => {
    if (item.disabled) return

    // Add ripple effect
    if (e) {
      this.createRipple(e as MouseEvent)
    }

    // Keep action synchronous to preserve user activation
    // (required by prompt/dialog APIs in some webviews).
    try {
      item.action()
    } finally {
      this.hide()
    }
  }

  private createRipple(e: MouseEvent) {
    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    const x = e.clientX - rect.left - size / 2
    const y = e.clientY - rect.top - size / 2

    const ripple = document.createElement('div')
    ripple.className = 'ripple'
    ripple.style.width = ripple.style.height = size + 'px'
    ripple.style.left = x + 'px'
    ripple.style.top = y + 'px'

    target.appendChild(ripple)
    setTimeout(() => ripple.remove(), 600)
  }

  show(x: number, y: number, items: ContextMenuItem[]) {
    this.previousFocus = this.getDeepActiveElement()
    this.items = items
    const selectable = items.filter((item) => !item.disabled && !item.separator)
    this.activeIndex.set(selectable.length > 0 ? 0 : -1)

    this.x = Math.max(8, Math.floor(x))
    this.y = Math.max(8, Math.floor(y))

    this.visible = true
    this.requestUpdate()

    // Focus first menu item for keyboard navigation (APG menu pattern).
    void this.updateComplete.then(() => {
      const menu = this.renderRoot.querySelector<HTMLElement>('.context-menu')
      if (!menu) return

      // Popover API (top-layer) when supported, otherwise fallback to our "visible" class.
      if (ContextMenu.supportsPopover()) {
        try {
          ;(menu as any).showPopover()
        } catch {
          // If already open or not supported, ignore.
        }
      }

      // Fallback positioning logic for engines without Anchor Positioning.
      if (!ContextMenu.supportsAnchorPositioning()) {
        // After render we know real size. Clamp within viewport.
        const rect = menu.getBoundingClientRect()
        const margin = 8
        let nx = this.x
        let ny = this.y
        if (nx + rect.width > window.innerWidth - margin) {
          nx = Math.max(margin, window.innerWidth - rect.width - margin)
        }
        if (ny + rect.height > window.innerHeight - margin) {
          ny = Math.max(margin, window.innerHeight - rect.height - margin)
        }
        if (nx !== this.x || ny !== this.y) {
          this.x = nx
          this.y = ny
          this.requestUpdate()
        }
      }

      this.focusActiveItem()
    })
  }

  hide(opts?: {restoreFocus?: boolean}) {
    this.visible = false
    this.activeIndex.set(-1)
    this.dispatchEvent(new CustomEvent('hide', {bubbles: true}))

    const menu = this.renderRoot.querySelector<HTMLElement>('.context-menu')
    if (menu && ContextMenu.supportsPopover()) {
      try {
        ;(menu as any).hidePopover()
      } catch {
        // ignore
      }
    }

    const restoreFocus = opts?.restoreFocus !== false
    if (restoreFocus) {
      if (this.previousFocus && typeof this.previousFocus.focus === 'function') {
        try {
          this.previousFocus.focus()
        } catch {
          // ignore
        }
      }
    }
    this.previousFocus = null
  }

  render() {
    const rootStyle = `--context-menu-x: ${this.x}px; --context-menu-y: ${this.y}px;`

    return html`
      <div class="anchor" aria-hidden="true" style=${rootStyle}></div>
      <div
        class="context-menu ${this.visible ? 'visible' : ''}"
        style=${rootStyle}
        popover="manual"
        role="menu"
        aria-label=${i18n('context-menu:title' as any)}
        aria-hidden=${this.visible ? 'false' : 'true'}
        @click=${(e: Event) => e.stopPropagation()}
      >
        ${this.items.map((item, index) => {
          if (item.separator) {
            return html`<div class="menu-separator" role="separator"></div>`
          }

          const selectableIndex = item.disabled
            ? -1
            : this.items.slice(0, index).filter((i) => !i.disabled && !i.separator).length
          const isActive = selectableIndex >= 0 && selectableIndex === this.activeIndex()

          const classes = [
            'menu-item',
            item.disabled && 'disabled',
            item.id.includes('delete') && 'danger',
            isActive && 'active',
          ]
            .filter(Boolean)
            .join(' ')

          return html`
            <div
              class=${classes}
              role="menuitem"
              tabindex="-1"
              data-selectable-index=${String(selectableIndex)}
              aria-disabled=${item.disabled ? 'true' : 'false'}
              @click=${(e: Event) => this.handleItemClick(item, e)}
              @mouseenter=${() => {
                if (item.disabled) return
                this.activeIndex.set(selectableIndex)
                this.focusActiveItem()
              }}
            >
              <cv-icon class="menu-icon" name=${item.icon}></cv-icon>
              <span class="menu-label">${item.label}</span>
              ${item.shortcut ? html`<span class="menu-shortcut">${item.shortcut}</span>` : ''}
            </div>
          `
        })}
      </div>
    `
  }
}
