import {CVDialog} from '@chromvoid/uikit/components/cv-dialog'
import {CVQrCode} from '@chromvoid/uikit/components/cv-qr-code'
import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'
import {renderRouteBackLink} from 'root/shared/ui/route-back-link'
import {shortenAddress} from './wallet-format'
import {
  walletAccountAddress,
  walletAccountContract,
  walletAccountId,
  walletAccountLabel,
  formatWalletTransactionAmount,
  walletTransactionCounterpartyLabel,
  walletTransactionDirectionLabel,
  type WalletAccount,
  type WalletMode,
  type WalletTransaction,
} from './wallet-page.types'
import {WalletPageLayoutBase} from './wallet-page-layout-base'
import {walletPageStyles} from './wallet-page.styles'
import {WalletSendForm} from './wallet-send-form'
import {renderWalletMnemonic, renderWalletSetup, type WalletSetupMode} from './wallet-setup.render'

export class WalletPageDesktopLayout extends WalletPageLayoutBase {
  static elementName = 'wallet-page-desktop-layout'
  static styles = walletPageStyles

  static define(): void {
    CVDialog.define()
    CVQrCode.define()
    WalletSendForm.define()
    if (!customElements.get(this.elementName)) customElements.define(this.elementName, this)
  }

  protected render(): TemplateResult {
    const status = this.model.status()
    const accounts = this.model.accounts()
    const error = this.model.error()
    const notice = this.model.notice()
    const receiveOpen = this.model.overlay() === 'receive'

    return html`
      <section class="page page-transition" aria-labelledby="wallet-title">
        ${this.renderHeader()}
        ${notice && !receiveOpen ? html`<div class="notice" role="status">${notice}</div>` : nothing}
        ${error && !receiveOpen ? html`<div class="error" role="alert">${error}</div>` : nothing}
        ${this.model.loading() && !status ? this.renderLoading() : nothing}
        ${status && !status.enabled ? this.renderDisabled(status.disabled_reason ?? '') : nothing}
        ${status?.enabled && accounts.length === 0 ? this.renderOnboarding() : nothing}
        ${status?.enabled && accounts.length > 0 ? this.renderWallet(accounts) : nothing}
        ${this.renderWalletSwitcherDialog()} ${this.renderReceiveDialog()}
      </section>
    `
  }

  private renderHeader(): TemplateResult {
    if (this.externalToolbar) {
      return html`<h1 id="wallet-title" class="sr-only">${i18n('wallet:title')}</h1>`
    }

    return html`
      <header class="wallet-header">
        <div class="wallet-heading">
          ${this.hideBackLink
            ? nothing
            : renderRouteBackLink({label: i18n('nav:back'), onBack: this.handleBack})}
          <span class="eyebrow">${i18n('wallet:eyebrow')}</span>
          <h1 id="wallet-title">${i18n('wallet:title')}</h1>
          <p class="muted">${i18n('wallet:subtitle')}</p>
        </div>
        ${this.model.accounts().length > 0
          ? html`
              <div class="toolbar">
                <button class="ghost" @click=${this.handleManualRefresh} ?disabled=${this.model.loading()}>
                  <cv-icon name="refresh-cw"></cv-icon>
                  ${i18n('wallet:action:refresh')}
                </button>
              </div>
            `
          : nothing}
      </header>
    `
  }

  private renderWalletSwitcherDialog(): TemplateResult {
    return html`
      <cv-dialog
        class="wallet-dialog"
        .open=${this.model.overlay() === 'wallet-switcher'}
        initial-focus-id="wallet-switcher-current"
        @cv-change=${this.handleCloseOverlay}
      >
        <span slot="title">${i18n('wallet:switcher:title')}</span>
        <span slot="description">${i18n('wallet:switcher:body')}</span>
        ${this.renderWalletOptions(false)}
      </cv-dialog>
    `
  }

  private renderReceiveDialog(): TemplateResult {
    return html`
      <cv-dialog
        class="receive-dialog"
        .open=${this.model.overlay() === 'receive'}
        initial-focus-id=${this.model.selectedAddress() ? 'wallet-receive-copy' : 'wallet-receive-generate'}
        @cv-change=${this.handleCloseOverlay}
      >
        <span slot="title">${i18n('wallet:receive:title')}</span>
        <span slot="description">${i18n('wallet:receive:body')}</span>
        ${this.renderReceiveContent()}
      </cv-dialog>
    `
  }

  private renderLoading(): TemplateResult {
    return html`<section class="card panel" aria-busy="true">${i18n('wallet:loading')}</section>`
  }

  private renderDisabled(reason: string): TemplateResult {
    return html`
      <section class="card panel">
        <h2>${i18n('wallet:disabled:title')}</h2>
        <p class="muted">${reason || i18n('wallet:disabled:body')}</p>
      </section>
    `
  }

  private renderOnboarding(): TemplateResult {
    const mode = this.model.mode()
    return html`
      <section class="card panel">
        <h2>${i18n('wallet:onboarding:title')}</h2>
        <p class="muted">${i18n('wallet:onboarding:body')}</p>
        <div class="tabs" role="group" aria-label=${i18n('wallet:onboarding:title')}>
          ${this.renderModeButton('create', 'wallet:mode:create', mode)}
          ${this.renderModeButton('restore', 'wallet:mode:restore', mode)}
          ${this.renderModeButton('import', 'wallet:mode:import', mode)}
        </div>
        ${renderWalletSetup(this.setupMode(mode))}
      </section>
    `
  }

  private renderWallet(accounts: WalletAccount[]): TemplateResult {
    const mode = this.model.mode()
    const selectedNetwork = this.model.selectedAccount()?.network
    return html`
      <div class="wallet-grid">
        <aside class="card account-list" aria-label=${i18n('wallet:accounts:title')}>
          <div class="account-list-header">
            <h2>${i18n('wallet:accounts:title')}</h2>
            ${selectedNetwork && this.model.canDeriveAccount(selectedNetwork)
              ? html`
                  <button
                    class="ghost account-add-button"
                    data-network=${selectedNetwork}
                    @click=${this.handleDeriveAccount}
                    ?disabled=${this.model.deriveAccountLoading()}
                  >
                    <cv-icon name="plus"></cv-icon>
                    ${i18n('wallet:action:add-account')}
                  </button>
                `
              : nothing}
          </div>
          ${accounts.map((account) => this.renderAccountButton(account))}
        </aside>
        <main class="panel">
          <div class="tabs" role="group" aria-label=${i18n('wallet:title')}>
            ${this.renderModeButton('overview', 'wallet:mode:overview', mode)}
            ${this.renderModeButton('send', 'wallet:mode:send', mode)}
            ${this.renderModeButton('activity', 'wallet:mode:activity', mode)}
            ${this.renderModeButton('recovery', 'wallet:mode:recovery', mode)}
            ${this.renderModeButton('create', 'wallet:mode:create', mode)}
          </div>
          ${this.renderNetworkStatusCallout()}
          ${mode === 'send'
            ? this.renderSend()
            : mode === 'activity'
              ? this.renderActivity()
              : mode === 'create'
                ? this.renderCreateWalletPanel()
                : mode === 'recovery'
                  ? this.renderRecovery()
                  : this.renderOverview()}
        </main>
      </div>
    `
  }

  private renderNetworkStatusCallout(): TemplateResult | typeof nothing {
    const providerReason = this.model.selectedNetworkUnavailableReason()
    const discoveryPending = this.model.selectedRecoveryDiscoveryPending()
    if (!providerReason && !discoveryPending) return nothing
    const discoveryError = this.model.selectedRecoveryDiscoveryError()
    return html`
      <div class="status-callouts">
        ${discoveryPending
          ? html`
              <section class="status-callout" role="status">
                <h3>${i18n('wallet:status:discovery:title')}</h3>
                <p class="muted">
                  ${discoveryError ??
                  (this.model.selectedRecoveryDiscoveryLoading()
                    ? i18n('wallet:status:discovery:active')
                    : i18n('wallet:status:discovery:waiting'))}
                </p>
              </section>
            `
          : nothing}
        ${providerReason
          ? html`
              <section class="status-callout" role="status">
                <h3>${i18n('wallet:status:provider-unavailable:title')}</h3>
                <p class="muted">${providerReason}</p>
              </section>
            `
          : nothing}
      </div>
    `
  }

  private renderModeButton(
    mode: WalletMode,
    labelKey: Parameters<typeof i18n>[0],
    current: WalletMode,
  ): TemplateResult {
    return html`
      <button
        class=${current === mode ? 'active' : 'ghost'}
        data-mode=${mode}
        aria-pressed=${current === mode}
        @click=${this.handleModeClick}
      >
        ${i18n(labelKey)}
      </button>
    `
  }

  private setupMode(mode: WalletMode): WalletSetupMode {
    return mode === 'restore' || mode === 'import' ? mode : 'create'
  }

  private renderAccountButton(account: WalletAccount): TemplateResult {
    const selected = this.model.selectedAccountId() === walletAccountId(account)
    return html`
      <button
        class="account-button ${selected ? 'active' : ''}"
        data-account-id=${walletAccountId(account)}
        @click=${this.handleAccountClick}
        aria-current=${selected}
      >
        <span>
          <strong><bdi dir="auto">${walletAccountLabel(account)}</bdi></strong>
          <span class="meta" dir="ltr">${account.network} · ${shortenAddress(walletAccountAddress(account))}</span>
        </span>
      </button>
    `
  }

  private renderOverview(): TemplateResult {
    const account = this.model.selectedAccount()
    const balance = this.model.selectedBalance()
    if (!account) return html`<section class="card panel">${i18n('wallet:empty')}</section>`
    const address = this.model.selectedAddress()
    return html`
      <section class="card section">
        <h2>${i18n('wallet:overview:title')}</h2>
        <div class="summary-grid">
          <div class="metric">
            <span class="label">${i18n('wallet:balance:total')}</span>
            <strong>${this.model.displayBalance()}</strong>
          </div>
          <div class="metric">
            <span class="label">${i18n('wallet:balance:spendable')}</span>
            <strong>${this.model.displaySpendable()}</strong>
          </div>
          <div class="metric">
            <span class="label">${i18n('wallet:account:contract')}</span>
            <strong dir="ltr">${walletAccountContract(account)}</strong>
          </div>
        </div>
        <div class="section">
          <h3>${i18n('wallet:receive:title')}</h3>
          <p class="account-copy" dir="ltr">${address}</p>
          <div class="row-actions">
            ${address
              ? html`<button @click=${this.handleCopyAddress}>
                  <cv-icon name="copy"></cv-icon>${i18n('wallet:action:copy-address')}
                </button>`
              : this.model.canDeriveReceiveAddress()
                ? html`<button
                    @click=${this.handleDeriveReceiveAddress}
                    ?disabled=${this.model.receiveAddressLoading()}
                  >
                    <cv-icon name="plus"></cv-icon>${i18n('wallet:action:generate-receive-address')}
                  </button>`
                : nothing}
            <button
              @click=${this.handleBalanceRefresh}
              ?disabled=${this.model.balanceLoading() || !this.model.canRefreshBalance()}
            >
              <cv-icon name="refresh-cw"></cv-icon>${i18n('wallet:action:refresh-balance')}
            </button>
          </div>
          <p class="muted">
            ${balance
              ? `${i18n('wallet:balance:fetched-at')} ${new Date(balance.fetched_at).toLocaleString()}`
              : ''}
          </p>
        </div>
      </section>
    `
  }

  private renderCreateWalletPanel(): TemplateResult {
    return html`<section class="card section">
      <h2>${i18n('wallet:create:title')}</h2>
      ${renderWalletSetup('create')}
    </section>`
  }

  private renderSend(): TemplateResult {
    return html`
      <section class="card section">
        <h2>${i18n('wallet:send:title')}</h2>
        <wallet-send-form presentation="desktop"></wallet-send-form>
      </section>
    `
  }

  private renderActivity(): TemplateResult {
    const transactions = this.model.selectedTransactions()
    return html`
      <section class="card section">
        <h2>${i18n('wallet:activity:title')}</h2>
        ${this.model.txSyncing()
          ? html`<p class="muted" aria-live="polite">${i18n('wallet:activity:syncing')}</p>`
          : nothing}
        <div class="activity-list">
          ${this.model.txLoading() && transactions.length === 0
            ? html`<p class="muted" aria-busy="true">${i18n('wallet:loading')}</p>`
            : transactions.length === 0
              ? html`<p class="muted">${i18n('wallet:activity:empty')}</p>`
              : transactions.map((transaction) => this.renderActivityTransaction(transaction))}
        </div>
      </section>
    `
  }

  private renderActivityTransaction(transaction: WalletTransaction): TemplateResult {
    const reference = transaction.tx_hash ?? transaction.message_ref ?? transaction.tx_ref
    return html`
      <div class="activity-row">
        <span
          ><strong>${formatWalletTransactionAmount(transaction)}</strong
          ><span class="meta"
            >${walletTransactionDirectionLabel(transaction)} · <span dir="ltr">${transaction.status}</span> ·
            ${new Date(transaction.created_at).toLocaleString()} ·
            <span dir="ltr">${transaction.network}</span></span
          >${transaction.counterparty
            ? html`<span class="meta"
                >${walletTransactionCounterpartyLabel(transaction)}
                <span dir="ltr">${shortenAddress(transaction.counterparty)}</span></span
              >`
            : nothing}<span class="meta tx-ref" dir="ltr">${reference}</span></span
        >
        <div class="activity-actions">
          <button
            data-tx-ref=${transaction.tx_ref}
            @click=${this.handleRefreshTx}
            ?disabled=${this.model.refreshTxRef() === transaction.tx_ref ||
            !this.model.networkProviderReady(transaction.network)}
          >
            <cv-icon name="refresh-cw"></cv-icon>${i18n('wallet:action:refresh')}
          </button>
          ${this.model.canOfferRebroadcast(transaction)
            ? html`<button
                class="ghost"
                data-tx-ref=${transaction.tx_ref}
                @click=${this.handleBeginRebroadcast}
                ?disabled=${!this.model.networkProviderReady(transaction.network)}
              >
                <cv-icon name="send"></cv-icon>${i18n('wallet:action:rebroadcast')}
              </button>`
            : nothing}
        </div>
        ${this.model.rebroadcastTxRef() === transaction.tx_ref
          ? this.renderRebroadcastConfirmation()
          : nothing}
      </div>
    `
  }

  private renderRebroadcastConfirmation(): TemplateResult {
    return html`<div class="rebroadcast-confirmation">
      <p class="muted">${i18n('wallet:activity:rebroadcast-help')}</p>
      <label
        >${i18n('wallet:field:master-password')}<input
          dir="ltr"
          .value=${this.model.rebroadcastMasterPassword()}
          @input=${this.handleRebroadcastPasswordInput}
          type="password"
          autocomplete="off"
      /></label>
      <div class="row-actions">
        <button
          class="primary"
          @click=${this.handleConfirmRebroadcast}
          ?disabled=${!this.model.canRebroadcast()}
        >
          ${i18n('wallet:action:confirm-rebroadcast')}</button
        ><button class="ghost" @click=${this.handleCancelRebroadcast}>${i18n('wallet:action:cancel')}</button>
      </div>
    </div>`
  }

  private renderRecovery(): TemplateResult {
    const wallet = this.model.selectedWallet()
    if (wallet?.kind !== 'hd')
      return html`<section class="card section">
        <h2>${i18n('wallet:recovery:title')}</h2>
        <p class="muted">${i18n('wallet:recovery:imported-unavailable')}</p>
      </section>`
    return html`
      <section class="card section">
        <h2>${i18n('wallet:recovery:title')}</h2>
        <label
          >${i18n('wallet:field:master-password')}<input
            dir="ltr"
            .value=${this.model.recoveryMasterPassword()}
            @input=${this.handleRecoveryPasswordInput}
            type="password"
            autocomplete="off"
        /></label>
        <button
          class="primary"
          @click=${this.handleExportRecovery}
          ?disabled=${!this.model.recoveryMasterPassword()}
        >
          <cv-icon name="eye"></cv-icon>${i18n('wallet:action:reveal-recovery')}
        </button>
        ${this.model.recoveryMnemonicStandard()
          ? html`<p class="account-copy">
              ${i18n('wallet:field:mnemonic-standard')}: ${this.model.recoveryMnemonicStandard()}
            </p>`
          : nothing}
        ${this.model.recoveryMnemonic().length > 0
          ? renderWalletMnemonic(this.model.recoveryMnemonic())
          : nothing}
        ${this.model.recoveryPassphrase()
          ? html`<p class="account-copy">
              ${i18n('wallet:field:passphrase')}: ${this.model.recoveryPassphrase()}
            </p>`
          : nothing}
      </section>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wallet-page-desktop-layout': WalletPageDesktopLayout
  }
}
