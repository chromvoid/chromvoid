import {XLitElement} from '@statx/lit'

import {css, html, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {sharedStyles} from 'root/shared/ui/shared-styles'

export type MobileToolbarLeadingMode = 'menu' | 'back' | 'none'

export type MobileToolbarAction = {
  id: string
  icon: string
  label: string
  disabled?: boolean
}

export class MobileTopToolbar extends XLitElement {
  static elementName = 'mobile-top-toolbar'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static properties = {
    title: {type: String},
    leading: {type: String},
    menuOpen: {type: Boolean, attribute: 'menu-open'},
    backDisabled: {type: Boolean, attribute: 'back-disabled'},
    showCommand: {type: Boolean, attribute: 'show-command'},
    actions: {type: Array},
    _overflowOpen: {type: Boolean, state: true},
  }

  declare title: string
  declare leading: MobileToolbarLeadingMode
  declare menuOpen: boolean
  declare backDisabled: boolean
  declare showCommand: boolean
  declare actions: MobileToolbarAction[]
  declare _overflowOpen: boolean

  private static readonly MAX_VISIBLE = 3

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        position: sticky;
        inset-block-start: 0;
        z-index: 5;
        background: color-mix(in oklch, var(--surface-base, #000) 88%, transparent);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border-block-end: 1px solid var(--border-subtle, var(--cv-alpha-white-6));
      }

      .toolbar {
        block-size: 56px;
        display: grid;
        grid-template-columns: 48px 1fr auto;
        align-items: center;
        gap: 4px;
      }

      .trailing {
        display: flex;
        align-items: center;
        gap: 2px;
        position: relative;
      }

      .title {
        min-inline-size: 0;
        text-align: center;
        font-size: var(--cv-font-size-sm, 14px);
        font-weight: var(--cv-font-weight-semibold, 600);
        color: var(--text-primary, var(--cv-color-text));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        padding-inline: 8px;
      }

      .action-btn {
        inline-size: 44px;
        block-size: 44px;
        min-inline-size: 44px;
        min-block-size: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--text-primary, var(--cv-color-text));
        cursor: pointer;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      .action-btn:hover {
        background: color-mix(in oklch, var(--cv-color-surface-2, #1a1a1a) 82%, white 6%);
      }

      .action-btn:active {
        transform: scale(0.94);
      }

      .action-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .action-btn cv-icon {
        font-size: 20px;
      }

      /* ── Overflow dropdown ── */

      .overflow-panel {
        position: absolute;
        inset-block-start: 100%;
        inset-inline-end: 0;
        margin-block-start: 4px;
        min-inline-size: 180px;
        padding: 4px;
        background: var(--cv-color-surface-2, #1a1a1a);
        border: 1px solid var(--cv-color-border, #333);
        border-radius: var(--cv-radius-2, 8px);
        box-shadow: var(--cv-shadow-3, 0 8px 24px rgba(0, 0, 0, 0.4));
        z-index: 10;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .overflow-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border: 0;
        border-radius: var(--cv-radius-1, 6px);
        background: transparent;
        color: var(--text-primary, var(--cv-color-text));
        font-size: var(--cv-font-size-sm, 14px);
        cursor: pointer;
        white-space: nowrap;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      .overflow-item:hover {
        background: color-mix(in oklch, var(--cv-color-surface-2, #1a1a1a) 70%, white 8%);
      }

      .overflow-item:active {
        transform: scale(0.97);
      }

      .overflow-item:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .overflow-item cv-icon {
        font-size: 18px;
        opacity: 0.7;
      }

      .overflow-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9;
      }
    `,
  ]

  constructor() {
    super()
    this.title = ''
    this.leading = 'none'
    this.menuOpen = false
    this.backDisabled = false
    this.showCommand = false
    this.actions = []
    this._overflowOpen = false
  }

  private onLeadingClick = () => {
    if (this.leading === 'none') return
    this.dispatchEvent(
      new CustomEvent('mobile-toolbar-leading', {
        detail: {mode: this.leading},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private onCommandClick = () => {
    this.dispatchEvent(
      new CustomEvent('mobile-toolbar-command', {
        bubbles: true,
        composed: true,
      }),
    )
  }

  private onActionClick(actionId: string) {
    this.dispatchEvent(
      new CustomEvent('mobile-toolbar-action', {
        detail: {actionId},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private toggleOverflow = () => {
    this._overflowOpen = !this._overflowOpen
  }

  private closeOverflow = () => {
    this._overflowOpen = false
  }

  private onOverflowItemClick(actionId: string) {
    this._overflowOpen = false
    this.onActionClick(actionId)
  }

  private renderLeading() {
    if (this.leading === 'none') return nothing

    const icon = this.leading === 'menu' ? (this.menuOpen ? 'x' : 'list') : 'arrow-left'
    const label =
      this.leading === 'menu'
        ? this.menuOpen
          ? i18n('menu:close' as any)
          : i18n('menu:open' as any)
        : i18n('nav:back' as any)

    return html`
      <button
        class="action-btn"
        data-action="mobile-leading"
        @click=${this.onLeadingClick}
        ?disabled=${this.leading === 'back' && this.backDisabled}
        aria-label=${label}
      >
        <cv-icon name=${icon}></cv-icon>
      </button>
    `
  }

  private renderCommand() {
    if (!this.showCommand) return nothing
    return html`
      <button
        class="action-btn"
        data-action="mobile-command"
        @click=${this.onCommandClick}
        aria-label=${i18n('command:search-and-commands' as any)}
      >
        <cv-icon name="search"></cv-icon>
      </button>
    `
  }

  private renderActions() {
    const actions = this.actions
    if (!actions.length) return nothing

    const max = MobileTopToolbar.MAX_VISIBLE
    const hasOverflow = actions.length > max
    const visible = hasOverflow ? actions.slice(0, max - 1) : actions
    const overflow = hasOverflow ? actions.slice(max - 1) : []

    return html`
      ${visible.map(
        (a) => html`
          <button
            class="action-btn"
            data-action=${a.id}
            ?disabled=${a.disabled}
            aria-label=${a.label}
            @click=${() => this.onActionClick(a.id)}
          >
            <cv-icon name=${a.icon}></cv-icon>
          </button>
        `,
      )}
      ${hasOverflow
        ? html`
            <button
              class="action-btn"
              aria-label=${i18n('button:more_actions' as any)}
              @click=${this.toggleOverflow}
            >
              <cv-icon name="three-dots"></cv-icon>
            </button>
            ${this._overflowOpen
              ? html`
                  <div class="overflow-backdrop" @click=${this.closeOverflow}></div>
                  <div class="overflow-panel">
                    ${overflow.map(
                      (a) => html`
                        <button
                          class="overflow-item"
                          ?disabled=${a.disabled}
                          @click=${() => this.onOverflowItemClick(a.id)}
                        >
                          <cv-icon name=${a.icon}></cv-icon>
                          <span>${a.label}</span>
                        </button>
                      `,
                    )}
                  </div>
                `
              : nothing}
          `
        : nothing}
    `
  }

  protected render() {
    return html`
      <header class="toolbar">
        <div>${this.renderLeading()}</div>
        <div class="title">${this.title || ' '}</div>
        <div class="trailing">
          ${this.renderActions()}
          <slot name="actions"></slot>
          ${this.renderCommand()}
        </div>
      </header>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mobile-top-toolbar': MobileTopToolbar
  }
}
