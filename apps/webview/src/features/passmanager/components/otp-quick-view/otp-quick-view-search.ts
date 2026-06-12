import {css, nothing, type PropertyValues} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVInput, type CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'

import {i18n} from '@project/passmanager/i18n'
import type {PasswordManagerLayoutModel} from '../password-manager-layout/password-manager-layout.model'
import {pmOtpQuickViewModel} from './otp-quick-view.model'

export class PMOtpQuickViewSearch extends ReatomLitElement {
  static elementName = 'pm-otp-quick-view-search'

  static properties = {
    preset: {type: String},
    desktopToolbarModel: {attribute: false},
  }

  static styles = [
    css`
      :host {
        display: block;
        inline-size: 100%;
        min-inline-size: 0;
        --pm-toolbar-control-height: var(--app-toolbar-control-height, 40px);
        --pm-toolbar-control-radius: var(--app-toolbar-control-radius, var(--cv-radius-2));
        --pm-toolbar-control-padding-inline: var(--app-toolbar-control-padding-inline, var(--cv-space-3));
        --pm-toolbar-control-font-size: var(--app-toolbar-control-font-size, var(--cv-font-size-sm));
        --pm-toolbar-control-gap: var(--app-toolbar-control-gap, var(--cv-space-2));
      }

      .controls {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: var(--pm-toolbar-control-gap);
        inline-size: 100%;
        min-inline-size: 0;
        box-sizing: border-box;
        padding-block: var(--pm-otp-search-padding-block, 0);
        padding-inline: var(--pm-otp-search-content-inset, 0px);
      }

      cv-input.search {
        flex: 1 1 auto;
        inline-size: 100%;
        max-inline-size: none;
        min-inline-size: 0;
        --cv-input-height: var(--pm-otp-search-height, var(--pm-toolbar-control-height));
        --cv-input-padding-inline: var(--pm-toolbar-control-padding-inline);
        --cv-input-border-radius: var(--pm-toolbar-control-radius);
        --cv-input-background: var(--cv-color-surface-2);
        --cv-input-border-color: var(--cv-color-border);
        --cv-input-color: var(--cv-color-text);
        --cv-input-font-size: var(--pm-toolbar-control-font-size);
        --cv-input-focus-ring: 0 0 0 2px var(--cv-color-accent-ring);
        --cv-input-search-mobile-shadow: var(
          --pm-otp-search-mobile-shadow,
          inset 0 1px 2px var(--cv-alpha-black-10),
          0 1px 0 var(--cv-alpha-white-4)
        );
      }

      cv-input.search[focused] {
        --cv-input-border-color: var(--cv-color-accent);
      }

      .search__prefix-icon {
        color: var(--cv-color-text-muted);
        transition:
          color var(--cv-duration-fast) var(--cv-easing-standard),
          transform var(--cv-duration-fast) var(--cv-easing-standard);
      }

      cv-input.search[focused] .search__prefix-icon {
        color: var(--cv-color-accent);
        transform: scale(1.08);
      }

      .clear-filters {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        gap: var(--cv-space-1);
        inline-size: var(--pm-toolbar-control-height);
        min-block-size: var(--pm-toolbar-control-height);
        padding: 0;
        border: 1px solid var(--cv-color-border);
        border-radius: var(--pm-toolbar-control-radius);
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text-muted);
        font: inherit;
        font-size: var(--cv-font-size-xs);
        cursor: pointer;
      }

      .clear-filters:focus-visible {
        outline: 2px solid var(--cv-color-accent);
        outline-offset: 2px;
      }

      @container (width < 720px) {
        .controls {
          justify-content: stretch;
        }
      }
    `,
  ]

  declare preset: string | undefined
  declare desktopToolbarModel: PasswordManagerLayoutModel | undefined

  private readonly model = pmOtpQuickViewModel
  private registeredDesktopToolbarModel: PasswordManagerLayoutModel | null = null
  private unregisterDesktopToolbarSearch?: () => void

  static define() {
    CVIcon.define()
    CVInput.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  focusInput() {
    const input = this.shadowRoot?.querySelector('cv-input') as unknown as {focus: () => void}
    input?.focus?.()
  }

  clear() {
    this.model.actions.clearFilters()
  }

  private handleQueryInput(event: CVInputInputEvent) {
    this.model.actions.setQuery(event.detail.value)
  }

  private handleClearFilters() {
    this.clear()
  }

  override updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties)
    this.syncDesktopToolbarRegistration()
  }

  override disconnectedCallback(): void {
    this.unregisterDesktopToolbarSearch?.()
    this.unregisterDesktopToolbarSearch = undefined
    this.registeredDesktopToolbarModel = null
    super.disconnectedCallback()
  }

  private syncDesktopToolbarRegistration(): void {
    const model = this.desktopToolbarModel ?? null
    if (this.registeredDesktopToolbarModel === model) {
      return
    }

    this.unregisterDesktopToolbarSearch?.()
    this.unregisterDesktopToolbarSearch = undefined
    this.registeredDesktopToolbarModel = model

    if (model) {
      this.unregisterDesktopToolbarSearch = model.registerDesktopToolbarSearchElement(this)
    }
  }

  protected render() {
    return html`
      <div class="controls">
        <cv-input
          class="search"
          type="search"
          size="small"
          preset=${this.preset ?? nothing}
          .value=${this.model.state.query()}
          placeholder=${i18n('otp:quick_view:search')}
          aria-label=${i18n('otp:quick_view:search')}
          @cv-input=${this.handleQueryInput}
        >
          <cv-icon class="search__prefix-icon" name="search" slot="prefix" aria-hidden="true"></cv-icon>
        </cv-input>
        ${this.model.state.hasActiveFilters()
          ? html`
              <button
                class="clear-filters"
                type="button"
                aria-label=${i18n('otp:quick_view:clear_filters')}
                title=${i18n('otp:quick_view:clear_filters')}
                @click=${this.handleClearFilters}
              >
                <cv-icon name="x" aria-hidden="true"></cv-icon>
              </button>
            `
          : nothing}
      </div>
    `
  }
}
