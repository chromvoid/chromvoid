import {html} from '@chromvoid/uikit/reatom-lit'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVPopover} from '@chromvoid/uikit/components/cv-popover'
import {CVRadio} from '@chromvoid/uikit/components/cv-radio'
import {CVRadioGroup, type CVRadioGroupChangeEvent} from '@chromvoid/uikit/components/cv-radio-group'
import {css, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'

import {SortControlsBase} from './sort-controls-base'
import {GROUP_BY_OPTIONS, SORT_FIELD_OPTIONS, getGroupByLabel, getSortFieldLabel} from './sort-options'
import {groupBy, sortField, sortDirection, type GroupBy, type SortField} from './sort-controls.model'

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
