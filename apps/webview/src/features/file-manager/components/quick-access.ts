import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {i18n} from 'root/i18n'
import {cardShellStyles, sharedStyles, surfacePrimitiveStyles} from 'root/shared/ui/shared-styles'

type QuickItem = {
  key: string
  icon?: string
}

export class QuickAccess extends XLitElement {
  static define() {
    customElements.define('quick-access', this)
  }

  private readonly items: QuickItem[] = [
    {key: 'starred', icon: 'star'},
    {key: 'recent', icon: 'clock'},
    {key: 'trash', icon: 'trash'},
  ]

  static styles = [
    sharedStyles,
    cardShellStyles,
    surfacePrimitiveStyles,
    css`
      /* ========== СОВРЕМЕННЫЙ QUICK ACCESS ========== */

      :host {
        --file-manager-section-accent: var(--gradient-primary);
        --file-manager-section-title-bg: linear-gradient(135deg, var(--cv-color-surface) 0%, var(--cv-color-surface-2) 100%);
      }

      .section-title {
        padding: var(--app-spacing-3) var(--app-spacing-3) var(--app-spacing-2);
      }

      .list {
        display: grid;
        gap: var(--app-spacing-1);
        padding: 0 var(--app-spacing-2) var(--app-spacing-3);
      }

      .item {
        display: grid;
        grid-template-columns: 28px 1fr auto;
        align-items: center;
        gap: var(--app-spacing-2);
        padding: var(--app-spacing-2) var(--app-spacing-3);
        border-radius: var(--cv-radius-2);
        color: var(--cv-color-text);
        cursor: pointer;
        position: relative;
        transition:
          background-color var(--cv-duration-fast) var(--cv-easing-standard),
          transform var(--cv-duration-fast) var(--cv-easing-standard),
          box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
        border: 1px solid transparent;

        &::before {
          content: '';
          position: absolute;
          inset-inline-start: 0;
          top: 50%;
          transform: translateY(-50%);
          inline-size: 3px;
          block-size: 0;
          background: var(--gradient-primary);
          transition: height var(--cv-duration-fast) var(--cv-easing-standard);
          border-radius: 0 2px 2px 0;
        }

        &:hover {
          background: var(--cv-color-hover);
          transform: translateX(4px);
          box-shadow: var(--cv-shadow-sm);
          border-color: var(--cv-color-border-accent);

          &::before {
            block-size: 16px;
          }
        }

        &:active {
          transform: translateX(2px);
          box-shadow: none;
        }

        .icon {
          inline-size: 24px;
          block-size: 24px;
          border-radius: var(--cv-radius-2);
          background: var(--gradient-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 14px;
          box-shadow: var(--cv-shadow-sm);
          transition: transform var(--cv-duration-fast) var(--cv-easing-standard);

          .item:hover & {
            transform: scale(1.1);
            box-shadow: var(--cv-shadow-1);
          }
        }

        .label {
          font-size: var(--cv-font-size-sm);
          font-weight: var(--cv-font-weight-medium);
        }
      }
    `,
  ]

  private onItemClick = (e: Event) => {
    const el = e.currentTarget as HTMLElement | null
    const key = (el?.dataset && el.dataset['key']) || ''
    this.dispatchEvent(new CustomEvent('navigate', {detail: {key}, bubbles: true}))
  }

  protected render() {
    const list = this.items.map((item) => {
      return html`
        <div
          class="item"
          role="listitem"
          tabindex="0"
          data-key=${item['key']}
          @click=${this.onItemClick}
          @keydown=${this.onItemKeydown}
        >
          <span class="icon" aria-hidden="true">
            <cv-icon name=${item.icon || 'folder'}></cv-icon>
          </span>
          <span class="label">${i18n(`quick-access:${item.key}` as any)}</span>
        </div>
      `
    })
    return html`
      <div class="section-title">${i18n('sidebar:quick-access' as any)}</div>
      <div class="list" role="list">${list}</div>
    `
  }

  private onItemKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      this.onItemClick(e)
    }
  }
}
