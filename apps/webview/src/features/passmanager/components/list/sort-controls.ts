import {MAX_SAFE_TIMEOUT, atom, withLocalStorage} from '@reatom/core'

import {html} from '@chromvoid/uikit/reatom-lit'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVPopover} from '@chromvoid/uikit/components/cv-popover'
import {CVRadio} from '@chromvoid/uikit/components/cv-radio'
import {CVRadioGroup, type CVRadioGroupChangeEvent} from '@chromvoid/uikit/components/cv-radio-group'
import {css, type TemplateResult} from 'lit'

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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStoredEnumValue<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

function readPersistedEnumValue<T extends string>(value: string, values: readonly T[]): T | null {
  try {
    const record: unknown = JSON.parse(value)
    if (!isObjectRecord(record)) {
      return null
    }

    const data = record['data']
    const id = record['id']
    const timestamp = record['timestamp']
    const version = record['version']
    const to = record['to']

    if (
      !isStoredEnumValue(data, values) ||
      typeof id !== 'number' ||
      typeof timestamp !== 'number' ||
      version !== 0 ||
      typeof to !== 'number' ||
      to < Date.now()
    ) {
      return null
    }

    return data
  } catch {
    return null
  }
}

function readStoredEnumValue<T extends string>(value: string | null, values: readonly T[]): T | null {
  if (value === null) {
    return null
  }

  return isStoredEnumValue(value, values) ? value : readPersistedEnumValue(value, values)
}

function serializePersistedEnumValue<T extends string>(value: T): string {
  const now = Date.now()
  return JSON.stringify({
    data: value,
    id: now,
    timestamp: now,
    to: now + MAX_SAFE_TIMEOUT,
    version: 0,
  })
}

function normalizePersistedEnumKey<T extends string>(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  currentValue: string | null,
  nextValue: T,
  values: readonly T[],
  writeMissing = false,
): void {
  if (currentValue === null && !writeMissing) {
    return
  }

  if (currentValue !== null && readPersistedEnumValue(currentValue, values) === nextValue) {
    return
  }

  storage.setItem(key, serializePersistedEnumValue(nextValue))
}

function normalizeRawEnumKey<T extends string>(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  currentValue: string | null,
  nextValue: T,
): void {
  if (currentValue !== null && currentValue !== nextValue) {
    storage.setItem(key, nextValue)
  }
}

export function normalizeStoredGroupBy(storage?: Pick<Storage, 'getItem' | 'setItem'>): GroupBy {
  try {
    const storageApi = storage ?? localStorage
    const persistedKey = 'pm_group_by'
    const legacyKey = 'pm-group-by'
    const persistedValue = storageApi.getItem(persistedKey)
    const legacyValue = storageApi.getItem(legacyKey)
    const next =
      readStoredEnumValue(persistedValue, GROUP_BY_VALUES) ??
      readStoredEnumValue(legacyValue, GROUP_BY_VALUES) ??
      'none'

    normalizePersistedEnumKey(
      storageApi,
      persistedKey,
      persistedValue,
      next,
      GROUP_BY_VALUES,
      legacyValue !== null,
    )
    normalizeRawEnumKey(storageApi, legacyKey, legacyValue, next)

    return next
  } catch {
    return 'none'
  }
}

export function normalizeStoredViewMode(
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): ViewMode {
  try {
    const storageApi = storage ?? localStorage
    const persistedKey = 'pm_view_mode'
    const legacyKey = 'pm-view-mode'
    const persistedValue = storageApi.getItem(persistedKey)
    const legacyValue = storageApi.getItem(legacyKey)
    const next =
      readStoredEnumValue(persistedValue, VIEW_MODE_VALUES) ??
      readStoredEnumValue(legacyValue, VIEW_MODE_VALUES) ??
      'default'

    normalizePersistedEnumKey(
      storageApi,
      persistedKey,
      persistedValue,
      next,
      VIEW_MODE_VALUES,
      legacyValue !== null,
    )
    if (legacyValue !== null) {
      storageApi.removeItem(legacyKey)
    }

    return next
  } catch {
    return 'default'
  }
}

// Global status of sorting and grouping
export const sortField = atom<SortField>('name', 'pm_sort_field').extend(
  withLocalStorage({key: 'pm_sort_field'}),
)
export const sortDirection = atom<SortDirection>('asc', 'pm_sort_direction').extend(
  withLocalStorage({key: 'pm_sort_direction'}),
)
export const groupBy = atom<GroupBy>(normalizeStoredGroupBy(), 'pm_group_by').extend(
  withLocalStorage({key: 'pm_group_by'}),
)
export const viewMode = atom<ViewMode>(normalizeStoredViewMode(), 'pm_view_mode').extend(
  withLocalStorage({key: 'pm_view_mode'}),
)

function getGroupByShortLabel(value: GroupBy): string {
  switch (value) {
    case 'none':
      return i18n('group-by-short')
    case 'website':
      return i18n('group:website-short')
    case 'modified':
      return i18n('group:modified-short')
    case 'security':
      return i18n('group:security-short')
  }
}

export class SortControls extends SortControlsBase {
  static define() {
    CVIcon.define()
    CVPopover.define()
    CVRadio.define()
    CVRadioGroup.define()
    if (!customElements.get('pm-sort-controls')) {
      customElements.define('pm-sort-controls', this)
    }
  }

  static styles = css`
    :host {
      display: inline-block;
      min-inline-size: 0;
      contain: style;
    }

    .sort-controls {
      display: inline-flex;
      align-items: center;
      gap: var(--pm-toolbar-control-gap);
      min-inline-size: 0;
    }

    .control-popover {
      --cv-popover-padding: 0;
      --cv-popover-gap: 0;
      --cv-popover-border-radius: var(--cv-radius-3);
      --cv-popover-z-index: var(--cv-z-overlay, 300);
    }

    .sort-popover {
      --cv-popover-min-inline-size: 264px;
      --cv-popover-max-inline-size: min(296px, calc(100vw - var(--cv-space-6)));
    }

    .group-popover {
      --cv-popover-min-inline-size: 244px;
      --cv-popover-max-inline-size: min(276px, calc(100vw - var(--cv-space-6)));
    }

    .control-popover::part(trigger) {
      min-block-size: var(--pm-toolbar-control-block-size);
      padding: 0 var(--pm-toolbar-control-padding-inline);
      gap: var(--pm-toolbar-control-gap);
      border-color: var(--cv-color-border);
      border-radius: var(--pm-toolbar-control-radius);
      background: var(--cv-color-surface-2);
      color: var(--cv-color-text);
      font-size: var(--pm-toolbar-control-font-size);
      font-weight: var(--pm-toolbar-control-font-weight);
      line-height: 1;
      box-shadow:
        inset 0 1px 0 var(--cv-alpha-white-4),
        0 1px 2px var(--cv-alpha-black-10);
      transition:
        border-color var(--cv-duration-fast) var(--cv-easing-standard),
        background-color var(--cv-duration-fast) var(--cv-easing-standard),
        color var(--cv-duration-fast) var(--cv-easing-standard),
        box-shadow var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .control-popover::part(trigger):hover,
    .control-popover[open]::part(trigger) {
      border-color: var(--cv-color-primary-border);
      background: var(--cv-color-primary-surface);
    }

    .group-popover.active::part(trigger) {
      border-color: var(--cv-color-primary-border-strong);
      background: var(--cv-color-primary-surface-strong);
      color: var(--cv-color-primary);
    }

    .trigger-icon,
    .trigger-direction,
    .trigger-chevron {
      inline-size: 14px;
      block-size: 14px;
      color: var(--cv-color-text-muted);
    }

    .trigger-direction.desc {
      transform: rotate(180deg);
    }

    .active .trigger-icon,
    .active .trigger-chevron {
      color: currentColor;
    }

    .trigger-label {
      max-inline-size: 96px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .control-panel {
      display: grid;
      min-inline-size: 0;
    }

    .control-section {
      display: grid;
      gap: var(--cv-space-2);
      padding: var(--cv-space-3);
    }

    .control-section + .control-section {
      border-block-start: 1px solid var(--cv-color-border);
    }

    .section-title {
      color: var(--cv-color-text-muted);
      font-size: var(--cv-font-size-xs);
      font-weight: var(--cv-font-weight-semibold);
    }

    cv-radio-group {
      inline-size: 100%;
    }

    cv-radio-group::part(base) {
      display: grid;
      inline-size: 100%;
      gap: var(--cv-space-1);
      padding: 0;
      border: 0;
      background: transparent;
    }

    cv-radio {
      inline-size: 100%;
    }

    cv-radio::part(base) {
      inline-size: 100%;
      min-block-size: 34px;
      padding-inline: var(--cv-space-2);
    }

    cv-radio:hover::part(base) {
      background: var(--cv-color-surface-3);
    }
  `

  private onSortFieldChange(event: CVRadioGroupChangeEvent): void {
    const value = event.detail.value
    if (SORT_FIELD_OPTIONS.some((option) => option.value === value)) {
      this.setSortField(value as SortField)
    }
  }

  private onSortDirectionChange(event: CVRadioGroupChangeEvent): void {
    const value = event.detail.value
    if (value === 'asc' || value === 'desc') {
      this.setSortDirection(value)
    }
  }

  private onGroupByChange(event: CVRadioGroupChangeEvent): void {
    const value = event.detail.value
    if (GROUP_BY_OPTIONS.some((option) => option.value === value)) {
      this.setGroupBy(value as GroupBy)
    }
  }

  private renderRadioGroup<T extends string>(
    value: T,
    label: string,
    options: readonly {value: T; label: () => string}[],
    onChange: (event: CVRadioGroupChangeEvent) => void,
  ): TemplateResult {
    return html`
      <cv-radio-group orientation="vertical" .value=${value} aria-label=${label} @cv-change=${onChange}>
        ${options.map(
          (option) => html`
            <cv-radio
              size="small"
              value=${option.value}
              aria-label=${option.label()}
              ?checked=${option.value === value}
            >
              ${option.label()}
            </cv-radio>
          `,
        )}
      </cv-radio-group>
    `
  }

  private renderSortControl(): TemplateResult {
    const currentField = sortField()
    const currentDirection = sortDirection()
    const fieldLabel = getSortFieldLabel(currentField)
    const directionLabel =
      currentDirection === 'asc' ? i18n('sort:direction:asc') : i18n('sort:direction:desc')

    return html`
      <cv-popover
        class="control-popover sort-popover"
        placement="bottom-end"
        aria-label=${i18n('sort-by')}
        title=${`${i18n('sort-by')}: ${fieldLabel}, ${directionLabel}`}
      >
        <cv-icon class="trigger-icon" slot="trigger" name="arrow-up-down" aria-hidden="true"></cv-icon>
        <span class="trigger-label" slot="trigger">${fieldLabel}</span>
        <cv-icon
          class="trigger-direction ${currentDirection === 'desc' ? 'desc' : ''}"
          slot="trigger"
          name="arrow-up"
          aria-hidden="true"
        ></cv-icon>

        <div class="control-panel">
          <section class="control-section" aria-labelledby="pm-sort-field-title">
            <span id="pm-sort-field-title" class="section-title">${i18n('sort-by')}</span>
            ${this.renderRadioGroup(
              currentField,
              i18n('sort-by'),
              SORT_FIELD_OPTIONS,
              this.onSortFieldChange,
            )}
          </section>
          <section class="control-section" aria-labelledby="pm-sort-direction-title">
            <span id="pm-sort-direction-title" class="section-title">${i18n('sort:direction')}</span>
            ${this.renderRadioGroup(
              currentDirection,
              i18n('sort:direction'),
              [
                {value: 'asc', label: () => i18n('sort:direction:asc')},
                {value: 'desc', label: () => i18n('sort:direction:desc')},
              ],
              this.onSortDirectionChange,
            )}
          </section>
        </div>
      </cv-popover>
    `
  }

  private renderGroupControl(): TemplateResult {
    const currentGroupBy = groupBy()
    const groupLabel = getGroupByLabel(currentGroupBy)

    return html`
      <cv-popover
        class=${currentGroupBy === 'none'
          ? 'control-popover group-popover'
          : 'control-popover group-popover active'}
        placement="bottom-end"
        aria-label=${i18n('group-by')}
        title=${`${i18n('group-by')}: ${groupLabel}`}
      >
        <cv-icon class="trigger-icon" slot="trigger" name="layers" aria-hidden="true"></cv-icon>
        <span class="trigger-label" slot="trigger">${getGroupByShortLabel(currentGroupBy)}</span>
        <cv-icon class="trigger-chevron" slot="trigger" name="chevron-down" aria-hidden="true"></cv-icon>

        <section class="control-section" aria-labelledby="pm-group-by-title">
          <span id="pm-group-by-title" class="section-title">${i18n('group-by')}</span>
          ${this.renderRadioGroup(currentGroupBy, i18n('group-by'), GROUP_BY_OPTIONS, this.onGroupByChange)}
        </section>
      </cv-popover>
    `
  }

  render(): TemplateResult {
    return html`
      <div class="sort-controls" role="group" aria-label=${i18n('button:filters_sorting')}>
        ${this.renderSortControl()} ${this.renderGroupControl()}
      </div>
    `
  }
}
