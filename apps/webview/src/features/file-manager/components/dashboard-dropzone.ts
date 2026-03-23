import {XLitElement} from '@statx/lit'

import {css, html, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {sharedStyles} from 'root/shared/ui/shared-styles'

export class DashboardDropzone extends XLitElement {
  static define() {
    customElements.define('dashboard-dropzone', this)
  }

  static get properties() {
    return {
      active: {type: Boolean},
      message: {type: String},
      loading: {type: Boolean},
    }
  }

  declare active: boolean
  declare message: string
  declare loading: boolean

  constructor() {
    super()
    this.active = false
    this.message = ''
    this.loading = false
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        position: relative;
        block-size: 100%;
        flex: 1;
        min-block-size: 0;
      }

      .drop-zone {
        position: relative;
        block-size: 100%;
        display: flex;
        flex-direction: column;

        .drop-overlay {
          position: absolute;
          inset: 0;
          background: color-mix(in oklch, var(--cv-color-primary), transparent 90%);
          border: 3px dashed var(--cv-color-primary);
          border-radius: var(--cv-radius-3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--cv-color-primary);
          font-weight: 600;
          font-size: 1.2em;
          opacity: 0;
          pointer-events: none;
          transition:
            opacity var(--cv-duration-fast) var(--cv-easing-standard),
            transform var(--cv-duration-fast) var(--cv-easing-standard);
          z-index: 1000;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);

          &.visible {
            opacity: 1;
          }
        }

        .loading-overlay {
          position: absolute;
          inset: 0;
          background: color-mix(in oklch, var(--cv-color-surface), white 80%);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999;
        }
      }

      /* dropZonePulse: removed — infinite animation hurt responsiveness */

      /* Touch устройства - улучшенная визуализация */
      @media (hover: none) and (pointer: coarse) {
        .drop-zone {
          .drop-overlay {
            border-width: 4px;
            font-size: 1.4em;
            padding-block: var(--app-spacing-4);

            &.visible {
              transform: scale(1.05);
            }
          }
        }
      }

      /* Responsive размеры для overlay */
      @media (max-width: 768px) {
        .drop-zone {
          .drop-overlay {
            font-size: 1.1em;
            padding: var(--app-spacing-3);
          }
        }
      }
    `,
  ]

  render() {
    return html`
      <div class="drop-zone">
        <slot></slot>
        <div class="drop-overlay ${this.active ? 'visible' : ''}">
          ${this.message || i18n('file-manager:drop-files-here' as any)}
        </div>
        ${this.loading ? html`<div class="loading-overlay">${i18n('loading' as any)}</div>` : nothing}
      </div>
    `
  }
}
