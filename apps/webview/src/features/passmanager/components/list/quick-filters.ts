import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVCheckbox} from '@chromvoid/uikit/components/cv-checkbox'
import {CVCombobox} from '@chromvoid/uikit/components/cv-combobox'
import {CVComboboxOption} from '@chromvoid/uikit/components/cv-combobox-option'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVPopover} from '@chromvoid/uikit/components/cv-popover'
import {css, nothing, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {type PMToolbarQuickFilter, pmQuickFiltersModel} from './quick-filters.model'

type QuickFilterOption = {
  value: PMToolbarQuickFilter
  icon: string
  label: string
}

export class PMQuickFilters extends ReatomLitElement {
  static define() {
    CVButton.define()
    CVCheckbox.define()
    CVCombobox.define()
    CVComboboxOption.define()
    CVIcon.define()
    CVPopover.define()
    if (!customElements.get('pm-quick-filters')) {
      customElements.define('pm-quick-filters', this)
    }
  }

  static styles = css`
    :host {
      display: inline-block;
      min-inline-size: 0;
      contain: style;
    }

    .filters-popover {
      --cv-popover-min-inline-size: 296px;
      --cv-popover-max-inline-size: min(336px, calc(100vw - var(--cv-space-6)));
      --cv-popover-padding: 0;
      --cv-popover-gap: 0;
      --cv-popover-border-radius: var(--cv-radius-3);
      --cv-popover-z-index: var(--cv-z-overlay, 300);
    }

    .filters-popover::part(trigger) {
      min-block-size: var(--pm-toolbar-control-block-size);
      padding: 0 var(--pm-toolbar-control-padding-inline);
      gap: var(--pm-toolbar-control-gap);
      border-color: var(--cv-color-border);
      border-radius: var(--pm-toolbar-control-radius);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      font-size: var(--pm-toolbar-control-font-size);
      font-weight: var(--pm-toolbar-control-font-weight);
      line-height: 1;
      box-shadow:
        inset 0 1px 0 var(--cv-alpha-white-4),
        0 1px 2px var(--cv-alpha-black-10);
      transition:
        border-color var(--cv-duration-fast) var(--cv-easing-standard),
        background-color var(--cv-duration-fast) var(--cv-easing-standard),
        color var(--cv-duration-fast) var(--cv-easing-standard),
        box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .filters-popover::part(trigger):hover,
    .filters-popover[open]::part(trigger) {
      border-color: var(--cv-color-primary-border);
      background: var(--cv-color-primary-surface);
    }

    .filters-popover.active::part(trigger) {
      border-color: var(--cv-color-primary-border-strong);
      background: var(--cv-color-primary-surface-strong);
      color: var(--cv-color-primary);
    }

    .trigger-icon,
    .trigger-chevron {
      inline-size: 14px;
      block-size: 14px;
      color: var(--cv-color-text-muted);
    }

    .active .trigger-icon,
    .active .trigger-chevron {
      color: currentColor;
    }

    .trigger-count {
      display: inline-grid;
      place-items: center;
      min-inline-size: 18px;
      block-size: 18px;
      padding-inline: var(--cv-space-1);
      border-radius: var(--cv-radius-pill, 999px);
      background: var(--cv-color-primary);
      color: var(--cv-color-on-primary);
      font-size: 0.6875rem;
      line-height: 1;
    }

    .filter-panel {
      display: grid;
      min-inline-size: 0;
    }

    .panel-header,
    .panel-section {
      padding: var(--cv-space-3);
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--cv-space-3);
      padding-block-end: var(--cv-space-2);
    }

    .panel-title,
    .section-title {
      color: var(--cv-color-text);
      font-weight: var(--cv-font-weight-semibold);
    }

    .panel-title {
      font-size: var(--cv-font-size-sm);
    }

    .section-title {
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text-muted);
    }

    .clear-button {
      color: var(--cv-color-primary);
      font-size: var(--cv-font-size-xs);
    }

    .panel-divider {
      block-size: 1px;
      margin-inline: var(--cv-space-3);
      background: var(--cv-color-border);
    }

    .quick-filter-list {
      display: grid;
      gap: var(--cv-space-1);
      margin-block-start: var(--cv-space-2);
    }

    .quick-filter-checkbox {
      inline-size: 100%;
    }

    .quick-filter-checkbox::part(base) {
      inline-size: 100%;
      min-block-size: 34px;
      padding-inline: var(--cv-space-2);
      border-radius: var(--cv-radius-2);
    }

    .quick-filter-checkbox:hover::part(base) {
      background: var(--cv-color-surface-3);
    }

    .filter-label {
      display: inline-flex;
      align-items: center;
      gap: var(--cv-space-2);
      min-inline-size: 0;
      font-size: var(--cv-font-size-sm);
    }

    .filter-label cv-icon {
      inline-size: 15px;
      block-size: 15px;
      color: var(--cv-color-text-muted);
    }

    .tag-filter-controls {
      display: grid;
      grid-template-columns: minmax(0, 1fr) max-content;
      align-items: center;
      gap: var(--cv-space-2);
      margin-block-start: var(--cv-space-2);
    }

    .tag-filter-combobox {
      --cv-combobox-min-width: 0;
      --cv-combobox-border-radius: var(--cv-radius-2);
      --cv-combobox-background: var(--cv-color-surface-2);
      inline-size: 100%;
      min-inline-size: 0;
    }

    .tag-filter-combobox::part(input-wrapper) {
      min-block-size: 34px;
      padding-inline: var(--cv-space-2);
      border-color: var(--cv-color-border);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-2);
    }

    .tag-filter-combobox::part(input) {
      min-inline-size: 44px;
      min-block-size: 32px;
      font-size: var(--cv-font-size-xs);
    }

    .tag-filter-combobox::part(tag-label) {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tag-filter-combobox::part(listbox) {
      max-block-size: min(260px, 52vh);
    }

    .tag-manage-button {
      --cv-button-min-height: 34px;
      --cv-button-border-radius: var(--cv-radius-2);
      --cv-button-padding-inline: var(--cv-space-2);
    }

    .tag-manage-button cv-icon {
      inline-size: 15px;
      block-size: 15px;
    }

    .tag-filter-controls.no-options {
      grid-template-columns: minmax(0, 1fr);
    }

    .no-options .tag-manage-button {
      inline-size: 100%;
    }

    .no-options .tag-manage-button::part(base) {
      justify-content: flex-start;
    }

    .no-options .tag-manage-button::part(label) {
      text-align: start;
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

  private handleClearFilters(): void {
    pmQuickFiltersModel.clearFilters()
  }

  private handleTagFilterChange(event: Event): void {
    pmQuickFiltersModel.setSelectedTagsFromComboboxEvent(event)
  }

  private handleOpenTagManage(): void {
    pmQuickFiltersModel.openTagManage()
  }

  private handlePopoverToggle(event: CustomEvent<{open?: boolean}>): void {
    pmQuickFiltersModel.setPopoverOpen(event.detail.open === true)
  }

  private renderQuickFilter(
    option: QuickFilterOption,
    selected: boolean,
    onChange: () => void,
  ): TemplateResult {
    return html`
      <cv-checkbox
        class="quick-filter-checkbox"
        data-quick-filter=${option.value}
        value=${option.value}
        .checked=${selected}
        aria-label=${option.label}
        @cv-change=${onChange}
      >
        <span class="filter-label">
          <cv-icon name=${option.icon} aria-hidden="true"></cv-icon>
          <span>${option.label}</span>
        </span>
      </cv-checkbox>
    `
  }

  private renderTagFilterControl(): TemplateResult {
    const options = pmQuickFiltersModel.getAvailableTagOptions()

    return html`
      <section class="panel-section" aria-labelledby="pm-filter-tags-title">
        <span id="pm-filter-tags-title" class="section-title">${i18n('tags:title')}</span>
        <div class=${options.length > 0 ? 'tag-filter-controls' : 'tag-filter-controls no-options'}>
          ${options.length > 0
            ? html`
                <cv-combobox
                  class="tag-filter-combobox"
                  size="small"
                  multiple
                  clearable
                  max-tags-visible="1"
                  aria-label=${i18n('tags:title')}
                  placeholder=${i18n('tags:filter_placeholder')}
                  .value=${pmQuickFiltersModel.getSelectedTagComboboxValue()}
                  @cv-change=${this.handleTagFilterChange}
                >
                  ${options.map(
                    (option) => html`
                      <cv-combobox-option value=${option.key}>
                        ${option.label} (${option.count})
                      </cv-combobox-option>
                    `,
                  )}
                </cv-combobox>
              `
            : nothing}
          <cv-button
            class="tag-manage-button"
            type="button"
            size="small"
            variant="default"
            title=${i18n('tags:manage_open' as never)}
            aria-label=${i18n('tags:manage_open' as never)}
            ?disabled=${!pmQuickFiltersModel.canManageTags()}
            @click=${this.handleOpenTagManage}
          >
            <cv-icon slot="prefix" name="sliders" aria-hidden="true"></cv-icon>
            ${options.length === 0 ? html`<span>${i18n('tags:manage_open' as never)}</span>` : nothing}
          </cv-button>
        </div>
      </section>
    `
  }

  protected render() {
    const selectedFilters = pmQuickFiltersModel.selectedQuickFilters()
    const activeFilterCount = pmQuickFiltersModel.activeFilterCount()
    return html`
      <cv-popover
        class=${activeFilterCount > 0 ? 'filters-popover active' : 'filters-popover'}
        .open=${pmQuickFiltersModel.popoverOpen()}
        placement="bottom-start"
        aria-label=${i18n('filters:title' as never)}
        @toggle=${this.handlePopoverToggle}
      >
        <cv-icon class="trigger-icon" slot="trigger" name="sliders" aria-hidden="true"></cv-icon>
        <span slot="trigger">${i18n('filters:title' as never)}</span>
        ${activeFilterCount > 0
          ? html`<span class="trigger-count" slot="trigger">${activeFilterCount}</span>`
          : nothing}
        <cv-icon class="trigger-chevron" slot="trigger" name="chevron-down" aria-hidden="true"></cv-icon>

        <div class="filter-panel">
          <header class="panel-header">
            <span class="panel-title">${i18n('filters:title' as never)}</span>
            ${activeFilterCount > 0
              ? html`
                  <cv-button unstyled class="clear-button" type="button" @click=${this.handleClearFilters}>
                    ${i18n('credentials:clear_filters' as never)}
                  </cv-button>
                `
              : nothing}
          </header>
          <section class="panel-section" aria-label=${i18n('filters:title' as never)}>
            <div class="quick-filter-list">
              ${this.renderQuickFilter(
                {value: 'recent', icon: 'clock-history', label: i18n('quick:recent')},
                selectedFilters.includes('recent'),
                this.handleToggleRecent,
              )}
              ${this.renderQuickFilter(
                {value: 'otp', icon: 'shield-check', label: i18n('otp')},
                selectedFilters.includes('otp'),
                this.handleToggleOTP,
              )}
              ${this.renderQuickFilter(
                {value: 'ssh', icon: 'key', label: i18n('quick:ssh')},
                selectedFilters.includes('ssh'),
                this.handleToggleSsh,
              )}
              ${this.renderQuickFilter(
                {value: 'card', icon: 'credit-card', label: i18n('quick:card')},
                selectedFilters.includes('card'),
                this.handleToggleCard,
              )}
            </div>
          </section>
          <span class="panel-divider" aria-hidden="true"></span>
          ${this.renderTagFilterControl()}
        </div>
      </cv-popover>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-quick-filters': PMQuickFilters
  }
}
