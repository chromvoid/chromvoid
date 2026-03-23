import {state} from '@statx/core'
import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import type {CVIcon} from '@chromvoid/uikit'

import {i18n, DEFAULT_CLIPBOARD_WIPE_MS, copyWithAutoWipe} from '@project/passmanager'
import {sharedStyles} from 'root/shared/ui/shared-styles'

export class CopyButton extends XLitElement {
  static define() {
    customElements.define('cv-copy-button', this)
  }

  static properties = {
    size: {type: String, reflect: true},
  }

  declare size: 'small' | 'medium' | 'large'

  static styles = [
    ...sharedStyles,
    css`
      :host {
        display: inline-block;
      }

      cv-button {
        display: block;
        &::part(base) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          block-size: var(--cv-button-min-height);
          inline-size: var(--cv-button-min-height);
          min-inline-size: var(--cv-button-min-height);
          padding: 0;
          background: var(--cv-color-surface-3);
          border: 1px solid color-mix(in oklch, var(--cv-color-border-strong) 100%, var(--cv-color-text) 20%);
          color: var(--cv-color-text);
          transition: transform var(--cv-duration-fast) var(--cv-easing-standard);
        }

        &:hover::part(base) {
          background: var(--cv-color-surface-4, color-mix(in oklch, var(--cv-color-surface-3) 80%, white));
          border-color: var(--cv-color-primary);
          color: var(--cv-color-primary);
          transform: translateY(-1px);
        }

        &:active::part(base) {
          transform: translateY(0);
        }
      }

      cv-icon {
        font-size: 16px;
        color: inherit;

        &[name='check'] {
          color: var(--cv-color-success);
        }
      }

      :host([slotted]) {
        cv-icon {
          display: none;
        }

        cv-button:hover {
          cv-icon {
            display: inline-block;
          }

          .slot {
            display: none;
          }
        }
      }
    `,
  ]

  clicked = state(false)
  value$ = state<string | (() => Promise<string>) | undefined>(undefined)

  handleClick = async (e: Event) => {
    e.preventDefault()
    e.stopPropagation()

    this.clicked.set(true)
    // Pulse animation (respects prefers-reduced-motion)
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const btn = this.shadowRoot?.querySelector('cv-button') as HTMLElement | null
      btn?.animate([{transform: 'scale(1)'}, {transform: 'scale(1.2)'}, {transform: 'scale(1)'}], {
        duration: 300,
        easing: 'ease-out',
      })
    }
    const value = this.value$()
    let resolvedValue: string | undefined

    if (typeof value === 'function') {
      try {
        resolvedValue = await value()
      } catch {
        // Ошибка получения значения
      }
    } else {
      resolvedValue = value
    }

    setTimeout(() => {
      this.clicked.set(false)
    }, 1500)

    try {
      console.debug('[cv-copy-button] copying', {len: resolvedValue?.length, hasTauri: '__TAURI_INTERNALS__' in globalThis})
      await copyWithAutoWipe(resolvedValue ?? '', DEFAULT_CLIPBOARD_WIPE_MS)
    } catch (e) {
      console.warn('[cv-copy-button] copyWithAutoWipe failed:', e)
    }
  }

  set value(v: string | (() => Promise<string>) | undefined) {
    this.value$.set(v)
  }

  get value() {
    return this.value$()
  }

  render() {
    const label = this.clicked() ? i18n('button:copied') : i18n('button:copy')
    return html`
      <cv-button
        @click=${this.handleClick}
        variant="default"
        size=${this.size ?? 'medium'}
        aria-label=${label}
        title=${label}
      >
        <cv-icon name=${this.clicked() ? 'check' : 'copy'} aria-hidden="true"></cv-icon>
        <slot class="slot"></slot>
      </cv-button>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cv-icon': CVIcon
  }
}
