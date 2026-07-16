import {css, type TemplateResult} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import {pmMobileChromeModel} from '../../models/pm-mobile-chrome.model'
import {PMSearchBase, searchBaseStyles} from './search-base'

export class PMSearchMobile extends PMSearchBase {
  static define() {
    if (!customElements.get('pm-search-mobile')) {
      customElements.define('pm-search-mobile', this)
    }
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
        block-size: 40px;
      }

      .search-form {
        flex: 1 1 auto;
        min-inline-size: 0;
        inline-size: 100%;
      }

      .search-form form {
        display: grid;
        align-items: center;
      }

      .sort-group-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 40px;
        inline-size: 40px;
        block-size: 40px;
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
        display: block;
        --cv-input-search-mobile-height: 40px;
        --cv-input-search-mobile-shadow:
          inset 0 1px 2px var(--cv-alpha-black-10),
          0 1px 0 var(--cv-alpha-white-4);
      }

      cv-input::part(form-control-label),
      cv-input::part(form-control-help-text) {
        display: none;
        margin: 0;
      }

      .kbd-slash {
        display: none;
      }

      @container (width < 360px) {
        cv-input {
          --cv-input-search-mobile-height: 40px;
          --cv-input-search-mobile-font-size: 15px;
          --cv-input-search-mobile-padding-inline: 12px;
        }

        .sort-group-trigger {
          flex-basis: 40px;
          inline-size: 40px;
          block-size: 40px;
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

  protected override getSearchInputPreset(): string {
    return 'search-mobile'
  }

  private handleOpenSortGroup(): void {
    pmMobileChromeModel.openSortGroupSheet()
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

  override render() {
    const {className, isInvalid, isSearched} = this.getSearchState()

    return html`
      <div class="search-header">
        ${this.renderSortGroupButton()}
        ${this.renderSearchInput(className, isInvalid, isSearched)}
      </div>
    `
  }
}
