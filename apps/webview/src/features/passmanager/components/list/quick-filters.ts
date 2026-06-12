import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVCombobox} from '@chromvoid/uikit/components/cv-combobox'
import {CVComboboxOption} from '@chromvoid/uikit/components/cv-combobox-option'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {css, nothing, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {type PMToolbarQuickFilter, pmQuickFiltersModel} from './quick-filters.model'

export class PMQuickFilters extends ReatomLitElement {
  static define() {
    CVButton.define()
    CVCombobox.define()
    CVComboboxOption.define()
    CVIcon.define()
    if (!customElements.get('pm-quick-filters')) {
      customElements.define('pm-quick-filters', this)
    }
  }

  static styles = css`
    :host {
      display: block;
      min-inline-size: 0;
      contain: layout style;
      container-type: inline-size;
      --pm-toolbar-control-height: var(--app-toolbar-control-height, 40px);
      --pm-toolbar-control-radius: var(--app-toolbar-control-radius, var(--cv-radius-2));
      --pm-toolbar-control-padding-inline: var(--app-toolbar-control-padding-inline, var(--cv-space-3));
      --pm-toolbar-control-font-size: var(--app-toolbar-control-font-size, var(--cv-font-size-sm));
      --pm-toolbar-control-font-weight: var(--app-toolbar-control-font-weight, var(--cv-font-weight-medium));
      --pm-toolbar-control-gap: var(--app-toolbar-control-gap, var(--cv-space-2));
      --pm-quick-filter-height: 30px;
      --pm-quick-filter-padding-inline: var(--cv-space-2);
      --pm-quick-filter-font-size: 0.8125rem;
      --pm-quick-filter-gap: 6px;
      --pm-quick-filter-icon-size: 13px;
    }

    .quick-filters {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: var(--pm-toolbar-control-gap);
      inline-size: 100%;
      min-inline-size: 0;
      max-inline-size: 100%;
      padding: 0;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }

    .quick-filters::-webkit-scrollbar {
      display: none;
    }

    .quick-filters cv-button {
      --cv-button-min-height: var(--pm-toolbar-control-height);
      --cv-button-border-radius: var(--pm-toolbar-control-radius);
      --cv-button-padding-block: 0;
      --cv-button-padding-inline: var(--pm-toolbar-control-padding-inline);
      --cv-button-font-size: var(--pm-toolbar-control-font-size);
      --cv-button-font-weight: var(--pm-toolbar-control-font-weight);
      --cv-button-gap: var(--pm-toolbar-control-gap);
      flex: 0 0 auto;
      white-space: nowrap;
    }

    .quick-filters cv-button.quick-filter-button {
      --cv-button-min-height: var(--pm-quick-filter-height);
      --cv-button-border-radius: var(--cv-radius-pill, 999px);
      --cv-button-padding-inline: var(--pm-quick-filter-padding-inline);
      --cv-button-font-size: var(--pm-quick-filter-font-size);
      --cv-button-gap: var(--pm-quick-filter-gap);
    }

    .quick-filters cv-button::part(base) {
      min-block-size: var(--pm-toolbar-control-height);
    }

    .quick-filters cv-button.quick-filter-button::part(base) {
      min-block-size: var(--pm-quick-filter-height);
    }

    .quick-filters cv-button.quick-filter-button::part(label) {
      line-height: 1;
    }

    .quick-filters cv-button cv-icon {
      inline-size: 14px;
      block-size: 14px;
    }

    .quick-filters cv-button.quick-filter-button cv-icon {
      inline-size: var(--pm-quick-filter-icon-size);
      block-size: var(--pm-quick-filter-icon-size);
    }

    .quick-filters .quick-filter-button.active cv-icon {
      color: var(--cv-color-primary);
    }

    .quick-filters cv-button:active {
      transform: translateY(0) scale(0.98);
    }

    .quick-filters .quick-filter-button.active::part(base) {
      background: var(--cv-color-primary-surface-strong);
      border-color: var(--cv-color-primary-border-strong);
      box-shadow: 0 0 0 1px var(--cv-color-primary-ring);
    }

    .quick-filters .quick-filter-button.active::part(label) {
      color: var(--cv-color-primary);
      font-weight: 600;
    }

    .quick-filters .quick-filter-button.active:hover::part(base) {
      background: var(--cv-color-primary-surface);
    }

    .tag-filter-row {
      display: flex;
      align-items: center;
      gap: var(--cv-space-1);
      min-inline-size: 0;
      max-inline-size: 100%;
    }

    .tag-filter-combobox {
      --cv-combobox-min-width: 170px;
      --cv-combobox-border-radius: var(--pm-toolbar-control-radius);
      --cv-combobox-background: var(--cv-color-surface-2);
      flex: 1 1 170px;
      inline-size: min(100%, 240px);
      min-inline-size: 160px;
      max-inline-size: 260px;
    }

    .tag-filter-combobox::part(input-wrapper) {
      min-block-size: var(--pm-toolbar-control-height);
      padding-inline: var(--pm-toolbar-control-padding-inline);
      border-color: var(--cv-color-border);
      border-radius: var(--pm-toolbar-control-radius);
      background: var(--cv-color-surface-2);
    }

    .tag-filter-combobox:focus-within::part(input-wrapper),
    .tag-filter-combobox[open]::part(input-wrapper) {
      border-color: var(--cv-color-primary-border-strong);
      box-shadow: 0 0 0 1px var(--cv-color-primary-ring);
    }

    .tag-filter-combobox::part(input) {
      min-inline-size: 52px;
      min-block-size: calc(var(--pm-toolbar-control-height) - 2px);
      font-size: var(--pm-toolbar-control-font-size);
    }

    .tag-filter-combobox::part(tag) {
      border: 1px solid var(--cv-color-primary-border);
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-primary);
      font-size: 0.7rem;
    }

    .tag-filter-combobox::part(tag-label) {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tag-filter-combobox::part(tag-overflow) {
      color: var(--cv-color-text-muted);
      font-size: 0.7rem;
    }

    .tag-filter-combobox::part(listbox) {
      max-block-size: min(260px, 52vh);
    }

    .tag-manage-button {
      flex: 0 0 auto;
      color: var(--cv-color-text-muted);
    }

    .tag-manage-button::part(base) {
      min-block-size: var(--pm-toolbar-control-height);
      padding: 0 var(--pm-toolbar-control-padding-inline);
      border-radius: var(--pm-toolbar-control-radius);
    }

    .tag-manage-button:hover {
      color: var(--cv-color-primary);
    }

    @media (hover: none) and (pointer: coarse) {
      .quick-filters cv-button.quick-filter-button {
        --cv-button-min-height: var(--pm-toolbar-control-height);
        --cv-button-padding-inline: var(--pm-toolbar-control-padding-inline);
        --cv-button-font-size: var(--pm-toolbar-control-font-size);
        --cv-button-gap: var(--pm-toolbar-control-gap);
      }

      .quick-filters cv-button::part(base) {
        min-block-size: var(--pm-toolbar-control-height);
      }

      .quick-filters cv-button.quick-filter-button cv-icon {
        inline-size: 14px;
        block-size: 14px;
      }
    }

    @container (width < 480px) {
      .quick-filters {
        justify-content: flex-start;
        gap: 3px;
        flex-wrap: nowrap;
      }

      .quick-filters:has(.tag-filter-combobox) {
        overflow-x: visible;
        flex-wrap: wrap;
      }

      .tag-filter-combobox {
        flex: 0 0 190px;
        min-inline-size: 190px;
      }

      .quick-filters:has(.tag-filter-combobox) .tag-filter-row,
      .quick-filters:has(.tag-filter-combobox) .tag-filter-combobox {
        flex: 1 1 100%;
        inline-size: 100%;
        min-inline-size: 0;
        max-inline-size: 100%;
      }
    }

    @container (width < 320px) {
      .quick-filter-button span {
        display: none;
      }
    }
  `

  private handleToggleRecent(): void {
    pmQuickFiltersModel.toggleQuickFilter('recent')
  }

  private handleToggleOTP(): void {
    pmQuickFiltersModel.toggleQuickFilter('otp')
  }

  private handleToggleSsh(): void {
    pmQuickFiltersModel.toggleQuickFilter('ssh')
  }

  private handleToggleCard(): void {
    pmQuickFiltersModel.toggleQuickFilter('card')
  }

  private handleTagFilterChange(event: Event): void {
    pmQuickFiltersModel.setSelectedTagsFromComboboxEvent(event)
  }

  private handleOpenTagManage(): void {
    pmQuickFiltersModel.openTagManage()
  }

  private renderQuickFilterButton(
    filter: PMToolbarQuickFilter,
    icon: string,
    label: string,
    selected: boolean,
    onClick: () => void,
  ): TemplateResult {
    return html`
      <cv-button
        class=${selected ? 'quick-filter-button active' : 'quick-filter-button'}
        data-quick-filter=${filter}
        size="small"
        pill
        variant=${selected ? 'brand' : 'neutral'}
        appearance=${selected ? 'filled' : 'outlined'}
        aria-pressed=${String(selected)}
        @click=${onClick}
      >
        <cv-icon name=${icon} slot="prefix"></cv-icon>
        <span>${label}</span>
      </cv-button>
    `
  }

  private renderTagFilterControl(): TemplateResult {
    const options = pmQuickFiltersModel.getAvailableTagOptions()

    return html`
      <span class="tag-filter-row">
        ${options.length > 0
          ? html`
              <cv-combobox
                class="tag-filter-combobox"
                size="small"
                multiple
                clearable
                max-tags-visible="2"
                aria-label=${i18n('tags:title')}
                placeholder=${i18n('tags:filter_placeholder')}
                .value=${pmQuickFiltersModel.getSelectedTagComboboxValue()}
                @cv-change=${this.handleTagFilterChange}
              >
                ${options.map(
                  (option) => html`
                    <cv-combobox-option value=${option.key}
                      >${option.label} (${option.count})</cv-combobox-option
                    >
                  `,
                )}
              </cv-combobox>
            `
          : nothing}
        <cv-button
          unstyled
          class="tag-manage-button"
          type="button"
          title=${i18n('tags:manage_open' as never)}
          aria-label=${i18n('tags:manage_open' as never)}
          @click=${this.handleOpenTagManage}
        >
          <cv-icon name="sliders" aria-hidden="true"></cv-icon>
        </cv-button>
      </span>
    `
  }

  protected render() {
    const filters = pmQuickFiltersModel.selectedQuickFilters()

    return html`
      <div class="quick-filters">
        ${this.renderTagFilterControl()}
        ${this.renderQuickFilterButton(
          'recent',
          'clock-history',
          i18n('quick:recent'),
          filters.includes('recent'),
          this.handleToggleRecent,
        )}
        ${this.renderQuickFilterButton(
          'otp',
          'shield-check',
          i18n('otp'),
          filters.includes('otp'),
          this.handleToggleOTP,
        )}
        ${this.renderQuickFilterButton(
          'ssh',
          'key',
          i18n('quick:ssh'),
          filters.includes('ssh'),
          this.handleToggleSsh,
        )}
        ${this.renderQuickFilterButton(
          'card',
          'credit-card',
          i18n('quick:card'),
          filters.includes('card'),
          this.handleToggleCard,
        )}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-quick-filters': PMQuickFilters
  }
}
