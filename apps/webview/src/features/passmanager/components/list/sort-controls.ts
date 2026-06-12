import {atom, withLocalStorage} from '@reatom/core'

import {css} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'
import type {TemplateResult} from 'lit'
import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVSelect, type CVSelectChangeEvent} from '@chromvoid/uikit/components/cv-select'
import {CVSelectOption} from '@chromvoid/uikit/components/cv-select-option'

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
    CVButton.define()
    CVIcon.define()
    CVSelect.define()
    CVSelectOption.define()
    if (!customElements.get('pm-sort-controls')) {
      customElements.define('pm-sort-controls', this)
    }
  }

  static styles = css`
    :host {
      display: block;
      min-inline-size: 0;
      container-type: inline-size;
      --pm-toolbar-control-height: var(--app-toolbar-control-height, 40px);
      --pm-toolbar-control-radius: var(--app-toolbar-control-radius, var(--cv-radius-2));
      --pm-toolbar-control-padding-inline: var(--app-toolbar-control-padding-inline, var(--cv-space-3));
      --pm-toolbar-control-font-size: var(--app-toolbar-control-font-size, var(--cv-font-size-sm));
      --pm-toolbar-control-font-weight: var(--app-toolbar-control-font-weight, var(--cv-font-weight-medium));
      --pm-toolbar-control-gap: var(--app-toolbar-control-gap, var(--cv-space-2));
    }

    @supports (-webkit-touch-callout: none) {
      @media (hover: none) and (pointer: coarse) {
        cv-select::part(trigger) {
          font-size: 16px;
        }
      }
    }

    .sort-controls {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--pm-toolbar-control-gap);
      inline-size: 100%;
      min-inline-size: 0;
    }

    .sort-control-set {
      display: flex;
      align-items: center;
      gap: var(--pm-toolbar-control-gap);
      min-inline-size: 0;
    }

    .sort-control-set[data-kind='sort'] {
      flex: 1 1 230px;
      min-inline-size: 190px;
    }

    .sort-control-set[data-kind='group'] {
      flex: 0 1 160px;
      min-inline-size: 136px;
    }

    .control-select {
      --cv-select-inline-size: 100%;
      --cv-select-min-height: var(--pm-toolbar-control-height);
      --cv-select-padding-inline: var(--pm-toolbar-control-padding-inline);
      --cv-select-padding-block: 0;
      --cv-select-border-radius: var(--pm-toolbar-control-radius);
      --cv-select-background: var(--cv-color-surface-2);
      min-inline-size: 0;
      flex: 1 1 auto;
    }

    .control-select::part(trigger) {
      border-color: var(--cv-color-border);
      box-shadow:
        inset 0 1px 0 var(--cv-alpha-white-4),
        0 1px 2px var(--cv-alpha-black-10);
      transition:
        border-color var(--cv-duration-fast) var(--cv-easing-standard),
        background-color var(--cv-duration-fast) var(--cv-easing-standard),
        box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .control-select:hover::part(trigger),
    .control-select[open]::part(trigger) {
      border-color: var(--cv-color-primary-border);
      background: var(--cv-color-primary-surface);
    }

    .control-select:focus-within::part(trigger) {
      border-color: var(--cv-color-primary-border-strong);
      outline: 2px solid var(--cv-color-focus, var(--cv-color-primary));
      outline-offset: 2px;
      box-shadow: none;
    }

    .control-select::part(chevron) {
      color: var(--cv-color-text-muted);
    }

    .control-select::part(listbox) {
      border-color: var(--cv-color-primary-border);
      background: var(--cv-color-surface-elevated);
      box-shadow: var(--cv-shadow-3);
      z-index: var(--cv-z-overlay, 300);
    }

    .select-trigger-content {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-inline-size: 0;
      max-inline-size: 100%;
      font-size: var(--pm-toolbar-control-font-size);
      line-height: 1;
      color: var(--cv-color-text);
    }

    .select-icon {
      inline-size: 14px;
      block-size: 14px;
      flex: 0 0 auto;
      color: var(--cv-color-text-muted);
    }

    .select-value {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: var(--pm-toolbar-control-font-weight);
    }

    .direction-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 var(--pm-toolbar-control-height);
      inline-size: var(--pm-toolbar-control-height);
      block-size: var(--pm-toolbar-control-height);
      border-radius: var(--pm-toolbar-control-radius);
      border: 1px solid var(--cv-color-border);
      background: var(--cv-color-surface-2);
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
      border-color: var(--cv-color-primary-border);
      background: var(--cv-color-primary-surface);
      box-shadow:
        inset 0 1px 0 var(--cv-alpha-white-8),
        var(--cv-shadow-1);
    }

    .direction-button:active {
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
      inline-size: 14px;
      block-size: 14px;
      transition: transform var(--cv-duration-fast) var(--cv-easing-spring);
    }

    .direction-icon.desc {
      transform: rotate(180deg);
    }

    @container (width < 460px) {
      .sort-controls {
        flex-wrap: wrap;
        justify-content: stretch;
      }

      .sort-control-set[data-kind='sort'],
      .sort-control-set[data-kind='group'] {
        flex: 1 1 100%;
        min-inline-size: 0;
      }
    }

    @container (width < 300px) {
      .sort-control-set[data-kind='sort'] {
        display: grid;
        grid-template-columns: var(--pm-toolbar-control-height) minmax(0, 1fr);
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

  private renderSelectTrigger(icon: string, value: string): TemplateResult {
    return html`
      <span slot="trigger" class="select-trigger-content">
        <cv-icon class="select-icon" name=${icon} aria-hidden="true"></cv-icon>
        <span class="select-value">${value}</span>
      </span>
    `
  }

  private renderGroupSection(): TemplateResult {
    const currentGroupBy = groupBy()
    const label = i18n('group-by')
    const valueLabel = this.getGroupLabel(currentGroupBy)
    return html`
      <div class="sort-control-set" data-kind="group">
        <cv-select
          class="control-select group-by-select"
          size="small"
          .value=${currentGroupBy}
          aria-label=${label}
          title=${`${label}: ${valueLabel}`}
          @cv-change=${this.onGroupByChange}
        >
          ${this.renderSelectTrigger('layers', valueLabel)}
          ${GROUP_BY_OPTIONS.map(
            (item) => html`<cv-select-option value=${item.value}>${item.label()}</cv-select-option>`,
          )}
        </cv-select>
      </div>
    `
  }

  private renderSortSection(): TemplateResult {
    const currentSortField = sortField()
    const currentDirection = sortDirection()
    const sortLabel = i18n('sort-by')
    const fieldLabel = this.getSortLabel(currentSortField)
    const directionLabel = this.getDirectionLabel(currentDirection)
    return html`
      <div class="sort-control-set" data-kind="sort">
        <cv-button
          unstyled
          type="button"
          class="direction-button"
          aria-label=${directionLabel}
          aria-pressed=${currentDirection === 'desc' ? 'true' : 'false'}
          @click=${this.onToggleDirection}
          title=${directionLabel}
        >
          <cv-icon
            name="arrow-up"
            class="direction-icon ${currentDirection === 'desc' ? 'desc' : ''}"
            aria-hidden="true"
          ></cv-icon>
        </cv-button>

        <cv-select
          class="control-select sort-field-select"
          size="small"
          .value=${currentSortField}
          aria-label=${sortLabel}
          title=${`${sortLabel}: ${fieldLabel}`}
          @cv-change=${this.onSortDropdownSelect}
        >
          ${this.renderSelectTrigger('arrow-up-down', fieldLabel)}
          ${SORT_FIELD_OPTIONS.map(
            (item) => html`<cv-select-option value=${item.value}>${item.label()}</cv-select-option>`,
          )}
        </cv-select>
      </div>
    `
  }

  render(): TemplateResult {
    return html`
      <div class="sort-controls" role="group" aria-label=${i18n('button:filters_sorting')}>
        ${this.renderSortSection()} ${this.renderGroupSection()}
      </div>
    `
  }
}
