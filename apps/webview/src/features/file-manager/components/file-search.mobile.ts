import {css, html, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {FileFilterControlsMobile} from './file-filter-controls-mobile'
import {FileSearchBase, DEFAULT_FILTERS} from './file-search.base'

/**
 * Mobile wrapper for file manager filtering.
 * Shows a compact sort chip + toggle button that opens a bottom sheet
 * with full filter/sort controls.
 */
export class FileSearchMobile extends FileSearchBase {
  static define() {
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

  constructor() {
    super()
    this.variant = 'inline'
  }

  static styles = css`
    :host {
      display: contents;
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
      border: 1px solid color-mix(in oklch, var(--cv-color-border) 60%, transparent);
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
        background: color-mix(in oklch, var(--cv-color-primary) 10%, transparent);
      }
    }

    .toggle-filters--fab {
      width: var(--fab-size, 44px);
      height: var(--fab-size, 44px);
      border-radius: 50%;
      border: 1px solid
        color-mix(in oklch, var(--cv-color-border-strong, var(--cv-color-border)) 70%, transparent);
      background: var(--cv-color-surface-2);
      box-shadow: var(--cv-shadow-2);

      cv-icon {
        width: var(--fab-icon-size, 20px);
        height: var(--fab-icon-size, 20px);
      }

      &:hover {
        border-color: color-mix(
          in oklch,
          var(--cv-color-border-strong, var(--cv-color-border)) 70%,
          transparent
        );
        color: var(--cv-color-primary, var(--cv-color-brand));
        background: color-mix(in oklch, var(--cv-color-surface-2) 78%, var(--cv-color-primary));
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

    /* ===== DRAWER ===== */
    cv-drawer {
      --cv-drawer-size: auto;
      position: fixed;
    }

    cv-drawer::part(trigger) {
      display: none;
    }

    cv-drawer::part(body) {
      padding: 16px 20px;
      padding-bottom: max(16px, env(safe-area-inset-bottom, 16px));
    }

    cv-drawer::part(panel) {
      border-radius: 16px 16px 0 0;
    }

    cv-drawer::part(footer) {
      display: none;
    }
  `

  private drawerOpen = false

  private onOpenDrawer = () => {
    this.drawerOpen = true
    this.requestUpdate()
  }

  private onDrawerClose = () => {
    this.drawerOpen = false
    this.requestUpdate()
  }

  private onFiltersChange = (e: CustomEvent) => {
    this.dispatchEvent(new CustomEvent('filters-change', {detail: e.detail, bubbles: true}))
  }

  private get hasActiveFilters(): boolean {
    return (
      this.filters.sortBy !== DEFAULT_FILTERS.sortBy ||
      this.filters.sortDirection !== DEFAULT_FILTERS.sortDirection ||
      this.filters.viewMode !== DEFAULT_FILTERS.viewMode ||
      this.filters.showHidden ||
      this.filters.fileTypes.length > 0
    )
  }

  private isFabVariant(): boolean {
    return this.variant === 'fab'
  }

  render() {
    const fab = this.isFabVariant()
    return html`
      <div class="mobile-bar ${fab ? 'mobile-bar--fab' : ''}">
        <button
          class="toggle-filters ${fab ? 'toggle-filters--fab' : ''}"
          data-action="filters"
          @click=${this.onOpenDrawer}
          aria-label=${i18n('file-manager:filters-and-sorting' as any)}
          title=${i18n('file-manager:filters-and-sorting' as any)}
        >
          <cv-icon name="sliders"></cv-icon>
          ${this.hasActiveFilters ? html`<span class="filter-badge"></span>` : nothing}
        </button>
      </div>

      <cv-drawer placement="bottom" ?open=${this.drawerOpen} @cv-after-hide=${this.onDrawerClose} no-header>
        <file-filter-controls-mobile
          .filters=${this.filters}
          @filters-change=${this.onFiltersChange}
        ></file-filter-controls-mobile>
      </cv-drawer>
    `
  }
}
