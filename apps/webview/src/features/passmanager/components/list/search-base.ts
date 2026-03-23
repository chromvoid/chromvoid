import {XLitElement} from '@statx/lit'

import {css, html, nothing} from 'lit'

import {i18n} from '@project/passmanager'
import {Group} from '@project/passmanager'
import {type QuickFilter, filterValue, quickFilters} from '@project/passmanager'

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
    gap: calc(var(--cv-space-2) * 0.75);
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

  /* Стилизация поля ввода */
  cv-input {
    --cv-input-background: color-mix(in oklch, var(--cv-color-surface-2) 80%, var(--cv-color-primary) 2%);
    --cv-input-border-color: color-mix(in oklch, var(--cv-color-border) 80%, transparent);
    border-radius: var(--cv-radius-2);
    min-inline-size: 0;
    inline-size: 100%;
    max-inline-size: 100%;
    box-shadow:
      inset 0 1px 3px color-mix(in oklch, black 6%, transparent),
      0 1px 0 color-mix(in oklch, white 4%, transparent);
  }

  cv-input:hover {
    --cv-input-border-color: color-mix(in oklch, var(--cv-color-border) 100%, var(--cv-color-primary) 30%);
  }

  cv-input:focus-within {
    --cv-input-border-color: var(--cv-color-primary);
    box-shadow:
      0 0 0 3px color-mix(in oklch, var(--cv-color-primary) 12%, transparent),
      inset 0 1px 3px color-mix(in oklch, var(--cv-color-primary) 8%, transparent);
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
    background: color-mix(in oklch, var(--cv-color-border) 40%, transparent);
    border: 1px solid var(--cv-color-border);
    color: var(--cv-color-text-muted);
    line-height: 1.4;
  }

  /* ===== QUICK FILTERS ===== */
  .quick-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    min-inline-size: 0;
    max-inline-size: 100%;
    padding: calc(var(--cv-space-2) * 0.75);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
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

  .quick-filters cv-button:hover {
    transform: translateY(-1px);
  }

  .quick-filters cv-button:active {
    transform: translateY(0) scale(0.98);
  }

  /* Активные фильтры - светлый фон с оранжевым акцентом */
  .quick-filters cv-button[variant='primary']::part(base) {
    background-color: var(--cv-color-accent-contrast, #2a2235);
    border-color: var(--cv-color-accent, #ff7a00);
    border-width: 1.5px;
  }

  .quick-filters cv-button[variant='primary']::part(label) {
    color: var(--cv-color-accent-light, #ff9a3e);
    font-weight: 500;
  }

  .quick-filters cv-button[variant='primary']:hover {
    transform: translateY(-2px);
  }

  .quick-filters cv-button[variant='primary']:hover::part(base) {
    background-color: color-mix(
      in oklch,
      var(--cv-color-accent-contrast, #2a2235) 85%,
      var(--cv-color-accent, #ff7a00)
    );
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
      padding: 4px;
      gap: 3px;
      overflow-x: auto;
      flex-wrap: nowrap;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;

      &::-webkit-scrollbar {
        display: none;
      }
    }

    .quick-filters cv-button {
      flex-shrink: 0;
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

export abstract class PMSearchBase extends XLitElement {
  protected debounceTimer: number | undefined
  protected readonly DEBOUNCE_MS = 180

  focusInput() {
    const input = this.shadowRoot?.querySelector('cv-input') as unknown as {focus: () => void}
    input?.focus?.()
  }

  clear() {
    const input = this.shadowRoot?.querySelector('cv-input') as unknown as {value: string}
    if (input) {
      input.value = ''
    }
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer)
      this.debounceTimer = undefined
    }
    filterValue.set('')
  }

  protected onToggleRecent = () => this.toggleQuick('recent')
  protected onToggleOTP = () => this.toggleQuick('otp')
  protected onToggleFiles = () => this.toggleQuick('files')
  protected onToggleNoPass = () => this.toggleQuick('nopass')
  protected onToggleFavorites = () => this.toggleQuick('favorites')

  protected toggleQuick(filter: QuickFilter) {
    const current = quickFilters()
    if (current.includes(filter)) {
      quickFilters.set(current.filter((f) => f !== filter))
    } else {
      quickFilters.set([...current, filter])
    }
  }

  protected submitSearch(e: Event) {
    e.preventDefault()
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer)
      this.debounceTimer = undefined
    }
    const input = this.shadowRoot?.querySelector('cv-input') as unknown as {value?: string} | undefined
    const value = input?.value ?? ''
    filterValue.set(value)
  }

  submit(e: Event) {
    e.preventDefault()
    this.submitSearch(e)
  }

  protected onInput = (e: Event) => {
    e.preventDefault()
    const target = e as unknown as {detail?: {value?: string}}
    const value = target?.detail?.value ?? ''
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = window.setTimeout(() => {
      filterValue.set(String(value))
      this.debounceTimer = undefined
    }, this.DEBOUNCE_MS)
  }

  protected getSearchState() {
    let group = window.passmanager?.showElement()
    //@ts-ignore
    const isRoot = group.isRoot
    let successFindLen = 0
    const isSearched = filterValue().length
    if (group instanceof Group || isRoot) {
      successFindLen = (group as Group).searched().length
    }
    const className = isSearched ? (successFindLen > 0 ? 'success' : 'fail') : ''
    const isInvalid = Boolean(isSearched && successFindLen === 0)
    return {className, isInvalid, isSearched}
  }

  protected renderSearchInput(className: string, isInvalid: boolean, isSearched: number | boolean) {
    const isFocused = this.shadowRoot?.querySelector('cv-input')?.matches(':focus-within')
    return html`
      <div class="search-form">
        <form @submit=${this.submit} class=${className}>
          <cv-input
            type="text"
            size="small"
            placeholder=${i18n('entry:search')}
            @cv-input=${this.onInput}
            @focus=${() => this.requestUpdate()}
            @blur=${() => this.requestUpdate()}
            ?invalid=${isInvalid}
          >
            <cv-icon name="search" slot="prefix"></cv-icon>
            ${!isFocused && !isSearched ? html`<kbd class="kbd-slash" slot="suffix">/</kbd>` : nothing}
          </cv-input>
        </form>
      </div>
    `
  }

  protected renderQuickFilters() {
    const filters = quickFilters()
    return html`
      <div class="quick-filters">
        <cv-button
          size="small"
          pill
          variant=${filters.includes('recent') ? 'brand' : 'neutral'}
          appearance=${filters.includes('recent') ? 'filled' : 'outlined'}
          @click=${this.onToggleRecent}
        >
          <cv-icon name="clock" slot="prefix"></cv-icon>
          ${i18n('quick:recent')}
        </cv-button>

        <cv-button
          size="small"
          pill
          variant=${filters.includes('otp') ? 'brand' : 'neutral'}
          appearance=${filters.includes('otp') ? 'filled' : 'outlined'}
          @click=${this.onToggleOTP}
        >
          <cv-icon name="shield-check" slot="prefix"></cv-icon>
          ${i18n('otp')}
        </cv-button>

        <cv-button
          size="small"
          pill
          variant=${filters.includes('files') ? 'brand' : 'neutral'}
          appearance=${filters.includes('files') ? 'filled' : 'outlined'}
          @click=${this.onToggleFiles}
        >
          <cv-icon name="paperclip" slot="prefix"></cv-icon>
          ${i18n('quick:files')}
        </cv-button>

        <cv-button
          size="small"
          pill
          variant=${filters.includes('nopass') ? 'brand' : 'neutral'}
          appearance=${filters.includes('nopass') ? 'filled' : 'outlined'}
          @click=${this.onToggleNoPass}
        >
          <cv-icon name="exclamation-triangle" slot="prefix"></cv-icon>
          ${i18n('quick:nopass')}
        </cv-button>

        <cv-button
          size="small"
          pill
          variant=${filters.includes('favorites') ? 'brand' : 'neutral'}
          appearance=${filters.includes('favorites') ? 'filled' : 'outlined'}
          @click=${this.onToggleFavorites}
        >
          <cv-icon name="star" slot="prefix"></cv-icon>
          <span>★</span>
        </cv-button>
      </div>
    `
  }
}
