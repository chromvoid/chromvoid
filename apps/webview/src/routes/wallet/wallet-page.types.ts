import {i18n} from 'root/i18n'
import type {RpcCmdData, RpcCmdName, RpcCmdResult} from 'root/core/transport/tauri/tauri-rpc-types'
import {formatWalletAmount} from './wallet-format'
import {getWalletNetworkProfile} from './wallet-network'

export type WalletRpcPort = {
  rpc<T extends RpcCmdName>(command: T, data: RpcCmdData<T>): Promise<RpcCmdResult<T>>
}

export type WalletStatus = RpcCmdResult<'wallet:status'>
export type WalletNetworkStatus = WalletStatus['networks'][number]
export type WalletSummary = RpcCmdResult<'wallet:list'>['wallets'][number]
export type WalletAccount = RpcCmdResult<'wallet:accounts:list'>['accounts'][number]
export type WalletBalanceResponse = RpcCmdResult<'wallet:balance:get'>
export type WalletTransaction = RpcCmdResult<'wallet:transactions:list'>['transactions'][number]
export type WalletPrepareResponse = RpcCmdResult<'wallet:transaction:prepare'>
export type WalletQuoteResponse = RpcCmdResult<'wallet:transaction:quote'>
export type WalletConfirmResponse = RpcCmdResult<'wallet:transaction:confirm'>
export type WalletAddressBookEntry = RpcCmdResult<'wallet:addressBook:list'>['entries'][number]

export type WalletMainTab = 'overview' | 'send' | 'activity' | 'recovery'
export type WalletSetupFlow = 'create' | 'restore' | 'import' | null
export type WalletOverlay = 'wallet-switcher' | 'add-account' | 'import-wallet' | 'receive' | 'send' | null
export type WalletMode = WalletMainTab | Exclude<WalletSetupFlow, null>

export type WalletToolbarCommand = 'switch-wallet' | 'send' | 'receive' | 'refresh'

export type WalletToolbarContext = {
  ready: boolean
  walletLabel: string
  accountLabel: string
  networkLabel: string
  walletCount: number
  sendActive: boolean
  switcherOpen: boolean
  refreshing: boolean
  transactionBusy: boolean
  canSwitchWallet: boolean
  canSend: boolean
  canReceive: boolean
  canRefresh: boolean
}

export type WalletSendRecipient = {
  id: string
  address: string
  amount: string
}

export type WalletOwnRecipient = {
  accountId: string
  label: string
  address: string
}

export function walletAccountId(account: WalletAccount): string {
  return account.account_id
}

export function walletAccountAddress(account: WalletAccount): string {
  if (account.kind === 'imported') return account.address
  return account.address ?? account.current_receive_address ?? account.raw_account ?? ''
}

export function walletAccountLabel(account: WalletAccount): string {
  return (
    account.label?.trim() ||
    (account.kind === 'imported' ? i18n('wallet:account:imported') : i18n('wallet:account:derived'))
  )
}

export function walletAccountContract(account: WalletAccount): string {
  if (account.wallet_contract) return account.wallet_contract
  return account.kind === 'derived' ? account.account_model : account.network
}

export function formatAccountBalance(
  account: WalletAccount | null,
  balance: WalletBalanceResponse | null,
  field: 'total' | 'spendable' = 'total',
): string {
  if (!account || !balance) {
    const symbol = account ? getWalletNetworkProfile(account.network)?.symbol : ''
    return `— ${symbol ?? ''}`.trim()
  }
  return formatWalletAmount(balance.balance[field], balance.balance.amount_unit, account.network)
}

export function walletTransactionDirection(
  transaction: WalletTransaction,
): NonNullable<WalletTransaction['direction']> {
  return transaction.direction ?? (transaction.broadcast_artifact_ref ? 'outgoing' : 'unknown')
}

export function formatWalletTransactionAmount(transaction: WalletTransaction): string {
  const amount = formatWalletAmount(transaction.amount, transaction.amount_unit, transaction.network)
  const direction = walletTransactionDirection(transaction)
  if (direction === 'incoming') return `+${amount}`
  if (direction === 'outgoing') return `−${amount}`
  return amount
}

export function walletTransactionDirectionLabel(transaction: WalletTransaction): string {
  switch (walletTransactionDirection(transaction)) {
    case 'incoming':
      return i18n('wallet:activity:incoming')
    case 'outgoing':
      return i18n('wallet:activity:outgoing')
    default:
      return i18n('wallet:activity:unknown-direction')
  }
}

export function walletTransactionCounterpartyLabel(transaction: WalletTransaction): string {
  return walletTransactionDirection(transaction) === 'incoming'
    ? i18n('wallet:activity:from')
    : i18n('wallet:activity:to')
}
