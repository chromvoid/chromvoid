import {atom, withLocalStorage} from '@reatom/core'

import {css} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'
import type {TemplateResult} from 'lit'
import type {CVSelectChangeEvent} from '@chromvoid/uikit/components/cv-select'

import {i18n} from '@project/passmanager/i18n'

import {SortControlsBase} from './sort-controls-base'
import {GROUP_BY_OPTIONS, SORT_FIELD_OPTIONS, getGroupByLabel, getSortFieldLabel} from './sort-options'

// Types of sorting
export type SortField = 'name' | 'username' | 'modified' | 'created' | 'website'
export type SortDirection = 'asc' | 'desc'
export type GroupBy = 'none' | 'website' | 'modified' | 'security'
export type ViewMode = 'default' | 'compact' | 'dense'

const GROUP_BY_VALUES: readonly GroupBy[] = ['none', 'website', 'modified', 'security']
const VIEW_MODE_VALUES: readonly ViewMode[] = ['default', 'compact', 'dense']

function isGroupByValue(value: string | null): value is GroupBy {
  return value !== null && GROUP_BY_VALUES.includes(value as GroupBy)
}

export function normalizeStoredGroupBy(storage?: Pick<Storage, 'getItem' | 'setItem'>): GroupBy {
  try {
    const storageApi = storage ?? localStorage
    const storageKeys = ['pm_group_by', 'pm-group-by'] as const
    let next: GroupBy = 'none'

    for (const key of storageKeys) {
      const value = storageApi.getItem(key)
      if (isGroupByValue(value)) {
        next = value
        break
      }
    }

    for (const key of storageKeys) {
      const value = storageApi.getItem(key)
      if (value === 'folder' || (value !== null && !isGroupByValue(value))) {
        storageApi.setItem(key, next)
      }
    }

    return next
  } catch {
    return 'none'
  }
}

function sanitizeStoredViewMode(): ViewMode {
  try {
    const storageKeys = ['pm_view_mode', 'pm-view-mode'] as const
    let next: ViewMode = 'default'
    let sawStoredValue = false

    for (const key of storageKeys) {
      const value = localStorage.getItem(key)
      if (value !== null) {
        sawStoredValue = true
      }
      if (value !== null && VIEW_MODE_VALUES.includes(value as ViewMode)) {
        next = value as ViewMode
        break
      }
    }

    if (sawStoredValue) {
      localStorage.setItem('pm_view_mode', next)
      localStorage.removeItem('pm-view-mode')
    }

    return next
  } catch {
    return 'default'
  }
}

// Global status of sorting and grouping
export const sortField = atom<SortField>('name', 'pm_sort_field').extend(withLocalStorage({key: 'pm_sort_field'}))
export const sortDirection = atom<SortDirection>('asc', 'pm_sort_direction').extend(
  withLocalStorage({key: 'pm_sort_direction'}),
)
export const groupBy = atom<GroupBy>(normalizeStoredGroupBy(), 'pm_group_by').extend(
  withLocalStorage({key: 'pm_group_by'}),
)
export const viewMode = atom<ViewMode>(sanitizeStoredViewMode(), 'pm_view_mode').extend(
  withLocalStorage({key: 'pm_view_mode'}),
)

export class SortControls extends SortControlsBase {
  static define() {
    if (!customElements.get('pm-sort-controls')) {
      customElements.define('pm-sort-controls', this)
    }
  }

  static styles = css`
    :host {
      display: block;
      container-type: inline-size;
    }

    @supports (-webkit-touch-callout: none) {
      @media (hover: none) and (pointer: coarse) {
        cv-select::part(trigger) {
          font-size: 16px;
        }
      }
    }

    /* ===== CONTROLS CONTAINER ===== */
    .sort-controls {
      display: grid;
      gap: var(--cv-space-2);
    }

    .control-group {
      display: grid;
      gap: var(--cv-space-2);
      padding: var(--cv-space-3);
      background: var(--cv-gradient-surface);
      border: 1px solid var(--cv-color-border-strong);
      border-radius: calc(var(--cv-radius-2) + 2px);
      position: relative;
      overflow: hidden;
      box-shadow:
        inset 0 1px 0 var(--cv-alpha-white-6),
        0 10px 24px var(--cv-alpha-black-10);
      transition:
        border-color var(--cv-duration-fast) var(--cv-easing-standard),
        box-shadow var(--cv-duration-fast) var(--cv-easing-standard),
        transform var(--cv-duration-fast) var(--cv-easing-standard);

      &::before {
        content: '';
        position: absolute;
        inset: 0;
        background: var(--cv-gradient-subtle);
        pointer-events: none;
      }
    }

    .control-group:hover {
      border-color: var(--cv-color-primary-border);
      box-shadow:
        inset 0 1px 0 var(--cv-alpha-white-8),
        var(--cv-shadow-2);
      transform: translateY(-1px);
    }

    .control-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    .control-title {
      display: inline-flex;
      align-items: center;
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    .control-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 28px;
      block-size: 28px;
      border-radius: var(--cv-radius-2);
      border: 1px solid var(--cv-color-primary-border);
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-primary);
      flex: 0 0 auto;

      cv-icon {
        inline-size: 14px;
        block-size: 14px;
      }
    }

    .control-summary {
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text);
      font-weight: var(--cv-font-weight-medium);
      text-align: end;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-inline-size: 48%;
      opacity: 0.86;
    }

    .control-body {
      display: grid;
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    .control-body[data-kind='sort'] {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: stretch;
    }

    .select-shell {
      min-inline-size: 0;
    }

    .select-shell cv-select {
      --cv-select-inline-size: 100%;
      --cv-select-min-height: 38px;
      --cv-select-padding-inline: calc(var(--cv-space-3) - 1px);
      --cv-select-padding-block: calc(var(--cv-space-2) - 1px);
    }

    .select-shell cv-select::part(trigger) {
      border-radius: var(--cv-radius-2);
      border-color: var(--cv-color-border-strong);
      background: var(--cv-color-surface);
      box-shadow:
        inset 0 1px 0 var(--cv-alpha-white-4),
        0 1px 2px var(--cv-alpha-black-10);
      transition:
        border-color var(--cv-duration-fast) var(--cv-easing-standard),
        background-color var(--cv-duration-fast) var(--cv-easing-standard),
        box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .select-shell cv-select::part(chevron) {
      color: var(--cv-color-text-muted);
    }

    .select-shell cv-select:focus-within::part(trigger),
    .select-shell cv-select[open]::part(trigger) {
      border-color: var(--pm-focus-border-color, var(--cv-color-primary-border-strong));
      background: var(--cv-color-primary-subtle);
      outline: var(--pm-focus-outline, 2px solid var(--cv-color-focus, var(--cv-color-primary)));
      outline-offset: var(--pm-focus-outline-outer-offset, 2px);
      box-shadow: none;
    }

    .select-shell cv-select::part(listbox) {
      border-color: var(--cv-color-primary-border);
      background: var(--cv-color-surface-elevated);
      box-shadow: var(--cv-shadow-3);
    }

    .direction-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      inline-size: 38px;
      block-size: 38px;
      border-radius: var(--cv-radius-2);
      border: 1px solid var(--cv-color-border-strong);
      background: var(--cv-color-surface);
      color: var(--cv-color-text-muted);
      cursor: pointer;
      box-shadow:
        inset 0 1px 0 var(--cv-alpha-white-4),
        0 1px 2px var(--cv-alpha-black-10);
      transition:
        border-color var(--cv-duration-fast) var(--cv-easing-standard),
        color var(--cv-duration-fast) var(--cv-easing-standard),
        background-color var(--cv-duration-fast) var(--cv-easing-standard),
        transform var(--cv-duration-fast) var(--cv-easing-standard),
        box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .direction-button:hover {
      color: var(--cv-color-primary);
      border-color: var(--cv-color-primary-border-strong);
      background: var(--cv-color-primary-surface);
      box-shadow:
        inset 0 1px 0 var(--cv-alpha-white-8),
        var(--cv-shadow-1);
      transform: translateY(-1px);
    }

    .direction-button:active {
      transform: translateY(0);
      outline: var(
        --pm-active-outline,
        2px solid var(--cv-color-primary-ring)
      );
      outline-offset: var(--pm-active-outline-offset, -2px);
    }

    .direction-button:focus-visible {
      outline: var(--pm-focus-outline, 2px solid var(--cv-color-focus, var(--cv-color-primary)));
      outline-offset: var(--pm-focus-outline-outer-offset, 2px);
    }

    .direction-button[aria-pressed='true'] {
      color: var(--cv-color-primary);
      border-color: var(--cv-color-primary-border-strong);
      background: var(--cv-color-primary-surface-strong);
      outline: var(
        --pm-active-outline,
        2px solid var(--cv-color-primary-ring)
      );
      outline-offset: var(--pm-active-outline-offset, -2px);
    }

    .direction-icon {
      inline-size: 16px;
      block-size: 16px;
      transition: transform var(--cv-duration-fast) var(--cv-easing-spring);
    }

    .direction-icon.desc {
      transform: rotate(180deg);
    }

    .control-label {
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text-muted);
      font-weight: var(--cv-font-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      white-space: nowrap;
      transition:
        opacity var(--cv-duration-fast) var(--cv-easing-standard),
        color var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .control-group:hover .control-label {
      color: var(--cv-color-primary);
    }

    @container (width < 360px) {
      .control-group {
        padding: var(--cv-space-2);
      }

      .control-header {
        flex-direction: column;
        align-items: stretch;
      }

      .control-summary {
        max-inline-size: 100%;
      }

      .control-body[data-kind='sort'] {
        grid-template-columns: 1fr;
      }

      .direction-button {
        inline-size: 100%;
      }
    }

    @container (width < 280px) {
      .control-summary {
        display: none;
      }
    }
  `

  private onSortFieldChange(field: SortField) {
    this.setSortField(field)
  }

  private onToggleDirection() {
    this.toggleDirection()
  }

  private onGroupByChange(event: CVSelectChangeEvent) {
    const value = event.detail.value as GroupBy | null
    if (value) {
      this.setGroupBy(value)
    }
  }

  private onSortDropdownSelect(event: CVSelectChangeEvent) {
    const field = event.detail.value as SortField | null
    if (field) {
      this.onSortFieldChange(field)
    }
  }

  private getSortLabel(field: SortField): string {
    return getSortFieldLabel(field)
  }

  private getGroupLabel(value: GroupBy): string {
    return getGroupByLabel(value)
  }

  private getDirectionLabel(direction: SortDirection): string {
    return direction === 'asc' ? i18n('sort:direction:asc') : i18n('sort:direction:desc')
  }

  private renderControlHeader(icon: string, label: string, summary: string): TemplateResult {
    return html`
      <div class="control-header">
        <div class="control-title">
          <span class="control-icon">
            <cv-icon name=${icon}></cv-icon>
          </span>
          <span class="control-label">${label}</span>
        </div>
        <span class="control-summary">${summary}</span>
      </div>
    `
  }

  private renderGroupSection(): TemplateResult {
    const currentGroupBy = groupBy()
    return html`
      <section class="control-group" data-kind="group">
        ${this.renderControlHeader('layers', i18n('group-by'), this.getGroupLabel(currentGroupBy))}
        <div class="control-body">
          <div class="select-shell">
            <cv-select
              size="small"
              .value=${currentGroupBy}
              aria-label=${i18n('group-by')}
              @cv-change=${this.onGroupByChange}
            >
              ${GROUP_BY_OPTIONS.map(
                (item) => html`<cv-select-option value=${item.value}>${item.label()}</cv-select-option>`,
              )}
            </cv-select>
          </div>
        </div>
      </section>
    `
  }

  private renderSortSection(): TemplateResult {
    const currentSortField = sortField()
    const currentDirection = sortDirection()
    return html`
      <section class="control-group" data-kind="sort">
        ${this.renderControlHeader(
          'arrow-up-down',
          i18n('sort-by'),
          `${this.getSortLabel(currentSortField)} · ${this.getDirectionLabel(currentDirection)}`,
        )}
        <div class="control-body" data-kind="sort">
          <cv-button unstyled
            type="button"
            class="direction-button"
            aria-label=${this.getDirectionLabel(currentDirection)}
            aria-pressed=${currentDirection === 'desc' ? 'true' : 'false'}
            @click=${this.onToggleDirection}
            title=${this.getDirectionLabel(currentDirection)}
          >
            <cv-icon
              name="arrow-up"
              class="direction-icon ${currentDirection === 'desc' ? 'desc' : ''}"
            ></cv-icon>
          </cv-button>

          <div class="select-shell">
            <cv-select
              size="small"
              .value=${currentSortField}
              aria-label=${i18n('sort-by')}
              @cv-change=${this.onSortDropdownSelect}
            >
              ${SORT_FIELD_OPTIONS.map(
                (item) => html`<cv-select-option value=${item.value}>${item.label()}</cv-select-option>`,
              )}
            </cv-select>
          </div>
        </div>
      </section>
    `
  }

  render(): TemplateResult {
    return html`
      <div class="sort-controls" role="group" aria-label=${i18n('button:filters_sorting')}>
        ${this.renderGroupSection()} ${this.renderSortSection()}
      </div>
    `
  }
}
