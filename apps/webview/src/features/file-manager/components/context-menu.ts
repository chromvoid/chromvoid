import {CVContextMenu, type CVContextMenuEventDetail} from '@chromvoid/uikit/components/cv-context-menu'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVMenuItem} from '@chromvoid/uikit/components/cv-menu-item'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {keyboardShortcutsModel} from 'root/shared/keyboard'
import {sharedStyles} from 'root/shared/ui/shared-styles'
import {ContextMenuModel, type ContextMenuItem} from './context-menu.model'

export type {ContextMenuItem} from './context-menu.model'

export class ContextMenu extends ReatomLitElement {
  static define() {
    CVContextMenu.define()
    CVIcon.define()
    CVMenuItem.define()

    if (!customElements.get('context-menu')) {
      customElements.define('context-menu', this)
    }
  }

  private readonly model = new ContextMenuModel()
  private previousFocus: HTMLElement | null = null
  private readonly handleKeyDownBound = this.handleKeyDown.bind(this)

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        inline-size: 0;
        block-size: 0;
      }

      cv-context-menu {
        --cv-context-menu-z-index: 10000;
        --cv-context-menu-min-inline-size: 200px;
        --cv-context-menu-padding: 8px 0;
        --cv-context-menu-border-radius: var(--cv-radius-2);
        --cv-context-menu-gap: 0;
      }

      cv-menu-item::part(base) {
        min-block-size: 38px;
        color: var(--cv-color-text);
        font-size: 0.9em;
        font-weight: 500;
      }

      cv-menu-item[data-danger]::part(base) {
        color: var(--cv-color-danger);
      }

      .menu-icon {
        font-size: 16px;
        inline-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: currentColor;
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
    `,
  ]

  connectedCallback() {
    super.connectedCallback()
    // Programmatically focusable for keyboard shortcut capture; not a tab stop.
    this.setAttribute('tabindex', '-1')
    document.addEventListener('keydown', this.handleKeyDownBound, true)
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.handleKeyDownBound, true)
    super.disconnectedCallback()
  }

  private getInnerMenu(): CVContextMenu | null {
    return this.renderRoot.querySelector<CVContextMenu>('cv-context-menu')
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (!this.model.visible()) return

    if (this.activateShortcut(e)) {
      e.stopImmediatePropagation()
      return
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        e.stopImmediatePropagation()
        this.hide()
        break
      case 'Backspace':
        e.preventDefault()
        e.stopImmediatePropagation()
        this.activateItemById('delete')
        break
      case 'Tab':
        e.stopImmediatePropagation()
        this.hide({restoreFocus: false})
        break
      default:
        break
    }
  }

  private activateShortcut(e: KeyboardEvent): boolean {
    for (const item of this.model.items()) {
      if (!item.shortcutId || item.disabled || item.separator) continue
      if (!keyboardShortcutsModel.matches(item.shortcutId, e)) continue

      e.preventDefault()
      this.activateItemById(item.id)
      return true
    }

    return false
  }

  private activateItemById(id: string) {
    const item = this.model.getActivatableItemById(id)
    if (!item) return

    this.activateItem(item)
  }

  private activateItem(item: ContextMenuItem) {
    if (item.disabled || item.separator) return

    // Keep action synchronous to preserve user activation.
    try {
      item.action()
    } finally {
      this.hide()
    }
  }

  private handleContextMenuInput(event: CustomEvent<CVContextMenuEventDetail>): void {
    if (!this.model.visible() || event.detail.open || event.detail.value) return

    this.hide({restoreFocus: false})
  }

  private handleContextMenuChange(event: CustomEvent<CVContextMenuEventDetail>): void {
    const {value} = event.detail
    if (!value) return

    const item = this.model.getActivatableItemById(value)
    if (!item) return

    this.activateItem(item)
  }

  private getDeepActiveElement(): HTMLElement | null {
    let active: Element | null = typeof document !== 'undefined' ? document.activeElement : null
    while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement
    }
    return active instanceof HTMLElement ? active : null
  }

  show(x: number, y: number, items: ContextMenuItem[]) {
    this.previousFocus = this.getDeepActiveElement()
    this.model.show(x, y, items)

    void this.updateComplete.then(() => {
      if (!this.model.visible()) return

      const menu = this.getInnerMenu()
      if (!menu) return

      const position = this.model.position()
      menu.value = ''
      menu.openAt(position.x, position.y)
    })
  }

  hide(opts?: {restoreFocus?: boolean}) {
    const wasVisible = this.model.visible()
    this.model.hide()

    const menu = this.getInnerMenu()
    if (menu) {
      menu.value = ''
      if (menu.open) {
        menu.close()
      }
    }

    if (wasVisible) {
      this.dispatchEvent(new CustomEvent('hide', {bubbles: true}))
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
    const items = this.model.items()

    return html`
      <cv-context-menu
        close-on-scroll
        aria-label=${i18n('context-menu:title' as any)}
        @cv-input=${this.handleContextMenuInput}
        @cv-change=${this.handleContextMenuChange}
      >
        ${items.map((item) => {
          if (item.separator) {
            return html`<div class="menu-separator" role="separator" aria-hidden="true"></div>`
          }

          const shortcutLabel = item.shortcutId ? keyboardShortcutsModel.label(item.shortcutId) : undefined

          return html`
            <cv-menu-item
              value=${item.id}
              ?disabled=${item.disabled}
              ?data-danger=${item.id.includes('delete')}
            >
              <cv-icon slot="prefix" class="menu-icon" name=${item.icon}></cv-icon>
              ${item.label}
              ${shortcutLabel ? html`<span slot="suffix" class="menu-shortcut">${shortcutLabel}</span>` : nothing}
            </cv-menu-item>
          `
        })}
      </cv-context-menu>
    `
  }
}
