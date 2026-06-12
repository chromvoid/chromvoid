import {css, nothing, type TemplateResult} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'
import {CVInput, type CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'

import {i18n} from 'root/i18n'
import {keyboardShortcutsModel} from 'root/shared/keyboard'
import {openCommandPalette} from 'root/shared/services/command-palette'
import {sharedStyles} from 'root/shared/ui/shared-styles'

import {hasContentFiltering} from '../models/file-search-filters.model'
import {getFileTypeLabel} from './file-manager-labels'
import {FileSearchBase} from './file-search.base'

export class FileSearch extends FileSearchBase {
  static define() {
    CVInput.define()
    if (!customElements.get('file-search')) {
      customElements.define('file-search', this as unknown as CustomElementConstructor)
    }
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        inline-size: 100%;
        min-inline-size: 0;
      }

      .bar {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        flex-wrap: nowrap;
        inline-size: 100%;
        min-inline-size: 0;
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }

      .search-input {
        flex: 1 1 min(320px, 45vw);
        inline-size: 100%;
        min-inline-size: min(180px, 100%);
        --cv-input-height: var(--file-search-control-height, 32px);
        --cv-input-padding-inline: var(--cv-space-3);
        --cv-input-border-radius: var(--file-search-control-radius, var(--cv-radius-2));
        --cv-input-background: var(--cv-color-surface-2);
        --cv-input-border-color: var(--cv-color-border-muted);
        --cv-input-color: var(--cv-color-text);
        --cv-input-placeholder-color: var(--cv-color-text-muted);
        --cv-input-font-size: var(--file-search-control-font-size, var(--cv-font-size-sm));
      }

      .search-input::part(form-control-label) {
        display: none;
        margin: 0;
      }

      .bar::-webkit-scrollbar {
        display: none;
      }


      /* ===== BASE CHIP ===== */
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-block-size: var(--file-search-control-height, 32px);
        padding: 0 12px;
        border-radius: var(--file-search-control-radius, var(--cv-radius-2, 8px));
        border: 1px solid var(--cv-color-border-muted);
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text);
        font-size: var(--file-search-control-font-size, var(--cv-font-size-sm));
        font-weight: var(--file-search-control-font-weight, var(--cv-font-weight-medium));
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          background var(--cv-duration-fast) var(--cv-easing-standard),
          border-color var(--cv-duration-fast) var(--cv-easing-standard),
          box-shadow var(--cv-duration-fast) var(--cv-easing-standard),
          transform var(--cv-duration-fast) var(--cv-easing-standard);
        box-shadow: 0 1px 2px var(--cv-alpha-black-5);

        cv-icon {
          width: 14px;
          height: 14px;
          color: var(--cv-color-text-muted);
          flex-shrink: 0;
          transition: color var(--cv-duration-fast) var(--cv-easing-standard);
        }

        &:hover {
          background: var(--cv-color-hover);
          border-color: var(--cv-color-primary-border-strong);
          box-shadow:
            0 2px 6px var(--cv-alpha-black-8),
            0 0 0 1px var(--cv-color-primary-subtle);

          cv-icon {
            color: var(--cv-color-primary);
          }
        }

        &:active {
          transform: scale(0.97);
          box-shadow: 0 1px 2px var(--cv-alpha-black-5);
        }
      }

      /* ===== CHIP GROUP (compound chips with close button) ===== */
      .chipgroup {
        display: inline-flex;
        align-items: center;
        gap: 0;
        min-block-size: var(--file-search-control-height, 32px);
        border-radius: var(--file-search-control-radius, var(--cv-radius-2, 8px));
        border: 1px solid var(--cv-color-border-muted);
        background: var(--cv-color-surface-2);
        overflow: hidden;
        box-shadow: 0 1px 2px var(--cv-alpha-black-5);
      }

      .chipgroup--danger {
        border-color: var(--cv-color-danger-border-strong);
      }

      .chipgroup__main {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-block-size: calc(var(--file-search-control-height, 32px) - 2px);
        padding: 0 10px;
        border: none;
        background: transparent;
        color: var(--cv-color-text);
        font-size: var(--file-search-control-font-size, var(--cv-font-size-sm));
        font-weight: var(--file-search-control-font-weight, var(--cv-font-weight-medium));
        cursor: pointer;
        min-inline-size: 0;
        -webkit-tap-highlight-color: transparent;

        cv-icon {
          width: 14px;
          height: 14px;
          color: var(--cv-color-text-muted);
          flex-shrink: 0;
        }

        &:hover {
          background: var(--cv-color-hover);
        }
      }

      .chip--muted,
      .chipgroup--muted {
        color: var(--cv-color-text-muted);
      }

      .chip__label {
        min-inline-size: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-inline-size: min(44ch, 48vw);
      }

      .chip__close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        inline-size: 22px;
        block-size: 22px;
        border: none;
        border-radius: var(--file-search-control-radius, var(--cv-radius-2, 8px));
        background: transparent;
        color: var(--cv-color-text-muted);
        cursor: pointer;
        padding: 0;
        margin-inline-end: 4px;
        -webkit-tap-highlight-color: transparent;
        transition:
          background var(--cv-duration-fast) var(--cv-easing-standard),
          color var(--cv-duration-fast) var(--cv-easing-standard);

        cv-icon {
          width: 12px;
          height: 12px;
        }

        &:hover {
          background: var(--cv-color-danger-surface-strong);
          color: var(--cv-color-danger);
        }
      }

      /* ===== TOUCH DEVICES ===== */
      @media (hover: none) and (pointer: coarse) {
        .chip {
          padding: 8px 14px;
          gap: 8px;
          min-block-size: 36px;
        }

        .chipgroup__main {
          padding: 8px 12px;
          gap: 8px;
          min-block-size: 36px;
        }

        .chip__close {
          inline-size: 28px;
          block-size: 28px;
          margin-inline-end: 4px;
        }

        .search-input {
          --cv-input-height: 36px;
          min-inline-size: min(220px, 100%);
        }

        .chip cv-icon,
        .chipgroup__main cv-icon {
          width: 16px;
          height: 16px;
        }
      }
    `,
  ]

  private openCommandPalette() {
    openCommandPalette({mode: 'all'})
  }

  private getEditInCommandTitle(): string {
    const shortcut = keyboardShortcutsModel.label('app.commandPalette.open')
    return shortcut
      ? i18n('file-manager:edit-in-command', {shortcut})
      : i18n('file-manager:edit-in-command-generic')
  }

  private resetAll() {
    this.getFilterActions().reset()
  }

  private onQueryInput(event: CVInputInputEvent) {
    this.getFilterActions().patchFilters({query: event.detail.value})
  }

  private removeFileType(typeValue: string) {
    this.getFilterActions().removeFileType(typeValue)
  }

  private clearQuery() {
    this.getFilterActions().clearQuery()
  }

  private hideHiddenFiles() {
    this.getFilterActions().hideHiddenFiles()
  }

  private onRemoveFileTypeClick(event: Event) {
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return
    const type = target.dataset['fileType']
    if (!type) return
    this.removeFileType(type)
  }

  private renderFilterChip(label: string, clearLabel: string, onClear: (event: Event) => void): TemplateResult {
    return html`
      <span class="chipgroup">
        <button
          type="button"
          class="chipgroup__main"
          title=${this.getEditInCommandTitle()}
          @click=${this.openCommandPalette}
        >
          <cv-icon name="filter" aria-hidden="true"></cv-icon>
          <span class="chip__label">${label}</span>
        </button>
        <button type="button" class="chip__close" aria-label=${clearLabel} @click=${onClear}>
          <cv-icon name="x" aria-hidden="true"></cv-icon>
        </button>
      </span>
    `
  }

  private renderActiveFilters() {
    const {filters} = this
    if (!hasContentFiltering(filters)) return nothing

    return html`
      ${filters.query.trim()
        ? this.renderFilterChip(
            i18n('file-manager:search-current', {query: filters.query}),
            i18n('file-manager:clear-search'),
            this.clearQuery,
          )
        : nothing}
      ${filters.showHidden
        ? this.renderFilterChip(
            i18n('file-manager:show-hidden'),
            i18n('file-manager:hide-hidden-files'),
            this.hideHiddenFiles,
          )
        : nothing}
      ${filters.fileTypes.map((type) => {
        const label = getFileTypeLabel(type)
        return html`
          <span class="chipgroup">
            <button
              type="button"
              class="chipgroup__main"
              title=${this.getEditInCommandTitle()}
              @click=${this.openCommandPalette}
            >
              <cv-icon name="file-type" aria-hidden="true"></cv-icon>
              <span class="chip__label">${label}</span>
            </button>
            <button
              type="button"
              class="chip__close"
              data-file-type=${type}
              aria-label=${i18n('file-manager:remove-filter', {label})}
              @click=${this.onRemoveFileTypeClick}
            >
              <cv-icon name="x" aria-hidden="true"></cv-icon>
            </button>
          </span>
        `
      })}
      <button type="button" class="chip chip--muted" @click=${this.resetAll}>
        <cv-icon name="rotate-ccw" aria-hidden="true"></cv-icon>
        <span class="chip__label">${i18n('button:reset')}</span>
      </button>
    `
  }

  render() {
    const {filters} = this

    return html`
      <div class="bar">
        ${this.renderActiveFilters()}
        <cv-input
          class="search-input"
          type="search"
          size="small"
          .value=${filters.query}
          placeholder=${i18n('file-manager:search')}
          aria-label=${i18n('file-manager:search')}
          @cv-input=${this.onQueryInput}
        >
          <cv-icon name="search" slot="prefix" aria-hidden="true"></cv-icon>
        </cv-input>
      </div>
    `
  }
}
