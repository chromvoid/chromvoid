import {stateLocalStorage} from '@statx/persist'

import {css, html} from 'lit'

import {i18n} from '@project/passmanager'
import type {CVIcon} from '@chromvoid/uikit'

import type {SortControls} from './sort-controls'
import {PMSearchBase, searchBaseStyles} from './search-base'

// Состояние сворачивания фильтров (сохраняется в localStorage)
const filtersExpanded = stateLocalStorage<boolean>(false, {name: 'pm_filters_expanded'})

export class PMSearch extends PMSearchBase {
  static define() {
    customElements.define('pm-search', this)
  }
  static styles = [
    searchBaseStyles,
    css`
      /* ===== TOGGLE BUTTON ===== */
      .toggle-filters {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: 1px solid color-mix(in oklch, var(--cv-color-border) 60%, transparent);
        background: var(--cv-color-surface-2);
        border-radius: var(--cv-radius-1);
        cursor: pointer;
        color: var(--cv-color-text-muted);
        flex-shrink: 0;

        cv-icon {
          width: 14px;
          height: 14px;
          transition: transform var(--cv-duration-fast) var(--cv-easing-standard);
        }

        &:hover {
          border-color: var(--cv-color-primary);
          color: var(--cv-color-primary);
          background: color-mix(in oklch, var(--cv-color-primary) 10%, transparent);
        }

        &.expanded cv-icon {
          transform: rotate(180deg);
        }
      }

      /* ===== COLLAPSIBLE FILTERS ===== */
      .filters-panel {
        display: grid;
        gap: calc(var(--cv-space-2) * 0.75);
        overflow: hidden;
      }

      .filters-panel.collapsed {
        display: none;
      }

      @media (hover: none) and (pointer: coarse) {
        .toggle-filters {
          width: 36px;
          height: 36px;
        }

        .quick-filters cv-button::part(base) {
          min-height: 32px;
          padding: 4px 10px;
        }
      }
    `,
  ]

  private onToggleFiltersPanel = () => {
    filtersExpanded.set(!filtersExpanded())
  }

  render() {
    const {className, isInvalid, isSearched} = this.getSearchState()
    const isExpanded = filtersExpanded()

    return html`
      <div class="search-header">
        ${this.renderSearchInput(className, isInvalid, isSearched)}
        <button
          class="toggle-filters ${isExpanded ? 'expanded' : ''}"
          @click=${this.onToggleFiltersPanel}
          title=${isExpanded ? i18n('button:hide_filters') : i18n('button:show_filters')}
        >
          <cv-icon name="sliders"></cv-icon>
        </button>
      </div>

      ${this.renderQuickFilters()}

      <div class="filters-panel ${isExpanded ? '' : 'collapsed'}">${this.renderSortControls()}</div>
    `
  }

  protected renderSortControls() {
    return html`<pm-sort-controls></pm-sort-controls>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-sort-controls': SortControls
    'cv-icon': CVIcon
  }
}
