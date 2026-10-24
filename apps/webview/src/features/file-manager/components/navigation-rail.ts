import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {sharedStyles} from 'root/shared/ui/shared-styles'
import {WelcomeChromvoidIcon} from 'root/shared/ui/welcome-chromvoid-icon'
import {moon, sun} from 'root/features/media/components/icons'
import {navigationRailModel} from './navigation-rail.model'

export class NavigationRail extends ReatomLitElement {
  static define() {
    WelcomeChromvoidIcon.define()
    if (!customElements.get('navigation-rail')) {
      customElements.define('navigation-rail', this as unknown as CustomElementConstructor)
    }
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        position: relative;
        display: flex;
        flex-direction: column;
        block-size: 100%;
        inline-size: var(--app-editorial-navigation-rail-inline-size, 56px);
        background: var(--app-editorial-surface-base, var(--cv-color-bg));
        border-inline-end: 1px solid var(--app-editorial-border-subtle, var(--cv-alpha-white-6));
        overflow: hidden;
        contain: content;
        container-type: inline-size;
        transition: inline-size var(--cv-duration-normal, 250ms)
          var(--app-editorial-easing-out-expo, cubic-bezier(0.16, 1, 0.3, 1));
      }

      :host([expanded]) {
        inline-size: var(--app-editorial-navigation-rail-inline-size-expanded, 240px);
      }

      :host(.mobile-nav-rail) {
        min-block-size: 0;
        overflow: auto;
        overscroll-behavior: contain;
      }

      :host(.mobile-nav-actions) {
        inline-size: 100%;
        block-size: auto;
        min-block-size: 0;
        border-inline-end: 0;
        overflow: visible;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 0;
        padding: var(--app-editorial-space-2, 8px);
        min-block-size: 56px;
      }

      :host([expanded]) .brand,
      :host(.mobile-nav-rail) .brand {
        gap: var(--app-editorial-space-3, 12px);
        padding: var(--app-editorial-space-3, 12px) var(--app-editorial-space-4, 16px);
        min-block-size: 64px;
      }

      .brand-icon {
        inline-size: 40px;
        block-size: 40px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--cv-radius-lg, 12px);
        color: var(--app-editorial-accent, var(--cv-color-primary));
        cursor: pointer;
      }

      .brand-icon--static {
        cursor: default;
      }

      .brand-text {
        font-family: var(--cv-font-family-display, var(--cv-font-family-primary, system-ui));
        font-weight: var(--app-editorial-font-weight-bold, 700);
        letter-spacing: var(--app-editorial-letter-spacing-tight, -0.02em);
        color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transform: translateX(
          calc(8px * var(--app-runtime-inline-start-direction-sign, -1))
        );
        transition:
          opacity var(--cv-duration-fast, 150ms) var(--app-editorial-easing-out-quart, cubic-bezier(0.25, 1, 0.5, 1)),
          transform var(--cv-duration-fast, 150ms) var(--app-editorial-easing-out-quart),
          visibility 0s linear var(--cv-duration-fast, 150ms);
      }

      :host([expanded]) .brand-text {
        opacity: 1;
        visibility: visible;
        transform: translateX(0);
        transition:
          opacity var(--cv-duration-fast, 150ms) var(--app-editorial-easing-out-quart, cubic-bezier(0.25, 1, 0.5, 1)),
          transform var(--cv-duration-fast, 150ms) var(--app-editorial-easing-out-quart),
          visibility 0s linear 0s;
      }

      .nav {
        display: flex;
        flex-direction: column;
        gap: var(--app-editorial-space-1, 4px);
        padding-inline: var(--app-editorial-space-2, 8px);
      }

      :host([expanded]) .nav,
      :host(.mobile-nav-rail) .nav,
      :host(.mobile-nav-actions) .nav {
        padding-inline: var(--app-editorial-space-3, 12px);
      }

      .main-nav {
        flex: 0 0 auto;
      }

      .secondary-actions {
        flex: 0 0 auto;
        margin-block-start: auto;
        padding-block: var(--app-editorial-space-3, 12px);
      }

      .secondary-actions::before {
        content: '';
        display: block;
        block-size: 1px;
        margin-block-end: var(--app-editorial-space-3, 12px);
        background: var(--app-editorial-border-subtle, var(--cv-alpha-white-6));
      }

      :host(.mobile-nav-actions) .secondary-actions {
        margin-block-start: 0;
      }

      :host(:not([expanded]):not(.mobile-nav-rail):not(.mobile-nav-actions)) .nav {
        align-items: center;
        gap: var(--app-editorial-space-2, 8px);
      }

      .item {
        display: flex;
        align-items: center;
        gap: var(--app-editorial-space-3, 12px);
        padding: var(--app-editorial-space-3, 12px);
        min-block-size: 44px;
        border-radius: var(--cv-radius-md, 8px);
        border: none;
        background: transparent;
        color: var(--app-editorial-text-secondary, var(--cv-alpha-white-70));
        cursor: pointer;
        text-align: start;
        font-family: var(--cv-font-family-body, 'Inter', system-ui);
        font-size: var(--app-editorial-text-small, 0.8125rem);
        font-weight: var(--app-editorial-font-weight-medium, 500);
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        transition:
          background-color var(--cv-duration-fast, 150ms) var(--app-editorial-easing-out-quart, cubic-bezier(0.25, 1, 0.5, 1)),
          color var(--cv-duration-fast, 150ms) var(--app-editorial-easing-out-quart);

        cv-icon {
          flex-shrink: 0;
          font-size: 20px;
        }

        .label {
          flex: 1;
          inline-size: 100%;
          opacity: 0;
          text-align: start;
          transform: translateX(
            calc(8px * var(--app-runtime-inline-start-direction-sign, -1))
          );
          transition:
            opacity var(--cv-duration-fast, 150ms) var(--app-editorial-easing-out-quart, cubic-bezier(0.25, 1, 0.5, 1)),
            transform var(--cv-duration-fast, 150ms) var(--app-editorial-easing-out-quart);
          white-space: nowrap;
        }

        .hint {
          opacity: 0;
          font-family: var(--cv-font-family-code, 'JetBrains Mono', monospace);
          font-size: var(--app-editorial-text-micro, 0.6875rem);
          color: var(--app-editorial-text-quaternary, var(--cv-alpha-white-30));
          padding: 3px 8px;
          border-radius: var(--cv-radius-sm, 4px);
          background: var(--app-editorial-surface-muted, var(--cv-color-surface-3));
          transition: opacity var(--cv-duration-fast, 150ms) var(--app-editorial-easing-out-quart);
        }

        &.active {
          background: var(--app-editorial-accent-muted, var(--cv-color-accent-surface));
          color: var(--app-editorial-accent, var(--cv-color-primary));
        }

        &[disabled] {
          opacity: 0.55;
          cursor: wait;
          pointer-events: none;
        }
      }

      button.item {
        appearance: none;
        -webkit-appearance: none;
        box-sizing: border-box;
        inline-size: 100%;
      }

      :host(:not([expanded]):not(.mobile-nav-rail):not(.mobile-nav-actions)) .item,
      :host(:not([expanded]):not(.mobile-nav-rail):not(.mobile-nav-actions)) .theme-toggle {
        inline-size: 40px;
        block-size: 40px;
        min-block-size: 40px;
        padding: 0;
        gap: 0;
        justify-content: center;
        text-align: center;
        --cv-button-gap: 0;
      }

      :host(:not([expanded]):not(.mobile-nav-rail):not(.mobile-nav-actions)) .item::part(base),
      :host(:not([expanded]):not(.mobile-nav-rail):not(.mobile-nav-actions))
        .theme-toggle::part(base) {
        inline-size: 40px;
        block-size: 40px;
        padding: 0;
        justify-content: center;
      }

      :host(:not([expanded]):not(.mobile-nav-rail):not(.mobile-nav-actions)) .item::part(label),
      :host(:not([expanded]):not(.mobile-nav-rail):not(.mobile-nav-actions)) .item::part(suffix),
      :host(:not([expanded]):not(.mobile-nav-rail):not(.mobile-nav-actions))
        .theme-toggle::part(label),
      :host(:not([expanded]):not(.mobile-nav-rail):not(.mobile-nav-actions))
        .theme-toggle::part(suffix) {
        display: none;
      }

      :host(:not([expanded]):not(.mobile-nav-rail):not(.mobile-nav-actions)) .item::part(prefix),
      :host(:not([expanded]):not(.mobile-nav-rail):not(.mobile-nav-actions))
        .theme-toggle::part(prefix) {
        inline-size: 18px;
        block-size: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      :host(:not([expanded]):not(.mobile-nav-rail):not(.mobile-nav-actions)) .item .label,
      :host(:not([expanded]):not(.mobile-nav-rail):not(.mobile-nav-actions)) .theme-toggle .label,
      :host(:not([expanded]):not(.mobile-nav-rail):not(.mobile-nav-actions)) .item .hint {
        flex: 0 0 0;
        inline-size: 0;
        min-inline-size: 0;
        max-inline-size: 0;
        padding: 0;
        overflow: hidden;
        opacity: 0;
      }

      :host([expanded]) .item .label {
        opacity: 1;
        transform: translateX(0);
      }

      :host([expanded]) .item::part(base),
      :host([expanded]) .theme-toggle::part(base) {
        justify-content: flex-start;
        text-align: start;
      }

      :host([expanded]) .item::part(label),
      :host([expanded]) .theme-toggle::part(label),
      :host(.mobile-nav-rail) .item::part(label),
      :host(.mobile-nav-actions) .item::part(label),
      :host(.mobile-nav-actions) .theme-toggle::part(label) {
        text-align: start;
      }

      :host([expanded]) .item .hint {
        opacity: 1;
      }

      .theme-toggle {
        display: flex;
        align-items: center;
        gap: var(--app-editorial-space-3, 12px);
        padding: var(--app-editorial-space-3, 12px);
        min-block-size: 44px;
        border-radius: var(--cv-radius-md, 8px);
        border: none;
        background: transparent;
        color: var(--app-editorial-text-secondary, var(--cv-alpha-white-70));
        cursor: pointer;
        text-align: start;
        font-family: var(--cv-font-family-body, 'Inter', system-ui);
        font-size: var(--app-editorial-text-small, 0.8125rem);
        font-weight: var(--app-editorial-font-weight-medium, 500);
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        transition:
          background-color var(--cv-duration-fast, 150ms) var(--app-editorial-easing-out-quart),
          color var(--cv-duration-fast, 150ms) var(--app-editorial-easing-out-quart);

        .theme-icon {
          flex-shrink: 0;
          inline-size: 20px;
          block-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          svg {
            fill: currentColor;
          }
        }

        .label {
          flex: 1;
          inline-size: 100%;
          opacity: 0;
          text-align: start;
          transform: translateX(
            calc(8px * var(--app-runtime-inline-start-direction-sign, -1))
          );
          transition:
            opacity var(--cv-duration-fast, 150ms) var(--app-editorial-easing-out-quart),
            transform var(--cv-duration-fast, 150ms) var(--app-editorial-easing-out-quart);
          white-space: nowrap;
        }

      }

      @media (hover: hover) and (pointer: fine) {
        .item:not(.active):hover,
        .theme-toggle:hover {
          background: var(--app-editorial-interaction-hover-overlay, var(--cv-alpha-white-4));
          color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
        }

        .item.danger:hover {
          background: var(--app-editorial-status-error-muted, var(--cv-color-danger-surface));
          color: var(--app-editorial-status-error, var(--cv-color-danger));
        }
      }

      .item:active:not([disabled]),
      .theme-toggle:active:not([disabled]),
      .item:not([disabled])::part(base):active,
      .theme-toggle:not([disabled])::part(base):active {
        background: var(--app-editorial-interaction-active-overlay, var(--cv-alpha-white-8));
        color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
        transition-duration: var(--cv-duration-instant, 0ms);
      }

      .item.danger:active:not([disabled]) {
        background: var(--app-editorial-interaction-active-overlay, var(--cv-alpha-white-8));
        color: var(--app-editorial-status-error, var(--cv-color-danger));
      }

      :host([expanded]) .theme-toggle .label {
        opacity: 1;
        transform: translateX(0);
      }

      @media (prefers-reduced-motion: reduce) {
        :host,
        .brand-text,
        .item .label,
        .item .hint,
        .theme-toggle .label {
          transition-duration: var(--cv-duration-instant, 0ms);
        }

        .brand-text,
        .item .label,
        .theme-toggle .label {
          transform: none;
        }
      }
    `,
  ]

  connectedCallback(): void {
    super.connectedCallback()
  }

  override updated(changed: Map<string, unknown>) {
    super.updated(changed)
    this.toggleAttribute('expanded', navigationRailModel.isExpanded())
  }

  private handleExpandedToggle() {
    navigationRailModel.toggleExpanded()
  }

  private handleExpandedToggleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') {
      return
    }

    e.preventDefault()
    this.handleExpandedToggle()
  }

  private handleThemeToggle() {
    navigationRailModel.toggleTheme()
  }

  private handleSettingsClick() {
    navigationRailModel.openSettings()
  }

  private handleFilesClick() {
    navigationRailModel.openFiles()
  }

  private handleNotesClick() {
    navigationRailModel.openNotes()
  }

  private handlePasswordsClick() {
    navigationRailModel.openPasswords()
  }

  private handleOtpCodesClick() {
    navigationRailModel.openOtpCodes()
  }

  private handleSshKeysClick() {
    navigationRailModel.openSshKeys()
  }

  private handlePasskeysClick() {
    navigationRailModel.openPasskeys()
  }

  private handleWalletClick() {
    navigationRailModel.openWallet()
  }

  private handleStorageClick() {
    navigationRailModel.openStorage()
  }

  private handleRemoteClick() {
    navigationRailModel.openRemote()
  }

  private handleExtensionsClick() {
    navigationRailModel.openExtensions()
  }

  private handleLockClick() {
    void navigationRailModel.lockVault()
  }

  private renderBrand() {
    const isExpanded = navigationRailModel.isExpanded()
    const canToggleExpanded = navigationRailModel.canToggleExpanded()
    const brandIcon = html`<welcome-chromvoid-icon variant="mark" aria-hidden="true"></welcome-chromvoid-icon>`

    return html`
      <div class="brand">
        ${canToggleExpanded
          ? html`
              <div
                class="brand-icon"
                @click=${this.handleExpandedToggle}
                title=${i18n(isExpanded ? 'navigation:collapse-sidebar' : 'navigation:expand-sidebar')}
                aria-label=${i18n(isExpanded ? 'navigation:collapse-sidebar' : 'navigation:expand-sidebar')}
                role="button"
                tabindex="0"
                @keydown=${this.handleExpandedToggleKeydown}
              >
                ${brandIcon}
              </div>
            `
          : html`<div class="brand-icon brand-icon--static" aria-hidden="true">${brandIcon}</div>`}
        <div class="brand-text">ChromVoid</div>
      </div>
    `
  }

  private renderMainNavigation() {
    const isMobileLayout = navigationRailModel.isMobileLayout()
    const isPasswords = navigationRailModel.isPasswordsActive()
    const isFiles = navigationRailModel.isFilesActive()
    const isNotes = navigationRailModel.isNotesActive()
    const isOtp = navigationRailModel.isOtpActive()
    const isSshKeys = navigationRailModel.isSshKeysActive()
    const isPasskeys = navigationRailModel.isPasskeysActive()
    const isWallet = navigationRailModel.isWalletActive()
    const supportsPasskeys = navigationRailModel.supportsPasskeys()
    const supportsWallet = navigationRailModel.supportsWallet()

    return html`
      <nav class="nav main-nav" aria-label=${i18n('navigation:main')}>
        <cv-button
          unstyled
          class="item ${isFiles ? 'active' : ''}"
          @click=${this.handleFilesClick}
          aria-current=${isFiles}
        >
          <cv-icon slot="prefix" name="folder"></cv-icon>
          <span class="label">${i18n('navigation:files')}</span>
        </cv-button>
        <cv-button
          unstyled
          class="item ${isNotes ? 'active' : ''}"
          @click=${this.handleNotesClick}
          aria-current=${isNotes}
        >
          <cv-icon slot="prefix" name="file-text"></cv-icon>
          <span class="label">${i18n('navigation:notes' as never)}</span>
        </cv-button>
        <cv-button
          unstyled
          class="item ${isPasswords ? 'active' : ''}"
          @click=${this.handlePasswordsClick}
          aria-current=${isPasswords}
        >
          <cv-icon slot="prefix" name="key"></cv-icon>
          <span class="label">${i18n('navigation:passwords')}</span>
        </cv-button>
        <cv-button
          unstyled
          class="item ${isOtp ? 'active' : ''}"
          @click=${this.handleOtpCodesClick}
          aria-current=${isOtp}
        >
          <cv-icon slot="prefix" name="shield-check"></cv-icon>
          <span class="label">${i18n('navigation:otp-codes' as any)}</span>
        </cv-button>
        ${isMobileLayout
          ? html`
              <cv-button
                unstyled
                class="item ${isSshKeys ? 'active' : ''}"
                @click=${this.handleSshKeysClick}
                aria-current=${isSshKeys}
              >
                <cv-icon slot="prefix" name="terminal"></cv-icon>
                <span class="label">${i18n('navigation:ssh-keys' as never)}</span>
              </cv-button>
            `
          : nothing}
        ${supportsPasskeys
          ? html`
              <cv-button
                unstyled
                class="item ${isPasskeys ? 'active' : ''}"
                @click=${this.handlePasskeysClick}
                aria-current=${isPasskeys}
              >
                <cv-icon slot="prefix" name="octicons:passkey-fill" fill></cv-icon>
                <span class="label">${i18n('navigation:passkeys')}</span>
              </cv-button>
            `
          : nothing}
        ${supportsWallet
          ? html`
              <cv-button
                unstyled
                class="item ${isWallet ? 'active' : ''}"
                @click=${this.handleWalletClick}
                aria-current=${isWallet}
              >
                <cv-icon slot="prefix" name="wallet"></cv-icon>
                <span class="label">${i18n('navigation:wallet')}</span>
              </cv-button>
            `
          : nothing}
      </nav>
    `
  }

  protected renderSecondaryActions() {
    const supportsStorage = navigationRailModel.supportsStorage()
    const supportsRemote = navigationRailModel.supportsRemote()
    const supportsExtensions = navigationRailModel.supportsExtensions()
    const isStorage = navigationRailModel.isStorageActive()
    const isRemote = navigationRailModel.isRemoteActive()
    const isExtensions = navigationRailModel.isExtensionsActive()
    const isSettings = navigationRailModel.isSettingsActive()
    const theme = navigationRailModel.theme()
    const vaultLockActionLabelKey = navigationRailModel.vaultLockActionLabelKey()
    const vaultLockShortcutLabel = navigationRailModel.vaultLockShortcutLabel()
    const vaultLockPending = navigationRailModel.isVaultLockPending()

    return html`
      <nav class="nav secondary-actions" aria-label=${i18n('navigation:actions')}>
        <cv-button
          unstyled
          class="theme-toggle"
          @click=${this.handleThemeToggle}
          title=${i18n('theme:toggle')}
        >
          <span slot="prefix" class="theme-icon">${theme === 'light' ? sun : moon}</span>
          <span class="label"
            >${theme === 'light'
              ? i18n('theme:mode:light')
              : theme === 'dark'
                ? i18n('theme:mode:dark')
                : i18n('theme:mode:system')}</span
          >
        </cv-button>

        ${supportsStorage
          ? html`
              <cv-button unstyled class="item ${isStorage ? 'active' : ''}" @click=${this.handleStorageClick}>
                <cv-icon slot="prefix" name="hard-drive"></cv-icon>
                <span class="label">${i18n('navigation:storage')}</span>
              </cv-button>
            `
          : ''}
        ${supportsRemote
          ? html`
              <cv-button unstyled class="item ${isRemote ? 'active' : ''}" @click=${this.handleRemoteClick}>
                <cv-icon slot="prefix" name="wifi"></cv-icon>
                <span class="label">${i18n('navigation:remote')}</span>
              </cv-button>
            `
          : ''}
        ${supportsExtensions
          ? html`
              <cv-button
                unstyled
                class="item ${isExtensions ? 'active' : ''}"
                @click=${this.handleExtensionsClick}
              >
                <cv-icon slot="prefix" name="puzzle"></cv-icon>
                <span class="label">${i18n('navigation:extensions')}</span>
              </cv-button>
            `
          : ''}

        <cv-button unstyled class="item ${isSettings ? 'active' : ''}" @click=${this.handleSettingsClick}>
          <cv-icon slot="prefix" name="settings"></cv-icon>
          <span class="label">${i18n('navigation:settings')}</span>
        </cv-button>

        <button
          id="app.vault.lock"
          type="button"
          class="item danger"
          ?disabled=${vaultLockPending}
          aria-busy=${vaultLockPending ? 'true' : 'false'}
          @click=${this.handleLockClick}
        >
          <cv-icon name="lock"></cv-icon>
          <span class="label">${i18n(vaultLockActionLabelKey)}</span>
          ${vaultLockShortcutLabel ? html`<span class="hint">${vaultLockShortcutLabel}</span>` : ''}
        </button>
      </nav>
    `
  }

  protected render() {
    const isMobileLayout = navigationRailModel.isMobileLayout()

    return html`
      ${this.renderBrand()} ${this.renderMainNavigation()}
      ${isMobileLayout ? '' : this.renderSecondaryActions()}
    `
  }
}

export class NavigationRailActions extends NavigationRail {
  static define() {
    if (!customElements.get('navigation-rail-actions')) {
      customElements.define('navigation-rail-actions', this as unknown as CustomElementConstructor)
    }
  }

  protected override render() {
    return this.renderSecondaryActions()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'navigation-rail': NavigationRail
    'navigation-rail-actions': NavigationRailActions
  }
}
