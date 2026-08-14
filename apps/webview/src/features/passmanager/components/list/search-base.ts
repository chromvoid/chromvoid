import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css, nothing, type PropertyValues} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {runtimeCapabilitiesAtom} from 'root/core/runtime/runtime-capabilities'
import {dashboardToolbarSearchStyles} from 'root/shared/ui/dashboard-toolbar-search.styles'
import type {PasswordManagerLayoutModel} from '../password-manager-layout/password-manager-layout.model'
import {PMSearchInputModel} from './search.model'

/** Shared CSS for search host, input field, and kbd hint */
export const searchBaseStyles = css`
  ${dashboardToolbarSearchStyles}

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
    @media (max-width: 768px) {
      cv-input::part(input) {
        font-size: 16px;
      }
    }
  }

  /*Styling the input field*/
  cv-input {
    min-inline-size: 0;
    inline-size: 100%;
    max-inline-size: 100%;
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

  /* ===== RESPONSIVE ===== */
  @container (width < 480px) {
    :host {
      gap: 4px;
    }

    .search-header {
      gap: 6px;
    }
  }
`

export abstract class PMSearchBase extends ReatomLitElement {
  static properties = {
    desktopToolbarModel: {attribute: false},
  }

  protected readonly searchModel = new PMSearchInputModel()
  declare desktopToolbarModel: PasswordManagerLayoutModel | undefined

  private registeredDesktopToolbarModel: PasswordManagerLayoutModel | null = null
  private unregisterDesktopToolbarSearch?: () => void

  override connectedCallback() {
    super.connectedCallback()
    this.searchModel.connect()
  }

  override disconnectedCallback() {
    this.unregisterDesktopToolbarSearch?.()
    this.unregisterDesktopToolbarSearch = undefined
    this.registeredDesktopToolbarModel = null
    this.searchModel.dispose()
    super.disconnectedCallback()
  }

  override updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties)
    this.syncDesktopToolbarRegistration()
  }

  private syncDesktopToolbarRegistration(): void {
    const model = this.desktopToolbarModel ?? null
    if (this.registeredDesktopToolbarModel === model) {
      return
    }

    this.unregisterDesktopToolbarSearch?.()
    this.unregisterDesktopToolbarSearch = undefined
    this.registeredDesktopToolbarModel = model

    if (model && typeof model.registerDesktopToolbarSearchElement === 'function') {
      this.unregisterDesktopToolbarSearch = model.registerDesktopToolbarSearchElement(this)
    }
  }

  focusInput() {
    const input = this.shadowRoot?.querySelector('cv-input') as unknown as {focus: () => void}
    input?.focus?.()
  }

  clear() {
    this.searchModel.clear()
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
    const capabilities = runtimeCapabilitiesAtom()
    if (capabilities.mobile || capabilities.platform === 'android' || capabilities.platform === 'ios') {
      return false
    }

    return !isFocused && !isSearched
  }

  protected getSearchInputPreset(): string | undefined {
    return undefined
  }

  protected renderSearchInput(className: string, isInvalid: boolean, isSearched: number | boolean) {
    const isFocused = this.searchModel.isFocused()
    const value = this.searchModel.getInputValue()
    const preset = this.getSearchInputPreset()
    return html`
      <div class="search-form">
        <form @submit=${this.submit} class=${className}>
          <cv-input
            class="dashboard-toolbar-search"
            type="text"
            size="small"
            preset=${preset ?? nothing}
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
}
