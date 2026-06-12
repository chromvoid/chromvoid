import {nothing} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import type {PMSummaryRailItem} from '../summary-rail'
import {pmOtpQuickViewModel, type PMOtpQuickViewRow} from './otp-quick-view.model'

type EmptyStateKind = 'unavailable' | 'empty' | 'filtered'

export abstract class PMOtpQuickViewBase extends ReatomLitElement {
  protected readonly model = pmOtpQuickViewModel

  protected handleClearFilters() {
    this.model.actions.clearFilters()
  }

  protected handleOpenEntry(event: Event) {
    const target = event.currentTarget as HTMLButtonElement | null
    this.model.actions.openEntryById(target?.value ?? '')
  }

  protected renderHeader(slot?: string) {
    return html`
      <header class="quick-view__header" slot=${slot ?? nothing} aria-label=${i18n('otp:quick_view:title')}>
        ${this.renderSearch()}
      </header>
    `
  }

  protected renderSummaryRail(slot?: string) {
    const summary = this.model.state.summary()

    return html`
      <pm-summary-rail
        slot=${slot ?? nothing}
        class="quick-view__summary-rail"
        .items=${this.getSummaryItems(summary)}
        .label=${i18n('otp:quick_view:summary:total')}
      ></pm-summary-rail>
    `
  }

  protected getSearchInputPreset(): string | undefined {
    return undefined
  }

  protected renderSearch() {
    const preset = this.getSearchInputPreset()
    return html`<pm-otp-quick-view-search preset=${preset ?? nothing}></pm-otp-quick-view-search>`
  }

  protected renderContent() {
    if (!this.model.state.hasRoot()) {
      return this.renderEmptyState('unavailable')
    }

    const rows = this.model.state.rows()
    if (rows.length === 0) {
      return this.renderEmptyState('empty')
    }

    const visibleRows = this.model.state.visibleRows()
    if (visibleRows.length === 0) {
      return this.renderEmptyState('filtered')
    }

    return html`<div class="rows" role="list">${visibleRows.map((row) => this.renderRow(row))}</div>`
  }

  protected renderRow(row: PMOtpQuickViewRow) {
    const openLabel = `${i18n('otp:quick_view:open')}: ${row.displayPath}`

    return html`
      <article class="row" role="listitem" data-row-id=${row.id}>
        <div class="row__meta">
          <button
            class="open-entry"
            type="button"
            value=${row.id}
            aria-label=${openLabel}
            title=${openLabel}
            @click=${this.handleOpenEntry}
          >
            <span class="row__entry-title row__path">${row.entryTitle}</span>
            ${row.otpDisplayLabel ? html`<span class="row__otp-label">${row.otpDisplayLabel}</span>` : nothing}
          </button>
          <span class="row__type" hidden>${row.otpType}</span>
        </div>
        <div class="row__otp">
          <pm-entry-otp-item .otp=${row.otp} role="listitem" aria-label=${row.otpLabel || row.entryTitle}></pm-entry-otp-item>
        </div>
      </article>
    `
  }

  private getSummaryItems(summary: {total: number; visible: number; totp: number; hotp: number}): PMSummaryRailItem[] {
    return [
      {id: 'total', label: i18n('otp:quick_view:summary:total'), value: summary.total},
      {id: 'visible', label: i18n('otp:quick_view:summary:visible'), value: summary.visible},
      {id: 'totp', label: i18n('otp:quick_view:summary:totp'), value: summary.totp},
      {id: 'hotp', label: i18n('otp:quick_view:summary:hotp'), value: summary.hotp},
    ]
  }

  private renderEmptyState(kind: EmptyStateKind) {
    const titleKey =
      kind === 'filtered'
        ? 'otp:quick_view:empty_filtered:title'
        : kind === 'unavailable'
          ? 'otp:quick_view:unavailable:title'
          : 'otp:quick_view:empty:title'
    const descriptionKey =
      kind === 'filtered'
        ? 'otp:quick_view:empty_filtered:description'
        : kind === 'unavailable'
          ? 'otp:quick_view:unavailable:description'
          : 'otp:quick_view:empty:description'

    return html`
      <cv-empty-state
        icon="shield-check"
        headline=${i18n(titleKey as never)}
        description=${i18n(descriptionKey as never)}
      >
        ${kind === 'filtered'
          ? html`
              <button slot="actions" class="clear-filters" type="button" @click=${this.handleClearFilters}>
                <cv-icon name="x" aria-hidden="true"></cv-icon>
                ${i18n('otp:quick_view:clear_filters')}
              </button>
            `
          : nothing}
      </cv-empty-state>
    `
  }
}
