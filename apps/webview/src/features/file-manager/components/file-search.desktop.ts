import {css, nothing, type TemplateResult} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'
import {CVInput, type CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import {CVPopover} from '@chromvoid/uikit/components/cv-popover'

import {i18n} from 'root/i18n'
import {sharedStyles} from 'root/shared/ui/shared-styles'

import {hasContentFiltering} from '../models/file-search-filters.model'
import {getFileTypeLabel} from './file-manager-labels'
import {FileSearchBase} from './file-search.base'

const FILE_TYPE_OPTIONS = [
  {value: 'images', icon: 'image'},
  {value: 'documents', icon: 'file-text'},
  {value: 'markdown', icon: 'book'},
  {value: 'videos', icon: 'film'},
  {value: 'audio', icon: 'music'},
  {value: 'archives', icon: 'archive'},
  {value: 'code', icon: 'code'},
] as const

export class FileSearch extends FileSearchBase {
  static define() {
    CVInput.define()
    CVPopover.define()
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

      :host([toolbar-only]) {
        container-type: inline-size;
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
        --cv-input-height: var(--file-search-control-block-size, 32px);
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

      :host([toolbar-only]) .bar {
        overflow: visible;
      }

      .type-filter {
        flex: 0 0 auto;
        --cv-popover-min-inline-size: 190px;
        --cv-popover-max-inline-size: min(220px, calc(100vw - var(--cv-space-6)));
        --cv-popover-padding: var(--cv-space-1);
        --cv-popover-gap: 0;
      }

      .type-filter::part(content) {
        align-content: start;
        block-size: fit-content;
        max-block-size: calc(100dvh - var(--cv-space-6));
        overflow-y: auto;
        border-color: var(--cv-color-border-strong);
        box-shadow: var(--cv-shadow-lg);
      }

      .type-filter::part(trigger) {
        min-block-size: var(--file-search-control-block-size, 32px);
        gap: var(--cv-space-2);
        padding-inline: var(--cv-space-3);
        border-color: var(--cv-color-border-muted);
        border-radius: var(--file-search-control-radius, var(--cv-radius-2));
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text-muted);
        font-size: var(--file-search-control-font-size, var(--cv-font-size-sm));
        font-weight: var(--file-search-control-font-weight, var(--cv-font-weight-medium));
      }

      .type-filter[open]::part(trigger),
      .type-filter::part(trigger):hover {
        border-color: var(--cv-color-primary-border-strong);
        background: var(--cv-color-hover);
        color: var(--cv-color-text);
      }

      .type-filter__icon,
      .type-filter__chevron,
      .type-filter-option cv-icon {
        --cv-icon-size: 15px;
        inline-size: 15px;
        block-size: 15px;
        flex: 0 0 auto;
      }

      .type-filter__chevron {
        --cv-icon-size: 13px;
        inline-size: 13px;
        block-size: 13px;
        color: var(--cv-color-text-subtle);
      }

      .type-filter__count {
        display: inline-grid;
        place-items: center;
        min-inline-size: 16px;
        block-size: 16px;
        padding-inline: var(--cv-space-1);
        border-radius: var(--cv-radius-pill);
        background: var(--cv-color-primary);
        color: var(--cv-color-on-primary);
        font-family: var(--cv-font-family-code);
        font-size: var(--cv-font-size-xs);
        font-weight: var(--cv-font-weight-bold);
        line-height: 1;
      }

      .type-filter-menu {
        display: grid;
        align-content: start;
        block-size: max-content;
        gap: 0;
      }

      .type-filter-menu__label {
        padding: var(--cv-space-2) var(--cv-space-2) var(--cv-space-1);
        color: var(--cv-color-text-subtle);
        font-size: var(--cv-font-size-xs);
        font-weight: var(--cv-font-weight-semibold);
        letter-spacing: 0.08em;
        line-height: 1.2;
        text-transform: uppercase;
      }

      .type-filter-menu__divider {
        block-size: 1px;
        margin: var(--cv-space-1) var(--cv-space-2);
        background: var(--cv-color-border-muted);
      }

      .type-filter-option {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr) max-content;
        align-items: center;
        gap: var(--cv-space-2);
        min-block-size: 30px;
        padding-inline: var(--cv-space-2);
        border: 0;
        border-radius: var(--cv-radius-2);
        background: transparent;
        color: var(--cv-color-text-muted);
        font: inherit;
        font-size: var(--cv-font-size-xs);
        line-height: 1.2;
        text-align: start;
        cursor: pointer;
      }

      .type-filter-option:hover {
        background: var(--cv-color-hover);
        color: var(--cv-color-text);
      }

      .type-filter-option:focus-visible {
        outline: 2px solid var(--cv-color-accent);
        outline-offset: -2px;
      }

      .type-filter-option[aria-pressed='true'] {
        background: var(--cv-color-primary-surface);
        color: var(--cv-color-text);
      }

      .type-filter-option[data-file-type='images'] > cv-icon:first-child {
        color: var(--cv-color-success);
      }

      .type-filter-option[data-file-type='documents'] > cv-icon:first-child,
      .type-filter-option[data-file-type='markdown'] > cv-icon:first-child {
        color: var(--cv-color-accent);
      }

      .type-filter-option[data-file-type='videos'] > cv-icon:first-child,
      .type-filter-option[data-file-type='archives'] > cv-icon:first-child {
        color: var(--cv-color-warning);
      }

      .type-filter-option[data-file-type='audio'] > cv-icon:first-child,
      .type-filter-option[data-file-type='code'] > cv-icon:first-child {
        color: var(--cv-color-primary);
      }

      .type-filter-option:not([data-file-type]) > cv-icon:first-child {
        color: var(--cv-color-accent);
      }

      .type-filter-option > .type-filter-option__check {
        color: var(--cv-color-primary);
      }

      @container (width < 250px) {
        .type-filter__label,
        .type-filter__chevron {
          display: none;
        }

        .type-filter::part(trigger) {
          padding-inline: var(--cv-space-2);
        }
      }

      /* ===== BASE CHIP ===== */
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-block-size: var(--file-search-control-block-size, 32px);
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
        min-block-size: var(--file-search-control-block-size, 32px);
        border-radius: var(--file-search-control-radius, var(--cv-radius-2, 8px));
        border: 1px solid var(--cv-color-border-muted);
        background: var(--cv-color-surface-2);
        overflow: hidden;
        box-shadow: 0 1px 2px var(--cv-alpha-black-5);
      }

      .chipgroup__main {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-block-size: calc(var(--file-search-control-block-size, 32px) - 2px);
        padding: 0 10px;
        border: none;
        background: transparent;
        color: var(--cv-color-text);
        font-size: var(--file-search-control-font-size, var(--cv-font-size-sm));
        font-weight: var(--file-search-control-font-weight, var(--cv-font-weight-medium));
        min-inline-size: 0;

        cv-icon {
          width: 14px;
          height: 14px;
          color: var(--cv-color-text-muted);
          flex-shrink: 0;
        }
      }

      .chip--muted {
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

    `,
  ]

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

  private onFileTypeOptionClick(event: Event) {
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return
    const type = target.dataset['fileType']
    if (!type) return

    this.getFilterActions().toggleFileType(type)
  }

  private onShowHiddenClick() {
    this.getFilterActions().toggleShowHidden()
  }

  private renderFilterChip(label: string, clearLabel: string, onClear: (event: Event) => void): TemplateResult {
    return html`
      <span class="chipgroup">
        <span class="chipgroup__main">
          <cv-icon name="filter" aria-hidden="true"></cv-icon>
          <span class="chip__label">${label}</span>
        </span>
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
            <span class="chipgroup__main">
              <cv-icon name="file-type" aria-hidden="true"></cv-icon>
              <span class="chip__label">${label}</span>
            </span>
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

  private renderTypeFilter() {
    const {filters} = this

    return html`
      <cv-popover class="type-filter" placement="bottom-end" aria-label=${i18n('file-manager:file-type')}>
        <cv-icon class="type-filter__icon" name="filter" slot="trigger" aria-hidden="true"></cv-icon>
        <span class="sr-only" slot="trigger">${i18n('file-manager:file-type')}</span>
        <span class="type-filter__label" slot="trigger" aria-hidden="true">
          ${i18n('file-manager:types')}
        </span>
        ${filters.fileTypes.length > 0
          ? html`<span class="type-filter__count" slot="trigger">${filters.fileTypes.length}</span>`
          : nothing}
        <cv-icon class="type-filter__chevron" name="chevron-down" slot="trigger" aria-hidden="true"></cv-icon>

        <div class="type-filter-menu" role="group" aria-label=${i18n('file-manager:file-type')}>
          <span class="type-filter-menu__label">${i18n('file-manager:filter-by-type')}</span>
          ${FILE_TYPE_OPTIONS.map(({value, icon}) => {
            const active = filters.fileTypes.includes(value)
            return html`
              <button
                type="button"
                class="type-filter-option"
                aria-pressed=${active ? 'true' : 'false'}
                data-file-type=${value}
                @click=${this.onFileTypeOptionClick}
              >
                <cv-icon name=${icon} aria-hidden="true"></cv-icon>
                <span>${getFileTypeLabel(value)}</span>
                ${active
                  ? html`<cv-icon
                      class="type-filter-option__check"
                      name="check"
                      aria-hidden="true"
                    ></cv-icon>`
                  : nothing}
              </button>
            `
          })}
          <span class="type-filter-menu__divider" aria-hidden="true"></span>
          <button
            type="button"
            class="type-filter-option"
            aria-pressed=${filters.showHidden ? 'true' : 'false'}
            @click=${this.onShowHiddenClick}
          >
            <cv-icon name="eye" aria-hidden="true"></cv-icon>
            <span>${i18n('file-manager:show-hidden')}</span>
            ${filters.showHidden
              ? html`<cv-icon class="type-filter-option__check" name="check" aria-hidden="true"></cv-icon>`
              : nothing}
          </button>
        </div>
      </cv-popover>
    `
  }

  render() {
    const {filters} = this

    return html`
      <div class="bar">
        <cv-input
          class="search-input"
          type="search"
          size="small"
          .value=${filters.query}
          placeholder=${i18n('file-manager:search-this-folder')}
          aria-label=${i18n('file-manager:search')}
          @cv-input=${this.onQueryInput}
        >
          <cv-icon name="search" slot="prefix" aria-hidden="true"></cv-icon>
        </cv-input>
        ${this.renderTypeFilter()} ${this.hasAttribute('toolbar-only') ? nothing : this.renderActiveFilters()}
      </div>
    `
  }
}
