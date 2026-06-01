import {nothing} from 'lit'
import type {CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import type {PMSummaryRailItem} from '../summary-rail'
import {pmOtpQuickViewModel, type PMOtpQuickViewRow} from './otp-quick-view.model'

type EmptyStateKind = 'unavailable' | 'empty' | 'filtered'

export abstract class PMOtpQuickViewBase extends ReatomLitElement {
  protected readonly model = pmOtpQuickViewModel

  protected handleQueryInput(event: CVInputInputEvent) {
    this.model.actions.setQuery(event.detail.value)
  }

  protected handleClearFilters() {
    this.model.actions.clearFilters()
  }

  protected handleOpenEntry(event: Event) {
    const target = event.currentTarget as HTMLButtonElement | null
    this.model.actions.openEntryById(target?.value ?? '')
  }

  protected renderHeader() {
    return html`
      <header class="quick-view__header" aria-label=${i18n('otp:quick_view:title')}>
        ${this.renderControls()}
      </header>
    `
  }

  protected renderSummaryRail() {
    const summary = this.model.state.summary()

    return html`
      <pm-summary-rail
        class="quick-view__summary-rail"
        .items=${this.getSummaryItems(summary)}
        .label=${i18n('otp:quick_view:summary:total')}
      ></pm-summary-rail>
    `
  }

  protected renderControls() {
    return html`
      <div class="controls">
        <cv-input
          class="search"
          type="search"
          size="small"
          .value=${this.model.state.query()}
          placeholder=${i18n('otp:quick_view:search')}
          aria-label=${i18n('otp:quick_view:search')}
          @cv-input=${this.handleQueryInput}
        >
          <cv-icon class="search__prefix-icon" name="search" slot="prefix" aria-hidden="true"></cv-icon>
        </cv-input>
        ${this.model.state.hasActiveFilters()
          ? html`
              <button
                class="clear-filters clear-filters--compact"
                type="button"
                aria-label=${i18n('otp:quick_view:clear_filters')}
                title=${i18n('otp:quick_view:clear_filters')}
                @click=${this.handleClearFilters}
              >
                <cv-icon name="x" aria-hidden="true"></cv-icon>
              </button>
            `
          : nothing}
      </div>
    `
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
    const title = row.otpLabel ? `${row.entryTitle} / ${row.otpLabel}` : row.entryTitle
    const openLabel = `${i18n('otp:quick_view:open')}: ${row.entryTitle}`

    return html`
      <article class="row" role="listitem" data-row-id=${row.id}>
        <div class="row__meta">
          <div class="row__heading">
            <h3 class="row__title" title=${title}>
              <span class="row__entry-title">${row.entryTitle}</span>
              ${row.otpLabel
                ? html`
                    <span class="row__separator" aria-hidden="true">/</span>
                    <span class="row__otp-label">${row.otpLabel}</span>
                  `
                : nothing}
            </h3>
            <button
              class="open-entry"
              type="button"
              value=${row.id}
              aria-label=${openLabel}
              title=${openLabel}
              @click=${this.handleOpenEntry}
            >
              <cv-icon name="external-link" aria-hidden="true"></cv-icon>
              <span class="sr-only">${i18n('otp:quick_view:open')}</span>
            </button>
          </div>
          <div class="row__details">
            <span class="row__type">${row.otpType}</span>
            ${row.username ? html`<span class="row__detail">${row.username}</span>` : nothing}
            ${row.groupPath
              ? html`
                  <span
                    class="row__detail"
                    aria-label=${`${i18n('otp:quick_view:entry_group')}: ${row.groupPath}`}
                  >
                    ${row.groupPath}
                  </span>
                `
              : nothing}
            ${row.urlsText ? html`<span class="row__detail">${row.urlsText}</span>` : nothing}
          </div>
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
      <section class="empty-state" role="status">
        <cv-icon name="shield-check" size="lg" aria-hidden="true"></cv-icon>
        <p class="empty-state__title">${i18n(titleKey as never)}</p>
        <p class="empty-state__description">${i18n(descriptionKey as never)}</p>
        ${kind === 'filtered'
          ? html`
              <button class="clear-filters" type="button" @click=${this.handleClearFilters}>
                <cv-icon name="x" aria-hidden="true"></cv-icon>
                ${i18n('otp:quick_view:clear_filters')}
              </button>
            `
          : nothing}
      </section>
    `
  }
}
