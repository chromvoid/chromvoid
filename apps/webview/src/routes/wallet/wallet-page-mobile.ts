import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import {CVQrCode} from '@chromvoid/uikit/components/cv-qr-code'
import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'
import {shortenAddress} from './wallet-format'
import {
  walletAccountContract,
  walletAccountLabel,
  formatWalletTransactionAmount,
  walletTransactionCounterpartyLabel,
  walletTransactionDirection,
  walletTransactionDirectionLabel,
  type WalletMainTab,
  type WalletSummary,
  type WalletTransaction,
} from './wallet-page.types'
import {WalletPageLayoutBase} from './wallet-page-layout-base'
import {walletPageMobileStyles} from './wallet-page-mobile.styles'
import {WalletSendForm} from './wallet-send-form'
import {renderWalletMnemonic, renderWalletSetup} from './wallet-setup.render'

const MAIN_TABS: Array<{tab: WalletMainTab; key: Parameters<typeof i18n>[0]}> = [
  {tab: 'overview', key: 'wallet:mode:overview'},
  {tab: 'activity', key: 'wallet:mode:activity'},
  {tab: 'recovery', key: 'wallet:mode:recovery'},
]

export class WalletPageMobileLayout extends WalletPageLayoutBase {
  static elementName = 'wallet-page-mobile-layout'
  static styles = walletPageMobileStyles

  static define(): void {
    CVBottomSheet.define()
    CVQrCode.define()
    WalletSendForm.define()
    if (!customElements.get(this.elementName)) customElements.define(this.elementName, this)
  }

  protected render(): TemplateResult {
    const status = this.model.status()
    const error = this.model.error()
    const notice = this.model.notice()
    const modalOpen = this.model.overlay() === 'receive' || this.model.overlay() === 'send'

    return html`
      <section class="mobile-page page-transition" aria-labelledby="wallet-mobile-title">
        <h1 id="wallet-mobile-title" class="sr-only">${i18n('wallet:title')}</h1>
        ${notice && !modalOpen
          ? html`<div class="feedback feedback-info" role="status">${notice}</div>`
          : nothing}
        ${error && !modalOpen
          ? html`<div class="feedback feedback-error" role="alert">${error}</div>`
          : nothing}
        ${this.model.loading() && !status
          ? this.renderLoading()
          : status && !status.enabled
            ? this.renderDisabled(status.disabled_reason ?? '')
            : status?.enabled &&
                (this.model.accounts().length === 0 || this.model.setupVisible() || this.model.setupFlow())
              ? this.renderOnboarding()
              : status?.enabled
                ? this.renderWallet()
                : nothing}
        ${this.renderWalletSwitcher()} ${this.renderImportWalletSheet()}
        ${this.renderReceiveSheet()} ${this.renderSendSheet()}
      </section>
    `
  }

  private renderLoading(): TemplateResult {
    return html`
      <div class="center-state" aria-busy="true">
        <span class="state-icon"><cv-icon name="wallet"></cv-icon></span>
        <h2>${i18n('wallet:loading')}</h2>
      </div>
    `
  }

  private renderDisabled(reason: string): TemplateResult {
    return html`
      <div class="center-state">
        <span class="state-icon"><cv-icon name="circle-off"></cv-icon></span>
        <h2>${i18n('wallet:disabled:title')}</h2>
        <p>${reason || i18n('wallet:disabled:body')}</p>
      </div>
    `
  }

  private renderOnboarding(): TemplateResult {
    const flow = this.model.setupFlow()
    if (!flow) return this.renderMethodPicker()
    return html`
      <div class="setup-view">
        <header class="setup-header">
          <button class="icon-button" @click=${this.handleSetupBack} aria-label=${i18n('button:back')}>
            <cv-icon name="arrow-left"></cv-icon>
          </button>
          <div>
            <span class="eyebrow">${i18n('wallet:onboarding:eyebrow')}</span>
            <h2>${this.setupTitle(flow)}</h2>
          </div>
        </header>
        <section class="setup-panel">${renderWalletSetup(flow)}</section>
      </div>
    `
  }

  private renderMethodPicker(): TemplateResult {
    return html`
      <div class="onboarding-view">
        ${this.model.accounts().length > 0
          ? html`<button
              class="icon-button"
              @click=${this.handleCloseSetup}
              aria-label=${i18n('button:back')}
            >
              <cv-icon name="arrow-left"></cv-icon>
            </button>`
          : nothing}
        <header class="onboarding-heading">
          <span class="brand-mark"><cv-icon name="wallet"></cv-icon></span>
          <span class="eyebrow">${i18n('wallet:onboarding:eyebrow')}</span>
          <h2>${i18n('wallet:onboarding:title')}</h2>
          <p>${i18n('wallet:onboarding:body')}</p>
        </header>
        <div class="method-list">
          ${this.renderMethod(
            'create',
            'sparkles',
            'wallet:method:create:title',
            'wallet:method:create:body',
          )}
          <button class="import-existing-button" @click=${this.handleOpenImportWallet}>
            ${i18n('wallet:method:import-existing:title')}
          </button>
        </div>
      </div>
    `
  }

  private renderMethod(
    flow: 'create' | 'restore' | 'import',
    icon: string,
    titleKey: Parameters<typeof i18n>[0],
    bodyKey: Parameters<typeof i18n>[0],
  ): TemplateResult {
    return html`
      <button class="method-button" data-flow=${flow} @click=${this.handleSetupFlowClick}>
        <span class="method-icon"><cv-icon name=${icon}></cv-icon></span>
        <span class="method-copy"><strong>${i18n(titleKey)}</strong><span>${i18n(bodyKey)}</span></span>
        <cv-icon name="chevron-right"></cv-icon>
      </button>
    `
  }

  private setupTitle(flow: 'create' | 'restore' | 'import'): string {
    if (flow === 'restore') return i18n('wallet:method:restore:title')
    if (flow === 'import') return i18n('wallet:method:import:title')
    return i18n('wallet:method:create:title')
  }

  private renderWallet(): TemplateResult {
    const wallet = this.model.selectedWallet()
    const account = this.model.selectedAccount()
    if (!wallet || !account) return this.renderMethodPicker()
    return html`
      <div class="wallet-view">
        ${this.externalToolbar ? nothing : this.renderWalletHeader(wallet)}
        ${this.renderNetworkCallout()} ${this.renderTabs()}
        <main class="tab-panel">${this.renderCurrentTab()}</main>
      </div>
    `
  }

  private renderWalletHeader(wallet: WalletSummary): TemplateResult {
    const accountCount = this.model.walletAccounts().length
    return html`
      <header class="mobile-header">
        <button class="wallet-switcher" @click=${this.handleOpenWalletSwitcher} aria-haspopup="dialog">
          <span class="wallet-avatar"><cv-icon name="wallet"></cv-icon></span>
          <span class="wallet-switcher-copy">
            <strong><bdi dir="auto">${wallet.label}</bdi></strong>
            <span>${this.walletKind(wallet)} · ${this.accountCount(accountCount)}</span>
          </span>
          <cv-icon name="chevron-down"></cv-icon>
        </button>
        <button
          class="icon-button"
          @click=${this.handleManualRefresh}
          ?disabled=${this.model.loading()}
          aria-label=${i18n('wallet:action:refresh')}
        >
          <cv-icon name="refresh-cw"></cv-icon>
        </button>
      </header>
    `
  }

  private renderNetworkCallout(): TemplateResult | typeof nothing {
    if (this.model.selectedRecoveryDiscoveryPending()) {
      const error = this.model.selectedRecoveryDiscoveryError()
      return html`
        <section class="network-callout" role="status">
          <cv-icon
            name=${this.model.selectedRecoveryDiscoveryLoading() ? 'loader-circle' : 'history'}
          ></cv-icon>
          <span
            ><strong>${i18n('wallet:status:discovery:title')}</strong
            ><span
              >${error ??
              (this.model.selectedRecoveryDiscoveryLoading()
                ? i18n('wallet:status:discovery:active')
                : i18n('wallet:status:discovery:waiting'))}</span
            ></span
          >
        </section>
      `
    }
    const reason = this.model.selectedNetworkUnavailableReason()
    if (!reason) return nothing
    return html`
      <section class="network-callout" role="status">
        <cv-icon name="triangle-alert"></cv-icon>
        <span
          ><strong>${i18n('wallet:status:provider-unavailable:title')}</strong><span>${reason}</span></span
        >
      </section>
    `
  }

  private renderTabs(): TemplateResult {
    const current = this.model.mainTab()
    return html`
      <div class="main-tabs" role="tablist" aria-label=${i18n('wallet:title')}>
        ${MAIN_TABS.map(
          ({tab, key}) => html`
            <button
              id="wallet-tab-${tab}"
              role="tab"
              aria-selected=${current === tab}
              aria-controls="wallet-tab-panel"
              tabindex=${current === tab ? '0' : '-1'}
              data-tab=${tab}
              @click=${this.handleTabClick}
            >
              ${i18n(key)}
            </button>
          `,
        )}
      </div>
    `
  }

  private renderCurrentTab(): TemplateResult {
    const tab = this.model.mainTab()
    const content =
      tab === 'activity'
        ? this.renderActivity()
        : tab === 'recovery'
          ? this.renderRecovery()
          : this.renderOverview()
    return html`<section id="wallet-tab-panel" role="tabpanel" aria-labelledby="wallet-tab-${tab}">
      ${content}
    </section>`
  }

  private renderOverview(): TemplateResult {
    const account = this.model.selectedAccount()
    const balance = this.model.selectedBalance()
    if (!account) return html`<p class="empty-copy">${i18n('wallet:empty')}</p>`
    const address = this.model.selectedAddress()
    const profile = this.model.selectedNetworkProfile()
    return html`
      <div class="overview-stack">
        <section class="balance-hero">
          <span>${i18n('wallet:overview:assets')}</span>
          ${this.renderAssetList()}
          <div class="quick-actions">
            <button @click=${this.handleOpenMobileSend} ?disabled=${!this.model.anyAccountTransactionReady()}>
              <cv-icon name="arrow-up-right"></cv-icon><span>${i18n('wallet:mode:send')}</span>
            </button>
            <button @click=${this.handleOpenReceive} ?disabled=${!this.model.toolbarContext().canReceive}>
              <cv-icon name="arrow-down-left"></cv-icon><span>${i18n('wallet:receive:title')}</span>
            </button>
          </div>
        </section>
        <section class="detail-section">
          <div class="detail-heading">
            <div>
              <span class="eyebrow" dir="ltr">${profile?.label ?? account.network}</span>
              <h3>${i18n('wallet:account:details')}</h3>
            </div>
            <button
              class="icon-button"
              @click=${this.handleBalanceRefresh}
              ?disabled=${this.model.balanceLoading() || !this.model.canRefreshBalance()}
              aria-label=${i18n('wallet:action:refresh-balance')}
            >
              <cv-icon name="refresh-cw"></cv-icon>
            </button>
          </div>
          <dl class="detail-list">
            <div>
              <dt>${i18n('wallet:field:account')}</dt>
              <dd><bdi dir="auto">${walletAccountLabel(account)}</bdi></dd>
            </div>
            <div>
              <dt>${i18n('wallet:balance:total')}</dt>
              <dd>${this.model.displayBalance()}</dd>
            </div>
            <div>
              <dt>${i18n('wallet:balance:spendable')}</dt>
              <dd>${this.model.displaySpendable()}</dd>
            </div>
            <div>
              <dt>${i18n('wallet:account:contract')}</dt>
              <dd dir="ltr">${walletAccountContract(account)}</dd>
            </div>
          </dl>
          <div class="address-block">
            <span>${i18n('wallet:receive:address')}</span><code dir="ltr">${address}</code
            ><button @click=${this.handleCopyAddress} ?disabled=${!address}>
              <cv-icon name="copy"></cv-icon>${i18n('wallet:action:copy-address')}
            </button>
          </div>
          ${this.model.canDeriveReceiveAddress()
            ? html`<button
                class="secondary-action"
                @click=${this.handleDeriveReceiveAddress}
                ?disabled=${this.model.receiveAddressLoading()}
              >
                <cv-icon name="plus"></cv-icon>${address
                  ? i18n('wallet:action:new-receive-address')
                  : i18n('wallet:action:generate-receive-address')}
              </button>`
            : nothing}
          ${this.renderAddAccountAction(account.network, 'secondary-action')}
          ${balance
            ? html`<p class="timestamp">
                ${i18n('wallet:balance:fetched-at')} ${new Date(balance.fetched_at).toLocaleString()}
              </p>`
            : nothing}
        </section>
      </div>
    `
  }
  private renderActivity(): TemplateResult {
    const transactions = this.model.selectedTransactions()
    const activityBody = i18n(
      this.model.txSyncing() ? 'wallet:activity:syncing' : 'wallet:activity:account-body',
    )
    return html`
      <div class="content-stack">
        <header class="content-heading">
          <span class="eyebrow">${this.model.selectedNetworkProfile()?.label ?? ''}</span>
          <h2>${i18n('wallet:activity:title')}</h2>
          <p aria-live="polite">${activityBody}</p>
        </header>
        ${this.model.txLoading() && transactions.length === 0
          ? html`<p class="empty-copy" aria-busy="true">${i18n('wallet:loading')}</p>`
          : transactions.length === 0
            ? html`<div class="empty-state">
                <cv-icon name="list-minus"></cv-icon><strong>${i18n('wallet:activity:empty')}</strong
                ><span>${i18n('wallet:activity:empty-body')}</span>
              </div>`
            : html`<div class="activity-list">
                ${transactions.map((transaction) => this.renderTransaction(transaction))}
              </div>`}
      </div>
    `
  }

  private renderTransaction(transaction: WalletTransaction): TemplateResult {
    const reference = transaction.tx_hash ?? transaction.message_ref ?? transaction.tx_ref
    const incoming = walletTransactionDirection(transaction) === 'incoming'
    return html`
      <article class="transaction-row">
        <span class="transaction-icon"
          ><cv-icon name=${incoming ? 'arrow-down-left' : 'arrow-up-right'}></cv-icon
        ></span>
        <span class="transaction-copy"
          ><strong>${formatWalletTransactionAmount(transaction)}</strong
          ><span
            >${walletTransactionDirectionLabel(transaction)} ·
            <bdi dir="ltr">${transaction.status}</bdi> ·
            ${new Date(transaction.created_at).toLocaleString()}</span
          >${transaction.counterparty
            ? html`<span
                >${walletTransactionCounterpartyLabel(transaction)}
                <code dir="ltr">${shortenAddress(transaction.counterparty)}</code></span
              >`
            : nothing}<code dir="ltr">${shortenAddress(reference)}</code></span
        >
        <div class="transaction-actions">
          <button
            data-tx-ref=${transaction.tx_ref}
            @click=${this.handleRefreshTx}
            ?disabled=${this.model.refreshTxRef() === transaction.tx_ref ||
            !this.model.networkProviderReady(transaction.network)}
            aria-label=${i18n('wallet:action:refresh')}
          >
            <cv-icon name="refresh-cw"></cv-icon></button
          >${this.model.canOfferRebroadcast(transaction)
            ? html`<button
                data-tx-ref=${transaction.tx_ref}
                @click=${this.handleBeginRebroadcast}
                ?disabled=${!this.model.networkProviderReady(transaction.network)}
                aria-label=${i18n('wallet:action:rebroadcast')}
              >
                <cv-icon name="send"></cv-icon>
              </button>`
            : nothing}
        </div>
        ${this.model.rebroadcastTxRef() === transaction.tx_ref
          ? html`<div class="rebroadcast-panel">
              <p>${i18n('wallet:activity:rebroadcast-help')}</p>
              <label
                >${i18n('wallet:field:master-password')}<input
                  dir="ltr"
                  .value=${this.model.rebroadcastMasterPassword()}
                  @input=${this.handleRebroadcastPasswordInput}
                  type="password"
                  autocomplete="off"
              /></label>
              <div class="confirmation-actions">
                <button
                  class="primary-action"
                  @click=${this.handleConfirmRebroadcast}
                  ?disabled=${!this.model.canRebroadcast()}
                >
                  ${i18n('wallet:action:confirm-rebroadcast')}</button
                ><button class="secondary-action" @click=${this.handleCancelRebroadcast}>
                  ${i18n('wallet:action:cancel')}
                </button>
              </div>
            </div>`
          : nothing}
      </article>
    `
  }

  private renderRecovery(): TemplateResult {
    const wallet = this.model.selectedWallet()
    if (wallet?.kind !== 'hd')
      return html`<div class="content-stack">
        <header class="content-heading"><h2>${i18n('wallet:recovery:title')}</h2></header>
        <div class="empty-state">
          <cv-icon name="key-round"></cv-icon><strong>${i18n('wallet:recovery:imported-unavailable')}</strong>
        </div>
      </div>`
    return html`
      <div class="content-stack">
        <header class="content-heading">
          <span class="eyebrow">${wallet.label}</span>
          <h2>${i18n('wallet:recovery:title')}</h2>
          <p>${i18n('wallet:recovery:warning')}</p>
        </header>
        <section class="recovery-warning">
          <cv-icon name="triangle-alert"></cv-icon><span>${i18n('wallet:recovery:private-warning')}</span>
        </section>
        <div class="mobile-form">
          <label
            >${i18n('wallet:field:master-password')}<input
              dir="ltr"
              .value=${this.model.recoveryMasterPassword()}
              @input=${this.handleRecoveryPasswordInput}
              type="password"
              autocomplete="off" /></label
          ><button
            class="primary-action"
            @click=${this.handleExportRecovery}
            ?disabled=${!this.model.recoveryMasterPassword()}
          >
            <cv-icon name="eye"></cv-icon>${i18n('wallet:action:reveal-recovery')}
          </button>
        </div>
        ${this.model.recoveryMnemonicStandard()
          ? html`<p class="preview-meta">
              ${i18n('wallet:field:mnemonic-standard')}: ${this.model.recoveryMnemonicStandard()}
            </p>`
          : nothing}
        ${this.model.recoveryMnemonic().length > 0
          ? renderWalletMnemonic(this.model.recoveryMnemonic(), this.model.recoveryMnemonicStandard())
          : nothing}
        ${this.model.recoveryPassphrase()
          ? html`<p class="secret-copy">
              ${i18n('wallet:field:passphrase')}: ${this.model.recoveryPassphrase()}
            </p>`
          : nothing}
      </div>
    `
  }

  private renderWalletSwitcher(): TemplateResult {
    return html`
      <cv-bottom-sheet
        class="wallet-sheet"
        .open=${this.model.overlay() === 'wallet-switcher'}
        initial-focus-id="wallet-switcher-current"
        show-handle
        drag-to-close
        @cv-change=${this.handleCloseOverlay}
      >
        <span slot="title">${i18n('wallet:switcher:title')}</span>
        <span slot="description">${i18n('wallet:switcher:body')}</span>
        ${this.renderWalletOptions(true)}
      </cv-bottom-sheet>
    `
  }

  private renderReceiveSheet(): TemplateResult {
    return html`
      <cv-bottom-sheet
        class="wallet-sheet receive-sheet"
        .open=${this.model.overlay() === 'receive'}
        initial-focus-id=${this.model.selectedAddress() ? 'wallet-receive-copy' : 'wallet-receive-generate'}
        show-handle
        drag-to-close
        @cv-change=${this.handleCloseOverlay}
      >
        <span slot="title">${i18n('wallet:receive:title')}</span>
        <span slot="description">${i18n('wallet:receive:body')}</span>
        ${this.renderReceiveContent()}
      </cv-bottom-sheet>
    `
  }

  private renderSendSheet(): TemplateResult {
    const title =
      this.model.send.step() === 'form'
        ? i18n('wallet:send:title')
        : this.model.send.step() === 'recipients'
          ? i18n('wallet:send:select-title')
          : this.model.addressBook.editorEntryId()
            ? i18n('wallet:send:edit-contact')
            : i18n('wallet:send:add-contact')
    return html`
      <cv-bottom-sheet
        class="wallet-sheet send-sheet"
        .open=${this.model.overlay() === 'send'}
        initial-focus-id="wallet-send-prepare"
        show-handle
        drag-to-close
        @cv-change=${this.handleCloseOverlay}
      >
        <span slot="title">${title}</span>
        <span slot="description">${i18n('wallet:send:body')}</span>
        <wallet-send-form presentation="mobile"></wallet-send-form>
      </cv-bottom-sheet>
    `
  }

  private renderImportWalletSheet(): TemplateResult {
    return html`
      <cv-bottom-sheet
        class="wallet-sheet"
        .open=${this.model.overlay() === 'import-wallet'}
        show-handle
        drag-to-close
        @cv-change=${this.handleCloseOverlay}
      >
        <span slot="title">${i18n('wallet:method:import-existing:title')}</span>
        <span slot="description">${i18n('wallet:method:import-existing:body')}</span>
        <div class="sheet-list">
          ${this.renderMethod(
            'restore',
            'rotate-ccw',
            'wallet:method:restore:title',
            'wallet:method:restore:body',
          )}
          ${this.renderMethod(
            'import',
            'key-round',
            'wallet:method:import:title',
            'wallet:method:import:body',
          )}
        </div>
      </cv-bottom-sheet>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wallet-page-mobile-layout': WalletPageMobileLayout
  }
}
