import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {css, type TemplateResult} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import {pmMobileChromeModel} from '../../models/pm-mobile-chrome.model'
import {
  groupBy,
  sortDirection,
  sortField,
  type GroupBy,
  type SortDirection,
  type SortField,
} from './sort-controls'
import {GROUP_BY_OPTIONS, SORT_FIELD_OPTIONS} from './sort-options'

type BottomSheetChangeEvent = CustomEvent<{open: boolean}>

type SortFieldChip = {
  value: SortField
  icon: string
  label: () => string
}

type SortDirectionChip = {
  value: SortDirection
  icon: string
  label: () => string
}

type GroupByChip = {
  value: GroupBy
  icon: string
  label: () => string
}

const SORT_FIELD_CHIPS: readonly SortFieldChip[] = [
  {value: 'name', icon: 'arrow-up-a-z', label: () => i18n('sort:name')},
  {value: 'username', icon: 'user-circle', label: () => i18n('sort:username-short')},
  {value: 'modified', icon: 'history', label: () => i18n('sort:modified')},
  {value: 'created', icon: 'calendar', label: () => i18n('sort:created')},
  {value: 'website', icon: 'globe', label: () => i18n('sort:website')},
]

const SORT_DIRECTION_CHIPS: readonly SortDirectionChip[] = [
  {value: 'asc', icon: 'arrow-up', label: () => i18n('sort:direction:asc-short')},
  {value: 'desc', icon: 'arrow-down', label: () => i18n('sort:direction:desc-short')},
]

const GROUP_BY_CHIPS: readonly GroupByChip[] = [
  {value: 'none', icon: 'circle-minus', label: () => i18n('group:none-short')},
  {value: 'website', icon: 'globe', label: () => i18n('group:website-short')},
  {value: 'modified', icon: 'calendar-clock', label: () => i18n('group:modified-short')},
  {value: 'security', icon: 'shield-check', label: () => i18n('group:security-short')},
]

function isSortField(value: string | undefined): value is SortField {
  return SORT_FIELD_OPTIONS.some((item) => item.value === value)
}

function isSortDirection(value: string | undefined): value is SortDirection {
  return SORT_DIRECTION_CHIPS.some((item) => item.value === value)
}

function isGroupBy(value: string | undefined): value is GroupBy {
  return GROUP_BY_OPTIONS.some((item) => item.value === value)
}

export class PMMobileSortGroupSheet extends ReatomLitElement {
  static elementName = 'pm-mobile-sort-group-sheet'

  static define(): void {
    CVBottomSheet.define()
    CVIcon.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = css`
    :host {
      display: contents;
    }

    cv-bottom-sheet {
      --cv-bottom-sheet-z-index: calc(var(--cv-z-overlay, 300) + 32);
      --cv-bottom-sheet-overlay-color: var(--cv-alpha-black-50);
      --cv-bottom-sheet-max-height: min(76dvh, calc(100dvh - 24px));
      --cv-bottom-sheet-border-radius: 18px 18px 0 0;
      --cv-bottom-sheet-grabber-color: var(--cv-color-primary-border-strong);
    }

    cv-bottom-sheet::part(content) {
      border-color: var(--cv-color-border-strong);
      background: var(--cv-color-surface-elevated);
      box-shadow: var(--cv-shadow-4);
    }

    cv-bottom-sheet::part(header) {
      padding: 0 var(--cv-space-4) var(--cv-space-1);
      border-block-end: 1px solid var(--cv-color-border-glass);
    }

    cv-bottom-sheet::part(title) {
      font-size: var(--cv-font-size-base);
      font-weight: var(--cv-font-weight-semibold);
      color: var(--cv-color-text);
    }

    cv-bottom-sheet::part(body) {
      padding: 0;
    }

    cv-bottom-sheet::part(footer) {
      display: flex;
      gap: var(--cv-space-2);
      padding: var(--cv-space-3) var(--cv-space-4) max(var(--cv-space-3), env(safe-area-inset-bottom, 0px));
      border-block-start: 1px solid var(--cv-color-border-glass);
      background: var(--cv-color-surface-elevated);
    }

    .sheet-body {
      display: grid;
      gap: var(--cv-space-3);
      padding: var(--cv-space-3) var(--cv-space-4);
    }

    .section {
      display: grid;
      gap: var(--cv-space-2);
    }

    .section + .section {
      padding-block-start: var(--cv-space-3);
      border-block-start: 1px solid var(--cv-color-border-glass);
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: var(--cv-space-2);
      min-inline-size: 0;
    }

    .section-header cv-icon {
      inline-size: 14px;
      block-size: 14px;
      color: var(--cv-color-primary);
      opacity: 0.82;
    }

    .section-label {
      min-inline-size: 0;
      font-family: var(--cv-font-family-code);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
      color: var(--cv-color-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chips {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--cv-space-2);
    }

    .chip {
      min-block-size: 44px;
      border-radius: var(--cv-radius-2);
      border: 1px solid var(--cv-color-border-soft);
      background: var(--cv-color-surface-secondary-glass);
      color: var(--cv-color-text);
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-medium);
      box-shadow:
        inset 0 1px 0 var(--cv-alpha-white-4),
        0 1px 2px var(--cv-alpha-black-10);
      -webkit-tap-highlight-color: transparent;
    }

    .chip {
      min-inline-size: 0;
    }

    .chip::part(base),
    .footer-action::part(base) {
      min-block-size: inherit;
    }

    .chip::part(base) {
      justify-content: flex-start;
      gap: var(--cv-space-2);
      padding-inline: var(--cv-space-3);
    }

    .chip:active,
    .footer-action:active {
      transform: scale(0.97);
    }

    .chip.active {
      border-color: var(--cv-color-primary-border-strong);
      background: var(--cv-color-primary-surface);
      color: var(--cv-color-primary);
      box-shadow:
        inset 0 0 0 1px var(--cv-color-primary-ring),
        0 1px 6px var(--cv-color-primary-subtle);
    }

    .chip cv-icon {
      inline-size: 18px;
      block-size: 18px;
      color: var(--cv-color-text-muted);
      flex: 0 0 auto;
    }

    .chip.active cv-icon {
      color: currentColor;
    }

    .chip::part(label) {
      flex: 1 1 auto;
      justify-content: flex-start;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .footer-action {
      flex: 1 1 0;
      min-block-size: 44px;
    }

    @media (max-width: 360px) {
      .sheet-body {
        padding-inline: var(--cv-space-3);
      }

      cv-bottom-sheet::part(header),
      cv-bottom-sheet::part(footer) {
        padding-inline: var(--cv-space-3);
      }

      .chip {
        font-size: var(--cv-font-size-xs);
      }

      .chip::part(base) {
        padding-inline: var(--cv-space-2);
      }
    }
  `

  private handleSheetChange(event: BottomSheetChangeEvent): void {
    if (!event.detail.open) {
      pmMobileChromeModel.closeSortGroupSheet()
    }
  }

  private handleSortFieldClick(event: Event): void {
    const value = (event.currentTarget as HTMLElement | null)?.dataset['value']
    if (isSortField(value)) {
      pmMobileChromeModel.setSortField(value)
    }
  }

  private handleGroupByClick(event: Event): void {
    const value = (event.currentTarget as HTMLElement | null)?.dataset['value']
    if (isGroupBy(value)) {
      pmMobileChromeModel.setGroupBy(value)
    }
  }

  private handleDirectionClick(event: Event): void {
    const value = (event.currentTarget as HTMLElement | null)?.dataset['value']
    if (isSortDirection(value)) {
      pmMobileChromeModel.setSortDirection(value)
    }
  }

  private handleReset(): void {
    pmMobileChromeModel.resetSortGrouping()
  }

  private handleDone(): void {
    pmMobileChromeModel.closeSortGroupSheet()
  }

  private renderSortFieldChips(currentSortField: SortField): TemplateResult {
    return html`
      <div class="chips" role="radiogroup" aria-label=${i18n('sort-by')}>
        ${SORT_FIELD_CHIPS.map((item) => {
          const active = item.value === currentSortField
          return html`
            <cv-button unstyled
              type="button"
              class="chip ${active ? 'active' : ''}"
              data-value=${item.value}
              role="radio"
              aria-checked=${String(active)}
              aria-label=${item.label()}
              @click=${this.handleSortFieldClick}
            >
              <cv-icon slot="prefix" name=${item.icon} aria-hidden="true"></cv-icon>
              ${item.label()}
            </cv-button>
          `
        })}
      </div>
    `
  }

  private renderDirectionChips(currentDirection: SortDirection): TemplateResult {
    return html`
      <div class="chips" role="radiogroup" aria-label=${i18n('sort:order')}>
        ${SORT_DIRECTION_CHIPS.map((item) => {
          const active = item.value === currentDirection
          return html`
            <cv-button unstyled
              type="button"
              class="chip ${active ? 'active' : ''}"
              data-value=${item.value}
              role="radio"
              aria-checked=${String(active)}
              aria-label=${item.label()}
              @click=${this.handleDirectionClick}
            >
              <cv-icon slot="prefix" name=${item.icon} aria-hidden="true"></cv-icon>
              ${item.label()}
            </cv-button>
          `
        })}
      </div>
    `
  }

  private renderGroupByChips(currentGroupBy: GroupBy): TemplateResult {
    return html`
      <div class="chips" role="radiogroup" aria-label=${i18n('group-by')}>
        ${GROUP_BY_CHIPS.map((item) => {
          const active = item.value === currentGroupBy
          return html`
            <cv-button unstyled
              type="button"
              class="chip ${active ? 'active' : ''}"
              data-value=${item.value}
              role="radio"
              aria-checked=${String(active)}
              aria-label=${item.label()}
              @click=${this.handleGroupByClick}
            >
              <cv-icon slot="prefix" name=${item.icon} aria-hidden="true"></cv-icon>
              ${item.label()}
            </cv-button>
          `
        })}
      </div>
    `
  }

  protected render(): TemplateResult {
    const open = pmMobileChromeModel.sortGroupSheetOpen()
    const currentSortField = sortField()
    const currentDirection = sortDirection()
    const currentGroupBy = groupBy()
    const hasActiveSortGrouping = pmMobileChromeModel.hasActiveSortGrouping()

    return html`
      <cv-bottom-sheet
        .open=${open}
        show-handle
        drag-to-close
        @cv-change=${this.handleSheetChange}
      >
        <span slot="title">${i18n('sort-group:title' as never)}</span>
        <div class="sheet-body">
          <section class="section">
            <div class="section-header">
              <cv-icon name="arrow-up-down" aria-hidden="true"></cv-icon>
              <span class="section-label">${i18n('sort-by-short')}</span>
            </div>
            ${this.renderSortFieldChips(currentSortField)}
          </section>

          <section class="section">
            <div class="section-header">
              <cv-icon name="arrow-up-down" aria-hidden="true"></cv-icon>
              <span class="section-label">${i18n('sort:order')}</span>
            </div>
            ${this.renderDirectionChips(currentDirection)}
          </section>

          <section class="section">
            <div class="section-header">
              <cv-icon name="layers" aria-hidden="true"></cv-icon>
              <span class="section-label">${i18n('group-by-short')}</span>
            </div>
            ${this.renderGroupByChips(currentGroupBy)}
          </section>
        </div>

        <cv-button
          slot="footer"
          type="button"
          class="footer-action"
          variant="ghost"
          ?disabled=${!hasActiveSortGrouping}
          @click=${this.handleReset}
        >
          ${i18n('button:reset')}
        </cv-button>
        <cv-button
          slot="footer"
          type="button"
          class="footer-action"
          variant="primary"
          @click=${this.handleDone}
        >
          ${i18n('button:done')}
        </cv-button>
      </cv-bottom-sheet>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-mobile-sort-group-sheet': PMMobileSortGroupSheet
  }
}
