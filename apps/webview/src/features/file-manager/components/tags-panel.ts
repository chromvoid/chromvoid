import {state} from '@statx/core'
import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {i18n} from 'root/i18n'
import {cardShellStyles, sharedStyles, surfacePrimitiveStyles} from 'root/shared/ui/shared-styles'

type TagItem = {
  key: string
  label: string
  color?: string
}

export class TagsPanel extends XLitElement {
  static define() {
    if (!customElements.get('tags-panel')) {
      customElements.define('tags-panel', this as unknown as CustomElementConstructor)
    }
  }

  private collapsed = state(false)

  private readonly tags: TagItem[] = [
    {key: 'work', label: i18n('tags:work' as any)},
    {key: 'personal', label: i18n('tags:personal' as any)},
    {key: 'scan', label: i18n('tags:scan' as any)},
    {key: 'project', label: i18n('tags:project' as any)},
  ]

  static styles = [
    ...sharedStyles,
    cardShellStyles,
    surfacePrimitiveStyles,
    css`
      /* ========== СОВРЕМЕННЫЕ ТЕГИ ========== */

      :host {
        --file-manager-section-accent: var(--gradient-secondary);
        --file-manager-section-title-bg: linear-gradient(
          135deg,
          var(--cv-color-surface) 0%,
          var(--cv-color-surface-2) 100%
        );
      }

      .section-header {
        padding: var(--app-spacing-3);
        background: linear-gradient(135deg, var(--cv-color-surface) 0%, var(--cv-color-surface-2) 100%);
        border-block-end: 1px solid var(--cv-color-border-muted);
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        transition: background-color var(--cv-duration-fast) var(--cv-easing-standard);

        &:hover {
          background: var(--cv-color-hover);
        }
      }

      .section-title {
        margin-block-start: 0;
        margin-block-end: 0;
        margin-inline-start: 0;
        margin-inline-end: 0;
      }

      .collapse-icon {
        color: var(--cv-color-text-muted);
        transition: transform var(--cv-duration-fast) var(--cv-easing-standard);
      }

      .section-header.collapsed .collapse-icon {
        transform: rotate(-90deg);
      }

      .tags-container {
        max-block-size: 300px;
        overflow: hidden;
        transition: max-height var(--cv-duration-normal) var(--cv-easing-standard);

        &.collapsed {
          max-height: 0;
        }
      }

      .tags {
        display: grid;
        gap: var(--app-spacing-1) var(--app-spacing-2);
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        padding: var(--app-spacing-3);
      }

      .tag {
        display: inline-flex;
        align-items: center;
        gap: var(--app-spacing-2);
        padding: var(--app-spacing-2) var(--app-spacing-3);
        border-radius: var(--cv-radius-2);
        border: 1px solid var(--cv-color-border);
        background: var(--cv-color-surface);
        color: var(--cv-color-text);
        cursor: pointer;
        user-select: none;
        font-size: var(--cv-font-size-xs);
        font-weight: var(--cv-font-weight-medium);
        position: relative;
        transition:
          background-color var(--cv-duration-fast) var(--cv-easing-standard),
          border-color var(--cv-duration-fast) var(--cv-easing-standard),
          color var(--cv-duration-fast) var(--cv-easing-standard),
          transform var(--cv-duration-fast) var(--cv-easing-standard),
          box-shadow var(--cv-duration-fast) var(--cv-easing-standard);

        &::before {
          content: '';
          position: absolute;
          inset: 0;
          background: var(--gradient-subtle);
          opacity: 0;
          transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
          border-radius: var(--cv-radius-2);
        }

        &:hover {
          background: var(--cv-color-hover);
          border-color: var(--cv-color-border-accent);
          color: var(--cv-color-primary);
          transform: translateY(-2px);
          box-shadow: var(--cv-shadow-1);

          &::before {
            opacity: 0.1;
          }

          .dot {
            background: var(--gradient-secondary);
            transform: scale(1.1);
          }
        }

        &:active {
          transform: translateY(0);
          box-shadow: none;
        }
      }

      .dot {
        inline-size: 10px;
        block-size: 10px;
        border-radius: 50%;
        background: var(--gradient-primary);
        box-shadow: var(--cv-shadow-sm);
        position: relative;
        z-index: 1;
      }
    `,
  ]

  private onTagClick = (tag: TagItem) => {
    this.dispatchEvent(new CustomEvent('tag-click', {detail: {tag}, bubbles: true}))
  }

  private onToggleCollapse = () => {
    this.collapsed.set(!this.collapsed())
  }

  protected render() {
    const isCollapsed = this.collapsed()
    const tags = this.tags.map(
      (t) =>
        html`<div
          class="tag"
          role="listitem"
          tabindex="0"
          data-key=${t['key']}
          @click=${this._onTagElClick}
          @keydown=${this._onTagKeydown}
        >
          <span class="dot" aria-hidden="true"></span>
          <span class="label">${t.label}</span>
        </div>`,
    )

    return html`
      <div class="section-header ${isCollapsed ? 'collapsed' : ''}" @click=${this.onToggleCollapse}>
        <div class="section-title">
          <cv-icon name="tags"></cv-icon>
          ${i18n('sidebar:tags' as any)}
        </div>
        <cv-icon class="collapse-icon" name="chevron-down"></cv-icon>
      </div>
      <div class="tags-container ${isCollapsed ? 'collapsed' : ''}">
        <div class="tags" role="list">${tags}</div>
      </div>
    `
  }

  private _onTagElClick = (e: Event) => {
    const el = e.currentTarget as HTMLElement | null
    const key = el?.dataset && el.dataset['key']
    const tag = this.tags.find((t) => t['key'] === key)
    if (tag) this.onTagClick(tag)
  }

  private _onTagKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      this._onTagElClick(e)
    }
  }
}
