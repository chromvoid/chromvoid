import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {CVMenuButton} from '@chromvoid/uikit/components/cv-menu-button'
import {CVMenuItem} from '@chromvoid/uikit/components/cv-menu-item'

import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {notificationIndicatorStyles} from 'root/shared/ui/notification-indicator.styles'
import {sharedStyles} from 'root/shared/ui/shared-styles'

export type MobileToolbarLeadingMode = 'menu' | 'back' | 'none'

export type MobileToolbarAction = {
  id: string
  icon: string
  label: string
  disabled?: boolean
  active?: boolean
  tone?: 'accent'
}

export type MobileToolbarStatusTone = 'saved' | 'dirty' | 'saving' | 'error' | 'readonly' | 'neutral'

export type MobileToolbarStatus = {
  tone: MobileToolbarStatusTone
  icon: string
  label: string
  spinner?: boolean
}

export class MobileTopToolbar extends ReatomLitElement {
  static elementName = 'mobile-top-toolbar'

  static define() {
    if (!customElements.get(this.elementName)) {
      CVMenuButton.define()
      CVMenuItem.define()
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static properties = {
    title: {type: String},
    subtitle: {type: String},
    status: {type: Object},
    leading: {type: String},
    menuOpen: {type: Boolean, attribute: 'menu-open'},
    backDisabled: {type: Boolean, attribute: 'back-disabled'},
    showCommand: {type: Boolean, attribute: 'show-command'},
    commandActive: {type: Boolean, attribute: 'command-active'},
    actions: {type: Array},
    maxVisible: {type: Number, attribute: 'max-visible'},
    overflowFromIndex: {type: Number, attribute: 'overflow-from-index'},
  }

  declare title: string
  declare subtitle: string
  declare status: MobileToolbarStatus | null
  declare leading: MobileToolbarLeadingMode
  declare menuOpen: boolean
  declare backDisabled: boolean
  declare showCommand: boolean
  declare commandActive: boolean
  declare actions: MobileToolbarAction[]
  declare maxVisible: number
  declare overflowFromIndex?: number

  static styles = [
    sharedStyles,
    notificationIndicatorStyles,
    css`
      :host {
        display: block;
        position: sticky;
        inset-block-start: 0;
        z-index: 5;
        background: var(--cv-color-surface-glass-strong);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border-block-end: 1px solid var(--border-subtle, var(--cv-alpha-white-6));
      }

      .toolbar {
        box-sizing: border-box;
        inline-size: 100%;
        min-block-size: var(--app-mobile-topbar-block-size, 56px);
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) auto;
        align-items: center;
        gap: 4px;
        padding-inline-start: max(4px, env(safe-area-inset-left, 0px));
        padding-inline-end: max(8px, env(safe-area-inset-right, 0px));
      }

      .toolbar.has-subtitle {
        align-items: center;
        padding-block: 6px;
      }

      .trailing {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 4px;
        min-inline-size: 0;
        position: relative;
      }

      .title-block {
        min-inline-size: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 2px;
        padding-inline: 8px;
      }

      .title {
        min-inline-size: 0;
        text-align: left;
        font-size: var(--cv-font-size-sm, 14px);
        font-weight: var(--cv-font-weight-semibold, 600);
        color: var(--text-primary, var(--cv-color-text));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .subtitle {
        min-inline-size: 0;
        text-align: left;
        font-size: 12px;
        font-weight: var(--cv-font-weight-medium, 500);
        color: var(--cv-color-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .subtitle.tone-saved {
        color: var(--cv-color-accent, var(--cv-color-text-muted));
      }

      .subtitle.tone-dirty {
        color: var(--cv-color-warning, var(--cv-color-text-muted));
      }

      .subtitle.tone-saving {
        color: var(--cv-color-text);
      }

      .subtitle.tone-error {
        color: var(--cv-color-danger);
      }

      .subtitle.tone-readonly {
        color: var(--cv-color-warning);
      }

      .status-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 0 10px;
        min-block-size: 32px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: var(--cv-font-weight-medium, 500);
        color: var(--cv-color-text-muted);
        background: var(--cv-color-surface-tertiary-glass);
        border: 1px solid var(--cv-color-border-faint);
        white-space: nowrap;
        max-inline-size: 50vw;
        overflow: hidden;
      }

      .status-chip > span {
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .status-chip cv-icon,
      .status-chip cv-spinner {
        flex: 0 0 auto;
      }

      .status-chip[data-tone='saved'] {
        color: var(--cv-color-accent, var(--cv-color-text-muted));
        border-color: var(--cv-color-accent-border, var(--cv-color-border-faint));
        background: var(--cv-color-accent-surface, var(--cv-color-surface-tertiary-glass));
      }

      .status-chip[data-tone='dirty'] {
        color: var(--cv-color-warning);
        border-color: var(--cv-color-warning-border, var(--cv-color-border-faint));
      }

      .status-chip[data-tone='saving'] {
        color: var(--cv-color-text);
      }

      .status-chip[data-tone='error'] {
        color: var(--cv-color-danger);
        border-color: var(--cv-color-danger-border, var(--cv-color-border-faint));
      }

      .status-chip[data-tone='readonly'] {
        color: var(--cv-color-warning);
      }

      @media (max-width: 380px) {
        .status-chip > span {
          display: none;
        }

        .status-chip {
          padding: 0;
          inline-size: 32px;
          justify-content: center;
        }
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
        position: relative;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      .action-btn:hover {
        background: var(--cv-color-primary-surface);
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

      .action-btn.active {
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-primary);
      }

      .action-btn.active:hover {
        background: var(--cv-color-primary-surface-strong, var(--cv-color-primary-subtle));
      }

      .action-btn.tone-accent {
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-primary);
        box-shadow:
          inset 0 0 0 1px var(--cv-color-border-accent),
          0 0 0 1px var(--cv-color-primary-surface-strong);
      }

      .action-btn.tone-accent:hover {
        background: var(--cv-color-primary-surface-strong);
      }

      .action-indicator {
        --cv-notification-dot-block-start: 9px;
        --cv-notification-dot-inline-end: 9px;
        --cv-notification-dot-size: 7px;
        --cv-notification-dot-border: 1.5px solid
          var(--cv-color-surface-glass-strong, var(--cv-color-surface));
      }

      /* ── Overflow dropdown ── */

      .overflow-menu {
        --cv-menu-button-min-height: 44px;
        --cv-menu-button-menu-align: center;
        --cv-menu-button-menu-z-index: 10;
        --cv-menu-item-gap: 14px;
      }

      .overflow-menu::part(trigger) {
        inline-size: 44px;
        block-size: 44px;
        min-inline-size: 44px;
        min-block-size: 44px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--text-primary, var(--cv-color-text));
        cursor: pointer;
        position: relative;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      .overflow-menu::part(trigger):hover {
        background: var(--cv-color-primary-surface);
      }

      .overflow-menu::part(trigger):active {
        transform: scale(0.94);
      }

      .overflow-menu.active::part(trigger),
      .overflow-menu[open]::part(trigger) {
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-primary);
      }

      .overflow-menu.active::part(trigger):hover,
      .overflow-menu[open]::part(trigger):hover {
        background: var(--cv-color-primary-surface-strong, var(--cv-color-primary-subtle));
      }

      .overflow-menu::part(prefix) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .overflow-menu::part(label),
      .overflow-menu::part(suffix),
      .overflow-menu::part(dropdown-icon) {
        display: none;
      }

      .overflow-menu::part(menu) {
        gap: 2px;
        padding: 4px;
        border: 1px solid var(--cv-color-border, #333);
        border-radius: var(--cv-radius-2, 8px);
        background: var(--cv-color-surface-2, #1a1a1a);
        box-shadow: var(--cv-shadow-3, 0 8px 24px rgba(0, 0, 0, 0.4));
      }

      .overflow-menu-trigger {
        inline-size: 100%;
        block-size: 100%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }

      .overflow-menu-trigger cv-icon {
        font-size: 20px;
      }

      .overflow-menu-item {
        color: var(--text-primary, var(--cv-color-text));
        font-size: var(--cv-font-size-sm, 14px);
      }

      .overflow-menu-item::part(base) {
        align-items: center;
        gap: var(--cv-menu-item-gap, 14px);
        padding: 10px 12px;
        border-radius: var(--cv-radius-1, 6px);
        white-space: nowrap;
      }

      .overflow-menu-item::part(prefix) {
        opacity: 0.7;
      }

      .overflow-menu-item::part(prefix) cv-icon {
        font-size: 18px;
      }

      .overflow-menu-item.tone-accent::part(base) {
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-primary);
      }

    `,
  ]

  constructor() {
    super()
    this.title = ''
    this.subtitle = ''
    this.status = null
    this.leading = 'none'
    this.menuOpen = false
    this.backDisabled = false
    this.showCommand = false
    this.commandActive = false
    this.actions = []
    this.maxVisible = 3
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

  private onActionButtonClick(event: Event) {
    const actionId = (event.currentTarget as HTMLElement | null)?.dataset['action']
    if (!actionId) return
    this.onActionClick(actionId)
  }

  private resetOverflowMenuSelection(menu: HTMLElementTagNameMap['cv-menu-button']) {
    menu.value = ''
    for (const item of menu.querySelectorAll<HTMLElementTagNameMap['cv-menu-item']>('cv-menu-item')) {
      item.selected = false
      item.active = false
    }
  }

  private onOverflowMenuInput(event: CustomEvent<{value: string | null; open: boolean}>) {
    const actionId = event.detail.value
    if (!actionId) return

    const menu = event.currentTarget as HTMLElementTagNameMap['cv-menu-button']

    if (event.detail.open) {
      this.resetOverflowMenuSelection(menu)
      return
    }

    menu.open = false
    this.resetOverflowMenuSelection(menu)
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
      <cv-button unstyled
        class="action-btn"
        data-action="mobile-leading"
        @click=${this.onLeadingClick}
        ?disabled=${this.leading === 'back' && this.backDisabled}
        aria-label=${label}
      >
        <cv-icon name=${icon}></cv-icon>
      </cv-button>
    `
  }

  private renderCommand() {
    if (!this.showCommand) return nothing
    return html`
      <cv-button unstyled
        class="action-btn ${this.commandActive ? 'active' : ''}"
        data-action="mobile-command"
        @click=${this.onCommandClick}
        aria-label=${i18n('command:search-and-commands' as any)}
      >
        <cv-icon name="search"></cv-icon>
        ${this.commandActive
          ? html`<span class="notification-dot action-indicator" aria-hidden="true"></span>`
          : nothing}
      </cv-button>
    `
  }

  private renderActions() {
    const actions = this.actions
    if (!actions.length) return nothing

    const max = Math.max(1, this.maxVisible)
    const explicitOverflow = typeof this.overflowFromIndex === 'number'
    const legacyHasOverflow = actions.length > max
    const visible = explicitOverflow
      ? actions.slice(0, this.overflowFromIndex)
      : legacyHasOverflow
        ? actions.slice(0, max - 1)
        : actions
    const overflow = explicitOverflow
      ? actions.slice(this.overflowFromIndex)
      : legacyHasOverflow
        ? actions.slice(max - 1)
        : []
    const hasOverflow = overflow.length > 0
    const overflowActive = overflow.some((action) => action.active)
    const overflowMenu = hasOverflow
      ? html`
          <cv-menu-button
            class="overflow-menu ${overflowActive ? 'active' : ''}"
            variant="ghost"
            preset="icon-overflow"
            aria-label=${i18n('button:more_actions' as any)}
            @cv-input=${this.onOverflowMenuInput}
          >
            <span slot="prefix" class="overflow-menu-trigger">
              <cv-icon name="three-dots"></cv-icon>
              ${overflowActive
                ? html`<span class="notification-dot action-indicator" aria-hidden="true"></span>`
                : nothing}
            </span>
            <span class="sr-only">${i18n('button:more_actions' as any)}</span>
            ${overflow.map(
              (a) => html`
                <cv-menu-item
                  slot="menu"
                  value=${a.id}
                  class="overflow-menu-item ${a.tone === 'accent' ? 'tone-accent' : ''}"
                  ?disabled=${a.disabled}
                >
                  <cv-icon slot="prefix" name=${a.icon}></cv-icon>
                  ${a.label}
                </cv-menu-item>
              `,
            )}
          </cv-menu-button>
        `
      : nothing
    const visibleButtons = visible.map((a) => {
      const button = html`
        <cv-button unstyled
          class="action-btn ${a.active ? 'active' : ''} ${a.tone === 'accent' ? 'tone-accent' : ''}"
          data-action=${a.id}
          ?disabled=${a.disabled}
          aria-label=${a.label}
          @click=${this.onActionButtonClick}
        >
          <cv-icon name=${a.icon}></cv-icon>
          ${a.active
            ? html`<span class="notification-dot action-indicator" aria-hidden="true"></span>`
            : nothing}
        </cv-button>
      `

      if (a.id !== 'pm-create-entry') {
        return button
      }

      return html`
        <cv-guidance-anchor anchor-id="passwords.create-entry" surface="passwords" owner="passmanager">
          ${button}
        </cv-guidance-anchor>
      `
    })

    return html`
      ${explicitOverflow ? html`${visibleButtons}${overflowMenu}` : html`${overflowMenu}${visibleButtons}`}
    `
  }

  private renderStatusChip() {
    const status = this.status
    if (!status) return nothing
    const icon = status.spinner
      ? html`<cv-spinner size="xs" label=${status.label}></cv-spinner>`
      : html`<cv-icon name=${status.icon} size="xs"></cv-icon>`
    return html`
      <div class="status-chip" data-tone=${status.tone} role="status" aria-live="polite">
        ${icon}<span>${status.label}</span>
      </div>
    `
  }

  protected render() {
    const hasSubtitle = !!this.subtitle
    return html`
      <header class="toolbar ${hasSubtitle ? 'has-subtitle' : ''}">
        <div>${this.renderLeading()}</div>
        <div class="title-block">
          <div class="title">${this.title || ' '}</div>
          ${hasSubtitle
            ? html`<div class="subtitle tone-${this.status?.tone ?? 'neutral'}">${this.subtitle}</div>`
            : nothing}
        </div>
        <div class="trailing">
          ${this.renderStatusChip()}
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
