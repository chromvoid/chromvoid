import {css} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'
import {functionalMotionStyles} from 'root/shared/ui/shared-styles'

import {i18n} from '@project/passmanager/i18n'
import type {CVIcon} from '@chromvoid/uikit/components/cv-icon'

import type {SortControls} from './sort-controls'
import {PMSearchBase, searchBaseStyles} from './search-base'

export class PMSearch extends PMSearchBase {
  static define() {
    if (!customElements.get('pm-search')) {
      customElements.define('pm-search', this)
    }
  }
  static styles = [
    searchBaseStyles,
    functionalMotionStyles,
    css`
      /* ===== TOGGLE BUTTON ===== */
      .toggle-filters {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: 1px solid transparent;
        background: transparent;
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
          color: var(--cv-color-primary);
          background: var(--cv-color-primary-subtle);
        }

        &.expanded cv-icon {
          transform: rotate(180deg);
        }

        &.expanded {
          color: var(--cv-color-primary);
          background: var(--cv-color-primary-subtle);
        }
      }

      /* ===== COLLAPSIBLE FILTERS ===== */
      .filters-panel {
        --motion-panel-reveal-distance: -6px;
      }

      .filters-panel .motion-panel-reveal__inner {
        display: grid;
        gap: var(--cv-space-2);
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

  private onToggleFiltersPanel() {
    this.searchModel.toggleFiltersPanel()
  }

  render() {
    const {className, isInvalid, isSearched} = this.getSearchState()
    const isExpanded = this.searchModel.isFiltersPanelExpanded()

    return html`
      <div class="search-header">
        ${this.renderSearchInput(className, isInvalid, isSearched)}
        <cv-button unstyled
          type="button"
          class="toggle-filters ${isExpanded ? 'expanded' : ''}"
          aria-expanded=${String(isExpanded)}
          @click=${this.onToggleFiltersPanel}
          title=${isExpanded ? i18n('button:hide_filters') : i18n('button:show_filters')}
        >
          <cv-icon name="sliders"></cv-icon>
        </cv-button>
      </div>

      ${this.renderQuickFilters()}

      <div
        class="filters-panel motion-panel-reveal"
        data-expanded=${String(isExpanded)}
        aria-hidden=${String(!isExpanded)}
        ?inert=${!isExpanded}
      >
        <div class="motion-panel-reveal__inner">${this.renderSortControls()}</div>
      </div>
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
