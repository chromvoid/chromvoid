import type {CredentialCandidate} from '@chromvoid/scheme'
import {ReatomLitElement, html} from '@chromvoid/uikit/reatom-lit'
import type {PropertyValues} from 'lit'

import {appStyles} from './app.styles'
import type {CredentialRow} from './components/credential-row'
import {i18n} from './i18n'
import type {PopupActionKind, PopupModel, PopupRuntimeKind} from './popup.model'

type CandidateEvent = CustomEvent<{candidate: CredentialCandidate}>
type CredentialActionEvent = CustomEvent<{
  kind: PopupActionKind
  candidate: CredentialCandidate
  otpId?: string
}>

export class AppRoot extends ReatomLitElement {
  static styles = appStyles
  private static configuredModel: PopupModel | undefined
  private searchFocused = false
  private pendingFocus: {kind: 'back' | 'search'} | {kind: 'credential'; credentialId: string} | undefined

  static configure(model: PopupModel) {
    this.configuredModel = model
  }

  static define() {
    if (!customElements.get('app-root')) {
      customElements.define('app-root', AppRoot)
    }
  }

  private get model(): PopupModel {
    const model = AppRoot.configuredModel
    if (!model) {
      throw new Error('AppRoot must be configured with a PopupModel before it is connected')
    }
    return model
  }

  override connectedCallback() {
    super.connectedCallback()
    this.model.connect()
  }

  override disconnectedCallback() {
    this.model.disconnect()
    super.disconnectedCallback()
  }

  protected override updated(changedProperties: PropertyValues<this>) {
    super.updated(changedProperties)
    const pendingFocus = this.pendingFocus
    this.pendingFocus = undefined
    if (pendingFocus?.kind === 'back') {
      this.renderRoot.querySelector<HTMLButtonElement>('.back-button')?.focus()
      return
    }
    if (pendingFocus?.kind === 'search') {
      this.renderRoot.querySelector<HTMLInputElement>('.search-input')?.focus()
      return
    }
    if (pendingFocus?.kind === 'credential') {
      const rows = this.renderRoot.querySelectorAll<CredentialRow>('credential-row')
      for (const row of rows) {
        if (row.candidate?.credential_id === pendingFocus.credentialId) {
          void this.focusCredentialRow(row)
          return
        }
      }
    }
    if (this.model.runtime().kind !== 'ready') {
      this.searchFocused = false
      return
    }
    if (!this.searchFocused) {
      this.renderRoot.querySelector<HTMLInputElement>('.search-input')?.focus()
      this.searchFocused = true
    }
  }

  private handleSearchInput(event: Event) {
    this.model.setQuery((event.currentTarget as HTMLInputElement).value)
  }

  private async focusCredentialRow(row: CredentialRow) {
    await row.updateComplete
    row.focusPrimary()
  }

  private handleCredentialOpen(event: CandidateEvent) {
    this.pendingFocus = {kind: 'back'}
    this.model.openDetail(event.detail.candidate)
  }

  private handleCredentialFill(event: CandidateEvent) {
    void this.model.fillPassword(event.detail.candidate)
  }

  private handleCredentialAction(event: CredentialActionEvent) {
    const {kind, candidate, otpId} = event.detail
    void this.model.performAction(kind, candidate, otpId)
  }

  private handleOtpChange(event: CustomEvent<{otpId: string}>) {
    this.model.setSelectedOtp(event.detail.otpId)
  }

  private handlePairingPin(event: CustomEvent<{pin: string}>) {
    this.model.setPairingPin(event.detail.pin)
  }

  private handlePairingSubmit() {
    void this.model.pair()
  }

  private handleRetry() {
    this.model.retry()
  }

  private handleSearchRetry() {
    this.model.retrySearch()
  }

  private handleBack() {
    const credentialId = this.model.selectedCandidate()?.credential_id
    if (credentialId) {
      this.pendingFocus = {kind: 'credential', credentialId}
    }
    this.model.closeDetail()
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') {
      return
    }
    if (this.model.isDetailMode()) {
      event.preventDefault()
      this.handleBack()
      return
    }
    if (this.model.query()) {
      event.preventDefault()
      this.pendingFocus = {kind: 'search'}
      this.model.setQuery('')
    }
  }

  private renderHeader() {
    const runtime = this.model.runtime()
    const detail = this.model.isDetailMode()
    const context = this.model.currentHost() || i18n('app.nonWebPage')
    return html`
      <header class="topbar">
        ${detail
          ? html`<button
              class="back-button"
              type="button"
              @click=${this.handleBack}
              aria-label=${i18n('app.back')}
            >
              ←
            </button>`
          : html`<div class="brand-mark" aria-hidden="true">C</div>`}
        <div class="identity">
          <span class="title">${i18n('app.title')}</span>
          <span class="context">${context}</span>
        </div>
        <span class=${`health ${runtime.kind === 'ready' ? 'ready' : ''}`}>
          <span class="health-dot" aria-hidden="true"></span>
          ${this.runtimeLabel(runtime.kind)}
        </span>
      </header>
    `
  }

  private runtimeLabel(kind: PopupRuntimeKind): string {
    switch (kind) {
      case 'ready':
        return i18n('app.ready')
      case 'checking':
        return i18n('app.status.checking')
      case 'gateway_offline':
        return i18n('app.status.offline')
      case 'unpaired':
        return i18n('app.status.pairing')
      case 'provider_disabled':
        return i18n('app.status.disabled')
      case 'vault_locked':
        return i18n('app.status.locked')
      case 'load_error':
        return i18n('app.status.error')
    }
  }

  private renderSearch() {
    if (this.model.runtime().kind !== 'ready') {
      return null
    }
    return html`
      <div class="search-region">
        <label class="visually-hidden" for="credential-search">${i18n('search.label')}</label>
        <input
          class="search-input"
          id="credential-search"
          type="search"
          autocomplete="off"
          spellcheck="false"
          .value=${this.model.query()}
          placeholder=${i18n('search.placeholder')}
          @input=${this.handleSearchInput}
        />
      </div>
    `
  }

  private renderEmpty(title: string, body: string) {
    return html`
      <section class="empty">
        <div class="empty-content">
          <h2>${title}</h2>
          <p>${body}</p>
        </div>
      </section>
    `
  }

  private renderResults() {
    const candidates = this.model.visibleCandidates()
    const searchMode = this.model.isSearchMode()
    const searchPending = this.model.search.pending() > 0
    const searchError = this.model.searchError()

    if (!searchMode && !this.model.isWebTab()) {
      return this.renderEmpty(i18n('empty.nonWebTitle'), i18n('empty.nonWebBody'))
    }
    if (!candidates.length && searchPending) {
      return html`<div class="loading" role="status">${i18n('search.loading')}</div>`
    }
    if (!candidates.length && searchMode && searchError) {
      return html`
        <section class="empty">
          <div class="empty-content">
            <h2>${i18n('recovery.loadErrorTitle')}</h2>
            <p role="alert">${searchError}</p>
            <button type="button" @click=${this.handleSearchRetry}>${i18n('action.retry')}</button>
          </div>
        </section>
      `
    }
    if (!candidates.length) {
      return this.renderEmpty(
        searchMode ? i18n('empty.searchTitle') : i18n('empty.siteTitle'),
        searchMode ? i18n('empty.searchBody') : i18n('empty.siteBody'),
      )
    }

    const countLabel =
      candidates.length === 1
        ? i18n('section.result.one')
        : i18n('section.result.many', {count: candidates.length})
    return html`
      <section aria-labelledby="result-heading" aria-busy=${searchPending ? 'true' : 'false'}>
        <div class="section-header">
          <span id="result-heading"
            >${searchMode ? i18n('section.searchResults') : i18n('section.currentSite')}</span
          >
          <span class="search-state" aria-live="polite"
            >${searchPending ? i18n('search.loading') : countLabel}</span
          >
        </div>
        ${searchError ? html`<p class="message error" role="alert">${searchError}</p>` : null}
        <div class="list" role="list">
          ${candidates.map(
            (candidate) =>
              html`<credential-row
                role="listitem"
                .candidate=${candidate}
                .currentSite=${this.model.isCurrentSite(candidate)}
                .pending=${this.model.pendingAction() === 'fill_password'}
              ></credential-row>`,
          )}
        </div>
      </section>
    `
  }

  private renderReady() {
    const selected = this.model.selectedCandidate()
    if (selected) {
      return html`<credential-detail
        .candidate=${selected}
        .currentSite=${this.model.isCurrentSite(selected)}
        .selectedOtpId=${this.model.selectedOtpId()}
        .pending=${Boolean(this.model.pendingAction())}
      ></credential-detail>`
    }
    return this.renderResults()
  }

  private renderContent() {
    const runtime = this.model.runtime()
    if (runtime.kind === 'checking') {
      return html`<div class="loading" role="status">${i18n('loading.checking')}</div>`
    }
    if (runtime.kind === 'unpaired') {
      return html`
        <section class="pairing" aria-labelledby="pairing-title">
          <div class="pairing-content">
            <h2 id="pairing-title">${i18n('recovery.unpairedTitle')}</h2>
            <p>${i18n('recovery.unpairedBody')}</p>
            <ext-pairing-form
              .pin=${this.model.pairingPin()}
              .pinError=${this.model.pairingPinError()}
              .backendError=${this.model.pairingError()}
              .pending=${this.model.pair.pending() > 0}
              .focusRequest=${this.model.pairingFocusRequest()}
            ></ext-pairing-form>
          </div>
        </section>
      `
    }
    if (runtime.kind !== 'ready') {
      return html`<recovery-state .state=${runtime}></recovery-state>`
    }
    return this.renderReady()
  }

  protected override render() {
    const feedback = this.model.feedback()
    const actionError = this.model.actionError()
    return html`
      <div
        class="shell"
        @keydown=${this.handleKeydown}
        @credential-open=${this.handleCredentialOpen}
        @credential-fill=${this.handleCredentialFill}
        @credential-action=${this.handleCredentialAction}
        @credential-otp-change=${this.handleOtpChange}
        @pairing-pin-input=${this.handlePairingPin}
        @pairing-submit=${this.handlePairingSubmit}
        @recovery-retry=${this.handleRetry}
      >
        ${this.renderHeader()} ${this.renderSearch()}
        <main class="content">${this.renderContent()}</main>
        <div class="message-stack">
          ${actionError ? html`<p class="message error" role="alert">${actionError}</p>` : null}
          ${feedback ? html`<p class="message" role="status" aria-live="polite">${feedback}</p>` : null}
        </div>
      </div>
    `
  }
}
