import {css, html, LitElement} from 'lit'

/**
 * Feature badge for "Pro" tier indicator.
 * Violet accent to signal premium/pro feature.
 *
 * @example
 * ```html
 * <cv-feature-badge-pro></cv-feature-badge-pro>
 * ```
 */
export class CVFeatureBadgePro extends LitElement {
  static elementName = 'cv-feature-badge-pro'

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
        border: 1px solid rgba(179, 136, 255, 0.24);
        background: rgba(179, 136, 255, 0.08);
        color: #b388ff;
        white-space: nowrap;
        transition:
          border-color 120ms ease,
          background 120ms ease,
          color 120ms ease;
      }

      [part='base']:hover {
        border-color: rgba(179, 136, 255, 0.36);
        background: rgba(179, 136, 255, 0.12);
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
        <svg part="icon" viewBox="0 0 16 16" fill="currentColor">
          <!-- Star icon -->
          <path
            d="M8 1.5l1.98 4.02h4.36l-3.52 2.56 1.34 4.35L8 11.88l-3.16 2.55 1.34-4.35-3.52-2.56h4.36L8 1.5z"
          />
        </svg>
        <span part="label">Pro</span>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cv-feature-badge-pro': CVFeatureBadgePro
  }
}
