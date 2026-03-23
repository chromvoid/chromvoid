import {stateLocalStorage} from '@statx/persist'

import {css, html} from 'lit'
import type {TemplateResult} from 'lit'
import type {CVSelectChangeEvent} from '@chromvoid/uikit'

import {i18n} from '@project/passmanager'

import {SortControlsBase} from './sort-controls-base'

// Типы сортировки
export type SortField = 'name' | 'username' | 'modified' | 'created' | 'website'
export type SortDirection = 'asc' | 'desc'
export type GroupBy = 'none' | 'folder' | 'website' | 'modified' | 'security'

// Глобальное состояние сортировки и группировки
export const sortField = stateLocalStorage<SortField>('name', {name: 'pm_sort_field'})
export const sortDirection = stateLocalStorage<SortDirection>('asc', {name: 'pm_sort_direction'})
export const groupBy = stateLocalStorage<GroupBy>('none', {name: 'pm_group_by'})

export class SortControls extends SortControlsBase {
  static define() {
    customElements.define('pm-sort-controls', this)
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

    /* ===== CONTROL GROUP ===== */
    .control-group {
      display: grid;
      align-items: center;
      grid-template-columns: min-content auto;
      grid-auto-flow: column;
      gap: var(--cv-space-2);
      background: linear-gradient(
        145deg,
        color-mix(in oklch, var(--cv-color-surface-2) 85%, var(--cv-color-primary) 3%) 0%,
        color-mix(in oklch, var(--cv-color-surface-2) 95%, transparent) 100%
      );
      border: 1px solid color-mix(in oklch, var(--cv-color-border) 60%, transparent);
      border-radius: var(--cv-radius-2);
      padding: var(--cv-space-2) var(--cv-space-3);
      position: relative;
      overflow: hidden;
      box-shadow:
        inset 0 1px 0 color-mix(in oklch, white 4%, transparent),
        0 1px 2px color-mix(in oklch, black 4%, transparent);

      &::before {
        content: '';
        position: absolute;
        left: 0;
        top: 4px;
        bottom: 4px;
        width: 2px;
        border-radius: 0 2px 2px 0;
        background: var(--cv-color-primary);
        opacity: 0;
        transform: scaleY(0.3);
        transition:
          opacity var(--cv-duration-fast) var(--cv-easing-standard),
          transform var(--cv-duration-fast) var(--cv-easing-standard);
      }

      &:hover {
        border-color: color-mix(in oklch, var(--cv-color-border) 40%, var(--cv-color-primary) 40%);
        box-shadow:
          inset 0 1px 0 color-mix(in oklch, white 6%, transparent),
          0 2px 8px color-mix(in oklch, var(--cv-color-primary) 8%, transparent);

        &::before {
          opacity: 1;
          transform: scaleY(1);
        }

        .control-label {
          opacity: 1;
          color: var(--cv-color-primary);
        }
      }
    }

    /* ===== LABELS ===== */
    .control-label {
      font-size: var(--cv-font-size-xs);
      color: var(--cv-color-text-muted);
      font-weight: var(--cv-font-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      white-space: nowrap;
      opacity: 0.7;
      transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .dd-container {
      display: flex;
      justify-content: end;
      min-width: 0;
    }

    .dd-container cv-select {
      --cv-select-inline-size: 100%;
    }

    /* ===== SORT DIRECTION BUTTON ===== */
    .sort-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: calc(var(--cv-space-2) * 0.75);
      width: 32px;
      height: 32px;
      border: 1px solid color-mix(in oklch, var(--cv-color-border) 60%, transparent);
      background: linear-gradient(
        145deg,
        color-mix(in oklch, var(--cv-color-surface-2) 95%, white 5%) 0%,
        var(--cv-color-surface-2) 100%
      );
      border-radius: var(--cv-radius-2);
      cursor: pointer;
      color: var(--cv-color-text-muted);
      box-shadow:
        0 1px 2px color-mix(in oklch, black 6%, transparent),
        inset 0 1px 0 color-mix(in oklch, white 6%, transparent);

      &:hover {
        background: linear-gradient(
          145deg,
          color-mix(in oklch, var(--cv-color-primary) 15%, transparent) 0%,
          color-mix(in oklch, var(--cv-color-primary) 8%, transparent) 100%
        );
        border-color: var(--cv-color-primary);
        color: var(--cv-color-primary);
        transform: scale(1.08);
        box-shadow:
          0 2px 8px color-mix(in oklch, var(--cv-color-primary) 20%, transparent),
          inset 0 1px 0 color-mix(in oklch, white 10%, transparent);
      }

      &:active {
        transform: scale(0.95);
        box-shadow: inset 0 1px 3px color-mix(in oklch, black 10%, transparent);
      }
    }

    .sort-icon {
      width: 16px;
      height: 16px;
      transition: transform var(--cv-duration-fast) var(--cv-easing-spring);

      &.desc {
        transform: rotate(180deg);
      }
    }

    /* ===== RESPONSIVE ===== */
    @container (width < 400px) {
      .sort-controls {
        gap: calc(var(--cv-space-2) * 0.75);
      }

      .control-group {
        padding: calc(var(--cv-space-2) * 0.75) var(--cv-space-2);
      }
    }

    @container (width < 250px) {
      .control-label {
        display: none;
      }
    }
  `

  private onSortFieldChange = (field: SortField) => {
    this.setSortField(field)
  }

  private onToggleDirection = () => {
    this.toggleDirection()
  }

  private onGroupByChange = (event: CVSelectChangeEvent) => {
    const value = event.detail.value as GroupBy | null
    if (value) {
      this.setGroupBy(value)
    }
  }

  private onSortDropdownSelect = (event: CVSelectChangeEvent) => {
    const field = event.detail.value as SortField | null
    if (field) {
      this.onSortFieldChange(field)
    }
  }

  private getSortLabel(field: SortField): string {
    switch (field) {
      case 'name':
        return i18n('sort:name')
      case 'username':
        return i18n('sort:username')
      case 'modified':
        return i18n('sort:modified')
      case 'created':
        return i18n('sort:created')
      case 'website':
        return i18n('sort:website')
      default:
        return field
    }
  }

  private renderGroupSection(): TemplateResult {
    const currentGroupBy = groupBy()
    return html`
      <div class="control-group">
        <span class="control-label">${i18n('group-by')}</span>
        <div class="dd-container">
          <cv-select
            size="small"
            .value=${currentGroupBy}
            aria-label=${i18n('group-by')}
            @cv-change=${this.onGroupByChange}
          >
            <cv-select-option value="none">${i18n('group:none')}</cv-select-option>
            <cv-select-option value="folder">${i18n('group:folder')}</cv-select-option>
            <cv-select-option value="website">${i18n('group:website')}</cv-select-option>
            <cv-select-option value="modified">${i18n('group:modified')}</cv-select-option>
            <cv-select-option value="security">${i18n('group:security')}</cv-select-option>
          </cv-select>
        </div>
      </div>
    `
  }

  private renderSortSection(): TemplateResult {
    const currentSortField = sortField()
    return html`
      <div class="control-group">
        <span class="control-label">${i18n('sort-by')}</span>
        <button
          class="sort-button"
          @click=${this.onToggleDirection}
          title=${sortDirection() === 'asc' ? i18n('sort:direction:asc') : i18n('sort:direction:desc')}
        >
          <cv-icon name="arrow-up" class="sort-icon ${sortDirection() === 'desc' ? 'desc' : ''}"></cv-icon>
        </button>

        <div class="dd-container">
          <cv-select
            size="small"
            .value=${currentSortField}
            aria-label=${i18n('sort-by')}
            @cv-change=${this.onSortDropdownSelect}
          >
            <cv-select-option value="name">${i18n('sort:name')}</cv-select-option>
            <cv-select-option value="username">${i18n('sort:username')}</cv-select-option>
            <cv-select-option value="modified">${i18n('sort:modified')}</cv-select-option>
            <cv-select-option value="created">${i18n('sort:created')}</cv-select-option>
            <cv-select-option value="website">${i18n('sort:website')}</cv-select-option>
          </cv-select>
        </div>
      </div>
    `
  }

  render(): TemplateResult {
    return html`<div class="sort-controls">${this.renderGroupSection()} ${this.renderSortSection()}</div>`
  }
}
