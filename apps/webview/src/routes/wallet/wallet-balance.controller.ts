import {atom, computed, wrap} from '@reatom/core'

import type {WalletAccount, WalletBalanceResponse, WalletRpcPort, WalletSummary} from './wallet-page.types'

type WritableState<T> = (() => T) & {set(value: T): void}

export type WalletBalanceHost = {
  selectedAccount: () => WalletAccount | null
  selectedAccountId: () => string | null
  selectedWalletId: () => string | null
  wallets: () => WalletSummary[]
  accounts: () => WalletAccount[]
  balances: WritableState<Record<string, WalletBalanceResponse>>
  error: WritableState<string | null>
  networkProviderReady(network: string): boolean
  reloadWalletData(refreshResources?: boolean): Promise<void>
}

/** Networks whose restore discovery has not completed yet for this wallet. */
export function discoveryPendingNetworks(wallet: WalletSummary | undefined): string[] {
  if (!wallet) return []
  const networks = wallet.bitcoin_discovery_pending ? ['bitcoin'] : []
  for (const network of wallet.account_discovery_pending ?? []) {
    if (!networks.includes(network)) networks.push(network)
  }
  return networks
}

export class WalletBalanceController {
  private readonly requests = new Map<string, Promise<WalletBalanceResponse>>()
  private discoveryRun: Promise<void> | null = null
  private readonly loadingAccountCounts = atom<Record<string, number>>({}, 'wallet.loadingBalanceAccountCounts')
  readonly selectedLoading = computed(() => {
    const accountId = this.host.selectedAccountId()
    return Boolean(accountId && this.loadingAccountCounts()[accountId])
  }, 'wallet.selectedBalanceLoading')
  /** Accounts whose balance request is still in flight (for the per-network summary). */
  readonly loadingAccountIds = computed(
    () => new Set(Object.keys(this.loadingAccountCounts())),
    'wallet.loadingBalanceAccountIds',
  )
  readonly discoveryWalletId = atom<string | null>(null, 'wallet.discoveryWalletId')
  readonly discoveryErrors = atom<Record<string, string>>({}, 'wallet.discoveryErrors')
  readonly selectedDiscoveryPendingNetworks = computed(() => {
    const walletId = this.host.selectedWalletId()
    return new Set(
      walletId ? discoveryPendingNetworks(this.host.wallets().find((wallet) => wallet.wallet_id === walletId)) : [],
    )
  }, 'wallet.selectedRecoveryDiscoveryPendingNetworks')
  readonly selectedDiscoveryPending = computed(
    () => this.selectedDiscoveryPendingNetworks().size > 0,
    'wallet.selectedRecoveryDiscoveryPending',
  )
  readonly selectedDiscoveryLoading = computed(
    () => this.discoveryWalletId() === this.host.selectedWalletId(),
    'wallet.selectedRecoveryDiscoveryLoading',
  )
  readonly selectedDiscoveryError = computed(() => {
    const walletId = this.host.selectedWalletId()
    return walletId ? (this.discoveryErrors()[walletId] ?? null) : null
  }, 'wallet.selectedRecoveryDiscoveryError')
  readonly selectedTransactionReady = computed(() => {
    const account = this.host.selectedAccount()
    return Boolean(
      account &&
      this.host.networkProviderReady(account.network) &&
      !this.accountDiscoveryPending(account),
    )
  }, 'wallet.selectedTransactionReady')

  constructor(
    private readonly host: WalletBalanceHost,
    private readonly rpcPort: WalletRpcPort,
    private readonly formatError: (error: unknown) => string,
  ) {}

  /** Balances and sends wait while the wallet still has to discover this account's network. */
  accountDiscoveryPending(account: WalletAccount): boolean {
    const wallet = this.host.wallets().find((item) => item.wallet_id === account.wallet_id)
    return discoveryPendingNetworks(wallet).includes(account.network)
  }

  async refreshSelectedWallet(): Promise<void> {
    const walletId = this.host.selectedWalletId()
    if (!walletId) return
    const accounts = this.host
      .accounts()
      .filter(
        (account) =>
          account.wallet_id === walletId &&
          this.host.networkProviderReady(account.network) &&
          !this.accountDiscoveryPending(account),
      )
    await wrap(Promise.all(accounts.map((account) => this.refreshAccount(account))))
  }

  private async refreshAccount(account: WalletAccount): Promise<void> {
    this.setLoading(account.account_id, true)
    try {
      const response = await wrap(this.request(account.account_id, false))
      this.storeBalance(response)
    } catch (error) {
      if (this.host.selectedAccountId() === account.account_id) this.host.error.set(this.formatError(error))
    } finally {
      this.setLoading(account.account_id, false)
    }
  }

  startPendingDiscovery(): void {
    if (this.discoveryRun) return
    const run = this.runPendingDiscovery()
    this.discoveryRun = run
    void run.finally(() => {
      if (this.discoveryRun === run) this.discoveryRun = null
    })
  }

  hydrateCachedBalances(cachedBalances: readonly WalletBalanceResponse[]): void {
    const accounts = new Map(this.host.accounts().map((account) => [account.account_id, account]))
    const balances: Record<string, WalletBalanceResponse> = {}
    for (const [accountId, balance] of Object.entries(this.host.balances())) {
      if (accounts.get(accountId)?.network === balance.network) balances[accountId] = balance
    }
    for (const cached of cachedBalances) {
      if (accounts.get(cached.account_id)?.network !== cached.network) continue
      const current = balances[cached.account_id]
      if (!current || cached.fetched_at > current.fetched_at) balances[cached.account_id] = cached
    }
    this.host.balances.set(balances)
  }

  private async runPendingDiscovery(): Promise<void> {
    for (const wallet of this.host.wallets()) {
      for (const network of discoveryPendingNetworks(wallet)) {
        const account = this.host
          .accounts()
          .find((item) => item.wallet_id === wallet.wallet_id && item.network === network)
        if (!account || !this.host.networkProviderReady(account.network)) continue

        this.discoveryWalletId.set(wallet.wallet_id)
        this.setDiscoveryError(wallet.wallet_id, null)
        try {
          const response = await wrap(this.request(account.account_id, true))
          this.storeBalance(response)
          await wrap(this.host.reloadWalletData(false))
        } catch (error) {
          this.setDiscoveryError(wallet.wallet_id, this.formatError(error))
        } finally {
          if (this.discoveryWalletId() === wallet.wallet_id) this.discoveryWalletId.set(null)
        }
      }
    }
  }

  private request(accountId: string, discoverAddresses: boolean): Promise<WalletBalanceResponse> {
    const requestKey = `${accountId}:${discoverAddresses ? 'discovery' : 'balance'}`
    const existing = this.requests.get(requestKey)
    if (existing) return existing

    const request = this.rpcPort.rpc(
      'wallet:balance:get',
      discoverAddresses ? {account_id: accountId, discover_addresses: true} : {account_id: accountId},
    )
    this.requests.set(requestKey, request)
    void request.then(
      () => this.deleteRequest(requestKey, request),
      () => this.deleteRequest(requestKey, request),
    )
    return request
  }

  private deleteRequest(requestKey: string, request: Promise<WalletBalanceResponse>): void {
    if (this.requests.get(requestKey) === request) this.requests.delete(requestKey)
  }

  private setDiscoveryError(walletId: string, error: string | null): void {
    const errors = {...this.discoveryErrors()}
    if (error) errors[walletId] = error
    else delete errors[walletId]
    this.discoveryErrors.set(errors)
  }

  private setLoading(accountId: string, loading: boolean): void {
    const counts = {...this.loadingAccountCounts()}
    const count = (counts[accountId] ?? 0) + (loading ? 1 : -1)
    if (count > 0) counts[accountId] = count
    else delete counts[accountId]
    this.loadingAccountCounts.set(counts)
  }

  private storeBalance(response: WalletBalanceResponse): void {
    const account = this.host.accounts().find((item) => item.account_id === response.account_id)
    if (account?.network !== response.network) return
    const current = this.host.balances()[response.account_id]
    if (current && current.fetched_at > response.fetched_at) return
    this.host.balances.set({...this.host.balances(), [response.account_id]: response})
  }
}
