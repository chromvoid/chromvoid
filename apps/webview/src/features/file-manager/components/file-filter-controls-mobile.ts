import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'
import type {TemplateResult} from 'lit'

import {i18n} from 'root/i18n'
import type {SearchFilters, SortOption, ViewMode} from 'root/shared/contracts/file-manager'
import {getFileTypeLabel, getSortDirectionLabel, getSortLabel, getViewLabel} from './file-manager-labels'

const SORT_OPTIONS: SortOption[] = ['name', 'size', 'date', 'type']

const VIEW_OPTIONS: {value: ViewMode; icon: string}[] = [
  {value: 'list', icon: 'list'},
  {value: 'grid', icon: 'grid'},
  {value: 'table', icon: 'table'},
]

const FILE_TYPE_OPTIONS = ['images', 'documents', 'videos', 'audio', 'archives', 'code']

/**
 * Mobile-optimized filter/sort controls for file manager.
 * Renders inside a bottom sheet drawer with touch-friendly chip selectors.
 */
export class FileFilterControlsMobile extends XLitElement {
  static define() {
    if (!customElements.get('file-filter-controls-mobile')) {
      customElements.define('file-filter-controls-mobile', this as unknown as CustomElementConstructor)
    }
  }

  static get properties() {
    return {
      filters: {type: Object},
    }
  }

  declare filters: SearchFilters

  constructor() {
    super()
    this.filters = {
      query: '',
      sortBy: 'name',
      sortDirection: 'asc',
      viewMode: 'list',
      showHidden: false,
      fileTypes: [],
    }
  }

  static styles = css`
    :host {
      display: block;
    }

    /* ===== DRAG HANDLE ===== */
    .handle {
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background: color-mix(in oklch, var(--cv-color-text) 18%, transparent);
      margin: 0 auto 16px;
    }

    /* ===== SECTION ===== */
    .section {
      margin-bottom: 16px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      padding-left: 2px;
    }

    .section-icon {
      width: 14px;
      height: 14px;
      color: var(--cv-color-primary);
      opacity: 0.7;
    }

    .section-label {
      font-size: 11px;
      color: var(--cv-color-text-muted);
      font-weight: var(--cv-font-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    /* ===== CHIPS ===== */
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .chip {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 44px;
      padding: 8px 18px;
      border-radius: var(--cv-radius-2);
      border: 1.5px solid color-mix(in oklch, var(--cv-color-border) 70%, transparent);
      background: color-mix(in oklch, var(--cv-color-surface-2) 80%, transparent);
      color: var(--cv-color-text);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color var(--cv-duration-fast) var(--cv-easing-standard);
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      box-shadow: 0 1px 2px color-mix(in oklch, black 6%, transparent);

      cv-icon {
        width: 14px;
        height: 14px;
      }

      &:active {
        transform: scale(0.96);
        box-shadow: none;
      }

      &.active {
        border-color: var(--cv-color-primary);
        background: color-mix(in oklch, var(--cv-color-primary) 12%, transparent);
        color: var(--cv-color-primary);
        font-weight: 600;
        box-shadow:
          0 0 0 1px color-mix(in oklch, var(--cv-color-primary) 20%, transparent),
          0 1px 4px color-mix(in oklch, var(--cv-color-primary) 10%, transparent);
      }
    }

    /* ===== DIRECTION ROW ===== */
    .direction-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-bottom: 16px;
      margin-bottom: 16px;
      border-bottom: 1px solid color-mix(in oklch, var(--cv-color-border) 40%, transparent);
    }

    .direction-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 8px 22px;
      border-radius: var(--cv-radius-2);
      border: 1.5px solid color-mix(in oklch, var(--cv-color-border) 70%, transparent);
      background: color-mix(in oklch, var(--cv-color-surface-2) 80%, transparent);
      color: var(--cv-color-text);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color var(--cv-duration-fast) var(--cv-easing-standard);
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      gap: 8px;
      box-shadow: 0 1px 2px color-mix(in oklch, black 6%, transparent);

      &:active {
        transform: scale(0.96);
      }

      cv-icon {
        width: 14px;
        height: 14px;
        transition: transform var(--cv-duration-fast) var(--cv-easing-spring);
      }

      &.desc cv-icon {
        transform: rotate(180deg);
      }
    }

    .direction-label {
      font-size: 11px;
      color: var(--cv-color-text-muted);
      font-weight: var(--cv-font-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
  `

  private emit(next: SearchFilters) {
    this.dispatchEvent(new CustomEvent('filters-change', {detail: next, bubbles: true}))
  }

  private set<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) {
    this.emit({...this.filters, [key]: value})
  }

  private onSortBySelect = (value: SortOption) => {
    this.set('sortBy', value)
  }

  private onToggleDirection = () => {
    this.set('sortDirection', this.filters.sortDirection === 'asc' ? 'desc' : 'asc')
  }

  private onViewModeSelect = (value: ViewMode) => {
    this.set('viewMode', value)
  }

  private onToggleFileType = (type: string) => {
    const current = this.filters.fileTypes
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type]
    this.set('fileTypes', next)
  }

  private onToggleShowHidden = () => {
    this.set('showHidden', !this.filters.showHidden)
  }

  private getDirectionLabel(): string {
    return getSortDirectionLabel(this.filters.sortBy, this.filters.sortDirection)
  }

  render(): TemplateResult {
    const {filters} = this

    return html`
      <div class="handle"></div>

      <div class="section">
        <div class="section-header">
          <cv-icon name="arrow-up-down" class="section-icon"></cv-icon>
          <span class="section-label">${i18n('file-manager:sort-by' as any)}</span>
        </div>
        <div class="chips">
          ${SORT_OPTIONS.map(
            (value) => html`
              <button
                class="chip ${filters.sortBy === value ? 'active' : ''}"
                @click=${() => this.onSortBySelect(value)}
              >
                ${getSortLabel(value)}
              </button>
            `,
          )}
        </div>
      </div>

      <div class="direction-row">
        <span class="direction-label">${i18n('file-manager:direction' as any)}</span>
        <button
          class="direction-toggle ${filters.sortDirection === 'desc' ? 'desc' : ''}"
          @click=${this.onToggleDirection}
        >
          <cv-icon name="arrow-up"></cv-icon>
          ${this.getDirectionLabel()}
        </button>
      </div>

      <div class="section">
        <div class="section-header">
          <cv-icon name="layout-grid" class="section-icon"></cv-icon>
          <span class="section-label">${i18n('file-manager:view' as any)}</span>
        </div>
        <div class="chips">
          ${VIEW_OPTIONS.map(
            (opt) => html`
              <button
                class="chip ${filters.viewMode === opt.value ? 'active' : ''}"
                @click=${() => this.onViewModeSelect(opt.value)}
              >
                <cv-icon name=${opt.icon}></cv-icon>
                ${getViewLabel(opt.value)}
              </button>
            `,
          )}
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <cv-icon name="tag" class="section-icon"></cv-icon>
          <span class="section-label">${i18n('file-manager:file-type' as any)}</span>
        </div>
        <div class="chips">
          ${FILE_TYPE_OPTIONS.map(
            (value) => html`
              <button
                class="chip ${filters.fileTypes.includes(value) ? 'active' : ''}"
                @click=${() => this.onToggleFileType(value)}
              >
                ${getFileTypeLabel(value)}
              </button>
            `,
          )}
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <cv-icon name="eye" class="section-icon"></cv-icon>
          <span class="section-label">${i18n('file-manager:hidden-files' as any)}</span>
        </div>
        <div class="chips">
          <button class="chip ${filters.showHidden ? 'active' : ''}" @click=${this.onToggleShowHidden}>
            ${filters.showHidden ? i18n('file-manager:show' as any) : i18n('file-manager:hide' as any)}
          </button>
        </div>
      </div>
    `
  }
}
