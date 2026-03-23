import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {i18n} from 'root/i18n'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {sharedStyles} from 'root/shared/ui/shared-styles'

export class MobileTabBar extends XLitElement {
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
          display: block;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: calc(var(--cv-z-overlay, 300) - 1);
          background: var(--cv-color-bg);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-top: 1px solid var(--border-subtle, var(--cv-alpha-white-6));
        }
      }

      .tab-bar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 72px;
        padding: 0 16px;
      }

      .tab {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        flex: 1;
        min-width: 0;
        padding: 10px 0;
        border: none;
        border-radius: 12px;
        background: transparent;
        color: var(--cv-alpha-white-50);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        transition:
          color var(--cv-duration-fast, 150ms) var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1)),
          background var(--cv-duration-fast, 150ms) var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
        min-height: 48px;
      }

      .tab:active {
        transform: scale(0.96);
      }

      .tab.active {
        color: var(--cv-color-accent);
        background: color-mix(in oklch, var(--cv-color-accent) 12%, transparent);
        box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--cv-color-accent) 15%, transparent);
      }

      .tab cv-icon {
        font-size: 22px;
        flex-shrink: 0;
      }

      .tab-label {
        font-family: var(--cv-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
        font-size: 11px;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
    `,
  ]

  private onFiles = () => {
    navigationModel.navigateToSurface('files')
  }

  private onPasswords = () => {
    navigationModel.navigateToSurface('passwords')
  }

  private getActiveTab(): string {
    return navigationModel.snapshot().surface === 'passwords' ? 'passwords' : 'files'
  }

  protected render() {
    const active = this.getActiveTab()

    return html`
      <nav class="tab-bar" aria-label=${i18n('navigation:main' as any)}>
        <button
          class="tab ${active === 'files' ? 'active' : ''}"
          @click=${this.onFiles}
          aria-label=${i18n('navigation:files' as any)}
        >
          <cv-icon name="folder-fill"></cv-icon>
          <span class="tab-label">${i18n('navigation:files' as any)}</span>
        </button>
        <button
          class="tab ${active === 'passwords' ? 'active' : ''}"
          @click=${this.onPasswords}
          aria-label=${i18n('navigation:passwords' as any)}
        >
          <cv-icon name="lock"></cv-icon>
          <span class="tab-label">${i18n('navigation:passwords' as any)}</span>
        </button>
      </nav>
    `
  }
}
