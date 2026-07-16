import {atom, computed, wrap} from '@reatom/core'

import {
  walletAccountLabel,
  type WalletAccount,
  type WalletMainTab,
  type WalletOverlay,
  type WalletSetupFlow,
  type WalletStatus,
  type WalletSummary,
  type WalletToolbarCommand,
  type WalletToolbarContext,
} from './wallet-page.types'

type ReadonlyState<T> = () => T
type WritableState<T> = ReadonlyState<T> & {set(value: T): void}

export type WalletToolbarHost = {
  status: ReadonlyState<WalletStatus | null>
  wallets: ReadonlyState<WalletSummary[]>
  selectedWallet: ReadonlyState<WalletSummary | null>
  selectedAccount: ReadonlyState<WalletAccount | null>
  selectedAddress: ReadonlyState<string>
  canDeriveReceiveAddress: ReadonlyState<boolean>
  selectedNetworkProfile: ReadonlyState<{label: string} | null>
  selectedNetworkReady: ReadonlyState<boolean>
  selectedTransactionReady: ReadonlyState<boolean>
  mainTab: ReadonlyState<WalletMainTab>
  setupFlow: ReadonlyState<WalletSetupFlow>
  setupVisible: ReadonlyState<boolean>
  overlay: ReadonlyState<WalletOverlay>
  loading: ReadonlyState<boolean>
  preparing: ReadonlyState<boolean>
  prepared: ReadonlyState<unknown>
  confirming: ReadonlyState<boolean>
  error: WritableState<string | null>
  notice: WritableState<string | null>
  openOverlay(overlay: Exclude<WalletOverlay, null>): void
  setMainTab(tab: WalletMainTab): void
  reloadWalletData(): Promise<void>
}

export function createWalletToolbar(host: WalletToolbarHost, formatError: (error: unknown) => string) {
  const refreshing = atom(false, 'wallet.refreshing')
  let refreshInFlight: Promise<void> | null = null
  const context = computed<WalletToolbarContext>(() => {
    const status = host.status()
    const wallet = host.selectedWallet()
    const account = host.selectedAccount()
    const network = host.selectedNetworkProfile()
    const transactionBusy = Boolean(host.preparing() || host.prepared() || host.confirming())
    const ready = Boolean(
      status?.enabled && wallet && account && !host.loading() && !host.setupVisible() && !host.setupFlow(),
    )

    return {
      ready,
      walletLabel: wallet?.label ?? '',
      accountLabel: account ? walletAccountLabel(account) : '',
      networkLabel: network?.label ?? account?.network ?? '',
      walletCount: host.wallets().length,
      sendActive: ready && (host.mainTab() === 'send' || host.overlay() === 'send'),
      switcherOpen: host.overlay() === 'wallet-switcher',
      refreshing: refreshing(),
      transactionBusy,
      canSwitchWallet: ready && !transactionBusy,
      canSend: ready && (host.selectedTransactionReady() || transactionBusy),
      canReceive:
        ready && Boolean(host.selectedAddress() || host.canDeriveReceiveAddress()) && !transactionBusy,
      canRefresh: ready && host.selectedNetworkReady() && !refreshing() && !transactionBusy,
    }
  }, 'wallet.toolbarContext')

  const manualRefresh = async (): Promise<void> => {
    if (refreshInFlight) return refreshInFlight
    refreshInFlight = (async () => {
      refreshing.set(true)
      host.error.set(null)
      try {
        await wrap(host.reloadWalletData())
      } catch (error) {
        host.error.set(formatError(error))
      } finally {
        refreshing.set(false)
      }
    })().finally(() => {
      refreshInFlight = null
    })
    return refreshInFlight
  }

  const execute = (command: WalletToolbarCommand, presentation?: 'mobile'): boolean => {
    const snapshot = context()
    if (command === 'switch-wallet') {
      if (!snapshot.canSwitchWallet) return false
      host.openOverlay('wallet-switcher')
      return true
    }
    if (command === 'send') {
      if (!snapshot.canSend) return false
      if (presentation === 'mobile') host.openOverlay('send')
      else host.setMainTab('send')
      return true
    }
    if (command === 'receive') {
      if (!snapshot.canReceive) return false
      host.error.set(null)
      host.notice.set(null)
      host.openOverlay('receive')
      return true
    }
    if (!snapshot.canRefresh) return false
    void manualRefresh()
    return true
  }

  return {refreshing, context, manualRefresh, execute}
}
