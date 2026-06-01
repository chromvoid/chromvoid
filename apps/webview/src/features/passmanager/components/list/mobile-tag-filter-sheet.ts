import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import type {CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import {css, nothing, type TemplateResult} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import type {CredentialTagOption} from '@project/passmanager/tags'
import {pmCredentialTagsModel} from '../../models/pm-credential-tags.model'

type BottomSheetChangeEvent = CustomEvent<{open: boolean}>

export class PMMobileTagFilterSheet extends ReatomLitElement {
  static elementName = 'pm-mobile-tag-filter-sheet'

  static define(): void {
    CVBottomSheet.define()
    CVIcon.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = css`
    :host {
      display: contents;
    }

    cv-bottom-sheet {
      --cv-bottom-sheet-z-index: calc(var(--cv-z-overlay, 300) + 34);
      --cv-bottom-sheet-overlay-color: var(--cv-alpha-black-50);
      --cv-bottom-sheet-max-height: min(78dvh, calc(100dvh - 20px));
      --cv-bottom-sheet-border-radius: 18px 18px 0 0;
      --cv-bottom-sheet-grabber-color: var(--cv-color-primary-border-strong);
    }

    cv-bottom-sheet::part(content) {
      border-color: var(--cv-color-border-strong);
      background: var(--cv-color-surface-elevated);
      box-shadow: var(--cv-shadow-4);
    }

    cv-bottom-sheet::part(header) {
      padding: 0 var(--cv-space-4) var(--cv-space-1);
      border-block-end: 1px solid var(--cv-color-border-glass);
    }

    cv-bottom-sheet::part(title) {
      font-size: var(--cv-font-size-lg);
      font-weight: var(--cv-font-weight-semibold);
      color: var(--cv-color-text);
    }

    cv-bottom-sheet::part(body) {
      padding: 0;
    }

    cv-bottom-sheet::part(footer) {
      display: flex;
      gap: var(--cv-space-2);
      padding: var(--cv-space-3) var(--cv-space-4) max(var(--cv-space-3), env(safe-area-inset-bottom, 0px));
      border-block-start: 1px solid var(--cv-color-border-glass);
      background: var(--cv-color-surface-elevated);
    }

    .sheet-body {
      display: grid;
      gap: var(--cv-space-4);
      padding: var(--cv-space-3) var(--cv-space-4);
    }

    .tag-search {
      --cv-input-height: 42px;
      --cv-input-padding-inline: 14px;
      --cv-input-font-size: 16px;
      --cv-input-border-radius: 14px;
      --cv-input-background: var(--cv-color-surface-2);
      --cv-input-border-color: var(--cv-color-border-glass);
      --cv-input-placeholder-color: var(--cv-color-text-muted);
      --cv-input-icon-size: 20px;
      inline-size: 100%;
      box-shadow:
        inset 0 1px 2px var(--cv-alpha-black-10),
        0 1px 0 var(--cv-alpha-white-4);
    }

    .tag-search cv-icon {
      color: var(--cv-color-text-muted);
    }

    .tag-search:focus-within cv-icon {
      color: var(--cv-color-primary);
    }

    .section {
      display: grid;
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    .section-label {
      min-inline-size: 0;
      font-family: var(--cv-font-family-code);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
      color: var(--cv-color-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    .tag-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-block-size: 40px;
      max-inline-size: 100%;
      padding: 0 14px;
      border: 1px solid var(--cv-color-border-soft);
      border-radius: var(--cv-radius-2);
      background: var(--cv-color-surface-secondary-glass);
      color: var(--cv-color-text);
      font: inherit;
      font-size: var(--cv-font-size-sm);
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

    .tag-chip__remove {
      inline-size: 14px;
      block-size: 14px;
    }

    .empty-state {
      min-block-size: 40px;
      display: flex;
      align-items: center;
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-sm);
    }

    .footer-action {
      flex: 1 1 0;
      min-block-size: 44px;
    }

    .footer-action::part(base) {
      min-block-size: inherit;
    }

    @media (max-width: 360px) {
      .sheet-body {
        padding-inline: var(--cv-space-3);
      }

      cv-bottom-sheet::part(header),
      cv-bottom-sheet::part(footer) {
        padding-inline: var(--cv-space-3);
      }

      .tag-chip {
        min-block-size: 38px;
        padding-inline: 12px;
        font-size: var(--cv-font-size-xs);
      }
    }
  `

  private handleSheetChange(event: BottomSheetChangeEvent): void {
    if (!event.detail.open) {
      pmCredentialTagsModel.closeFilterSheet()
    }
  }

  private handleSearchInput(event: CVInputInputEvent): void {
    pmCredentialTagsModel.setFilterSheetQuery(event.detail.value)
  }

  private handleTagClick(event: Event): void {
    const key = (event.currentTarget as HTMLElement | null)?.dataset['tagKey']
    if (key) {
      pmCredentialTagsModel.toggleTagKey(key)
    }
  }

  private handleClear(): void {
    pmCredentialTagsModel.clearSelectedTags()
  }

  private handleDone(): void {
    pmCredentialTagsModel.closeFilterSheet()
  }

  private renderTagChip(option: CredentialTagOption, selected: boolean): TemplateResult {
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
        @click=${this.handleTagClick}
      >
        <span class="tag-chip__label">${option.label}</span>
        <span class="tag-chip__meta">· ${option.count}</span>
        ${selected
          ? html`<cv-icon class="tag-chip__remove" name="x-lg" aria-hidden="true"></cv-icon>`
          : nothing}
      </button>
    `
  }

  private renderSelectedTags(selectedOptions: readonly CredentialTagOption[]): TemplateResult | typeof nothing {
    if (selectedOptions.length === 0) return nothing

    return html`
      <section class="section" aria-label=${i18n('details:selected' as never)}>
        <div class="section-label">${i18n('details:selected' as never)}</div>
        <div class="chips">
          ${selectedOptions.map((option) => this.renderTagChip(option, true))}
        </div>
      </section>
    `
  }

  private renderAvailableTags(
    options: readonly CredentialTagOption[],
    selectedKeys: ReadonlySet<string>,
  ): TemplateResult {
    return html`
      <section class="section" aria-label=${i18n('tags:all_tags' as never)}>
        <div class="section-label">${i18n('tags:all_tags' as never)}</div>
        ${options.length > 0
          ? html`
              <div class="chips">
                ${options.map((option) => this.renderTagChip(option, selectedKeys.has(option.key)))}
              </div>
            `
          : html`<div class="empty-state" role="status">${i18n('tags:empty_filter' as never)}</div>`}
      </section>
    `
  }

  protected render(): TemplateResult {
    const open = pmCredentialTagsModel.filterSheetOpen()
    const query = pmCredentialTagsModel.filterSheetQuery()
    const selectedOptions = pmCredentialTagsModel.selectedTagOptions()
    const selectedKeys = new Set(pmCredentialTagsModel.effectiveSelectedTagKeys())
    const options = pmCredentialTagsModel.filteredAvailableTags()
    const hasSelectedTags = selectedKeys.size > 0

    return html`
      <cv-bottom-sheet
        .open=${open}
        show-handle
        drag-to-close
        initial-focus-id="pm-tag-filter-query"
        @cv-change=${this.handleSheetChange}
      >
        <span slot="title">${i18n('tags:filter_sheet_title' as never)}</span>
        <div class="sheet-body">
          <cv-input
            id="pm-tag-filter-query"
            class="tag-search"
            type="search"
            size="large"
            clearable
            placeholder=${i18n('tags:filter_placeholder')}
            .value=${query}
            @cv-input=${this.handleSearchInput}
          >
            <cv-icon name="search" slot="prefix"></cv-icon>
          </cv-input>
          ${this.renderSelectedTags(selectedOptions)}
          ${this.renderAvailableTags(options, selectedKeys)}
        </div>

        <cv-button
          slot="footer"
          type="button"
          class="footer-action"
          variant="ghost"
          ?disabled=${!hasSelectedTags}
          @click=${this.handleClear}
        >
          ${i18n('button:reset')}
        </cv-button>
        <cv-button
          slot="footer"
          type="button"
          class="footer-action"
          variant="primary"
          @click=${this.handleDone}
        >
          ${i18n('button:done')}
        </cv-button>
      </cv-bottom-sheet>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-mobile-tag-filter-sheet': PMMobileTagFilterSheet
  }
}
