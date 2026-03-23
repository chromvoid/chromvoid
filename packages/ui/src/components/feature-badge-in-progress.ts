import {css, html, LitElement} from 'lit'

/**
 * Feature badge for "In Progress" status.
 * Cyan accent to signal ongoing development.
 *
 * @example
 * ```html
 * <cv-feature-badge-in-progress></cv-feature-badge-in-progress>
 * ```
 */
export class CVFeatureBadgeInProgress extends LitElement {
  static elementName = 'cv-feature-badge-in-progress'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }
  static styles = [
    css`
      :host {
        display: inline-flex;
      }

      [part='base'] {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 4px;
        font-family: var(--cv-font-mono, 'Courier New', monospace);
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 500;
        border: 1px solid rgba(0, 229, 255, 0.24);
        background: rgba(0, 229, 255, 0.08);
        color: var(--cv-primary, #00e5ff);
        white-space: nowrap;
        transition:
          border-color 120ms ease,
          background 120ms ease,
          color 120ms ease;
      }

      [part='base']:hover {
        border-color: rgba(0, 229, 255, 0.36);
        background: rgba(0, 229, 255, 0.12);
      }

      [part='icon'] {
        width: 12px;
        height: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
    `,
  ]

  protected override render() {
    return html`
      <div part="base">
        <svg part="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <!-- Spinner icon -->
          <circle cx="8" cy="8" r="6" stroke-dasharray="9.42 37.7" stroke-dashoffset="0" opacity="0.4" />
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke-dasharray="18.84 37.7"
            stroke-dashoffset="0"
            style="animation: cv-spinner-rotate 2s linear infinite"
          />
          <defs>
            <style>
              @keyframes cv-spinner-rotate {
                from {
                  transform: rotate(0deg);
                  transform-origin: center;
                }
                to {
                  transform: rotate(360deg);
                  transform-origin: center;
                }
              }
            </style>
          </defs>
        </svg>
        <span part="label">In Development</span>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cv-feature-badge-in-progress': CVFeatureBadgeInProgress
  }
}
