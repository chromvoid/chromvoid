import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing, type TemplateResult} from 'lit'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {i18n} from 'root/i18n'
import {walletPageModel} from './wallet-page.model'
import {getWalletNetworkProfile, type WalletFeeTier} from './wallet-network'
import {
  walletAccountLabel,
  type WalletAccount,
  type WalletMainTab,
  type WalletSetupFlow,
  type WalletSummary,
} from './wallet-page.types'

export abstract class WalletPageLayoutBase extends ReatomLitElement {
  static properties = {
    hideBackLink: {type: Boolean, attribute: 'hide-back-link'},
    externalToolbar: {type: Boolean, attribute: 'external-toolbar'},
  }

  declare hideBackLink: boolean
  declare externalToolbar: boolean

  protected readonly model = walletPageModel

  constructor() {
    super()
    this.hideBackLink = false
    this.externalToolbar = false
  }

  connectedCallback(): void {
    super.connectedCallback()
    void this.model.load()
  }

  disconnectedCallback(): void {
    this.model.clearSensitiveState()
    super.disconnectedCallback()
  }

  protected handleBack(): void {
    navigationModel.goBack()
  }

  protected handleModeClick(event: Event): void {
    const mode = (event.currentTarget as HTMLElement | null)?.dataset['mode']
    if (mode) this.model.setMode(mode as WalletMainTab | Exclude<WalletSetupFlow, null>)
  }

  protected handleTabClick(event: Event): void {
    const tab = (event.currentTarget as HTMLElement | null)?.dataset['tab'] as WalletMainTab | undefined
    if (tab) this.model.setMainTab(tab)
  }

  protected handleSetupFlowClick(event: Event): void {
    const flow = (event.currentTarget as HTMLElement | null)?.dataset['flow'] as
      | Exclude<WalletSetupFlow, null>
      | undefined
    if (flow) this.model.setSetupFlow(flow)
  }

  protected handleSetupBack(): void {
    this.model.setSetupFlow(null)
  }

  protected handleCloseSetup(): void {
    this.model.closeSetup()
  }

  protected handleAccountClick(event: Event): void {
    const accountId = (event.currentTarget as HTMLElement | null)?.dataset['accountId']
    if (accountId) this.model.selectAccount(accountId)
  }

  protected handleAccountRailKeydown(event: KeyboardEvent): void {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    if (!forward && !backward) return
    const accounts = this.model.walletAssets()
    const currentIndex = accounts.findIndex(
      (account) => account.account_id === this.model.selectedAccountId(),
    )
    if (currentIndex < 0 || accounts.length < 2) return
    event.preventDefault()
    const direction = forward ? 1 : -1
    const nextIndex = (currentIndex + direction + accounts.length) % accounts.length
    const account = accounts[nextIndex]
    if (account) this.model.selectAccount(account.account_id)
  }

  protected handleWalletClick(event: Event): void {
    const walletId = (event.currentTarget as HTMLElement | null)?.dataset['walletId']
    if (walletId) this.model.selectWallet(walletId)
  }

  protected handleOpenWalletSwitcher(): void {
    this.model.openOverlay('wallet-switcher')
  }

  protected handleOpenImportWallet(): void {
    this.model.openOverlay('import-wallet')
  }

  protected handleOpenReceive(): void {
    this.model.executeToolbarCommand('receive')
  }

  protected handleOpenMobileSend(): void {
    this.model.openMobileSend()
  }

  protected handleCloseOverlay(event?: CustomEvent<{open?: boolean}>): void {
    if (!event || event.detail.open === false) this.model.closeOverlay()
  }

  protected handleAddWallet(): void {
    this.model.openSetupPicker()
  }

  protected handleDeriveAccount(event: Event): void {
    const network = (event.currentTarget as HTMLElement | null)?.dataset['network']
    if (network) void this.model.deriveAccount(network)
  }

  protected handleDeriveReceiveAddress(): void {
    void this.model.deriveReceiveAddress()
  }

  protected handleManualRefresh(): void {
    void this.model.manualRefresh()
  }

  protected handleBalanceRefresh(): void {
    void this.model.manualRefresh()
  }

  protected handleCopyAddress(): void {
    void this.model.copySelectedAddress()
  }

  protected renderPreparedAmountGuard(className: string): TemplateResult {
    return this.model.preparedAmountBelowFee()
      ? html`<div class=${className} role="alert">${i18n('wallet:preview:amount-below-fee')}</div>`
      : html``
  }

  protected renderReceiveContent(): TemplateResult {
    const wallet = this.model.selectedWallet()
    const account = this.model.selectedAccount()
    if (!wallet || !account) {
      return html`<p class="receive-error" role="alert">${i18n('wallet:empty')}</p>`
    }

    const address = this.model.selectedAddress()
    const canDeriveAddress = this.model.canDeriveReceiveAddress()
    const derivingAddress = this.model.receiveAddressLoading()
    const networkLabel = this.model.selectedNetworkProfile()?.label ?? account.network
    const notice = this.model.notice()
    const error = this.model.error()

    return html`
      <div class="receive-content">
        ${this.renderReceiveNetworkChips(account)}
        <dl class="receive-context-list">
          <div>
            <dt>${i18n('wallet:field:wallet')}</dt>
            <dd><bdi dir="auto">${wallet.label}</bdi></dd>
          </div>
          <div>
            <dt>${i18n('wallet:field:account')}</dt>
            <dd><bdi dir="auto">${walletAccountLabel(account)}</bdi></dd>
          </div>
          <div>
            <dt>${i18n('wallet:field:network')}</dt>
            <dd>${networkLabel}</dd>
          </div>
        </dl>
        ${address
          ? html`
              <div class="receive-qr-frame">
                <cv-qr-code
                  class="receive-qr"
                  .value=${address}
                  .ariaLabel=${`${i18n('wallet:receive:qr-label')}: ${networkLabel}`}
                ></cv-qr-code>
              </div>
              <div class="receive-address">
                <span>${i18n('wallet:receive:address')}</span>
                <code dir="ltr">${address}</code>
              </div>
              <div class="receive-actions">
                <button id="wallet-receive-copy" class="primary" @click=${this.handleCopyAddress}>
                  <cv-icon name="copy"></cv-icon>${i18n('wallet:action:copy-address')}
                </button>
                ${canDeriveAddress
                  ? html`
                      <button @click=${this.handleDeriveReceiveAddress} ?disabled=${derivingAddress}>
                        <cv-icon name=${derivingAddress ? 'loader-circle' : 'plus'}></cv-icon>
                        ${derivingAddress
                          ? i18n('wallet:action:generating-address')
                          : i18n('wallet:action:new-receive-address')}
                      </button>
                    `
                  : nothing}
              </div>
            `
          : canDeriveAddress
            ? html`
                <div class="receive-feedback" role="status">${i18n('wallet:receive:empty')}</div>
                <div class="receive-actions">
                  <button
                    id="wallet-receive-generate"
                    class="primary"
                    @click=${this.handleDeriveReceiveAddress}
                    ?disabled=${derivingAddress}
                    aria-busy=${derivingAddress ? 'true' : 'false'}
                  >
                    <cv-icon name=${derivingAddress ? 'loader-circle' : 'plus'}></cv-icon>
                    ${derivingAddress
                      ? i18n('wallet:action:generating-address')
                      : i18n('wallet:action:generate-receive-address')}
                  </button>
                </div>
              `
            : html`<div class="receive-error" role="alert">${i18n('wallet:empty')}</div>`}
        ${notice ? html`<div class="receive-feedback" role="status">${notice}</div>` : nothing}
        ${error ? html`<div class="receive-error" role="alert">${error}</div>` : nothing}
      </div>
    `
  }

  /** One Receive surface for the whole wallet: pick the network, the address follows. */
  protected renderReceiveNetworkChips(selected: WalletAccount): TemplateResult | typeof nothing {
    const assets = this.model.walletAssets()
    if (assets.length < 2) return nothing
    return html`
      <div class="receive-network-chips" role="group" aria-label=${i18n('wallet:receive:choose-network')}>
        ${assets.map((account) => {
          const profile = getWalletNetworkProfile(account.network)
          const active = account.account_id === selected.account_id
          return html`
            <button
              class="receive-network-chip"
              data-account-id=${account.account_id}
              aria-pressed=${active ? 'true' : 'false'}
              @click=${this.handleAccountClick}
            >
              <span class="network-mark">${profile?.symbol.slice(0, 1) ?? '?'}</span>
              <span dir="ltr">${profile?.label ?? account.network}</span>
            </button>
          `
        })}
      </div>
    `
  }

  /**
   * A wallet-level list of the network accounts with their balances; selecting one expands its
   * details. Adding a second account of a network is an advanced move and lives in the network
   * details, not here.
   */
  protected renderAssetList(): TemplateResult {
    const assets = this.model.walletAssets()
    return html`
      <div
        class="asset-list"
        role="listbox"
        aria-label=${i18n('wallet:overview:assets')}
        @keydown=${this.handleAccountRailKeydown}
      >
        ${assets.map((account) => this.renderAssetRow(account))}
      </div>
    `
  }

  /** "Add account" for the network shown in the details; derives directly, no picker. */
  protected renderAddAccountAction(network: string, className: string): TemplateResult | typeof nothing {
    if (!this.model.canDeriveAccount(network)) return nothing
    return html`
      <button
        class=${className}
        data-network=${network}
        @click=${this.handleDeriveAccount}
        ?disabled=${this.model.deriveAccountLoading()}
      >
        <cv-icon name="plus"></cv-icon>${i18n('wallet:action:add-account')}
      </button>
    `
  }

  protected renderAssetRow(account: WalletAccount): TemplateResult {
    const selected = this.model.selectedAccountId() === account.account_id
    const profile = getWalletNetworkProfile(account.network)
    const loading = this.model.accountBalanceLoading(account.account_id)
    const reason = this.model.networkUnavailableReason(account.network)
    return html`
      <button
        class="asset-row ${selected ? 'selected' : ''}"
        role="option"
        aria-selected=${selected}
        data-account-id=${account.account_id}
        @click=${this.handleAccountClick}
      >
        <span class="network-mark">${profile?.symbol.slice(0, 1) ?? '?'}</span>
        <span class="asset-copy">
          <strong dir="ltr">${profile?.label ?? account.network}</strong>
          <span class="asset-meta"
            ><bdi dir="auto">${walletAccountLabel(account)}</bdi>${reason
              ? html` · <span class="asset-warning">${i18n('wallet:network:disabled')}</span>`
              : nothing}</span
          >
        </span>
        <span class="asset-balance">
          <strong>${this.model.displayAccountBalance(account)}</strong>
          ${loading
            ? html`<cv-icon class="loading-spinner" name="loader-circle" aria-label=${i18n('wallet:balance:loading')}></cv-icon>`
            : nothing}
        </span>
      </button>
    `
  }

  protected renderWalletOptions(includeAddWallet: boolean): TemplateResult {
    return html`
      <div class="wallet-option-list sheet-list">
        ${this.model.wallets().map((wallet) => {
          const selected = wallet.wallet_id === this.model.selectedWalletId()
          const count = this.model
            .accounts()
            .filter((account) => account.wallet_id === wallet.wallet_id).length
          return html`
            <button
              id=${selected ? 'wallet-switcher-current' : nothing}
              class="wallet-option sheet-option ${selected ? 'selected' : ''}"
              data-wallet-id=${wallet.wallet_id}
              aria-current=${selected ? 'true' : 'false'}
              @click=${this.handleWalletClick}
            >
              <span class="wallet-avatar"><cv-icon name="wallet"></cv-icon></span>
              <span>
                <strong><bdi dir="auto">${wallet.label}</bdi></strong>
                <span>${this.walletKind(wallet)} · ${this.accountCount(count)}</span>
              </span>
              ${selected ? html`<cv-icon name="check"></cv-icon>` : nothing}
            </button>
          `
        })}
        ${includeAddWallet
          ? html`
              <button class="wallet-option sheet-option add-option" @click=${this.handleAddWallet}>
                <span class="wallet-avatar"><cv-icon name="plus"></cv-icon></span>
                <span>
                  <strong>${i18n('wallet:action:add-wallet')}</strong>
                  <span>${i18n('wallet:action:add-wallet:body')}</span>
                </span>
              </button>
            `
          : nothing}
      </div>
    `
  }

  protected walletKind(wallet: WalletSummary): string {
    if (wallet.kind === 'imported') return i18n('wallet:type:imported')
    return wallet.wallet_mode === 'ton_only' ? i18n('wallet:type:ton-only') : i18n('wallet:type:multichain')
  }

  protected accountCount(count: number): string {
    const lastTwo = count % 100
    const last = count % 10
    const key =
      lastTwo >= 11 && lastTwo <= 14
        ? 'wallet:accounts:count'
        : last === 1
          ? 'wallet:accounts:one'
          : last >= 2 && last <= 4
            ? 'wallet:accounts:few'
            : 'wallet:accounts:count'
    return `${count} ${i18n(key)}`
  }

  protected handleRecipientAddressInput(event: Event): void {
    const input = event.target as HTMLInputElement
    const recipientId = input.dataset['recipientId']
    if (recipientId) this.model.setSendRecipientAddress(recipientId, input.value)
  }

  protected handleRecipientAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement
    const recipientId = input.dataset['recipientId']
    if (recipientId) this.model.setSendRecipientAmount(recipientId, input.value)
  }

  protected handleAddRecipient(): void {
    this.model.addSendRecipient()
  }

  protected handleRemoveRecipient(event: Event): void {
    const recipientId = (event.currentTarget as HTMLElement | null)?.dataset['recipientId']
    if (recipientId) this.model.removeSendRecipient(recipientId)
  }

  protected handleSendCommentInput(event: Event): void {
    this.model.setSendComment((event.target as HTMLTextAreaElement).value)
  }

  protected handleFeeTierChange(event: Event): void {
    this.model.setSendFeeTier((event.target as HTMLSelectElement).value as WalletFeeTier)
  }

  protected handleSendMasterPasswordInput(event: Event): void {
    this.model.setSendMasterPassword((event.target as HTMLInputElement).value)
  }

  protected handlePrepareSend(): void {
    void this.model.prepareSend()
  }

  protected handleWarningToggle(event: Event): void {
    const input = event.target as HTMLInputElement
    const code = input.dataset['warningCode']
    if (code) this.model.toggleWarning(code, input.checked)
  }

  protected handleConfirmSend(): void {
    void this.model.confirmSend()
  }

  protected handleCancelPrepared(): void {
    void this.model.cancelPrepared()
  }

  protected handleRefreshTx(event: Event): void {
    const txRef = (event.currentTarget as HTMLElement | null)?.dataset['txRef']
    if (txRef) void this.model.refreshTransaction(txRef)
  }

  protected handleBeginRebroadcast(event: Event): void {
    const txRef = (event.currentTarget as HTMLElement | null)?.dataset['txRef']
    if (txRef) this.model.beginRebroadcast(txRef)
  }

  protected handleRebroadcastPasswordInput(event: Event): void {
    this.model.setRebroadcastMasterPassword((event.target as HTMLInputElement).value)
  }

  protected handleConfirmRebroadcast(): void {
    void this.model.rebroadcastTransaction()
  }

  protected handleCancelRebroadcast(): void {
    this.model.cancelRebroadcast()
  }

  protected handleRecoveryPasswordInput(event: Event): void {
    this.model.setRecoveryMasterPassword((event.target as HTMLInputElement).value)
  }

  protected handleExportRecovery(): void {
    void this.model.exportRecovery()
  }
}
