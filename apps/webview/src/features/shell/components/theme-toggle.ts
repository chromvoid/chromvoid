import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {sharedStyles} from 'root/shared/ui/shared-styles'

import {moon, sun} from 'root/features/media/components/icons'

export class ThemeToggle extends XLitElement {
  static define() {
    if (!customElements.get('theme-toggle')) {
      customElements.define('theme-toggle', this)
    }
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        display: inline-block;
      }

      .toggle {
        display: inline-flex;
        align-items: center;
        inline-size: max-content;
        gap: 0.5rem;
        padding-block: 0.625rem;
        padding-inline: 0.75rem 1rem;
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-1);
        background: var(--cv-color-surface);
        color: var(--cv-color-text);
        cursor: pointer;
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-medium);
        transition:
          background var(--cv-duration-normal) var(--cv-easing-standard),
          color var(--cv-duration-normal) var(--cv-easing-standard),
          border-color var(--cv-duration-normal) var(--cv-easing-standard);

        .mode-label {
          font-variant: all-small-caps;
          letter-spacing: 0.02em;
          opacity: 0.8;
        }

        &:hover {
          background: var(--cv-color-surface-2);
        }

        &:focus-visible {
          outline: 2px solid var(--cv-color-primary);
          outline-offset: 2px;
        }
      }
    `,
  ]

  private onClick = () => {
    getAppContext().store.switchTheme()
  }

  protected render() {
    const theme = getAppContext().store.theme()
    const ariaLabel =
      theme === 'light'
        ? i18n('theme:switch-to-dark')
        : theme === 'dark'
          ? i18n('theme:switch-to-system')
          : i18n('theme:switch-to-light')
    const modeLabel =
      theme === 'light'
        ? i18n('theme:mode:light')
        : theme === 'dark'
          ? i18n('theme:mode:dark')
          : i18n('theme:mode:system')

    return html`<button
      class="toggle"
      @click=${this.onClick}
      aria-label=${ariaLabel}
      aria-pressed=${theme !== 'light'}
    >
      ${theme === 'light' ? sun : theme === 'dark' ? moon : sun}
      <span class="mode-label">${modeLabel}</span>
    </button>`
  }
}
