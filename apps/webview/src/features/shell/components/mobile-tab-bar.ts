import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css} from 'lit'

import {i18n} from 'root/i18n'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {sharedStyles} from 'root/shared/ui/shared-styles'

export class MobileTabBar extends ReatomLitElement {
  static elementName = 'mobile-tab-bar'
  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        display: none;
      }

      @media (max-width: 767px) {
        :host {
          display: var(--app-runtime-tab-bar-display, block);
          position: fixed;
          inset-block-end: 0;
          inset-inline: 0;
          z-index: calc(var(--cv-z-overlay, 300) - 1);
          background: var(--cv-color-bg);
          border-block-start: 1px solid var(--cv-color-border-faint);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          padding-block-end: var(--app-runtime-safe-area-block-end-active, var(--app-runtime-safe-area-block-end, 0px));
        }
      }

      .tab-bar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        block-size: var(--app-mobile-tabbar-block-size, 64px);
        padding: 0 16px;
      }

      .tab {
        flex: 1;
        min-inline-size: 0;
        block-size: 100%;
        position: relative;
        border: none;
        border-radius: 12px;
        background: transparent;
        color: var(--cv-color-text-muted);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        transition:
          color var(--cv-duration-fast, 150ms) var(--app-editorial-easing-out-quart, cubic-bezier(0.25, 1, 0.5, 1)),
          background var(--cv-duration-fast, 150ms) var(--app-editorial-easing-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
        min-block-size: 48px;
      }

      .tab::part(base) {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        inline-size: 100%;
        block-size: 100%;
        box-sizing: border-box;
        border-radius: inherit;
        padding: 10px 0;
      }

      .tab:active {
        transform: scale(0.96);
      }

      .tab:focus-within,
      .tab::part(base):focus-visible {
        outline: none;
        outline-offset: 0;
      }

      .tab:focus-visible::part(base),
      .tab::part(base):focus-visible {
        box-shadow: 0 0 0 2px var(--cv-color-accent-ring);
      }

      .tab.active {
        color: var(--cv-color-accent);
      }

      .tab cv-icon {
        font-size: 20px;
        flex-shrink: 0;
      }

      .tab-label {
        max-inline-size: 100%;
        overflow: hidden;
        font-family: var(--cv-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
        font-size: 9px;
        font-weight: 600;
        line-height: 1;
        text-overflow: ellipsis;
        white-space: nowrap;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
    `,
  ]

  private onFiles() {
    navigationModel.navigateToSurface('files')
  }

  private onNotes() {
    navigationModel.navigateToSurface('notes')
  }

  private onPasswords() {
    navigationModel.navigateToSurface('passwords')
  }

  private onOtpCodes() {
    navigationModel.openPassmanagerRoute({kind: 'otp-view'})
  }

  private getActiveTab(): string {
    return navigationModel.activeMobileTab()
  }

  protected render() {
    const active = this.getActiveTab()

    return html`
      <nav class="tab-bar" aria-label=${i18n('navigation:main' as any)}>
        <cv-button unstyled
          class="tab ${active === 'files' ? 'active' : ''}"
          @click=${this.onFiles}
          aria-label=${i18n('navigation:files' as any)}
        >
          <cv-icon slot="prefix" name="folder-fill"></cv-icon>
          <span class="tab-label">${i18n('navigation:files' as any)}</span>
        </cv-button>
        <cv-button unstyled
          class="tab ${active === 'notes' ? 'active' : ''}"
          @click=${this.onNotes}
          aria-label=${i18n('navigation:notes' as never)}
        >
          <cv-icon slot="prefix" name="file-text"></cv-icon>
          <span class="tab-label">${i18n('navigation:notes' as never)}</span>
        </cv-button>
        <cv-button unstyled
          class="tab ${active === 'passwords' ? 'active' : ''}"
          @click=${this.onPasswords}
          aria-label=${i18n('navigation:passwords' as any)}
        >
          <cv-icon slot="prefix" name="lock"></cv-icon>
          <span class="tab-label">${i18n('navigation:passwords' as any)}</span>
        </cv-button>
        <cv-button unstyled
          class="tab ${active === 'otp' ? 'active' : ''}"
          @click=${this.onOtpCodes}
          aria-label=${i18n('navigation:otp-codes' as any)}
        >
          <cv-icon slot="prefix" name="shield-check"></cv-icon>
          <span class="tab-label">${i18n('navigation:otp-codes' as any)}</span>
        </cv-button>
      </nav>
    `
  }
}
