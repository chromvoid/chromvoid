import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {CVMenuButton} from '@chromvoid/uikit/components/cv-menu-button'
import {CVMenuItem} from '@chromvoid/uikit/components/cv-menu-item'

import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {notificationIndicatorStyles} from 'root/shared/ui/notification-indicator.styles'
import {sharedStyles} from 'root/shared/ui/shared-styles'
import {viewTransitionTargets} from 'root/utils/view-transition-targets'

import type {
  MobileToolbarAction,
  MobileToolbarLeadingMode,
  MobileToolbarMetaItem,
  MobileToolbarStatus,
  MobileToolbarTitleAction,
} from './mobile-top-toolbar.types'

export type {
  MobileToolbarAction,
  MobileToolbarLeadingMode,
  MobileToolbarMetaItem,
  MobileToolbarStatus,
  MobileToolbarStatusTone,
  MobileToolbarTitleAction,
} from './mobile-top-toolbar.types'

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
    titleAction: {type: Object, attribute: false},
    subtitle: {type: String},
    meta: {type: Array},
    metaLabel: {type: String, attribute: 'meta-label'},
    status: {type: Object},
    leading: {type: String},
    menuOpen: {type: Boolean, attribute: 'menu-open'},
    backDisabled: {type: Boolean, attribute: 'back-disabled'},
    actions: {type: Array},
    maxVisible: {type: Number, attribute: 'max-visible'},
    overflowFromIndex: {type: Number, attribute: 'overflow-from-index'},
  }

  declare title: string
  declare titleAction: MobileToolbarTitleAction | null
  declare subtitle: string
  declare meta: MobileToolbarMetaItem[]
  declare metaLabel: string
  declare status: MobileToolbarStatus | null
  declare leading: MobileToolbarLeadingMode
  declare menuOpen: boolean
  declare backDisabled: boolean
  declare actions: MobileToolbarAction[]
  declare maxVisible: number
  declare overflowFromIndex?: number
  private unregisterViewTransitionTarget?: () => void

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
        border-block-end: 1px solid var(--app-editorial-border-subtle, var(--cv-alpha-white-6));
      }

      .toolbar {
        box-sizing: border-box;
        inline-size: 100%;
        min-block-size: var(--app-mobile-topbar-block-size, 56px);
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) auto;
        align-items: center;
        gap: 4px;
        padding-inline-start: max(4px, var(--app-runtime-safe-area-inline-start, 0px));
        padding-inline-end: max(8px, var(--app-runtime-safe-area-inline-end, 0px));
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

      .title-action {
        inline-size: 100%;
        border: 0;
        border-radius: var(--cv-radius-sm);
        background: transparent;
        font: inherit;
        cursor: pointer;
      }

      .title-action:focus-visible {
        outline: 2px solid var(--cv-color-primary);
        outline-offset: 1px;
      }

      .title-action:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .title-row {
        min-inline-size: 0;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .title-row .title {
        flex: 0 1 auto;
      }

      .title-row cv-icon {
        flex: 0 0 auto;
        inline-size: 14px;
        block-size: 14px;
        color: var(--cv-color-text-muted);
      }

      .title {
        min-inline-size: 0;
        text-align: start;
        font-size: var(--cv-font-size-base, 14px);
        font-weight: var(--cv-font-weight-bold, 600);
        color: var(--app-editorial-text-primary, var(--cv-color-text));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .subtitle {
        min-inline-size: 0;
        text-align: start;
        font-size: var(--cv-font-size-xs, 14px);
        font-weight: var(--cv-font-weight-medium, 400);
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

      .meta-row {
        min-inline-size: 0;
        display: flex;
        align-items: center;
        gap: 9px;
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-xs, 12px);
        font-weight: var(--cv-font-weight-semibold, 600);
        line-height: 1;
        white-space: nowrap;
        overflow: hidden;
      }

      .meta-item {
        min-inline-size: 0;
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }

      .meta-item cv-icon {
        inline-size: 13px;
        block-size: 13px;
        color: var(--cv-color-text-muted);
        opacity: 0.86;
        flex: 0 0 auto;
      }

      .meta-value {
        font-variant-numeric: tabular-nums;
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
        appearance: none;
        -webkit-appearance: none;
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
        color: var(--app-editorial-text-primary, var(--cv-color-text));
        padding: 0;
        font: inherit;
        cursor: pointer;
        position: relative;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
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

      .action-btn.tone-accent {
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-primary);
        box-shadow:
          inset 0 0 0 1px var(--cv-color-border-accent),
          0 0 0 1px var(--cv-color-primary-surface-strong);
      }

      .action-indicator {
        --app-notification-dot-block-start: 9px;
        --app-notification-dot-inline-end: 9px;
        --app-notification-dot-size: 7px;
        --app-notification-dot-border: 1.5px solid
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
        color: var(--app-editorial-text-primary, var(--cv-color-text));
        cursor: pointer;
        position: relative;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      .overflow-menu::part(trigger):active {
        transform: scale(0.94);
      }

      .overflow-menu.active::part(trigger),
      .overflow-menu[open]::part(trigger) {
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-primary);
      }

      @media (hover: hover) and (pointer: fine) {
        .title-action:hover,
        .action-btn:hover,
        .overflow-menu::part(trigger):hover {
          background: var(--cv-color-primary-surface);
        }

        .action-btn.active:hover,
        .overflow-menu.active::part(trigger):hover,
        .overflow-menu[open]::part(trigger):hover {
          background: var(--cv-color-primary-surface-strong, var(--cv-color-primary-subtle));
        }

        .action-btn.tone-accent:hover {
          background: var(--cv-color-primary-surface-strong);
        }
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
        color: var(--app-editorial-text-primary, var(--cv-color-text));
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
    this.titleAction = null
    this.subtitle = ''
    this.meta = []
    this.metaLabel = ''
    this.status = null
    this.leading = 'none'
    this.menuOpen = false
    this.backDisabled = false
    this.actions = []
    this.maxVisible = 3
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.unregisterViewTransitionTarget = viewTransitionTargets.register('mobile-toolbar', {
      getElement: () => this,
      settle: async () => {
        await this.updateComplete
      },
    })
  }

  override disconnectedCallback(): void {
    this.unregisterViewTransitionTarget?.()
    this.unregisterViewTransitionTarget = undefined
    super.disconnectedCallback()
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

  private onTitleActionClick() {
    const action = this.titleAction
    if (!action || action.disabled) return
    this.onActionClick(action.id)
  }

  private onActionButtonPointerDown(event: PointerEvent) {
    const actionId = (event.currentTarget as HTMLElement | null)?.dataset['action']
    if (!actionId) return

    const action = this.actions.find((candidate) => candidate.id === actionId)
    if (!action?.preserveFocusOnPress || action.disabled) return

    event.preventDefault()
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
      <button
        type="button"
        id=${this.leading === 'menu' ? 'app.navigation.menu' : nothing}
        class="action-btn"
        data-action="mobile-leading"
        data-leading=${this.leading}
        @click=${this.onLeadingClick}
        ?disabled=${this.leading === 'back' && this.backDisabled}
        aria-label=${label}
      >
        <cv-icon name=${icon}></cv-icon>
      </button>
    `
  }

  private renderActions() {
    const actions = this.actions
    if (!actions.length) return nothing

    const max = Math.max(1, this.maxVisible)
    const explicitOverflow = typeof this.overflowFromIndex === 'number'
    const hasForcedOverflow = actions.some((action) => action.overflowOnly)
    const legacyHasOverflow = actions.length > max
    const visibleCandidates = explicitOverflow ? actions.slice(0, this.overflowFromIndex ?? 0) : actions
    const visibleLimit = Math.max(
      0,
      explicitOverflow
        ? visibleCandidates.length
        : legacyHasOverflow || hasForcedOverflow
          ? max - 1
          : actions.length,
    )
    const visible: MobileToolbarAction[] = []

    for (const action of visibleCandidates) {
      if (action.overflowOnly || visible.length >= visibleLimit) {
        continue
      }
      visible.push(action)
    }

    const visibleSet = new Set(visible)
    const overflow = actions.filter((action) => !visibleSet.has(action))
    const hasOverflow = overflow.length > 0
    const overflowActive = overflow.some((action) => action.active)
    const overflowPreserveFocusOnPress = overflow.some((action) => action.preserveFocusOnPress)
    const overflowMenu = hasOverflow
      ? html`
          <cv-menu-button
            class="overflow-menu ${overflowActive ? 'active' : ''}"
            variant="ghost"
            preset="icon-overflow"
            aria-label=${i18n('button:more_actions' as any)}
            ?preserve-focus-on-pointer-open=${overflowPreserveFocusOnPress}
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
      const content = html`
        <cv-icon name=${a.icon}></cv-icon>
        ${a.active
          ? html`<span class="notification-dot action-indicator" aria-hidden="true"></span>`
          : nothing}
      `

      if (a.id !== 'pm-create-entry') {
        return html`
          <cv-button
            unstyled
            class="action-btn ${a.active ? 'active' : ''} ${a.tone === 'accent' ? 'tone-accent' : ''}"
            data-action=${a.id}
            ?disabled=${a.disabled}
            aria-label=${a.label}
            @pointerdown=${this.onActionButtonPointerDown}
            @click=${this.onActionButtonClick}
          >
            ${content}
          </cv-button>
        `
      }

      return html`
        <cv-guidance-anchor anchor-id="passwords.create-entry" surface="passwords" owner="passmanager">
          <button
            id="passwords.create-entry"
            type="button"
            class="action-btn ${a.active ? 'active' : ''} ${a.tone === 'accent' ? 'tone-accent' : ''}"
            data-action=${a.id}
            ?disabled=${a.disabled}
            aria-label=${a.label}
            @pointerdown=${this.onActionButtonPointerDown}
            @click=${this.onActionButtonClick}
          >
            ${content}
          </button>
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

  private renderMeta() {
    const meta = this.meta.filter((item) => item.value.length > 0)
    if (meta.length === 0) return nothing

    const label = this.metaLabel || meta.map((item) => `${item.label}: ${item.value}`).join(', ')

    return html`
      <div class="meta-row" aria-label=${label}>
        ${meta.map(
          (item) => html`
            <span class="meta-item" title=${`${item.label}: ${item.value}`} aria-hidden="true">
              <cv-icon name=${item.icon}></cv-icon>
              <span class="meta-value">${item.value}</span>
            </span>
          `,
        )}
      </div>
    `
  }

  private renderTitleBlock() {
    const content = html`
      <div class="title-row">
        <div class="title">${this.title || ' '}</div>
        ${this.titleAction ? html`<cv-icon name="chevron-down" aria-hidden="true"></cv-icon>` : nothing}
      </div>
      ${this.subtitle
        ? html`<div class="subtitle tone-${this.status?.tone ?? 'neutral'}">${this.subtitle}</div>`
        : nothing}
      ${this.renderMeta()}
    `

    if (!this.titleAction) return html`<div class="title-block">${content}</div>`

    return html`
      <button
        class="title-block title-action"
        type="button"
        aria-label=${this.titleAction.label}
        aria-haspopup=${this.titleAction.popup ?? 'dialog'}
        aria-expanded=${String(Boolean(this.titleAction.expanded))}
        ?disabled=${this.titleAction.disabled}
        @click=${this.onTitleActionClick}
      >
        ${content}
      </button>
    `
  }

  protected render() {
    const hasSubtitle = !!this.subtitle
    const hasMeta = this.meta.length > 0
    return html`
      <header class="toolbar ${hasSubtitle || hasMeta ? 'has-subtitle' : ''}">
        <div>${this.renderLeading()}</div>
        ${this.renderTitleBlock()}
        <div class="trailing">
          ${this.renderStatusChip()} ${this.renderActions()}
          <slot name="actions"></slot>
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
