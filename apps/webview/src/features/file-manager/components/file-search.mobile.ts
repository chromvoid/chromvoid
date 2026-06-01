import {css, nothing} from 'lit'
import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {html} from '@chromvoid/uikit/reatom-lit'

import {i18n} from 'root/i18n'
import {FileFilterControlsMobile} from './file-filter-controls-mobile'
import {hasMobileFilterBadge} from '../models/file-search-filters.model'
import {FileSearchBase} from './file-search.base'
import {FileSearchMobileModel} from './file-search.mobile.model'

/**
 * Mobile wrapper for file manager filtering.
 * Shows a compact sort chip + toggle button that opens a bottom sheet
 * with full filter/sort controls.
 */
export class FileSearchMobile extends FileSearchBase {
  static define() {
    CVBottomSheet.define()
    FileFilterControlsMobile.define()

    if (!customElements.get('file-search-mobile')) {
      customElements.define('file-search-mobile', this as unknown as CustomElementConstructor)
    }
  }

  static get properties() {
    return {
      ...super.properties,
      variant: {type: String},
    }
  }

  declare variant: 'inline' | 'fab'
  private readonly mobileModel = new FileSearchMobileModel()

  constructor() {
    super()
    this.variant = 'inline'
  }

  static styles = css`
    :host {
      display: contents;
      --fab-size: 44px;
      --fab-icon-size: 20px;
    }

    .mobile-bar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
    }

    .mobile-bar--fab {
      justify-content: center;
    }

    /* ===== TOGGLE BUTTON ===== */
    .toggle-filters {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: 1px solid var(--cv-color-border-soft);
      background: var(--cv-color-surface-2);
      border-radius: var(--cv-radius-1);
      cursor: pointer;
      color: var(--cv-color-text-muted);
      flex-shrink: 0;
      position: relative;

      cv-icon {
        width: 14px;
        height: 14px;
      }

      &:hover {
        border-color: var(--cv-color-primary);
        color: var(--cv-color-primary);
        background: var(--cv-color-primary-subtle);
      }
    }

    .toggle-filters--fab {
      width: var(--fab-size, 44px);
      height: var(--fab-size, 44px);
      border-radius: 50%;
      border: 1px solid var(--cv-color-border-soft);
      background: var(--cv-color-surface-2);
      box-shadow: var(--cv-shadow-2);

      cv-icon {
        width: var(--fab-icon-size, 20px);
        height: var(--fab-icon-size, 20px);
      }

      &:hover {
        border-color: var(--cv-color-border-soft);
        color: var(--cv-color-primary, var(--cv-color-brand));
        background: var(--cv-color-primary-surface);
      }

      &:active {
        transform: scale(0.94);
        box-shadow: var(--cv-shadow-1, 0 1px 3px var(--cv-alpha-black-25));
      }
    }

    /* Active filter indicator dot */
    .filter-badge {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--cv-color-accent, #ff7a00);
      border: 1.5px solid var(--cv-color-surface-2);
    }

    .toggle-filters--fab .filter-badge {
      top: 10px;
      right: 10px;
    }

    /* ===== SHEET ===== */
    cv-bottom-sheet {
      position: fixed;
      --cv-bottom-sheet-max-height: min(82dvh, calc(100dvh - 24px));
      --cv-bottom-sheet-border-radius: 16px 16px 0 0;
    }

    cv-bottom-sheet::part(trigger) {
      display: none;
    }

    cv-bottom-sheet::part(body) {
      padding: 16px 20px;
      padding-bottom: max(16px, env(safe-area-inset-bottom, 16px));
    }

    cv-bottom-sheet::part(content) {
      border-radius: 16px 16px 0 0;
    }
  `

  private onOpenSheet() {
    this.mobileModel.openSheet()
  }

  private onSheetChange(e: CustomEvent<{open?: boolean}>) {
    this.mobileModel.syncSheetOpen(e.detail.open)
  }

  private onFiltersChange(e: CustomEvent) {
    e.stopPropagation()
    this.dispatchEvent(new CustomEvent('filters-change', {detail: e.detail, bubbles: true}))
  }

  private get hasActiveFilters(): boolean {
    return hasMobileFilterBadge(this.filters)
  }

  private isFabVariant(): boolean {
    return this.variant === 'fab'
  }

  render() {
    const fab = this.isFabVariant()
    return html`
      <div class="mobile-bar ${fab ? 'mobile-bar--fab' : ''}">
        <cv-button unstyled
          class="toggle-filters ${fab ? 'toggle-filters--fab' : ''}"
          data-action="filters"
          @click=${this.onOpenSheet}
          aria-label=${i18n('file-manager:filters-and-sorting' as any)}
          title=${i18n('file-manager:filters-and-sorting' as any)}
        >
          <cv-icon name="sliders"></cv-icon>
          ${this.hasActiveFilters ? html`<span class="filter-badge"></span>` : nothing}
        </cv-button>
      </div>

      <cv-bottom-sheet .open=${this.mobileModel.sheetOpen()} no-header show-handle drag-to-close @cv-change=${this.onSheetChange}>
        <file-filter-controls-mobile
          .filters=${this.filters}
          .filterActions=${this.filterActions}
          @filters-change=${this.onFiltersChange}
        ></file-filter-controls-mobile>
      </cv-bottom-sheet>
    `
  }
}
