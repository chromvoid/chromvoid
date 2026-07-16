import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css} from 'lit'

import {i18n} from 'root/i18n'
import type {SortDirection, SortOption} from 'root/shared/contracts/file-manager'
import {hostContentContainStyles, sharedStyles} from 'root/shared/ui/shared-styles'

import {getSortDirectionLabel, getSortLabel} from './file-manager-labels'

export class FileManagerStatusBar extends ReatomLitElement {
  static elementName = 'file-manager-status-bar'

  static get properties() {
    return {
      visibleCount: {type: Number, attribute: 'visible-count'},
      totalCount: {type: Number, attribute: 'total-count'},
      currentPath: {type: String, attribute: 'current-path'},
      sortBy: {type: String, attribute: 'sort-by'},
      sortDirection: {type: String, attribute: 'sort-direction'},
      loading: {type: Boolean, reflect: true},
    }
  }

  declare visibleCount: number
  declare totalCount: number
  declare currentPath: string
  declare sortBy: SortOption
  declare sortDirection: SortDirection
  declare loading: boolean

  constructor() {
    super()
    this.visibleCount = 0
    this.totalCount = 0
    this.currentPath = '/'
    this.sortBy = 'name'
    this.sortDirection = 'asc'
    this.loading = false
  }

  static styles = [
    sharedStyles,
    hostContentContainStyles,
    css`
      :host {
        display: block;
        min-inline-size: 0;
        border-block-start: 1px solid var(--cv-color-border-muted);
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text-subtle);
        container-type: inline-size;
      }

      .status-bar {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-3);
        block-size: 26px;
        min-inline-size: 0;
        padding-inline: var(--app-spacing-3);
        box-sizing: border-box;
        font-family: var(--cv-font-family-code);
        font-size: var(--cv-font-size-xs);
        font-variant-numeric: tabular-nums;
        line-height: 1;
      }

      .divider {
        color: var(--cv-color-border);
      }

      .sort,
      .path {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .path {
        margin-inline-start: auto;
        color: var(--cv-color-text-muted);
      }

      .loading {
        color: var(--cv-color-accent);
      }

      @container (width < 620px) {
        .sort,
        .divider {
          display: none;
        }
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  private formatVaultPath(): string {
    if (!this.currentPath || this.currentPath === '/') return 'vault://root'
    return `vault:/${this.currentPath.replace(/^\/+/, '')}`
  }

  protected render() {
    const countLabel = i18n('file-manager:visible-items-count', {
      visible: String(this.visibleCount),
      total: String(this.totalCount),
    })
    const sortLabel = i18n('file-manager:sorted-by', {
      sort: getSortLabel(this.sortBy),
      direction: getSortDirectionLabel(this.sortBy, this.sortDirection),
    })
    const path = this.formatVaultPath()

    return html`
      <div class="status-bar" role="status" aria-label=${countLabel}>
        <span class="count">${countLabel}</span>
        ${this.loading ? html`<span class="loading">${i18n('loading')}</span>` : html`<span class="divider">·</span>`}
        <span class="sort">${sortLabel}</span>
        <span class="path" dir="ltr" title=${path}>${path}</span>
      </div>
    `
  }
}

