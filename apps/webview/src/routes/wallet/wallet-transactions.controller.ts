import {atom, computed, wrap} from '@reatom/core'

import type {WalletAccount, WalletRpcPort, WalletTransaction} from './wallet-page.types'

type WritableState<T> = (() => T) & {set(value: T): void}

export type WalletTransactionsHost = {
  selectedAccount: () => WalletAccount | null
  selectedAccountId: () => string | null
  transactions: WritableState<WalletTransaction[]>
  error: WritableState<string | null>
  networkProviderReady(network: string): boolean
}

export class WalletTransactionsController {
  private loadId = 0
  private readonly syncRequests = new Map<string, Promise<void>>()
  private readonly syncingAccounts = atom<Record<string, true>>({}, 'wallet.syncingTransactionAccounts')

  readonly loading = atom(false, 'wallet.txLoading')
  readonly selectedSyncing = computed(() => {
    const accountId = this.host.selectedAccountId()
    return Boolean(accountId && this.syncingAccounts()[accountId])
  }, 'wallet.selectedTransactionSyncing')

  constructor(
    private readonly host: WalletTransactionsHost,
    private readonly rpcPort: WalletRpcPort,
    private readonly formatError: (error: unknown) => string,
  ) {}

  async reload(): Promise<void> {
    const account = this.host.selectedAccount()
    const loadId = ++this.loadId
    if (!account) {
      this.host.transactions.set([])
      this.loading.set(false)
      return
    }

    this.loading.set(true)
    const cacheLoaded = await wrap(this.loadCached(account.account_id, loadId))
    if (loadId === this.loadId) this.loading.set(false)
    if (!cacheLoaded || !this.canSync(account)) return

    try {
      await wrap(this.requestSync(account.account_id))
    } catch (error) {
      if (this.isCurrent(account.account_id, loadId)) this.host.error.set(this.formatError(error))
      return
    }
    if (this.isCurrent(account.account_id, loadId)) await wrap(this.loadCached(account.account_id, loadId))
  }

  private async loadCached(accountId: string, loadId: number): Promise<boolean> {
    try {
      const response = await wrap(
        this.rpcPort.rpc('wallet:transactions:list', {
          wallet_id: null,
          account_id: accountId,
          status: null,
          limit: 50,
          cursor: null,
        }),
      )
      if (this.isCurrent(accountId, loadId)) this.host.transactions.set(response.transactions)
      return true
    } catch (error) {
      if (this.isCurrent(accountId, loadId)) this.host.error.set(this.formatError(error))
      return false
    }
  }

  private canSync(account: WalletAccount): boolean {
    return account.network === 'ton' && this.host.networkProviderReady(account.network)
  }

  private requestSync(accountId: string): Promise<void> {
    const existing = this.syncRequests.get(accountId)
    if (existing) return existing

    this.setSyncing(accountId, true)
    const request = this.rpcPort
      .rpc('wallet:transactions:sync', {account_id: accountId, limit: 50})
      .then(() => undefined)
    this.syncRequests.set(accountId, request)
    void request.then(
      () => this.finishSync(accountId, request),
      () => this.finishSync(accountId, request),
    )
    return request
  }

  private finishSync(accountId: string, request: Promise<void>): void {
    if (this.syncRequests.get(accountId) !== request) return
    this.syncRequests.delete(accountId)
    this.setSyncing(accountId, false)
  }

  private setSyncing(accountId: string, syncing: boolean): void {
    const accounts = {...this.syncingAccounts()}
    if (syncing) accounts[accountId] = true
    else delete accounts[accountId]
    this.syncingAccounts.set(accounts)
  }

  private isCurrent(accountId: string, loadId: number): boolean {
    return loadId === this.loadId && this.host.selectedAccountId() === accountId
  }
}
