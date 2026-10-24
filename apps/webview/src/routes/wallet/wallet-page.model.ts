import {atom, computed, wrap} from '@reatom/core'

import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {
  getWalletNetworkProfile,
  isKnownWalletNetwork,
  walletNetworkRank,
  walletNetworkReady,
  walletNetworkUnavailableReason,
  type WalletFeeTier,
  type WalletKnownNetwork,
  type WalletNetworkUiProfile,
} from './wallet-network'
import {WalletBalanceController} from './wallet-balance.controller'
import {WalletAddressBookModel} from './wallet-address-book.model'
import {MULTICHAIN_WALLET_MODE, WalletSetupModel} from './wallet-setup.model'
import {WalletSetupController} from './wallet-setup.controller'
import {WalletSendModel} from './wallet-send.model'
import {WalletTransactionsController} from './wallet-transactions.controller'
import {createWalletToolbar} from './wallet-toolbar'
import {
  formatAccountBalance,
  walletAccountAddress,
  walletAccountId,
  walletAccountLabel,
  type WalletAccount,
  type WalletBalanceResponse,
  type WalletMainTab,
  type WalletMode,
  type WalletNetworkStatus,
  type WalletOverlay,
  type WalletRpcPort,
  type WalletSetupFlow,
  type WalletStatus,
  type WalletSummary,
  type WalletTransaction,
  type WalletOwnRecipient,
} from './wallet-page.types'

const defaultWalletRpcPort: WalletRpcPort = {
  rpc: (command, data) => getAppContext().ws.rpc(command, data),
}

const rpcErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export class WalletPageModel {
  readonly status = atom<WalletStatus | null>(null, 'wallet.status')
  readonly setup = new WalletSetupModel(() => this.status())
  readonly wallets = atom<WalletSummary[]>([], 'wallet.wallets')
  readonly accounts = atom<WalletAccount[]>([], 'wallet.accounts')
  readonly selectedWalletId = atom<string | null>(null, 'wallet.selectedWalletId')
  readonly selectedAccountId = atom<string | null>(null, 'wallet.selectedAccountId')
  readonly selectedAccountByWallet = atom<Record<string, string>>({}, 'wallet.selectedAccountByWallet')
  readonly balances = atom<Record<string, WalletBalanceResponse>>({}, 'wallet.balances')
  readonly transactions = atom<WalletTransaction[]>([], 'wallet.transactions')

  readonly mainTab = atom<WalletMainTab>('overview', 'wallet.mainTab')
  readonly setupFlow = atom<WalletSetupFlow>(null, 'wallet.setupFlow')
  readonly setupVisible = atom(false, 'wallet.setupVisible')
  readonly overlay = atom<WalletOverlay>(null, 'wallet.overlay')
  readonly mode = computed<WalletMode>(() => this.setupFlow() ?? this.mainTab(), 'wallet.mode')

  readonly loading = atom(false, 'wallet.loading')
  private readonly toolbar = createWalletToolbar(this, rpcErrorMessage)
  readonly refreshing = this.toolbar.refreshing
  readonly balanceLoading: WalletBalanceController['selectedLoading']
  readonly txLoading: WalletTransactionsController['loading']
  readonly txSyncing: WalletTransactionsController['selectedSyncing']
  readonly preparing = atom(false, 'wallet.preparing')
  readonly confirming = atom(false, 'wallet.confirming')
  readonly deriveAccountLoading = atom(false, 'wallet.deriveAccountLoading')
  readonly receiveAddressLoading = atom(false, 'wallet.receiveAddressLoading')
  readonly refreshTxRef = atom<string | null>(null, 'wallet.refreshTxRef')
  readonly rebroadcastTxRef = atom<string | null>(null, 'wallet.rebroadcastTxRef')
  readonly rebroadcastMasterPassword = atom('', 'wallet.rebroadcastMasterPassword')
  readonly rebroadcasting = atom(false, 'wallet.rebroadcasting')
  readonly error = atom<string | null>(null, 'wallet.error')
  readonly notice = atom<string | null>(null, 'wallet.notice')

  readonly recoveryMasterPassword = atom('', 'wallet.recoveryMasterPassword')
  readonly recoveryMnemonic = atom<string[]>([], 'wallet.recoveryMnemonic')
  readonly recoveryMnemonicStandard = atom<string | null>(null, 'wallet.recoveryMnemonicStandard')
  readonly recoveryPassphrase = atom<string | null>(null, 'wallet.recoveryPassphrase')
  private readonly balanceController: WalletBalanceController
  private readonly transactionsController: WalletTransactionsController

  readonly selectedWallet = computed(() => {
    const walletId = this.selectedWalletId()
    return this.wallets().find((wallet) => wallet.wallet_id === walletId) ?? null
  }, 'wallet.selectedWallet')

  readonly walletAccounts = computed(() => {
    const walletId = this.selectedWalletId()
    return walletId ? this.accounts().filter((account) => account.wallet_id === walletId) : []
  }, 'wallet.walletAccounts')

  /**
   * The selected wallet as one multichain account: every network account in display order.
   * The overview, Send and Receive surfaces work on this list; picking an account only
   * decides which network's details are expanded.
   */
  readonly walletAssets = computed(
    () => [...this.walletAccounts()].sort((a, b) => walletNetworkRank(a.network) - walletNetworkRank(b.network)),
    'wallet.walletAssets',
  )

  readonly selectedAccount = computed(() => {
    const selectedId = this.selectedAccountId()
    return this.walletAccounts().find((account) => walletAccountId(account) === selectedId) ?? null
  }, 'wallet.selectedAccount')

  /** True when at least one network account of the wallet can build a transfer right now. */
  readonly anyAccountTransactionReady = computed(
    () => this.walletAccounts().some((account) => this.accountTransactionReady(account)),
    'wallet.anyAccountTransactionReady',
  )

  /**
   * Network Core recognised for the primary Send destination (`wallet:address:detect`), or null
   * while the address is empty, unrecognised or still being checked.
   */
  readonly sendDestinationNetwork = atom<WalletKnownNetwork | null>(null, 'wallet.sendDestinationNetwork')
  private sendDetectionSequence = 0

  /** Detected destination network that has no account in the selected wallet. */
  readonly sendDestinationNetworkMismatch = computed(() => {
    const network = this.sendDestinationNetwork()
    if (!network) return null
    return this.walletAccounts().some((account) => account.network === network) ? null : network
  }, 'wallet.sendDestinationNetworkMismatch')

  readonly selectedBalance = computed(() => {
    const selectedId = this.selectedAccountId()
    return selectedId ? (this.balances()[selectedId] ?? null) : null
  }, 'wallet.selectedBalance')

  readonly selectedAddress = computed(() => {
    const account = this.selectedAccount()
    return account ? walletAccountAddress(account) : ''
  }, 'wallet.selectedAddress')

  readonly selectedTransactions = computed(() => {
    const accountId = this.selectedAccountId()
    return accountId ? this.transactions().filter((transaction) => transaction.account_id === accountId) : []
  }, 'wallet.selectedTransactions')

  readonly selectedNetworkProfile = computed<WalletNetworkUiProfile | null>(() => {
    const account = this.selectedAccount()
    return account ? getWalletNetworkProfile(account.network) : null
  }, 'wallet.selectedNetworkProfile')

  readonly send = new WalletSendModel(
    () => {
      const account = this.selectedAccount()
      const profile = this.selectedNetworkProfile()
      if (!account || !profile) return null
      return {
        accountId: account.account_id,
        profile,
        providerReady:
          this.networkProviderReady(account.network) && !this.balanceController.accountDiscoveryPending(account),
        cachedSpendable: this.selectedBalance()?.balance.spendable ?? null,
      }
    },
    (request) => this.rpcPort.rpc('wallet:transaction:quote', request),
  )
  readonly addressBook: WalletAddressBookModel
  readonly sendDestination = this.send.destination
  readonly sendAmount = this.send.amount
  readonly sendAmountTon = this.send.amount
  readonly additionalRecipients = this.send.additionalRecipients
  readonly sendComment = this.send.comment
  readonly sendFeeTier = this.send.feeTier
  readonly sendMasterPassword = this.send.masterPassword
  readonly prepared = this.send.prepared
  readonly acceptedWarnings = this.send.acceptedWarnings
  readonly lastConfirm = this.send.lastConfirm
  readonly sendRecipients = this.send.recipients
  readonly canPrepareSend = this.send.canPrepare
  readonly preparedAmountBelowFee = this.send.preparedAmountBelowFee
  readonly canConfirmPrepared = this.send.canConfirm

  readonly ownRecipients = computed<WalletOwnRecipient[]>(() => {
    const sender = this.selectedAccount()
    if (!sender) return []
    const seen = new Set<string>()
    const recipients: WalletOwnRecipient[] = []
    for (const account of this.accounts()) {
      if (account.account_id === sender.account_id || account.network !== sender.network) continue
      const address = walletAccountAddress(account).trim()
      if (!address || seen.has(address)) continue
      seen.add(address)
      const walletLabel = this.wallets().find((wallet) => wallet.wallet_id === account.wallet_id)?.label
      recipients.push({
        accountId: account.account_id,
        label: walletLabel ? `${walletLabel} · ${walletAccountLabel(account)}` : walletAccountLabel(account),
        address,
      })
    }
    return recipients
  }, 'wallet.ownRecipients')

  readonly selectedNetworkStatus = computed(() => {
    const network = this.selectedAccount()?.network
    return network ? this.networkStatus(network) : null
  }, 'wallet.selectedNetworkStatus')

  readonly selectedNetworkReady = computed(
    () => walletNetworkReady(this.selectedNetworkStatus()),
    'wallet.selectedNetworkReady',
  )

  readonly selectedNetworkUnavailableReason = computed(
    () => walletNetworkUnavailableReason(this.selectedNetworkStatus()),
    'wallet.selectedNetworkUnavailableReason',
  )

  readonly selectedRecoveryDiscoveryPending = () => this.balanceController.selectedDiscoveryPending()
  readonly selectedRecoveryDiscoveryLoading = () => this.balanceController.selectedDiscoveryLoading()
  readonly selectedRecoveryDiscoveryError = () => this.balanceController.selectedDiscoveryError()
  readonly selectedTransactionReady = () => this.balanceController.selectedTransactionReady()

  readonly tonStatus = computed(() => this.networkStatus('ton'), 'wallet.tonStatus')
  readonly tonProviderReady = computed(() => walletNetworkReady(this.tonStatus()), 'wallet.tonProviderReady')
  readonly tonProviderUnavailableReason = computed(
    () => walletNetworkUnavailableReason(this.tonStatus()),
    'wallet.tonProviderUnavailableReason',
  )

  readonly derivableNetworks = computed<WalletKnownNetwork[]>(() => {
    const wallet = this.selectedWallet()
    if (!wallet || wallet.kind !== 'hd' || wallet.wallet_mode !== MULTICHAIN_WALLET_MODE) return []
    return (this.status()?.networks ?? [])
      .filter((network) => network.enabled)
      .map((network) => network.network)
      .filter((network): network is WalletKnownNetwork => Boolean(getWalletNetworkProfile(network)))
  }, 'wallet.derivableNetworks')

  readonly canDeriveTonAccount = computed(() => this.canDeriveAccount('ton'), 'wallet.canDeriveTonAccount')

  readonly canDeriveReceiveAddress = computed(() => {
    const account = this.selectedAccount()
    return Boolean(
      account?.kind === 'derived' &&
      account.network === 'bitcoin' &&
      account.account_model === 'utxo' &&
      this.networkStatus(account.network)?.enabled,
    )
  }, 'wallet.canDeriveReceiveAddress')

  readonly canRefreshBalance = computed(
    () => Boolean(this.selectedAccount() && this.selectedNetworkReady()),
    'wallet.canRefreshBalance',
  )

  readonly toolbarContext = this.toolbar.context

  readonly canRebroadcast = computed(() => {
    const txRef = this.rebroadcastTxRef()
    if (!txRef || !this.rebroadcastMasterPassword().trim() || this.rebroadcasting()) return false
    const transaction = this.selectedTransactions().find((item) => item.tx_ref === txRef)
    return Boolean(
      transaction && this.networkProviderReady(transaction.network) && this.canOfferRebroadcast(transaction),
    )
  }, 'wallet.canRebroadcast')

  private loadId = 0
  private readonly setupController: WalletSetupController

  constructor(private readonly rpcPort: WalletRpcPort = defaultWalletRpcPort) {
    this.addressBook = new WalletAddressBookModel(
      rpcPort,
      () => this.selectedNetworkProfile()?.network ?? null,
    )
    this.balanceController = new WalletBalanceController(this, rpcPort, rpcErrorMessage)
    this.balanceLoading = this.balanceController.selectedLoading
    this.transactionsController = new WalletTransactionsController(this, rpcPort, rpcErrorMessage)
    this.txLoading = this.transactionsController.loading
    this.txSyncing = this.transactionsController.selectedSyncing
    this.setupController = new WalletSetupController({
      setup: this.setup,
      rpcPort,
      reloadWalletStructure: () => this.reloadWalletData(false),
      selectCreated: (walletId, accountId) => this.selectCreated(walletId, accountId),
      finishSetup: (notice) => this.finishSetup(notice),
      setError: (error) => this.error.set(rpcErrorMessage(error)),
    })
  }

  networkStatus(network: string): WalletNetworkStatus | null {
    return this.status()?.networks.find((item) => item.network === network) ?? null
  }

  networkProviderReady(network: string): boolean {
    return walletNetworkReady(this.networkStatus(network))
  }

  networkUnavailableReason(network: string): string | null {
    return walletNetworkUnavailableReason(this.networkStatus(network))
  }

  canDeriveAccount(network: string): boolean {
    return Boolean(
      this.derivableNetworks().includes(network as WalletKnownNetwork) &&
      this.networkStatus(network)?.enabled,
    )
  }

  accountBalance(accountId: string): WalletBalanceResponse | null {
    return this.balances()[accountId] ?? null
  }

  accountBalanceLoading(accountId: string): boolean {
    return this.balanceController.loadingAccountIds().has(accountId)
  }

  accountTransactionReady(account: WalletAccount): boolean {
    return this.networkProviderReady(account.network) && !this.balanceController.accountDiscoveryPending(account)
  }

  /** The account Send should start from: the selected one when it is usable, else the first usable one. */
  private sendReadyAccountId(): string | null {
    const selected = this.selectedAccount()
    if (selected && this.accountTransactionReady(selected)) return selected.account_id
    return this.walletAssets().find((account) => this.accountTransactionReady(account))?.account_id ?? null
  }

  /**
   * Asks Core which network accepts the primary destination. Only the latest lookup is applied,
   * so fast typing never leaves a stale answer behind.
   */
  async detectSendDestination(): Promise<WalletKnownNetwork | null> {
    const address = this.send.destination().trim()
    const sequence = ++this.sendDetectionSequence
    if (!address) {
      this.sendDestinationNetwork.set(null)
      return null
    }
    let network: WalletKnownNetwork | null = null
    try {
      const result = await wrap(this.rpcPort.rpc('wallet:address:detect', {address}))
      network = result.network && isKnownWalletNetwork(result.network) ? result.network : null
    } catch {
      network = null
    }
    if (sequence !== this.sendDetectionSequence) return this.sendDestinationNetwork()
    this.sendDestinationNetwork.set(network)
    return network
  }

  /**
   * Address-first Send: when the primary destination belongs to another network of the same
   * wallet, switch the sender account to it and carry the draft over. Resolves to true when
   * the account changed.
   */
  async retargetSendToDestination(): Promise<boolean> {
    const network = await this.detectSendDestination()
    if (this.prepared()) return false
    if (!network) return false
    const current = this.selectedAccount()
    if (!current || current.network === network) return false
    const target = this.walletAssets().find((account) => account.network === network)
    if (!target) return false
    const draft = {
      destination: this.send.destination(),
      amount: this.send.amount(),
      comment: this.send.comment(),
      feeTier: this.send.feeTier(),
    }
    this.selectAccount(target.account_id)
    this.send.setDestination(draft.destination)
    this.sendDestinationNetwork.set(network)
    if (draft.amount) this.send.setAmount(draft.amount)
    if (draft.comment && getWalletNetworkProfile(network)?.supportsComment) this.send.setComment(draft.comment)
    if (draft.feeTier !== 'standard') this.send.setFeeTier(draft.feeTier)
    return true
  }

  displayAccountBalance(account: WalletAccount): string {
    return formatAccountBalance(account, this.accountBalance(account.account_id))
  }

  async load(): Promise<void> {
    const loadId = ++this.loadId
    this.loading.set(true)
    this.error.set(null)
    try {
      const status = await wrap(this.rpcPort.rpc('wallet:status', {}))
      if (loadId !== this.loadId) return
      this.status.set(status)
      this.setup.ensureOptions()
      if (!status.enabled) {
        this.wallets.set([])
        this.accounts.set([])
        this.transactions.set([])
        return
      }
      await wrap(this.reloadWalletData(false))
      if (loadId !== this.loadId) return
      this.loading.set(false)
      await wrap(this.refreshSelectedResources())
    } catch (error) {
      if (loadId === this.loadId) this.error.set(rpcErrorMessage(error))
    } finally {
      if (loadId === this.loadId) this.loading.set(false)
    }
  }

  async reloadWalletData(refreshResources = true): Promise<void> {
    const [wallets, accounts] = await wrap(
      Promise.all([this.rpcPort.rpc('wallet:list', {}), this.rpcPort.rpc('wallet:accounts:list', {})]),
    )
    this.wallets.set(wallets.wallets)
    this.accounts.set(accounts.accounts)
    this.balanceController.hydrateCachedBalances(accounts.cached_balances ?? [])
    this.ensureSelectedContext()
    this.balanceController.startPendingDiscovery()
    if (refreshResources) await wrap(Promise.all([this.refreshWalletBalances(), this.reloadTransactions()]))
  }

  readonly manualRefresh = this.toolbar.manualRefresh
  executeToolbarCommand(
    command: Parameters<typeof this.toolbar.execute>[0],
    presentation?: 'mobile',
  ): boolean {
    return this.toolbar.execute(command, presentation)
  }

  selectWallet(walletId: string): void {
    const wallet = this.wallets().find((item) => item.wallet_id === walletId)
    if (!wallet) return
    if (this.selectedWalletId() !== walletId) this.clearContextSensitiveState()
    this.selectedWalletId.set(walletId)
    const accounts = this.accounts().filter((account) => account.wallet_id === walletId)
    const remembered = this.selectedAccountByWallet()[walletId]
    const selected = accounts.find((account) => account.account_id === remembered) ?? accounts[0] ?? null
    this.selectAccountInternal(selected?.account_id ?? null)
    this.overlay.set(null)
    void this.refreshSelectedResources()
  }

  selectAccount(accountId: string): void {
    const account = this.accounts().find((item) => item.account_id === accountId)
    if (!account || this.selectedAccountId() === accountId) return
    this.clearContextSensitiveState()
    this.selectedWalletId.set(account.wallet_id)
    this.selectAccountInternal(accountId)
    void this.reloadTransactions()
  }

  setMainTab(tab: WalletMainTab): void {
    const previous = this.mainTab()
    if (previous !== tab) this.clearMainTabSensitiveState(previous)
    if (tab === 'send' && previous !== 'send') this.selectSendReadyAccount()
    const setupFlow = this.setupFlow()
    if (setupFlow) this.clearSetupSensitiveState(setupFlow)
    this.mainTab.set(tab)
    this.setupFlow.set(null)
    this.setupVisible.set(false)
    this.overlay.set(null)
    this.error.set(null)
    this.notice.set(null)
    if (tab === 'activity') void this.reloadTransactions()
  }

  setSetupFlow(flow: WalletSetupFlow): void {
    const previous = this.setupFlow()
    if (previous && previous !== flow) this.clearSetupSensitiveState(previous)
    this.setupFlow.set(flow)
    if (flow) this.setupVisible.set(true)
    this.overlay.set(null)
    this.error.set(null)
    this.notice.set(null)
  }

  setMode(mode: WalletMode): void {
    if (mode === 'create' || mode === 'restore' || mode === 'import') this.setSetupFlow(mode)
    else this.setMainTab(mode)
  }

  openOverlay(overlay: Exclude<WalletOverlay, null>): void {
    this.overlay.set(overlay)
  }

  openMobileSend(): void {
    this.selectSendReadyAccount()
    if (!this.toolbarContext().canSend) return
    this.error.set(null)
    this.notice.set(null)
    this.send.setStep('form')
    this.overlay.set('send')
  }

  openSetupPicker(): void {
    this.setupFlow.set(null)
    this.setupVisible.set(true)
    this.overlay.set(null)
  }

  closeSetup(): void {
    const flow = this.setupFlow()
    if (flow) this.clearSetupSensitiveState(flow)
    this.setupFlow.set(null)
    this.setupVisible.set(false)
  }

  closeOverlay(): void {
    if (this.overlay() === 'send') {
      const preparationId = this.prepared()?.preparation_id ?? null
      this.send.closePresentation()
      if (preparationId) {
        void this.rpcPort
          .rpc('wallet:transaction:cancel', {preparation_id: preparationId})
          .catch((error) => this.error.set(rpcErrorMessage(error)))
      }
    }
    this.overlay.set(null)
  }

  setRecoveryMasterPassword(value: string): void {
    this.recoveryMasterPassword.set(value)
  }

  setSendDestination(value: string): void {
    this.send.setDestination(value)
  }

  setSendAmount(value: string): void {
    this.send.setAmount(value)
  }

  setSendAmountTon(value: string): void {
    this.setSendAmount(value)
  }

  setSendComment(value: string): void {
    this.send.setComment(value)
  }

  setSendFeeTier(value: WalletFeeTier): void {
    this.send.setFeeTier(value)
  }

  addSendRecipient(): void {
    this.send.addRecipient()
  }

  removeSendRecipient(id: string): void {
    this.send.removeRecipient(id)
  }

  setSendRecipientAddress(id: string, value: string): void {
    this.send.setRecipientAddress(id, value)
  }

  setSendRecipientAmount(id: string, value: string): void {
    this.send.setRecipientAmount(id, value)
  }

  setSendMasterPassword(value: string): void {
    this.sendMasterPassword.set(value)
  }

  canOfferRebroadcast(transaction: WalletTransaction): boolean {
    return (
      Boolean(transaction.broadcast_artifact_ref) &&
      (transaction.status === 'broadcasting' || transaction.status === 'broadcast_unknown')
    )
  }

  beginRebroadcast(txRef: string): void {
    const transaction = this.selectedTransactions().find((item) => item.tx_ref === txRef)
    if (!transaction || !this.canOfferRebroadcast(transaction)) return
    this.rebroadcastTxRef.set(txRef)
    this.rebroadcastMasterPassword.set('')
    this.error.set(null)
  }

  cancelRebroadcast(): void {
    this.rebroadcastTxRef.set(null)
    this.rebroadcastMasterPassword.set('')
  }

  setRebroadcastMasterPassword(value: string): void {
    this.rebroadcastMasterPassword.set(value)
  }

  toggleWarning(code: string, checked: boolean): void {
    this.send.toggleWarning(code, checked)
  }

  async generateMnemonic(): Promise<void> {
    this.error.set(null)
    await this.setupController.generateMnemonic()
  }

  async createGeneratedWallet(): Promise<void> {
    this.error.set(null)
    await this.setupController.createGeneratedWallet()
  }

  async restoreHdWallet(): Promise<void> {
    this.error.set(null)
    await this.setupController.restoreHdWallet()
  }

  async importWallet(): Promise<void> {
    this.error.set(null)
    await this.setupController.importWallet()
  }

  async deriveAccount(network: string): Promise<void> {
    const wallet = this.selectedWallet()
    if (!wallet || !this.canDeriveAccount(network) || this.deriveAccountLoading()) return
    this.deriveAccountLoading.set(true)
    this.error.set(null)
    try {
      const response = await wrap(
        this.rpcPort.rpc('wallet:accounts:derive', {wallet_id: wallet.wallet_id, network}),
      )
      await wrap(this.reloadWalletData())
      this.selectedWalletId.set(wallet.wallet_id)
      this.selectAccountInternal(response.account_id)
      await wrap(this.reloadTransactions())
      this.setMainTab('overview')
      this.notice.set(i18n('wallet:notice:account-created'))
    } catch (error) {
      this.error.set(rpcErrorMessage(error))
    } finally {
      this.deriveAccountLoading.set(false)
    }
  }

  async deriveTonAccount(): Promise<void> {
    await this.deriveAccount('ton')
  }

  async deriveReceiveAddress(): Promise<void> {
    const account = this.selectedAccount()
    if (!account || !this.canDeriveReceiveAddress() || this.receiveAddressLoading()) return
    this.receiveAddressLoading.set(true)
    this.error.set(null)
    try {
      await wrap(
        this.rpcPort.rpc('wallet:addresses:derive', {account_id: account.account_id, purpose: 'receive'}),
      )
      await wrap(this.reloadWalletData(false))
      this.notice.set(i18n('wallet:notice:address-created'))
    } catch (error) {
      try {
        await wrap(this.reloadWalletData(false))
      } finally {
        this.error.set(rpcErrorMessage(error))
      }
    } finally {
      this.receiveAddressLoading.set(false)
    }
  }

  async prepareSend(): Promise<string | null> {
    const account = this.selectedAccount()
    const profile = this.selectedNetworkProfile()
    if (!account || !profile) return 'form'
    if (!this.networkProviderReady(account.network)) {
      this.error.set(i18n('wallet:error:provider-unavailable'))
      this.send.submitError.set(i18n('wallet:error:provider-unavailable'))
      return 'form'
    }
    const firstInvalidField = this.send.validateForPrepare()
    if (firstInvalidField) return firstInvalidField
    this.preparing.set(true)
    this.error.set(null)
    this.send.submitError.set(null)
    this.send.invalidatePrepared()
    try {
      const outputs = this.send.buildOutputs(profile)
      const maximizeOutputIndex =
        this.send.amountMode() === 'max'
          ? this.sendRecipients().findIndex((recipient) => recipient.id === this.send.activeRecipientId())
          : null
      const response = await wrap(
        this.rpcPort.rpc('wallet:transaction:prepare', {
          account_id: account.account_id,
          network: account.network,
          outputs,
          fee_policy: {tier: this.sendFeeTier()},
          ...(maximizeOutputIndex === null ? {} : {maximize_output_index: maximizeOutputIndex}),
        }),
      )
      this.prepared.set(response)
      return null
    } catch (error) {
      this.error.set(rpcErrorMessage(error))
      return this.send.applyPrepareError(error)
    } finally {
      this.preparing.set(false)
    }
  }

  async confirmSend(): Promise<void> {
    const prepared = this.prepared()
    if (!prepared || !this.canConfirmPrepared()) return
    this.confirming.set(true)
    this.error.set(null)
    try {
      const response = await wrap(
        this.rpcPort.rpc('wallet:transaction:confirm', {
          preparation_id: prepared.preparation_id,
          accepted_warnings: [...this.acceptedWarnings()],
          master_password: this.sendMasterPassword(),
          spend_authorization_id: null,
        }),
      )
      this.lastConfirm.set(response)
      this.send.reset()
      this.overlay.set(null)
      this.mainTab.set('activity')
      this.notice.set(
        response.status === 'broadcast_unknown'
          ? i18n('wallet:notice:broadcast-unknown')
          : i18n('wallet:notice:pending'),
      )
      await wrap(this.reloadWalletData())
    } catch (error) {
      this.error.set(rpcErrorMessage(error))
    } finally {
      this.confirming.set(false)
    }
  }

  async cancelPrepared(): Promise<void> {
    const prepared = this.prepared()
    this.send.invalidatePrepared()
    this.sendMasterPassword.set('')
    if (!prepared) return
    try {
      await wrap(this.rpcPort.rpc('wallet:transaction:cancel', {preparation_id: prepared.preparation_id}))
    } catch (error) {
      this.error.set(rpcErrorMessage(error))
    }
  }

  async refreshTransaction(txRef: string): Promise<void> {
    if (this.refreshTxRef()) return
    const transaction = this.selectedTransactions().find((item) => item.tx_ref === txRef)
    if (!transaction || !this.networkProviderReady(transaction.network)) {
      this.error.set(i18n('wallet:error:provider-unavailable'))
      return
    }
    this.refreshTxRef.set(txRef)
    this.error.set(null)
    try {
      await wrap(this.rpcPort.rpc('wallet:transactions:refresh', {tx_ref: txRef}))
      await wrap(this.reloadTransactions())
    } catch (error) {
      this.error.set(rpcErrorMessage(error))
    } finally {
      this.refreshTxRef.set(null)
    }
  }

  async rebroadcastTransaction(): Promise<void> {
    const txRef = this.rebroadcastTxRef()
    if (!txRef || !this.canRebroadcast()) return
    this.rebroadcasting.set(true)
    this.error.set(null)
    try {
      const response = await wrap(
        this.rpcPort.rpc('wallet:transaction:rebroadcast', {
          tx_ref: txRef,
          master_password: this.rebroadcastMasterPassword(),
        }),
      )
      this.cancelRebroadcast()
      this.notice.set(
        response.status === 'broadcast_unknown'
          ? i18n('wallet:notice:broadcast-unknown')
          : i18n('wallet:notice:rebroadcast-submitted'),
      )
      await wrap(this.reloadTransactions())
    } catch (error) {
      this.rebroadcastMasterPassword.set('')
      this.error.set(rpcErrorMessage(error))
    } finally {
      this.rebroadcasting.set(false)
    }
  }

  async exportRecovery(): Promise<void> {
    const wallet = this.selectedWallet()
    if (!wallet || wallet.kind !== 'hd') return
    this.error.set(null)
    this.clearRecoverySecrets()
    try {
      const response = await wrap(
        this.rpcPort.rpc('wallet:backup:export', {
          wallet_id: wallet.wallet_id,
          master_password: this.recoveryMasterPassword(),
        }),
      )
      this.recoveryMnemonic.set(response.mnemonic)
      this.recoveryMnemonicStandard.set(response.mnemonic_standard)
      this.recoveryPassphrase.set(response.bip39_passphrase)
      this.recoveryMasterPassword.set('')
    } catch (error) {
      this.error.set(rpcErrorMessage(error))
    }
  }

  async copySelectedAddress(): Promise<void> {
    const address = this.selectedAddress()
    if (!address) return
    try {
      await wrap(navigator.clipboard.writeText(address))
      this.notice.set(i18n('wallet:notice:address-copied'))
    } catch (error) {
      this.error.set(rpcErrorMessage(error))
    }
  }

  displayBalance(): string {
    return formatAccountBalance(this.selectedAccount(), this.selectedBalance())
  }

  displaySpendable(): string {
    return formatAccountBalance(this.selectedAccount(), this.selectedBalance(), 'spendable')
  }

  clearSensitiveState(): void {
    this.setup.clearSensitiveState()
    this.setupFlow.set(null)
    this.setupVisible.set(false)
    this.overlay.set(null)
    this.recoveryMasterPassword.set('')
    this.send.reset()
    this.cancelRebroadcast()
    this.rebroadcasting.set(false)
    this.clearRecoverySecrets()
  }

  /** Before opening Send, move to a network account that can actually transfer, if the selected one cannot. */
  private selectSendReadyAccount(): void {
    if (this.prepared() || this.preparing() || this.confirming()) return
    const accountId = this.sendReadyAccountId()
    if (accountId && accountId !== this.selectedAccountId()) this.selectAccount(accountId)
  }

  private selectCreated(walletId: string, accountId: string | null): void {
    this.selectedWalletId.set(walletId)
    this.selectAccountInternal(accountId)
  }

  private finishSetup(notice: string): void {
    this.setupFlow.set(null)
    this.setupVisible.set(false)
    this.overlay.set(null)
    this.mainTab.set('overview')
    this.notice.set(notice)
  }

  private async refreshSelectedResources(): Promise<void> {
    await wrap(Promise.all([this.refreshWalletBalances(), this.reloadTransactions()]))
  }

  private refreshWalletBalances(): Promise<void> {
    return this.balanceController.refreshSelectedWallet()
  }

  private async reloadTransactions(): Promise<void> {
    await this.transactionsController.reload()
  }

  private ensureSelectedContext(): void {
    const wallets = this.wallets()
    const selectedWalletId = this.selectedWalletId()
    const selectedWallet =
      wallets.find((wallet) => wallet.wallet_id === selectedWalletId) ?? wallets[0] ?? null
    this.selectedWalletId.set(selectedWallet?.wallet_id ?? null)
    if (!selectedWallet) {
      this.selectedAccountId.set(null)
      return
    }
    const accounts = this.accounts().filter((account) => account.wallet_id === selectedWallet.wallet_id)
    const remembered = this.selectedAccountByWallet()[selectedWallet.wallet_id]
    const current = this.selectedAccountId()
    const selected =
      accounts.find((account) => account.account_id === current) ??
      accounts.find((account) => account.account_id === remembered) ??
      accounts[0] ??
      null
    this.selectAccountInternal(selected?.account_id ?? null)
  }

  private selectAccountInternal(accountId: string | null): void {
    this.selectedAccountId.set(accountId)
    const walletId = this.selectedWalletId()
    if (walletId && accountId) {
      this.selectedAccountByWallet.set({...this.selectedAccountByWallet(), [walletId]: accountId})
    }
  }

  private clearContextSensitiveState(): void {
    const prepared = this.prepared()
    this.send.reset()
    this.sendDetectionSequence += 1
    this.sendDestinationNetwork.set(null)
    if (prepared) {
      void this.rpcPort
        .rpc('wallet:transaction:cancel', {preparation_id: prepared.preparation_id})
        .catch(() => {})
    }
    this.cancelRebroadcast()
    this.lastConfirm.set(null)
    this.recoveryMasterPassword.set('')
    this.clearRecoverySecrets()
  }

  private clearMainTabSensitiveState(previous: WalletMainTab): void {
    if (previous === 'send') void this.cancelPrepared()
    if (previous === 'recovery') {
      this.recoveryMasterPassword.set('')
      this.clearRecoverySecrets()
    }
    if (previous === 'activity') this.cancelRebroadcast()
  }

  private clearSetupSensitiveState(previous: Exclude<WalletSetupFlow, null>): void {
    if (previous === 'create') this.setup.invalidateGeneratedMnemonic()
    if (previous === 'restore') this.setup.restoreMnemonicText.set('')
    if (previous === 'create' || previous === 'restore') {
      this.setup.bip39Passphrase.set('')
      this.setup.useBip39Passphrase.set(false)
    }
    if (previous === 'import') this.setup.importPrivateKey.set('')
  }

  private clearRecoverySecrets(): void {
    this.recoveryMnemonic.set([])
    this.recoveryMnemonicStandard.set(null)
    this.recoveryPassphrase.set(null)
  }

  private clearBalance(accountId: string): void {
    if (!this.balances()[accountId]) return
    const next = {...this.balances()}
    delete next[accountId]
    this.balances.set(next)
  }
}

export const walletPageModel = new WalletPageModel()
