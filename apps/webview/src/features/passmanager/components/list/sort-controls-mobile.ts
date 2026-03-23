import {css, html} from 'lit'
import type {TemplateResult} from 'lit'

import {i18n} from '@project/passmanager'

import {sortField, sortDirection, groupBy, type SortField, type GroupBy} from './sort-controls'
import {SortControlsBase} from './sort-controls-base'

/**
 * Mobile-optimized sort controls using touch-friendly chip selectors
 * inside a bottom sheet drawer.
 */
export class SortControlsMobile extends SortControlsBase {
  static define() {
    if (!customElements.get('pm-sort-controls-mobile')) {
      customElements.define('pm-sort-controls-mobile', this)
    }
  }

  static styles = css`
    :host {
      display: block;
    }

    /* ===== DRAG HANDLE ===== */
    .handle {
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background: color-mix(in oklch, var(--cv-color-text) 18%, transparent);
      margin: 0 auto 16px;
    }

    /* ===== SECTION ===== */
    .section {
      margin-bottom: 16px;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      padding-left: 2px;
    }

    .section-icon {
      width: 14px;
      height: 14px;
      color: var(--cv-color-primary);
      opacity: 0.7;
    }

    .section-label {
      font-size: 11px;
      color: var(--cv-color-text-muted);
      font-weight: var(--cv-font-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    /* ===== CHIPS ===== */
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .chip {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 8px 18px;
      border-radius: var(--cv-radius-2);
      border: 1.5px solid color-mix(in oklch, var(--cv-color-border) 70%, transparent);
      background: color-mix(in oklch, var(--cv-color-surface-2) 80%, transparent);
      color: var(--cv-color-text);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      box-shadow: 0 1px 2px color-mix(in oklch, black 6%, transparent);

      &:active {
        transform: scale(0.96);
        box-shadow: none;
      }

      &.active {
        border-color: var(--cv-color-primary);
        background: color-mix(in oklch, var(--cv-color-primary) 12%, transparent);
        color: var(--cv-color-primary);
        font-weight: 600;
        box-shadow:
          0 0 0 1px color-mix(in oklch, var(--cv-color-primary) 20%, transparent),
          0 1px 4px color-mix(in oklch, var(--cv-color-primary) 10%, transparent);
      }
    }

    /* ===== DIRECTION ROW ===== */
    .direction-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-bottom: 16px;
      margin-bottom: 16px;
      border-bottom: 1px solid color-mix(in oklch, var(--cv-color-border) 40%, transparent);
    }

    .direction-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 8px 22px;
      border-radius: var(--cv-radius-2);
      border: 1.5px solid color-mix(in oklch, var(--cv-color-border) 70%, transparent);
      background: color-mix(in oklch, var(--cv-color-surface-2) 80%, transparent);
      color: var(--cv-color-text);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      gap: 8px;
      box-shadow: 0 1px 2px color-mix(in oklch, black 6%, transparent);

      &:active {
        transform: scale(0.96);
      }

      cv-icon {
        width: 14px;
        height: 14px;
        transition: transform var(--cv-duration-fast) var(--cv-easing-spring);
      }

      &.desc cv-icon {
        transform: rotate(180deg);
      }
    }

    .direction-label {
      font-size: 11px;
      color: var(--cv-color-text-muted);
      font-weight: var(--cv-font-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
  `

  private readonly sortFields: {value: SortField; label: () => string}[] = [
    {value: 'name', label: () => i18n('sort:name')},
    {value: 'username', label: () => i18n('sort:username')},
    {value: 'modified', label: () => i18n('sort:modified')},
    {value: 'created', label: () => i18n('sort:created')},
    {value: 'website', label: () => i18n('sort:website')},
  ]

  private readonly groupOptions: {value: GroupBy; label: () => string}[] = [
    {value: 'none', label: () => i18n('group:none')},
    {value: 'folder', label: () => i18n('group:folder')},
    {value: 'website', label: () => i18n('group:website')},
    {value: 'modified', label: () => i18n('group:modified')},
    {value: 'security', label: () => i18n('group:security')},
  ]

  private onSortFieldSelect = (field: SortField) => {
    this.setSortField(field)
  }

  private onToggleDirection = () => {
    this.toggleDirection()
  }

  private onGroupBySelect = (value: GroupBy) => {
    this.setGroupBy(value)
  }

  render(): TemplateResult {
    const currentSort = sortField()
    const currentDir = sortDirection()
    const currentGroup = groupBy()

    return html`
      <div class="handle"></div>

      <div class="section">
        <div class="section-header">
          <cv-icon name="arrow-up-down" class="section-icon"></cv-icon>
          <span class="section-label">${i18n('sort-by')}</span>
        </div>
        <div class="chips">
          ${this.sortFields.map(
            (f) => html`
              <button
                class="chip ${currentSort === f.value ? 'active' : ''}"
                @click=${() => this.onSortFieldSelect(f.value)}
              >
                ${f.label()}
              </button>
            `,
          )}
        </div>
      </div>

      <div class="direction-row">
        <span class="direction-label">${i18n('sort:direction')}</span>
        <button
          class="direction-toggle ${currentDir === 'desc' ? 'desc' : ''}"
          @click=${this.onToggleDirection}
        >
          <cv-icon name="arrow-up"></cv-icon>
          ${currentDir === 'asc' ? i18n('sort:direction:asc') : i18n('sort:direction:desc')}
        </button>
      </div>

      <div class="section">
        <div class="section-header">
          <cv-icon name="layers" class="section-icon"></cv-icon>
          <span class="section-label">${i18n('group-by')}</span>
        </div>
        <div class="chips">
          ${this.groupOptions.map(
            (g) => html`
              <button
                class="chip ${currentGroup === g.value ? 'active' : ''}"
                @click=${() => this.onGroupBySelect(g.value)}
              >
                ${g.label()}
              </button>
            `,
          )}
        </div>
      </div>
    `
  }
}
