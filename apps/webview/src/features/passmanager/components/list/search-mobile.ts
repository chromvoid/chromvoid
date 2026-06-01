import {css, nothing, type TemplateResult} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import type {CredentialTagOption} from '@project/passmanager/tags'
import {pmCredentialTagsModel} from '../../models/pm-credential-tags.model'
import {pmMobileChromeModel} from '../../models/pm-mobile-chrome.model'
import {PMMobileTagFilterSheet} from './mobile-tag-filter-sheet'
import {PMSearchBase, searchBaseStyles} from './search-base'

export class PMSearchMobile extends PMSearchBase {
  static define() {
    if (!customElements.get('pm-search-mobile')) {
      customElements.define('pm-search-mobile', this)
    }
    PMMobileTagFilterSheet.define()
  }

  static styles = [
    searchBaseStyles,
    css`
      :host {
        display: block;
        inline-size: 100%;
        contain: layout style;
      }

      .search-header {
        display: flex;
        align-items: center;
        gap: var(--cv-space-2);
        min-inline-size: 0;
      }

      .search-form {
        flex: 1 1 auto;
        min-inline-size: 0;
        inline-size: 100%;
      }

      .sort-group-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 42px;
        inline-size: 42px;
        block-size: 42px;
        border: 1px solid var(--cv-color-border-glass);
        border-radius: 14px;
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text-muted);
        box-shadow:
          inset 0 1px 2px var(--cv-alpha-black-10),
          0 1px 0 var(--cv-alpha-white-4);
        cursor: pointer;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      .sort-group-trigger:hover {
        border-color: var(--cv-color-primary-border);
        color: var(--cv-color-primary);
        background: var(--cv-color-primary-surface);
      }

      .sort-group-trigger:focus-visible {
        outline: 2px solid var(--cv-color-primary);
        outline-offset: 2px;
      }

      .sort-group-trigger:active {
        transform: scale(0.97);
      }

      .sort-group-trigger.active {
        border-color: var(--cv-color-primary-border-strong);
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-primary);
        box-shadow:
          inset 0 0 0 1px var(--cv-color-primary-ring),
          0 1px 8px var(--cv-color-primary-subtle);
      }

      .sort-group-trigger cv-icon {
        inline-size: 20px;
        block-size: 20px;
      }

      cv-input {
        --cv-input-height: 42px;
        --cv-input-padding-inline: 14px;
        --cv-input-font-size: 16px;
        --cv-input-border-radius: 14px;
        --cv-input-background: var(--cv-color-surface-2);
        --cv-input-border-color: var(--cv-color-border-glass);
        --cv-input-placeholder-color: var(--cv-color-text-muted);
        --cv-input-icon-size: 20px;
        box-shadow:
          inset 0 1px 2px var(--cv-alpha-black-10),
          0 1px 0 var(--cv-alpha-white-4);
      }

      cv-input:hover {
        --cv-input-border-color: var(--cv-color-primary-border);
      }

      .kbd-slash {
        display: none;
      }

      .tag-filter-row {
        display: flex;
        align-items: center;
        gap: 6px;
        min-inline-size: 0;
        max-inline-size: 100%;
        padding-block-start: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }

      .tag-filter-row::-webkit-scrollbar {
        display: none;
      }

      .tag-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        flex: 0 0 auto;
        min-block-size: 34px;
        max-inline-size: min(180px, 58vw);
        padding: 0 11px;
        border: 1px solid var(--cv-color-border-soft);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-surface-secondary-glass);
        color: var(--cv-color-text);
        font: inherit;
        font-size: 14px;
        font-weight: var(--cv-font-weight-medium);
        line-height: 1;
        white-space: nowrap;
        box-shadow:
          inset 0 1px 0 var(--cv-alpha-white-4),
          0 1px 2px var(--cv-alpha-black-10);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .tag-chip:focus-visible {
        outline: 2px solid var(--cv-color-primary);
        outline-offset: 2px;
      }

      .tag-chip:active {
        transform: scale(0.97);
      }

      .tag-chip.active {
        border-color: var(--cv-color-primary-border-strong);
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-primary);
        box-shadow:
          inset 0 0 0 1px var(--cv-color-primary-ring),
          0 1px 8px var(--cv-color-primary-subtle);
      }

      .tag-chip.add {
        border-color: var(--cv-color-primary-border);
        color: var(--cv-color-primary);
      }

      .tag-chip.add cv-icon,
      .tag-chip__remove {
        inline-size: 14px;
        block-size: 14px;
      }

      .tag-chip__label,
      .tag-chip__meta {
        min-inline-size: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .tag-chip__meta,
      .tag-chip__remove {
        color: var(--cv-color-text-muted);
      }

      .tag-chip.active .tag-chip__meta,
      .tag-chip.active .tag-chip__remove {
        color: currentColor;
        opacity: 0.86;
      }

      @container (width < 360px) {
        cv-input {
          --cv-input-height: 40px;
          --cv-input-font-size: 15px;
          --cv-input-padding-inline: 12px;
        }

        .sort-group-trigger {
          flex-basis: 40px;
          inline-size: 40px;
          block-size: 40px;
        }

        .tag-filter-row {
          gap: 6px;
          padding-block-start: 5px;
        }

        .tag-chip {
          min-block-size: 32px;
          padding-inline: 10px;
          font-size: 13px;
        }
      }
    `,
  ]

  protected override getSearchPlaceholder() {
    return i18n('entry:mobile_search' as any)
  }

  protected override shouldRenderShortcutHint(): boolean {
    return false
  }

  private handleClearTagFilters(): void {
    pmCredentialTagsModel.clearSelectedTags()
  }

  private handleOpenTagFilters(): void {
    pmCredentialTagsModel.openFilterSheet()
  }

  private handleOpenSortGroup(): void {
    pmMobileChromeModel.openSortGroupSheet()
  }

  private handleTagFilterClick(event: Event): void {
    const key = (event.currentTarget as HTMLElement | null)?.dataset['tagKey']
    if (key) {
      pmCredentialTagsModel.toggleTagKey(key)
    }
  }

  private renderTagFilterChip(option: CredentialTagOption, selected: boolean): TemplateResult {
    const ariaLabel = selected
      ? i18n('tags:remove_filter' as never, {tag: option.label})
      : i18n('tags:add_filter' as never, {tag: option.label})

    return html`
      <button
        class="tag-chip ${selected ? 'active' : ''}"
        type="button"
        data-tag-key=${option.key}
        aria-pressed=${String(selected)}
        aria-label=${ariaLabel}
        @click=${this.handleTagFilterClick}
      >
        <span class="tag-chip__label">${option.label}</span>
        <span class="tag-chip__meta">· ${option.count}</span>
        ${selected
          ? html`<cv-icon class="tag-chip__remove" name="x-lg" aria-hidden="true"></cv-icon>`
          : nothing}
      </button>
    `
  }

  private renderSortGroupButton(): TemplateResult {
    const active = pmMobileChromeModel.hasActiveSortGrouping()
    const label = i18n('sort-group:title' as never)

    return html`
      <button
        class="sort-group-trigger ${active ? 'active' : ''}"
        type="button"
        aria-label=${label}
        title=${label}
        aria-pressed=${String(active)}
        @click=${this.handleOpenSortGroup}
      >
        <cv-icon name="sliders" aria-hidden="true"></cv-icon>
      </button>
    `
  }

  private renderMobileTagFilters(): TemplateResult {
    const options = pmCredentialTagsModel.availableTags()
    const selectedKeys = new Set(pmCredentialTagsModel.effectiveSelectedTagKeys())
    const hasSelectedTags = selectedKeys.size > 0

    return html`
      <div class="tag-filter-row" aria-label=${i18n('tags:title')}>
        <button
          class="tag-chip ${hasSelectedTags ? '' : 'active'}"
          type="button"
          aria-pressed=${String(!hasSelectedTags)}
          @click=${this.handleClearTagFilters}
        >
          ${i18n('tags:all' as never)}
        </button>
        ${options.map((option) => this.renderTagFilterChip(option, selectedKeys.has(option.key)))}
        <button
          class="tag-chip add"
          type="button"
          aria-label=${i18n('tags:filter_open' as never)}
          @click=${this.handleOpenTagFilters}
        >
          <cv-icon name="plus-lg" aria-hidden="true"></cv-icon>
          <span>${i18n('tags:filter_add_chip' as never)}</span>
        </button>
      </div>
    `
  }

  override render() {
    const {className, isInvalid, isSearched} = this.getSearchState()

    return html`
      <div class="search-header">
        ${this.renderSortGroupButton()}
        ${this.renderSearchInput(className, isInvalid, isSearched)}
      </div>
      ${this.renderMobileTagFilters()}
      <pm-mobile-tag-filter-sheet></pm-mobile-tag-filter-sheet>
    `
  }
}
