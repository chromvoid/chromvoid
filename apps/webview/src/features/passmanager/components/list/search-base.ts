import {ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css, nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import {type QuickFilter, quickFilters} from '@project/passmanager/select'
import {pmCredentialTagsModel} from '../../models/pm-credential-tags.model'
import {PMSearchInputModel} from './search.model'

/** Shared CSS for search host, input field, kbd hint, quick filter buttons */
export const searchBaseStyles = css`
  :host {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-inline-size: 0;
    gap: calc(var(--cv-space-2) * 0.75);
    contain: layout style;
    container-type: inline-size;
  }

  /* ===== SEARCH HEADER ===== */
  .search-header {
    display: flex;
    align-items: center;
    gap: var(--cv-space-2);
    justify-content: space-between;
    min-inline-size: 0;
  }

  .search-form {
    flex: 1;
    min-width: 0;
    min-inline-size: 0;
    display: grid;
    align-items: center;
  }

  form {
    padding: 0;
    margin: 0;
    position: relative;
    min-inline-size: 0;
    inline-size: 100%;
  }

  @supports (-webkit-touch-callout: none) {
    @media (hover: none) and (pointer: coarse) {
      cv-input::part(input) {
        font-size: 16px;
      }
    }
  }

  /*Styling the input field*/
  cv-input {
    border-radius: var(--cv-radius-2);
    min-inline-size: 0;
    inline-size: 100%;
    max-inline-size: 100%;
    box-shadow:
      inset 0 1px 3px var(--cv-alpha-black-5),
      0 1px 0 var(--cv-alpha-white-4);
  }

  cv-input:hover {
    --cv-input-border-color: var(--cv-color-primary-border);
  }

  cv-input:focus-within {
    --cv-input-border-color: var(
      --pm-focus-border-color,
      var(--pm-focus-border-color, var(--cv-color-primary-border-strong))
    );
  }

  cv-input cv-icon {
    color: var(--cv-color-text-muted);
    transition:
      color var(--cv-duration-fast) var(--cv-easing-standard),
      transform var(--cv-duration-fast) var(--cv-easing-standard);
  }

  cv-input:focus-within cv-icon {
    color: var(--cv-color-primary);
    transform: scale(1.1);
  }

  /* ===== KBD HINT ===== */
  .kbd-slash {
    font-family: var(--cv-font-family-code, monospace);
    font-size: 0.65rem;
    font-weight: var(--cv-font-weight-semibold, 600);
    padding: 1px 6px;
    border-radius: var(--cv-radius-1);
    background: var(--cv-color-border-muted);
    border: 1px solid var(--cv-color-border);
    color: var(--cv-color-text-muted);
    line-height: 1.4;
  }

  /* ===== QUICK FILTERS ===== */
  .quick-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    min-inline-size: 0;
    max-inline-size: 100%;
    padding: 0;
  }

  .quick-filters cv-button {
    font-size: 0.65rem;
    white-space: nowrap;
    flex-shrink: 0;

    &::part(base) {
      padding: 2px 6px;
      min-height: 22px;
    }

    cv-icon {
      width: 12px;
      height: 12px;
    }
  }

  .quick-filters .quick-filter-button.active cv-icon {
    color: var(--cv-color-primary);
  }

  .quick-filters cv-button:active {
    transform: translateY(0) scale(0.98);
  }

  .tag-filter-combobox {
    --cv-combobox-min-width: 170px;
    --cv-combobox-min-height: 24px;
    --cv-combobox-padding-inline: 8px;
    --cv-combobox-font-size: 0.75rem;
    flex: 0 1 220px;
    inline-size: min(100%, 240px);
    min-inline-size: 160px;
    max-inline-size: 260px;
  }

  .tag-filter-combobox::part(input-wrapper) {
    min-block-size: 26px;
    padding-inline: 8px;
    border-color: var(--cv-color-border);
    border-radius: var(--cv-radius-1);
    background: var(--cv-color-surface-2);
  }

  .tag-filter-combobox:focus-within::part(input-wrapper),
  .tag-filter-combobox[open]::part(input-wrapper) {
    border-color: var(--cv-color-primary-border-strong);
    box-shadow: 0 0 0 1px var(--cv-color-primary-ring);
  }

  .tag-filter-combobox::part(input) {
    min-inline-size: 52px;
    min-block-size: 24px;
    font-size: 0.75rem;
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

  .tag-filter-row {
    display: flex;
    min-inline-size: 0;
    max-inline-size: 100%;
  }

  /*Active filters keep an explicit DOM-selected state for styling and accessibility*/
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

  /* ===== RESPONSIVE ===== */
  @container (width < 480px) {
    :host {
      gap: 4px;
    }

    .search-header {
      gap: 6px;
    }

    .quick-filters {
      justify-content: flex-start;
      gap: 3px;
      overflow-x: auto;
      flex-wrap: nowrap;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;

      &::-webkit-scrollbar {
        display: none;
      }
    }

    .quick-filters:has(.tag-filter-combobox) {
      overflow-x: visible;
      flex-wrap: wrap;
    }

    .quick-filters cv-button {
      flex-shrink: 0;
    }

    .tag-filter-combobox {
      flex: 0 0 190px;
      min-inline-size: 190px;
    }

    .quick-filters:has(.tag-filter-combobox) .tag-filter-combobox {
      flex: 1 1 100%;
      inline-size: 100%;
      min-inline-size: 0;
      max-inline-size: 100%;
    }
  }

  @container (width < 320px) {
    .quick-filters cv-button {
      padding-inline: 4px;

      span {
        display: none;
      }
    }
  }
`

export abstract class PMSearchBase extends ReatomLitElement {
  protected readonly searchModel = new PMSearchInputModel()

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.searchModel.dispose()
  }

  focusInput() {
    const input = this.shadowRoot?.querySelector('cv-input') as unknown as {focus: () => void}
    input?.focus?.()
  }

  clear() {
    this.searchModel.clear()
  }

  protected handleToggleRecent() {
    this.toggleQuick('recent')
  }

  protected handleToggleOTP() {
    this.toggleQuick('otp')
  }

  protected handleToggleSsh() {
    this.toggleQuick('ssh')
  }

  protected handleToggleCard() {
    this.toggleQuick('card')
  }

  protected handleTagFilterChange(e: Event) {
    this.searchModel.setSelectedTagsFromComboboxEvent(e)
  }

  protected toggleQuick(filter: QuickFilter) {
    this.searchModel.toggleQuick(filter)
  }

  protected submitSearch(e: Event) {
    e.preventDefault()
    this.searchModel.submitCurrent()
  }

  submit(e: Event) {
    e.preventDefault()
    this.submitSearch(e)
  }

  protected onInput(e: Event) {
    e.preventDefault()
    const target = e as unknown as {detail?: {value?: string}}
    const value = String(target?.detail?.value ?? '')
    this.searchModel.input(value)
  }

  protected getSearchState() {
    return this.searchModel.getSearchState()
  }

  protected getSearchPlaceholder() {
    return i18n('entry:search')
  }

  protected shouldRenderShortcutHint(isFocused: boolean, isSearched: number | boolean) {
    return !isFocused && !isSearched
  }

  protected renderSearchInput(className: string, isInvalid: boolean, isSearched: number | boolean) {
    const isFocused = this.searchModel.isFocused()
    const value = this.searchModel.getInputValue()
    return html`
      <div class="search-form">
        <form @submit=${this.submit} class=${className}>
          <cv-input
            type="text"
            size="small"
            placeholder=${this.getSearchPlaceholder()}
            .value=${value}
            @cv-input=${this.onInput}
            @focus=${this.handleFocus}
            @blur=${this.handleBlur}
            ?invalid=${isInvalid}
          >
            <cv-icon name="search" slot="prefix"></cv-icon>
            ${this.shouldRenderShortcutHint(isFocused, isSearched)
              ? html`<kbd class="kbd-slash" slot="suffix">/</kbd>`
              : nothing}
          </cv-input>
        </form>
      </div>
    `
  }

  protected handleFocus() {
    this.searchModel.focus()
  }

  protected handleBlur() {
    this.searchModel.blur()
  }

  protected renderQuickFilters() {
    const filters = quickFilters()
    const recentSelected = filters.includes('recent')
    const otpSelected = filters.includes('otp')
    const sshSelected = filters.includes('ssh')
    const cardSelected = filters.includes('card')
    return html`
      <div class="quick-filters">
        <cv-button
          class=${recentSelected ? 'quick-filter-button active' : 'quick-filter-button'}
          data-quick-filter="recent"
          size="small"
          pill
          variant=${recentSelected ? 'brand' : 'neutral'}
          appearance=${recentSelected ? 'filled' : 'outlined'}
          aria-pressed=${String(recentSelected)}
          @click=${this.handleToggleRecent}
        >
          <cv-icon name="clock-history" slot="prefix"></cv-icon>
          ${i18n('quick:recent')}
        </cv-button>

        <cv-button
          class=${otpSelected ? 'quick-filter-button active' : 'quick-filter-button'}
          data-quick-filter="otp"
          size="small"
          pill
          variant=${otpSelected ? 'brand' : 'neutral'}
          appearance=${otpSelected ? 'filled' : 'outlined'}
          aria-pressed=${String(otpSelected)}
          @click=${this.handleToggleOTP}
        >
          <cv-icon name="shield-check" slot="prefix"></cv-icon>
          ${i18n('otp')}
        </cv-button>

        <cv-button
          class=${sshSelected ? 'quick-filter-button active' : 'quick-filter-button'}
          data-quick-filter="ssh"
          size="small"
          pill
          variant=${sshSelected ? 'brand' : 'neutral'}
          appearance=${sshSelected ? 'filled' : 'outlined'}
          aria-pressed=${String(sshSelected)}
          @click=${this.handleToggleSsh}
        >
          <cv-icon name="key" slot="prefix"></cv-icon>
          ${i18n('quick:ssh')}
        </cv-button>

        <cv-button
          class=${cardSelected ? 'quick-filter-button active' : 'quick-filter-button'}
          data-quick-filter="card"
          size="small"
          pill
          variant=${cardSelected ? 'brand' : 'neutral'}
          appearance=${cardSelected ? 'filled' : 'outlined'}
          aria-pressed=${String(cardSelected)}
          @click=${this.handleToggleCard}
        >
          <cv-icon name="credit-card" slot="prefix"></cv-icon>
          ${i18n('quick:card')}
        </cv-button>

        ${this.renderTagFilterControl()}
      </div>
    `
  }

  protected renderTagFilterControl() {
    const options = pmCredentialTagsModel.availableTags()
    if (options.length === 0) return nothing

    return html`
      <cv-combobox
        class="tag-filter-combobox"
        size="small"
        multiple
        clearable
        max-tags-visible="2"
        aria-label=${i18n('tags:title')}
        placeholder=${i18n('tags:filter_placeholder')}
        .value=${pmCredentialTagsModel.selectedComboboxValue()}
        @cv-change=${this.handleTagFilterChange}
      >
        ${options.map(
          (option) => html`
            <cv-combobox-option value=${option.key}>${option.label} (${option.count})</cv-combobox-option>
          `,
        )}
      </cv-combobox>
    `
  }
}
