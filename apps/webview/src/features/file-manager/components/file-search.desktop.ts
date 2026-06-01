import {css} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {i18n} from 'root/i18n'
import {keyboardShortcutsModel} from 'root/shared/keyboard'
import {openCommandPalette} from 'root/shared/services/command-palette'
import {sharedStyles} from 'root/shared/ui/shared-styles'

import type {ViewMode} from 'root/shared/contracts/file-manager'
import {hasNonDefaultFileSearchFilters} from '../models/file-search-filters.model'
import {getFileTypeLabel, getSortLabel, getViewLabel} from './file-manager-labels'
import {FileSearchBase} from './file-search.base'

const VIEW_ICONS: Record<ViewMode, string> = {
  list: 'list',
  grid: 'grid',
  table: 'table',
}

export class FileSearch extends FileSearchBase {
  static define() {
    if (!customElements.get('file-search')) {
      customElements.define('file-search', this as unknown as CustomElementConstructor)
    }
  }

  static get properties() {
    return {
      ...super.properties,
      compact: {type: Boolean},
    }
  }

  /** Hides stats & view-mode chip (duplicated in the bottom bar on mobile) */
  declare compact: boolean

  constructor() {
    super()
    this.compact = false
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        display: contents;
      }

      .bar {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
        flex-wrap: nowrap;
        min-inline-size: 0;
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }

      .bar::-webkit-scrollbar {
        display: none;
      }

      .chips {
        display: flex;
        flex-wrap: nowrap;
        gap: 6px;
        align-items: center;
        min-inline-size: max-content;
      }

      /* ===== BASE CHIP ===== */
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: var(--cv-radius-2, 8px);
        border: 1px solid var(--cv-color-border-muted);
        background: var(--cv-color-surface-2);
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-xs);
        font-weight: 500;
        letter-spacing: 0.01em;
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
        border-radius: var(--cv-radius-2, 8px);
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
        padding: 6px 10px;
        border: none;
        background: transparent;
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-xs);
        font-weight: 500;
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
        border-radius: var(--cv-radius-1, 4px);
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

      .stats {
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-xs);
        font-weight: 500;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
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

  private toggleSortDirection() {
    this.getFilterActions().toggleSortDirection()
  }

  private cycleViewMode() {
    this.getFilterActions().cycleViewMode()
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

  render() {
    const {filters} = this

    const hasNonDefaults = hasNonDefaultFileSearchFilters(filters)

    const sortArrow = filters.sortDirection === 'asc' ? '↑' : '↓'
    const sortLabel = this.compact
      ? `${getSortLabel(filters.sortBy)} ${sortArrow}`
      : `${i18n('file-manager:sort-current', {sort: getSortLabel(filters.sortBy)})} ${sortArrow}`
    const editInCommandTitle = this.getEditInCommandTitle()

    return html`
      <div class="bar">
        ${this.compact ? '' : html`<span class="stats">${this.filteredFiles}/${this.totalFiles}</span>`}

        <div class="chips" role="list" aria-label=${i18n('file-manager:active-filters')}>
          ${this.compact
            ? ''
            : html`
                <cv-button unstyled
                  class="chip"
                  type="button"
                  role="listitem"
                  @click=${this.cycleViewMode}
                  title=${i18n('file-manager:change-view')}
                >
                  <cv-icon slot="prefix" name=${VIEW_ICONS[filters.viewMode]}></cv-icon>
                  <span class="chip__label"
                    >${i18n('file-manager:view-current', {view: getViewLabel(filters.viewMode)})}</span
                  >
                </cv-button>
              `}

          <cv-button unstyled
            class="chip"
            type="button"
            role="listitem"
            @click=${this.toggleSortDirection}
            title=${i18n('file-manager:toggle-sort-direction')}
          >
            <cv-icon slot="prefix" name="arrow-up-down"></cv-icon>
            <span class="chip__label">${sortLabel}</span>
          </cv-button>

          ${filters.query
            ? html`
                <span
                  class="chipgroup chipgroup--danger"
                  role="listitem"
                  title=${i18n('file-manager:search')}
                >
                  <cv-button unstyled
                    class="chipgroup__main"
                    type="button"
                    @click=${this.openCommandPalette}
                    title=${editInCommandTitle}
                  >
                    <cv-icon slot="prefix" name="search"></cv-icon>
                    <span class="chip__label"
                      >${i18n('file-manager:search-current', {query: filters.query})}</span
                    >
                  </cv-button>
                  <cv-button unstyled
                    class="chip__close"
                    type="button"
                    @click=${this.clearQuery}
                    aria-label=${i18n('file-manager:clear-search')}
                  >
                    <cv-icon name="x"></cv-icon>
                  </cv-button>
                </span>
              `
            : ''}
          ${filters.showHidden
            ? html`
                <span class="chipgroup" role="listitem" title=${i18n('file-manager:hidden-files')}>
                  <cv-button unstyled
                    class="chipgroup__main"
                    type="button"
                    @click=${this.openCommandPalette}
                    title=${editInCommandTitle}
                  >
                    <cv-icon slot="prefix" name="eye"></cv-icon>
                    <span class="chip__label">${i18n('file-manager:show-hidden')}</span>
                  </cv-button>
                  <cv-button unstyled
                    class="chip__close"
                    type="button"
                    @click=${this.hideHiddenFiles}
                    aria-label=${i18n('file-manager:hide-hidden-files')}
                  >
                    <cv-icon name="x"></cv-icon>
                  </cv-button>
                </span>
              `
            : ''}
          ${filters.fileTypes.map((type) => {
            const label = getFileTypeLabel(type)
            return html`
              <span class="chipgroup" role="listitem" title=${i18n('file-manager:file-type')}>
                <cv-button unstyled
                  class="chipgroup__main"
                  type="button"
                  @click=${this.openCommandPalette}
                  title=${editInCommandTitle}
                >
                  <cv-icon slot="prefix" name="tag"></cv-icon>
                  <span class="chip__label">${label}</span>
                </cv-button>
                <cv-button unstyled
                  class="chip__close"
                  type="button"
                  @click=${() => this.removeFileType(type)}
                  aria-label=${i18n('file-manager:remove-filter', {label})}
                >
                  <cv-icon name="x"></cv-icon>
                </cv-button>
              </span>
            `
          })}
          ${hasNonDefaults
            ? html`
                <cv-button unstyled
                  class="chip chip--muted"
                  type="button"
                  role="listitem"
                  @click=${this.resetAll}
                  title=${i18n('button:reset')}
                >
                  <cv-icon slot="prefix" name="refresh-cw"></cv-icon>
                  <span class="chip__label">${i18n('button:reset')}</span>
                </cv-button>
              `
            : ''}
        </div>
      </div>
    `
  }
}
