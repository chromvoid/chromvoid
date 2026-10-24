import {describe, expect, it, vi} from 'vitest'

import type {RpcCmdData, RpcCmdName, RpcCmdResult} from '../../src/core/transport/tauri/tauri-rpc-types'
import {WalletPageModel} from '../../src/routes/wallet/wallet-page.model'
import type {
  WalletAccount,
  WalletBalanceResponse,
  WalletPrepareResponse,
  WalletQuoteResponse,
  WalletRpcPort,
} from '../../src/routes/wallet/wallet-page.types'

type RpcCall = {
  command: RpcCmdName
  data: unknown
}

type WalletSummary = RpcCmdResult<'wallet:list'>['wallets'][number]
type WalletStatus = RpcCmdResult<'wallet:status'>
type WalletNetworkStatus = WalletStatus['networks'][number]
type WalletTransaction = RpcCmdResult<'wallet:transactions:list'>['transactions'][number]

const WALLET: WalletSummary = {
  wallet_id: 'wallet-1',
  kind: 'hd',
  label: 'Main TON',
  wallet_mode: 'multichain',
  mnemonic_standard: 'bip39',
  supported_networks: ['ton'],
  created_at: 1,
  updated_at: 1,
}

const ACCOUNT: WalletAccount = {
  kind: 'derived',
  account_id: 'account-1',
  wallet_id: WALLET.wallet_id,
  network: 'ton',
  wallet_mode: 'multichain',
  mnemonic_standard: 'bip39',
  account_model: 'account',
  derivation_profile: 'ton_bip39_wallet_tg_account',
  wallet_contract: 'wallet_tg',
  account_index: 0,
  workchain: 0,
  label: 'Main account',
  address: 'EQBabcdefghijklmnopqrstuvwxyz1234567890',
  raw_account: null,
  public_key: 'public-key',
  derivation_path: "m/44'/607'/0'",
  current_receive_address: 'EQBabcdefghijklmnopqrstuvwxyz1234567890',
  current_receive_derivation_path: "m/44'/607'/0'/0/0",
  next_receive_index: 1,
  next_change_index: 0,
  created_at: 1,
  updated_at: 1,
}

const CACHED_BALANCE: WalletBalanceResponse = {
  account_id: ACCOUNT.account_id,
  network: 'ton',
  balance: {
    spendable: '2300000000',
    pending_in: '0',
    pending_out: '0',
    total: '2340000000',
    amount_unit: 'nanoton',
  },
  fetched_at: 1_700_000_000_000,
}

const SECOND_ACCOUNT: WalletAccount = {
  ...ACCOUNT,
  account_id: 'account-2',
  account_index: 1,
  label: 'Second account',
  address: 'EQCabcdefghijklmnopqrstuvwxyz1234567890',
  current_receive_address: 'EQCabcdefghijklmnopqrstuvwxyz1234567890',
  derivation_path: "m/44'/607'/1'",
  current_receive_derivation_path: "m/44'/607'/1'/0/0",
  created_at: 3,
  updated_at: 3,
}

const NEW_WALLET: WalletSummary = {
  wallet_id: 'wallet-2',
  kind: 'hd',
  label: 'Separate TON',
  wallet_mode: 'ton_only',
  mnemonic_standard: 'ton_native',
  supported_networks: ['ton'],
  created_at: 4,
  updated_at: 4,
}

const NEW_WALLET_ACCOUNT: WalletAccount = {
  ...ACCOUNT,
  account_id: 'account-wallet-2',
  wallet_id: NEW_WALLET.wallet_id,
  wallet_mode: 'ton_only',
  mnemonic_standard: 'ton_native',
  account_index: 0,
  label: 'Separate account',
  address: 'EQNabcdefghijklmnopqrstuvwxyz1234567890',
  current_receive_address: 'EQNabcdefghijklmnopqrstuvwxyz1234567890',
  created_at: 4,
  updated_at: 4,
}

const IMPORTED_WALLET: WalletSummary = {
  wallet_id: 'wallet-imported',
  kind: 'imported',
  label: 'Imported TON',
  mnemonic_standard: 'imported',
  supported_networks: ['ton'],
  created_at: 1,
  updated_at: 1,
}

const IMPORTED_ACCOUNT: WalletAccount = {
  kind: 'imported',
  account_id: 'account-imported',
  wallet_id: IMPORTED_WALLET.wallet_id,
  network: 'ton',
  label: 'Imported account',
  address: 'EQIabcdefghijklmnopqrstuvwxyz1234567890',
  public_key: 'imported-public-key',
  curve: 'ed25519',
  wallet_contract: 'Telegram Wallet',
  workchain: 0,
  raw_account: null,
  created_at: 1,
  updated_at: 1,
}

const BITCOIN_WALLET: WalletSummary = {
  ...WALLET,
  wallet_id: 'wallet-bitcoin',
  label: 'Multichain wallet',
  supported_networks: ['bitcoin', 'ton'],
}

const BITCOIN_ACCOUNT: WalletAccount = {
  ...ACCOUNT,
  account_id: 'account-bitcoin',
  wallet_id: BITCOIN_WALLET.wallet_id,
  network: 'bitcoin',
  account_model: 'utxo',
  derivation_profile: 'bitcoin_bip84_account',
  wallet_contract: null,
  address: null,
  raw_account: null,
  current_receive_address: 'bc1qcurrentreceiveaddress',
  current_receive_derivation_path: "m/84'/0'/0'/0/0",
  derivation_path: "m/84'/0'/0'",
}

const MULTICHAIN_TON_ACCOUNT: WalletAccount = {
  ...ACCOUNT,
  account_id: 'account-bitcoin-ton',
  wallet_id: BITCOIN_WALLET.wallet_id,
}

const FRESH_BITCOIN_ACCOUNT: WalletAccount = {
  ...BITCOIN_ACCOUNT,
  current_receive_address: null,
  current_receive_derivation_path: null,
  next_receive_index: 0,
}

const RESTORED_BITCOIN_WALLET: WalletSummary = {
  ...BITCOIN_WALLET,
  bitcoin_discovery_pending: true,
}

const TRANSACTION: WalletTransaction = {
  tx_ref: 'tx-1',
  wallet_id: WALLET.wallet_id,
  account_id: ACCOUNT.account_id,
  network: 'ton',
  status: 'pending',
  tx_hash: null,
  message_ref: 'msg-1',
  broadcast_artifact_ref: 'tx-1',
  amount_unit: 'nanoton',
  amount: '1250000000',
  fee: '5000000',
  direction: 'outgoing',
  counterparty: 'EQDdestination',
  created_at: 2,
  updated_at: 2,
}

function tonStatus(input: Partial<WalletNetworkStatus> = {}): WalletNetworkStatus {
  return {
    network: 'ton',
    enabled: true,
    provider_status: 'ready',
    broadcast_enabled: true,
    capabilities: [
      {id: 'ton_native_transfer', state: 'ready', disabled_reason: null},
    ],
    disabled_reason: null,
    ...input,
  }
}

function bitcoinStatus(input: Partial<WalletNetworkStatus> = {}): WalletNetworkStatus {
  return {
    network: 'bitcoin',
    enabled: true,
    provider_status: 'ready',
    broadcast_enabled: true,
    capabilities: [{id: 'bitcoin_native_transfer', state: 'ready', disabled_reason: null}],
    disabled_reason: null,
    ...input,
  }
}

function walletStatus(networks: WalletNetworkStatus[] = [tonStatus()]): WalletStatus {
  return {
    initialized: true,
    wallet_count: 1,
    enabled: true,
    disabled_reason: null,
    networks,
  }
}

function preparedResponse(input: Partial<WalletPrepareResponse> = {}): WalletPrepareResponse {
  return {
    preparation_id: 'prep-1',
    wallet_id: WALLET.wallet_id,
    account_id: ACCOUNT.account_id,
    network: 'ton',
    preview: {
      amount_unit: 'nanoton',
      outputs: [{address: 'EQDdestination', amount: '1250000000', comment: 'hello'}],
      estimated_fee: '5000000',
      total_debit: '1255000000',
      warnings: [],
      ton: {
        wallet_contract: 'wallet_tg',
        seqno: 7,
        account_state: 'active',
        valid_until: 1000,
        message_mode: 3,
        sender_state_init_included: false,
        destination_state: 'active',
      },
    },
    expires_at: 100,
    ...input,
  }
}

function quoteResponse(input: Partial<WalletQuoteResponse> = {}): WalletQuoteResponse {
  return {
    account_id: ACCOUNT.account_id,
    network: 'ton',
    spendable: '2000000000',
    current_preview: {
      amount_unit: 'nanoton',
      outputs: [{address: 'EQDdestination', amount: '1000000000', comment: null}],
      estimated_fee: '5000000',
      total_debit: '1005000000',
      warnings: [],
    },
    max_preview: {
      amount_unit: 'nanoton',
      outputs: [{address: 'EQDdestination', amount: '1995000000', comment: null}],
      estimated_fee: '5000000',
      total_debit: '2000000000',
      warnings: [],
    },
    max_amount: '1995000000',
    quoted_at: Date.now(),
    expires_at: Date.now() + 30_000,
    ...input,
  }
}

function createWalletRpcPort(
  handler: <T extends RpcCmdName>(command: T, data: RpcCmdData<T>) => Promise<RpcCmdResult<T>>,
): {port: WalletRpcPort; calls: RpcCall[]} {
  const calls: RpcCall[] = []
  return {
    calls,
    port: {
      async rpc<T extends RpcCmdName>(command: T, data: RpcCmdData<T>): Promise<RpcCmdResult<T>> {
        calls.push({command, data})
        return handler(command, data)
      },
    },
  }
}

function defaultResponse<T extends RpcCmdName>(command: T): RpcCmdResult<T> {
  switch (command) {
    case 'wallet:status':
      return walletStatus() as RpcCmdResult<T>
    case 'wallet:list':
      return {wallets: [WALLET]} as RpcCmdResult<T>
    case 'wallet:accounts:list':
      return {accounts: [ACCOUNT], cached_balances: []} as RpcCmdResult<T>
    case 'wallet:balance:get':
      return {
        account_id: ACCOUNT.account_id,
        network: 'ton',
        balance: {
          spendable: '1200000000',
          pending_in: '0',
          pending_out: '0',
          total: '1230000000',
          amount_unit: 'nanoton',
        },
        fetched_at: 10,
      } as RpcCmdResult<T>
    case 'wallet:transactions:list':
      return {transactions: [TRANSACTION], next_cursor: null} as RpcCmdResult<T>
    case 'wallet:transactions:sync':
      return {
        account_id: ACCOUNT.account_id,
        network: 'ton',
        synced_count: 1,
        fetched_at: 11,
      } as RpcCmdResult<T>
    case 'wallet:transaction:quote':
      return quoteResponse() as RpcCmdResult<T>
    case 'wallet:addressBook:list':
      return {entries: []} as RpcCmdResult<T>
    default:
      throw new Error(`Unexpected RPC command: ${command}`)
  }
}

function findCall<T extends RpcCmdName>(calls: RpcCall[], command: T): RpcCmdData<T> {
  const call = calls.find((item) => item.command === command)
  if (!call) throw new Error(`Missing RPC call: ${command}`)
  return call.data as RpcCmdData<T>
}

function findCalls<T extends RpcCmdName>(calls: RpcCall[], command: T): RpcCmdData<T>[] {
  return calls.filter((item) => item.command === command).map((call) => call.data as RpcCmdData<T>)
}

describe('WalletPageModel', () => {
  it('loads wallet state, selects the first TON account, and fetches its balance', async () => {
    const {port, calls} = createWalletRpcPort(async (command) => defaultResponse(command))
    const model = new WalletPageModel(port)

    await model.load()

    expect(model.status()?.enabled).toBe(true)
    expect(model.selectedAccountId()).toBe(ACCOUNT.account_id)
    expect(model.transactions()).toEqual([TRANSACTION])
    expect(model.displayBalance()).toBe('1.23 TON')
    expect(calls.map((call) => call.command)).toEqual([
      'wallet:status',
      'wallet:list',
      'wallet:accounts:list',
      'wallet:balance:get',
      'wallet:transactions:list',
      'wallet:transactions:sync',
      'wallet:transactions:list',
    ])
    expect(findCall(calls, 'wallet:balance:get')).toEqual({account_id: ACCOUNT.account_id})
  })

  it('shows cached TON history before asynchronous sync completes and then refreshes it', async () => {
    type SyncResult = RpcCmdResult<'wallet:transactions:sync'>
    let resolveSync!: (value: SyncResult) => void
    const pendingSync = new Promise<SyncResult>((resolve) => {
      resolveSync = resolve
    })
    const liveTransaction: WalletTransaction = {
      ...TRANSACTION,
      tx_ref: 'ton-history-live',
      tx_hash: 'live-hash',
      message_ref: 'live-message',
      broadcast_artifact_ref: null,
      status: 'confirmed',
      direction: 'incoming',
      counterparty: 'EQ-source',
      amount: '2500000000',
      created_at: 20,
      updated_at: 20,
    }
    let listCalls = 0
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:transactions:list') {
        listCalls += 1
        return {
          transactions: listCalls === 1 ? [TRANSACTION] : [liveTransaction],
          next_cursor: null,
        } as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:transactions:sync') {
        return pendingSync as Promise<RpcCmdResult<typeof command>>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    const load = model.load()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(model.transactions()).toEqual([TRANSACTION])
    expect(model.txLoading()).toBe(false)
    expect(model.txSyncing()).toBe(true)
    expect(findCalls(calls, 'wallet:transactions:sync')).toEqual([
      {account_id: ACCOUNT.account_id, limit: 50},
    ])

    resolveSync({
      account_id: ACCOUNT.account_id,
      network: 'ton',
      synced_count: 1,
      fetched_at: 20,
    })
    await load

    expect(model.transactions()).toEqual([liveTransaction])
    expect(model.txSyncing()).toBe(false)
    expect(findCalls(calls, 'wallet:transactions:list')).toHaveLength(2)
  })

  it('keeps cached TON history when the live sync is unavailable', async () => {
    const {port} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:transactions:sync') throw new Error('TON provider unavailable')
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()

    expect(model.transactions()).toEqual([TRANSACTION])
    expect(model.txLoading()).toBe(false)
    expect(model.txSyncing()).toBe(false)
    expect(model.error()).toBe('TON provider unavailable')
  })

  it('exposes wallet structure while balance sync is pending and deduplicates that request', async () => {
    type BalanceResult = RpcCmdResult<'wallet:balance:get'>
    let resolveBalance!: (value: BalanceResult) => void
    const pendingBalance = new Promise<BalanceResult>((resolve) => {
      resolveBalance = resolve
    })
    let balanceCalls = 0
    const {port} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:balance:get') {
        balanceCalls += 1
        return pendingBalance as Promise<RpcCmdResult<typeof command>>
      }
      if (command === 'wallet:transactions:list') {
        return {transactions: [], next_cursor: null} as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    const firstLoad = model.load()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(model.loading()).toBe(false)
    expect(model.selectedAccountId()).toBe(ACCOUNT.account_id)
    expect(balanceCalls).toBe(1)

    const secondLoad = model.load()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(balanceCalls).toBe(1)

    resolveBalance(defaultResponse('wallet:balance:get'))
    await Promise.all([firstLoad, secondLoad])

    expect(model.displayBalance()).toBe('1.23 TON')
    expect(model.balanceLoading()).toBe(false)
  })

  it('hydrates a cached balance before live sync completes and replaces it with a newer result', async () => {
    type BalanceResult = RpcCmdResult<'wallet:balance:get'>
    let resolveBalance!: (value: BalanceResult) => void
    const pendingBalance = new Promise<BalanceResult>((resolve) => {
      resolveBalance = resolve
    })
    const {port} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:accounts:list') {
        return {
          accounts: [ACCOUNT],
          cached_balances: [CACHED_BALANCE],
        } as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:balance:get') {
        return pendingBalance as Promise<RpcCmdResult<typeof command>>
      }
      if (command === 'wallet:transactions:list') {
        return {transactions: [], next_cursor: null} as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    const load = model.load()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(model.loading()).toBe(false)
    expect(model.displayBalance()).toBe('2.34 TON')
    expect(model.selectedBalance()).toEqual(CACHED_BALANCE)

    const liveBalance: WalletBalanceResponse = {
      ...CACHED_BALANCE,
      balance: {...CACHED_BALANCE.balance, spendable: '3400000000', total: '3450000000'},
      fetched_at: CACHED_BALANCE.fetched_at + 1,
    }
    resolveBalance(liveBalance)
    await load

    expect(model.displayBalance()).toBe('3.45 TON')
    expect(model.selectedBalance()).toEqual(liveBalance)
  })

  it('retains a newer cached balance when live sync is stale or unavailable', async () => {
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:status') {
        return walletStatus([tonStatus({provider_status: 'unavailable'})]) as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:accounts:list') {
        return {
          accounts: [ACCOUNT],
          cached_balances: [CACHED_BALANCE],
        } as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()

    expect(model.selectedBalance()).toEqual(CACHED_BALANCE)
    expect(model.displayBalance()).toBe('2.34 TON')
    expect(findCalls(calls, 'wallet:balance:get')).toHaveLength(0)

    const staleLivePort = createWalletRpcPort(async (command) => {
      if (command === 'wallet:accounts:list') {
        return {
          accounts: [ACCOUNT],
          cached_balances: [CACHED_BALANCE],
        } as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    }).port
    const staleLiveModel = new WalletPageModel(staleLivePort)

    await staleLiveModel.load()

    expect(staleLiveModel.selectedBalance()).toEqual(CACHED_BALANCE)
    expect(staleLiveModel.displayBalance()).toBe('2.34 TON')
  })

  it('prunes cached balances whose accounts no longer exist', async () => {
    let accounts: WalletAccount[] = [ACCOUNT]
    const {port} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:accounts:list') {
        return {
          accounts,
          cached_balances: accounts.length ? [CACHED_BALANCE] : [],
        } as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:transactions:list') {
        return {transactions: [], next_cursor: null} as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    expect(model.balances()).toEqual({[ACCOUNT.account_id]: CACHED_BALANCE})

    accounts = []
    await model.reloadWalletData(false)

    expect(model.accounts()).toEqual([])
    expect(model.balances()).toEqual({})
    expect(model.selectedBalance()).toBeNull()
  })

  it('runs restored Bitcoin discovery lazily without blocking wallet load', async () => {
    type BalanceResult = RpcCmdResult<'wallet:balance:get'>
    let currentWallet: WalletSummary = RESTORED_BITCOIN_WALLET
    let resolveDiscovery!: (value: BalanceResult) => void
    const pendingDiscovery = new Promise<BalanceResult>((resolve) => {
      resolveDiscovery = resolve
    })
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:status') return walletStatus([bitcoinStatus()]) as RpcCmdResult<typeof command>
      if (command === 'wallet:list') return {wallets: [currentWallet]} as RpcCmdResult<typeof command>
      if (command === 'wallet:accounts:list') {
        return {accounts: [FRESH_BITCOIN_ACCOUNT]} as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:balance:get') {
        return pendingDiscovery as Promise<RpcCmdResult<typeof command>>
      }
      if (command === 'wallet:transactions:list') {
        return {transactions: [], next_cursor: null} as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()

    expect(model.loading()).toBe(false)
    expect(model.selectedRecoveryDiscoveryPending()).toBe(true)
    expect(model.selectedRecoveryDiscoveryLoading()).toBe(true)
    expect(model.selectedTransactionReady()).toBe(false)
    expect(findCalls(calls, 'wallet:balance:get')).toEqual([
      {account_id: FRESH_BITCOIN_ACCOUNT.account_id, discover_addresses: true},
    ])

    currentWallet = {...RESTORED_BITCOIN_WALLET, bitcoin_discovery_pending: false}
    resolveDiscovery({
      account_id: FRESH_BITCOIN_ACCOUNT.account_id,
      network: 'bitcoin',
      balance: {spendable: '42', pending_in: '0', pending_out: '0', total: '42', amount_unit: 'satoshi'},
      fetched_at: 20,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(model.selectedRecoveryDiscoveryPending()).toBe(false)
    expect(model.selectedRecoveryDiscoveryLoading()).toBe(false)
    expect(model.selectedTransactionReady()).toBe(true)
    expect(model.selectedBalance()?.balance.total).toBe('42')
    expect(findCalls(calls, 'wallet:balance:get')).toHaveLength(1)
  })

  it('runs restored Solana discovery from account_discovery_pending the same way', async () => {
    type BalanceResult = RpcCmdResult<'wallet:balance:get'>
    const solanaAccount: WalletAccount = {
      ...ACCOUNT,
      account_id: 'account-solana',
      wallet_id: BITCOIN_WALLET.wallet_id,
      network: 'solana',
      account_model: 'account',
      derivation_profile: 'solana_bip44_account',
      wallet_contract: null,
      address: 'So1anaAddress1111111111111111111111111111111',
      raw_account: null,
      derivation_path: "m/44'/501'/0'/0'",
    }
    const solanaStatus: WalletNetworkStatus = {
      ...bitcoinStatus(),
      network: 'solana',
      capabilities: [{id: 'solana_native_transfer', state: 'ready', disabled_reason: null}],
    }
    let currentWallet: WalletSummary = {...BITCOIN_WALLET, account_discovery_pending: ['solana']}
    let resolveDiscovery!: (value: BalanceResult) => void
    const pendingDiscovery = new Promise<BalanceResult>((resolve) => {
      resolveDiscovery = resolve
    })
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:status') return walletStatus([solanaStatus]) as RpcCmdResult<typeof command>
      if (command === 'wallet:list') return {wallets: [currentWallet]} as RpcCmdResult<typeof command>
      if (command === 'wallet:accounts:list') return {accounts: [solanaAccount]} as RpcCmdResult<typeof command>
      if (command === 'wallet:balance:get') return pendingDiscovery as Promise<RpcCmdResult<typeof command>>
      if (command === 'wallet:transactions:list') {
        return {transactions: [], next_cursor: null} as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()

    expect(model.selectedRecoveryDiscoveryPending()).toBe(true)
    expect(model.selectedTransactionReady()).toBe(false)
    expect(findCalls(calls, 'wallet:balance:get')).toEqual([
      {account_id: solanaAccount.account_id, discover_addresses: true},
    ])

    currentWallet = {...BITCOIN_WALLET, account_discovery_pending: []}
    resolveDiscovery({
      account_id: solanaAccount.account_id,
      network: 'solana',
      balance: {spendable: '7', pending_in: '0', pending_out: '0', total: '7', amount_unit: 'lamport'},
      fetched_at: 20,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(model.selectedRecoveryDiscoveryPending()).toBe(false)
    expect(model.selectedTransactionReady()).toBe(true)
    expect(model.selectedBalance()?.balance.total).toBe('7')
    expect(findCalls(calls, 'wallet:balance:get')).toHaveLength(1)
  })

  it('derives guarded toolbar context and commands from the selected wallet state', async () => {
    const {port} = createWalletRpcPort(async (command) => defaultResponse(command))
    const model = new WalletPageModel(port)

    await model.load()

    expect(model.toolbarContext()).toMatchObject({
      ready: true,
      walletLabel: WALLET.label,
      accountLabel: ACCOUNT.label,
      networkLabel: 'TON',
      walletCount: 1,
      sendActive: false,
      canSwitchWallet: true,
      canSend: true,
      canReceive: true,
      canRefresh: true,
    })

    expect(model.executeToolbarCommand('receive')).toBe(true)
    expect(model.overlay()).toBe('receive')

    model.closeOverlay()
    expect(model.executeToolbarCommand('send', 'mobile')).toBe(true)
    expect(model.overlay()).toBe('send')
    expect(model.mainTab()).toBe('overview')

    model.closeOverlay()
    expect(model.executeToolbarCommand('send')).toBe(true)
    expect(model.mainTab()).toBe('send')

    model.prepared.set(preparedResponse())
    expect(model.toolbarContext()).toMatchObject({
      sendActive: true,
      transactionBusy: true,
      canSwitchWallet: false,
      canSend: true,
      canReceive: false,
      canRefresh: false,
    })
    expect(model.executeToolbarCommand('switch-wallet')).toBe(false)
    expect(model.executeToolbarCommand('receive')).toBe(false)
    expect(model.executeToolbarCommand('refresh')).toBe(false)
    expect(model.executeToolbarCommand('send')).toBe(true)
    expect(model.prepared()).not.toBeNull()

    model.prepared.set(null)
    model.status.set(
      walletStatus([
        tonStatus({
          provider_status: 'unavailable',
          disabled_reason: 'Wallet provider unavailable',
        }),
      ]),
    )
    expect(model.toolbarContext()).toMatchObject({
      canSend: false,
      canReceive: true,
      canRefresh: false,
    })
  })

  it('deduplicates toolbar refresh and clears its reactive busy state after failure', async () => {
    type WalletListResult = RpcCmdResult<'wallet:list'>
    let walletListCalls = 0
    let rejectRefresh!: (reason: Error) => void
    const pendingRefresh = new Promise<WalletListResult>((_resolve, reject) => {
      rejectRefresh = reject
    })
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:list' && ++walletListCalls > 1) return pendingRefresh
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    const first = model.manualRefresh()
    const second = model.manualRefresh()

    expect(model.refreshing()).toBe(true)
    expect(model.toolbarContext().canRefresh).toBe(false)
    expect(calls.filter((call) => call.command === 'wallet:list')).toHaveLength(2)

    rejectRefresh(new Error('Refresh failed'))
    await Promise.all([first, second])

    expect(model.refreshing()).toBe(false)
    expect(model.error()).toBe('Refresh failed')
    expect(model.toolbarContext().canRefresh).toBe(true)
  })

  it('derives a new TON account through Core and selects it', async () => {
    let accounts = [ACCOUNT]
    const {port, calls} = createWalletRpcPort(async (command, data) => {
      if (command === 'wallet:accounts:derive') {
        accounts = [ACCOUNT, SECOND_ACCOUNT]
        return {account_id: SECOND_ACCOUNT.account_id} as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:accounts:list') return {accounts} as RpcCmdResult<typeof command>
      if (command === 'wallet:balance:get') {
        const request = data as RpcCmdData<'wallet:balance:get'>
        return {
          account_id: request.account_id,
          network: 'ton',
          balance: {
            spendable: '0',
            pending_in: '0',
            pending_out: '0',
            total: '0',
            amount_unit: 'nanoton',
          },
          fetched_at: 10,
        } as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    model.setMode('send')
    await model.deriveTonAccount()

    expect(findCall(calls, 'wallet:accounts:derive')).toEqual({
      wallet_id: WALLET.wallet_id,
      network: 'ton',
    })
    expect(model.accounts()).toEqual([ACCOUNT, SECOND_ACCOUNT])
    expect(model.selectedAccountId()).toBe(SECOND_ACCOUNT.account_id)
    expect(model.mode()).toBe('overview')
    expect(model.notice()).toBe('Account created.')
    expect(model.deriveAccountLoading()).toBe(false)
    const balanceCalls = findCalls(calls, 'wallet:balance:get')
    expect(balanceCalls[balanceCalls.length - 1]).toEqual({account_id: SECOND_ACCOUNT.account_id})
  })

  it('offers newly enabled networks when an older wallet has no network metadata yet', async () => {
    const bitcoinStatus: WalletNetworkStatus = {
      ...tonStatus(),
      network: 'bitcoin',
      capabilities: [{id: 'bitcoin_native_transfer', state: 'ready', disabled_reason: null}],
    }
    const {port} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:status') {
        return walletStatus([bitcoinStatus, tonStatus()]) as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()

    expect(WALLET.supported_networks).toEqual(['ton'])
    expect(model.derivableNetworks()).toEqual(['bitcoin', 'ton'])
    expect(model.canDeriveAccount('bitcoin')).toBe(true)
  })

  it('does not derive accounts for imported wallets', async () => {
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:list') return {wallets: [IMPORTED_WALLET]} as RpcCmdResult<typeof command>
      if (command === 'wallet:accounts:list')
        return {accounts: [IMPORTED_ACCOUNT]} as RpcCmdResult<typeof command>
      if (command === 'wallet:balance:get') {
        return {
          account_id: IMPORTED_ACCOUNT.account_id,
          network: 'ton',
          balance: {
            spendable: '0',
            pending_in: '0',
            pending_out: '0',
            total: '0',
            amount_unit: 'nanoton',
          },
          fetched_at: 10,
        } as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    await model.deriveTonAccount()

    expect(model.canDeriveTonAccount()).toBe(false)
    expect(calls.some((call) => call.command === 'wallet:accounts:derive')).toBe(false)
  })

  it('allows account derivation when the TON provider is unavailable', async () => {
    let accounts = [ACCOUNT]
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:status') {
        return walletStatus([
          tonStatus({
            provider_status: 'unavailable',
            disabled_reason: 'Wallet provider unavailable',
          }),
        ]) as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:accounts:derive') {
        accounts = [ACCOUNT, SECOND_ACCOUNT]
        return {account_id: SECOND_ACCOUNT.account_id} as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:accounts:list') return {accounts} as RpcCmdResult<typeof command>
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    await model.deriveTonAccount()

    expect(model.tonProviderReady()).toBe(false)
    expect(model.canDeriveTonAccount()).toBe(true)
    expect(findCall(calls, 'wallet:accounts:derive')).toEqual({
      wallet_id: WALLET.wallet_id,
      network: 'ton',
    })
    expect(model.selectedAccountId()).toBe(SECOND_ACCOUNT.account_id)
    expect(calls.some((call) => call.command === 'wallet:balance:get')).toBe(false)
  })

  it('creates a separate HD wallet when accounts already exist and selects its account', async () => {
    const mnemonic = [
      'abandon',
      'ability',
      'able',
      'about',
      'above',
      'absent',
      'absorb',
      'abstract',
      'absurd',
      'abuse',
      'access',
      'accident',
    ]
    let wallets = [WALLET]
    let accounts = [ACCOUNT]
    const {port, calls} = createWalletRpcPort(async (command, data) => {
      if (command === 'wallet:hd:create') {
        wallets = [WALLET, NEW_WALLET]
        accounts = [ACCOUNT, NEW_WALLET_ACCOUNT]
        return {
          wallet_id: NEW_WALLET.wallet_id,
          accounts: [NEW_WALLET_ACCOUNT],
        } as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:list') return {wallets} as RpcCmdResult<typeof command>
      if (command === 'wallet:accounts:list') return {accounts} as RpcCmdResult<typeof command>
      if (command === 'wallet:balance:get') {
        const request = data as RpcCmdData<'wallet:balance:get'>
        return {
          account_id: request.account_id,
          network: 'ton',
          balance: {
            spendable: '0',
            pending_in: '0',
            pending_out: '0',
            total: '0',
            amount_unit: 'nanoton',
          },
          fetched_at: 10,
        } as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    const balanceCallsBeforeCreate = findCalls(calls, 'wallet:balance:get').length
    model.setMode('create')
    model.setup.setRestoreProfile('ton_only')
    model.setup.createLabel.set('Separate multichain wallet')
    model.setup.generatedMnemonic.set(mnemonic)
    model.setup.generatedMnemonicDraftId.set('mnemonic-draft-1')
    // The passphrase is optional and the phrase is never confirmed by hand: Create is enough.
    expect(model.setup.canCreateGeneratedWallet()).toBe(true)
    model.setup.setUseBip39Passphrase(true)
    expect(model.setup.canCreateGeneratedWallet()).toBe(false)
    model.setup.setBip39Passphrase('secret')

    await model.createGeneratedWallet()

    expect(findCall(calls, 'wallet:hd:create')).toEqual({
      label: 'Separate multichain wallet',
      wallet_mode: 'multichain',
      mnemonic: null,
      mnemonic_draft_id: 'mnemonic-draft-1',
      wordlist: 'english',
      mnemonic_standard: 'rotation',
      bip39_passphrase: 'secret',
      supported_networks: ['ton'],
      client_request_id: expect.any(String),
    })
    expect(calls.some((call) => call.command === 'wallet:accounts:derive')).toBe(false)
    expect(findCalls(calls, 'wallet:balance:get')).toHaveLength(balanceCallsBeforeCreate)
    expect(model.wallets()).toEqual([WALLET, NEW_WALLET])
    expect(model.accounts()).toEqual([ACCOUNT, NEW_WALLET_ACCOUNT])
    expect(model.selectedAccountId()).toBe(NEW_WALLET_ACCOUNT.account_id)
    expect(model.mode()).toBe('overview')
    expect(model.notice()).toBe('Wallet created.')
    expect(model.setup.generatedMnemonic()).toEqual([])
    expect(model.setup.generatedMnemonicDraftId()).toBeNull()
  })

  it('always generates a multichain BIP39 mnemonic even after TON-native import was selected', async () => {
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:hd:generateMnemonic') {
        return {
          mnemonic_draft_id: 'mnemonic-draft-1',
          mnemonic: ['word-1', 'word-2'],
          wordlist: 'english',
          wallet_mode: 'multichain',
          mnemonic_standard: 'bip39',
          expires_at: 123,
        } as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)
    model.status.set(walletStatus())
    model.setup.ensureOptions()
    model.setup.setRestoreProfile('ton_only')

    await model.generateMnemonic()

    expect(findCall(calls, 'wallet:hd:generateMnemonic')).toEqual({
      wallet_mode: 'multichain',
      mnemonic_standard: 'rotation',
      word_count: 12,
      wordlist: 'english',
    })
    expect(model.setup.generatedMnemonic()).toEqual(['word-1', 'word-2'])
    expect(model.setup.generatedMnemonicDraftId()).toBe('mnemonic-draft-1')
    expect(model.setup.generatedMnemonicExpiresAt()).toBe(123)
  })

  it('deduplicates mnemonic generation while the offline RPC is pending', async () => {
    type GenerateResult = RpcCmdResult<'wallet:hd:generateMnemonic'>
    let resolveGeneration!: (value: GenerateResult) => void
    const pendingGeneration = new Promise<GenerateResult>((resolve) => {
      resolveGeneration = resolve
    })
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:hd:generateMnemonic') return pendingGeneration
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)
    model.status.set(walletStatus())
    model.setup.ensureOptions()

    const first = model.generateMnemonic()
    const second = model.generateMnemonic()

    expect(model.setup.mnemonicLoading()).toBe(true)
    expect(model.setup.canGenerateMnemonic()).toBe(false)
    expect(calls.filter((call) => call.command === 'wallet:hd:generateMnemonic')).toHaveLength(1)

    resolveGeneration({
      mnemonic_draft_id: 'mnemonic-draft-1',
      mnemonic: ['word-1', 'word-2'],
      wordlist: 'english',
      wallet_mode: 'multichain',
      mnemonic_standard: 'bip39',
      expires_at: 123,
    })
    await Promise.all([first, second])

    expect(model.setup.mnemonicLoading()).toBe(false)
    expect(model.setup.generatedMnemonic()).toEqual(['word-1', 'word-2'])
  })

  it('discards a mnemonic response after sensitive setup state is cleared', async () => {
    type GenerateResult = RpcCmdResult<'wallet:hd:generateMnemonic'>
    let resolveGeneration!: (value: GenerateResult) => void
    const pendingGeneration = new Promise<GenerateResult>((resolve) => {
      resolveGeneration = resolve
    })
    const {port} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:hd:generateMnemonic') return pendingGeneration
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)
    model.status.set(walletStatus())
    model.setup.ensureOptions()

    const generation = model.generateMnemonic()
    model.clearSensitiveState()
    resolveGeneration({
      mnemonic_draft_id: 'stale-draft',
      mnemonic: ['stale-word'],
      wordlist: 'english',
      wallet_mode: 'multichain',
      mnemonic_standard: 'bip39',
      expires_at: 123,
    })
    await generation

    expect(model.setup.generatedMnemonic()).toEqual([])
    expect(model.setup.generatedMnemonicDraftId()).toBeNull()
    expect(model.setup.mnemonicLoading()).toBe(false)
  })

  it('restores a multichain BIP39 wallet across every build-enabled network', async () => {
    const bitcoinStatus: WalletNetworkStatus = {
      ...tonStatus(),
      network: 'bitcoin',
      capabilities: [{id: 'bitcoin_native_transfer', state: 'ready', disabled_reason: null}],
    }
    const words = [
      'abandon',
      'ability',
      'able',
      'about',
      'above',
      'absent',
      'absorb',
      'abstract',
      'absurd',
      'abuse',
      'access',
      'accident',
    ]
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:status') {
        return walletStatus([bitcoinStatus, tonStatus()]) as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:hd:create') {
        return {wallet_id: WALLET.wallet_id, accounts: [ACCOUNT]} as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    model.setMode('restore')
    model.setup.restoreLabel.set('Across chains')
    model.setup.restoreMnemonicText.set(words.join(' '))
    model.setup.setUseBip39Passphrase(true)
    model.setup.bip39Passphrase.set('extra entropy')

    expect(model.setup.availableMultichainNetworks()).toEqual(['bitcoin', 'ton'])
    expect(model.setup.canRestoreHdWallet()).toBe(true)

    await model.restoreHdWallet()

    expect(findCall(calls, 'wallet:hd:create')).toEqual({
      label: 'Across chains',
      wallet_mode: 'multichain',
      mnemonic: words,
      mnemonic_draft_id: null,
      wordlist: 'english',
      mnemonic_standard: 'bip39',
      bip39_passphrase: 'extra entropy',
      supported_networks: ['bitcoin', 'ton'],
      client_request_id: expect.any(String),
    })
  })

  it('imports a TON-native wallet only through the recovery phrase flow', async () => {
    const words = Array.from({length: 24}, (_, index) => `word-${index + 1}`)
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:hd:create') {
        return {wallet_id: WALLET.wallet_id, accounts: [ACCOUNT]} as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    model.setMode('restore')
    model.setup.setRestoreProfile('ton_legacy')
    model.setup.restoreLabel.set('Imported TON wallet')
    model.setup.restoreMnemonicText.set(words.join(' '))

    expect(model.setup.canRestoreHdWallet()).toBe(true)

    await model.restoreHdWallet()

    expect(findCall(calls, 'wallet:hd:create')).toEqual({
      label: 'Imported TON wallet',
      wallet_mode: 'ton_only',
      mnemonic: words,
      mnemonic_draft_id: null,
      wordlist: 'english',
      mnemonic_standard: 'ton_native',
      bip39_passphrase: null,
      supported_networks: ['ton'],
      client_request_id: expect.any(String),
    })
  })

  it('restores a Telegram Wallet rotation phrase with 12 or 24 words', async () => {
    const anchor = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'.split(' ')
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:status') return walletStatus()
      if (command === 'wallet:hd:create') {
        return {wallet_id: 'wallet-rotation', accounts: [{...tonAccount(), wallet_id: 'wallet-rotation'}]}
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    model.setMode('restore')
    model.setup.setRestoreProfile('ton_only')
    model.setup.restoreLabel.set('Telegram wallet')
    model.setup.restoreMnemonicText.set(anchor.join(' '))
    expect(model.setup.restoreMnemonicStandard()).toBe('rotation')
    expect(model.setup.canRestoreHdWallet()).toBe(true)
    model.setup.restoreMnemonicText.set([...anchor, ...anchor].join(' '))
    expect(model.setup.canRestoreHdWallet()).toBe(true)
    model.setup.restoreMnemonicText.set(anchor.slice(0, 11).join(' '))
    expect(model.setup.canRestoreHdWallet()).toBe(false)
    model.setup.restoreMnemonicText.set(anchor.join(' '))

    await model.restoreHdWallet()

    expect(findCall(calls, 'wallet:hd:create')).toEqual({
      label: 'Telegram wallet',
      wallet_mode: 'ton_only',
      mnemonic: anchor,
      mnemonic_draft_id: null,
      wordlist: 'english',
      mnemonic_standard: 'rotation',
      bip39_passphrase: null,
      supported_networks: ['ton'],
      client_request_id: expect.any(String),
    })
  })

  it('imports a Bitcoin WIF with the chain-specific key contract', async () => {
    const bitcoinStatus: WalletNetworkStatus = {
      ...tonStatus(),
      network: 'bitcoin',
      capabilities: [{id: 'bitcoin_native_transfer', state: 'ready', disabled_reason: null}],
    }
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:status') {
        return walletStatus([bitcoinStatus, tonStatus()]) as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:import:create') {
        return {wallet_id: 'wallet-bitcoin', account_id: ACCOUNT.account_id} as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    model.setup.setImportNetwork('bitcoin')
    model.setup.importLabel.set('Cold key')
    model.setup.importPrivateKey.set('KxExampleCompressedMainnetWif')

    await model.importWallet()

    expect(model.setup.importEncodings()).toEqual(['wif'])
    expect(findCall(calls, 'wallet:import:create')).toEqual({
      label: 'Cold key',
      network: 'bitcoin',
      curve: 'secp256k1',
      private_key: 'KxExampleCompressedMainnetWif',
      encoding: 'wif',
      client_request_id: expect.any(String),
    })
  })

  it('prepares and confirms sends through Core with nanoton amount strings', async () => {
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:transaction:prepare') {
        return preparedResponse() as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:transaction:confirm') {
        return {
          tx_ref: 'tx-1',
          network: 'ton',
          status: 'pending',
          tx_hash: null,
        } as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    model.setSendDestination(' EQDdestination ')
    model.setSendAmountTon('1.25')
    model.setSendComment(' hello ')
    model.setSendMasterPassword('master-secret')

    await model.prepareSend()
    await model.confirmSend()

    expect(findCall(calls, 'wallet:transaction:prepare')).toEqual({
      account_id: ACCOUNT.account_id,
      network: 'ton',
      outputs: [{address: 'EQDdestination', amount: '1250000000', comment: 'hello'}],
      fee_policy: {tier: 'standard'},
    })
    expect(findCall(calls, 'wallet:transaction:confirm')).toEqual({
      preparation_id: 'prep-1',
      accepted_warnings: [],
      master_password: 'master-secret',
      spend_authorization_id: null,
    })
    expect(model.lastConfirm()?.tx_ref).toBe('tx-1')
    expect(model.lastConfirm()?.status).toBe('pending')
    expect(model.mode()).toBe('activity')
    expect(model.prepared()).toBeNull()
    expect(model.acceptedWarnings().size).toBe(0)
  })

  it('keeps TON preview data from Core after preparing a send', async () => {
    const {port} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:transaction:prepare') return preparedResponse() as RpcCmdResult<typeof command>
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    model.setSendDestination('EQDdestination')
    model.setSendAmountTon('1.25')

    await model.prepareSend()

    expect(model.prepared()?.preview.ton).toEqual({
      wallet_contract: 'wallet_tg',
      seqno: 7,
      account_state: 'active',
      valid_until: 1000,
      message_mode: 3,
      sender_state_init_included: false,
      destination_state: 'active',
    })
  })

  it('blocks TON confirmation when the transfer amount is below the estimated fee', async () => {
    const {port, calls} = createWalletRpcPort(async (command) => defaultResponse(command))
    const model = new WalletPageModel(port)

    await model.load()
    const base = preparedResponse()
    model.prepared.set(
      preparedResponse({
        preview: {
          ...base.preview,
          outputs: [{address: 'EQDdestination', amount: '4000000', comment: null}],
          estimated_fee: '5000000',
          total_debit: '9000000',
        },
      }),
    )
    model.setSendMasterPassword('master-secret')

    expect(model.preparedAmountBelowFee()).toBe(true)
    expect(model.canConfirmPrepared()).toBe(false)

    await model.confirmSend()

    expect(calls.some((call) => call.command === 'wallet:transaction:confirm')).toBe(false)

    model.prepared.set({
      ...base,
      preview: {
        ...base.preview,
        outputs: [{address: 'EQDdestination', amount: '5000000', comment: null}],
        estimated_fee: '5000000',
        total_debit: '10000000',
      },
    })
    expect(model.preparedAmountBelowFee()).toBe(false)
    expect(model.canConfirmPrepared()).toBe(true)
  })

  it('disables balance, send preparation, and tx refresh when the TON provider is unavailable', async () => {
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:status') {
        return walletStatus([
          tonStatus({
            provider_status: 'unavailable',
            disabled_reason: 'Wallet provider unavailable',
          }),
        ]) as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    model.setSendDestination('EQDdestination')
    model.setSendAmountTon('1')

    expect(model.tonProviderReady()).toBe(false)
    expect(model.canRefreshBalance()).toBe(false)
    expect(model.canPrepareSend()).toBe(false)
    expect(model.selectedBalance()).toBeNull()
    expect(calls.some((call) => call.command === 'wallet:balance:get')).toBe(false)

    await model.prepareSend()
    await model.refreshTransaction('tx-1')

    expect(model.error()).toBe('The selected network provider is unavailable.')
    expect(calls.some((call) => call.command === 'wallet:transaction:prepare')).toBe(false)
    expect(calls.some((call) => call.command === 'wallet:transactions:refresh')).toBe(false)
    expect(calls.some((call) => call.command === 'wallet:transaction:rebroadcast')).toBe(false)
  })

  it('requires the native transfer capability to be ready', async () => {
    const {port, calls} = createWalletRpcPort(async (command) => defaultResponse(command))
    const model = new WalletPageModel(port)
    model.status.set(
      walletStatus([
        tonStatus({
          capabilities: [{id: 'ton_native_transfer', state: 'disabled', disabled_reason: 'Not built'}],
        }),
      ]),
    )
    model.wallets.set([WALLET])
    model.accounts.set([ACCOUNT])
    model.selectedWalletId.set(WALLET.wallet_id)
    model.selectedAccountId.set(ACCOUNT.account_id)
    model.setSendDestination('EQDdestination')
    model.setSendAmountTon('1')

    expect(model.tonProviderReady()).toBe(false)
    expect(model.tonProviderUnavailableReason()).toBe('Not built')
    expect(model.canPrepareSend()).toBe(false)

    await model.prepareSend()

    expect(calls.some((call) => call.command === 'wallet:transaction:prepare')).toBe(false)
  })

  it('clears sensitive mode state and prepared transactions when leaving modes or disconnecting', () => {
    const {port} = createWalletRpcPort(async (command) => defaultResponse(command))
    const model = new WalletPageModel(port)

    model.setMode('create')
    model.setup.generatedMnemonic.set(['one', 'two'])
    model.setup.generatedMnemonicDraftId.set('mnemonic-draft-1')
    model.setup.generatedMnemonicExpiresAt.set(123)
    model.setup.createConfirmed.set(true)
    model.setup.setUseBip39Passphrase(true)
    model.setup.bip39Passphrase.set('create-passphrase')
    model.setMode('overview')

    expect(model.setup.generatedMnemonic()).toEqual([])
    expect(model.setup.generatedMnemonicDraftId()).toBeNull()
    expect(model.setup.generatedMnemonicExpiresAt()).toBeNull()
    expect(model.setup.createConfirmed()).toBe(false)
    expect(model.setup.bip39Passphrase()).toBe('')
    expect(model.setup.useBip39Passphrase()).toBe(false)

    model.setMode('restore')
    model.setup.restoreMnemonicText.set('alpha beta gamma')
    model.setup.setUseBip39Passphrase(true)
    model.setup.bip39Passphrase.set('restore-passphrase')
    model.setMode('overview')

    expect(model.setup.restoreMnemonicText()).toBe('')
    expect(model.setup.bip39Passphrase()).toBe('')
    expect(model.setup.useBip39Passphrase()).toBe(false)

    model.setMode('import')
    model.setup.importPrivateKey.set('private-key')
    model.setMode('overview')

    expect(model.setup.importPrivateKey()).toBe('')

    model.setMode('recovery')
    model.setRecoveryMasterPassword('master-password')
    model.recoveryMnemonic.set(['secret'])
    model.recoveryMnemonicStandard.set('bip39')
    model.recoveryPassphrase.set('recovery-passphrase')
    model.setMode('overview')

    expect(model.recoveryMasterPassword()).toBe('')
    expect(model.recoveryMnemonic()).toEqual([])
    expect(model.recoveryMnemonicStandard()).toBeNull()
    expect(model.recoveryPassphrase()).toBeNull()

    model.setMode('send')
    model.prepared.set(
      preparedResponse({
        preview: {...preparedResponse().preview, warnings: [{code: 'review', message: 'Review'}]},
      }),
    )
    model.toggleWarning('review', true)
    model.setSendMasterPassword('master-password')
    model.setMode('overview')

    expect(model.prepared()).toBeNull()
    expect(model.acceptedWarnings().size).toBe(0)
    expect(model.sendMasterPassword()).toBe('')

    model.setup.generatedMnemonic.set(['again'])
    model.setup.generatedMnemonicDraftId.set('mnemonic-draft-2')
    model.setup.generatedMnemonicExpiresAt.set(456)
    model.setup.restoreMnemonicText.set('restore')
    model.setup.importPrivateKey.set('private')
    model.setRecoveryMasterPassword('password')
    model.recoveryMnemonic.set(['phrase'])
    model.recoveryMnemonicStandard.set('bip39')
    model.recoveryPassphrase.set('passphrase')
    model.prepared.set(preparedResponse())
    model.toggleWarning('review', true)
    model.setSendMasterPassword('master-password')
    model.transactions.set([{...TRANSACTION, status: 'broadcast_unknown'}])
    model.beginRebroadcast(TRANSACTION.tx_ref)
    model.setRebroadcastMasterPassword('rebroadcast-password')

    model.clearSensitiveState()

    expect(model.setup.generatedMnemonic()).toEqual([])
    expect(model.setup.generatedMnemonicDraftId()).toBeNull()
    expect(model.setup.generatedMnemonicExpiresAt()).toBeNull()
    expect(model.setup.restoreMnemonicText()).toBe('')
    expect(model.setup.importPrivateKey()).toBe('')
    expect(model.recoveryMasterPassword()).toBe('')
    expect(model.recoveryMnemonic()).toEqual([])
    expect(model.recoveryMnemonicStandard()).toBeNull()
    expect(model.recoveryPassphrase()).toBeNull()
    expect(model.prepared()).toBeNull()
    expect(model.acceptedWarnings().size).toBe(0)
    expect(model.sendMasterPassword()).toBe('')
    expect(model.rebroadcastTxRef()).toBeNull()
    expect(model.rebroadcastMasterPassword()).toBe('')
  })

  it('refreshes transactions by reference without signing or rebroadcasting', async () => {
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:transactions:refresh') {
        return {
          tx_ref: 'tx-1',
          network: 'ton',
          status: 'confirmed',
          tx_hash: 'hash-1',
          updated_at: 20,
        } as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)
    model.status.set(walletStatus())
    model.wallets.set([WALLET])
    model.accounts.set([ACCOUNT])
    model.selectedWalletId.set(WALLET.wallet_id)
    model.selectedAccountId.set(ACCOUNT.account_id)
    model.transactions.set([TRANSACTION])

    await model.refreshTransaction('tx-1')

    expect(calls.map((call) => call.command)).toEqual([
      'wallet:transactions:refresh',
      'wallet:transactions:list',
      'wallet:transactions:sync',
      'wallet:transactions:list',
    ])
    expect(findCall(calls, 'wallet:transactions:refresh')).toEqual({tx_ref: 'tx-1'})
    expect(calls.some((call) => call.command === 'wallet:transaction:confirm')).toBe(false)
    expect(calls.some((call) => call.command === 'wallet:transaction:prepare')).toBe(false)
    expect(calls.some((call) => call.command === 'wallet:transaction:rebroadcast')).toBe(false)
  })

  it('rebroadcasts only through the explicit command and clears the password', async () => {
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:transaction:rebroadcast') {
        return {
          tx_ref: TRANSACTION.tx_ref,
          network: 'ton',
          status: 'broadcasting',
          tx_hash: 'hash-1',
          updated_at: 20,
        } as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)
    model.status.set(walletStatus())
    model.wallets.set([WALLET])
    model.accounts.set([ACCOUNT])
    model.selectedWalletId.set(WALLET.wallet_id)
    model.selectedAccountId.set(ACCOUNT.account_id)
    model.transactions.set([{...TRANSACTION, status: 'broadcast_unknown'}])

    model.beginRebroadcast(TRANSACTION.tx_ref)
    expect(model.canRebroadcast()).toBe(false)
    model.setRebroadcastMasterPassword('master-password')
    expect(model.canRebroadcast()).toBe(true)

    await model.rebroadcastTransaction()

    expect(findCall(calls, 'wallet:transaction:rebroadcast')).toEqual({
      tx_ref: TRANSACTION.tx_ref,
      master_password: 'master-password',
    })
    expect(calls.map((call) => call.command)).toEqual([
      'wallet:transaction:rebroadcast',
      'wallet:transactions:list',
      'wallet:transactions:sync',
      'wallet:transactions:list',
    ])
    expect(calls.some((call) => call.command === 'wallet:transactions:refresh')).toBe(false)
    expect(calls.some((call) => call.command === 'wallet:transaction:confirm')).toBe(false)
    expect(model.rebroadcastTxRef()).toBeNull()
    expect(model.rebroadcastMasterPassword()).toBe('')
  })

  it('keeps wallet and account selection hierarchical and restores the last account per wallet', async () => {
    const {port, calls} = createWalletRpcPort(async (command, data) => {
      if (command === 'wallet:list') return {wallets: [WALLET, NEW_WALLET]} as RpcCmdResult<typeof command>
      if (command === 'wallet:accounts:list') {
        return {accounts: [ACCOUNT, SECOND_ACCOUNT, NEW_WALLET_ACCOUNT]} as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:balance:get') {
        const accountId = (data as RpcCmdData<'wallet:balance:get'>).account_id
        return {
          account_id: accountId,
          network: 'ton',
          balance: {spendable: '0', pending_in: '0', pending_out: '0', total: '0', amount_unit: 'nanoton'},
          fetched_at: 10,
        } as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:transactions:list') {
        return {transactions: [], next_cursor: null} as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    model.selectAccount(SECOND_ACCOUNT.account_id)
    model.selectWallet(NEW_WALLET.wallet_id)

    expect(model.selectedWalletId()).toBe(NEW_WALLET.wallet_id)
    expect(model.selectedAccountId()).toBe(NEW_WALLET_ACCOUNT.account_id)
    expect(model.walletAccounts()).toEqual([NEW_WALLET_ACCOUNT])

    model.selectWallet(WALLET.wallet_id)

    expect(model.selectedAccountId()).toBe(SECOND_ACCOUNT.account_id)
    const activityCalls = findCalls(calls, 'wallet:transactions:list')
    expect(activityCalls.at(-1)?.account_id).toBe(SECOND_ACCOUNT.account_id)
  })

  it('loads every selected-wallet account balance in parallel without requiring account switching', async () => {
    type BalanceResult = RpcCmdResult<'wallet:balance:get'>
    const started: string[] = []
    const resolvers = new Map<string, (value: BalanceResult) => void>()
    const {port} = createWalletRpcPort(async (command, data) => {
      if (command === 'wallet:status') {
        return walletStatus([bitcoinStatus(), tonStatus()]) as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:list') {
        return {wallets: [BITCOIN_WALLET]} as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:accounts:list') {
        return {
          accounts: [BITCOIN_ACCOUNT, MULTICHAIN_TON_ACCOUNT],
          cached_balances: [],
        } as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:balance:get') {
        const accountId = (data as RpcCmdData<'wallet:balance:get'>).account_id
        started.push(accountId)
        return new Promise<BalanceResult>((resolve) => resolvers.set(accountId, resolve)) as Promise<
          RpcCmdResult<typeof command>
        >
      }
      if (command === 'wallet:transactions:list') {
        return {transactions: [], next_cursor: null} as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    const load = model.load()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(model.loading()).toBe(false)
    expect(model.selectedAccountId()).toBe(BITCOIN_ACCOUNT.account_id)
    expect(started.sort()).toEqual([BITCOIN_ACCOUNT.account_id, MULTICHAIN_TON_ACCOUNT.account_id].sort())
    expect(model.balanceLoading()).toBe(true)

    resolvers.get(MULTICHAIN_TON_ACCOUNT.account_id)?.({
      account_id: MULTICHAIN_TON_ACCOUNT.account_id,
      network: 'ton',
      balance: {
        spendable: '9000000000',
        pending_in: '0',
        pending_out: '0',
        total: '9000000000',
        amount_unit: 'nanoton',
      },
      fetched_at: 30,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(model.displayAccountBalance(MULTICHAIN_TON_ACCOUNT)).toBe('9 TON')
    expect(model.selectedAccountId()).toBe(BITCOIN_ACCOUNT.account_id)

    resolvers.get(BITCOIN_ACCOUNT.account_id)?.({
      account_id: BITCOIN_ACCOUNT.account_id,
      network: 'bitcoin',
      balance: {
        spendable: '100000000',
        pending_in: '0',
        pending_out: '0',
        total: '100000000',
        amount_unit: 'satoshi',
      },
      fetched_at: 31,
    })
    await load

    expect(model.displayBalance()).toBe('1 BTC')
    expect(model.balanceLoading()).toBe(false)

    model.selectAccount(MULTICHAIN_TON_ACCOUNT.account_id)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(model.displayBalance()).toBe('9 TON')
    expect(started).toHaveLength(2)
  })

  it('prepares Bitcoin multi-output transfers in satoshi with the selected fee tier', async () => {
    const {port, calls} = createWalletRpcPort(async (command, data) => {
      if (command === 'wallet:status') {
        return walletStatus([bitcoinStatus(), tonStatus()]) as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:list') return {wallets: [BITCOIN_WALLET]} as RpcCmdResult<typeof command>
      if (command === 'wallet:accounts:list') {
        return {accounts: [BITCOIN_ACCOUNT]} as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:balance:get') {
        return {
          account_id: BITCOIN_ACCOUNT.account_id,
          network: 'bitcoin',
          balance: {
            spendable: '500000000',
            pending_in: '0',
            pending_out: '0',
            total: '500000000',
            amount_unit: 'satoshi',
          },
          fetched_at: 10,
        } as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:transactions:list') {
        return {transactions: [], next_cursor: null} as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:transaction:prepare') {
        const request = data as RpcCmdData<'wallet:transaction:prepare'>
        return {
          preparation_id: 'btc-prep',
          wallet_id: BITCOIN_WALLET.wallet_id,
          account_id: BITCOIN_ACCOUNT.account_id,
          network: 'bitcoin',
          preview: {
            amount_unit: 'satoshi',
            outputs: request.outputs,
            estimated_fee: '500',
            total_debit: '350000500',
            warnings: [],
          },
          expires_at: 100,
        } as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    model.setSendDestination('bc1qrecipientone')
    model.setSendAmount('1.25')
    model.addSendRecipient()
    const secondRecipient = model.additionalRecipients()[0]!
    model.setSendRecipientAddress(secondRecipient.id, 'bc1qrecipienttwo')
    model.setSendRecipientAmount(secondRecipient.id, '2.25')
    model.setSendFeeTier('fast')

    expect(model.canPrepareSend()).toBe(true)
    await model.prepareSend()

    expect(findCall(calls, 'wallet:transaction:prepare')).toEqual({
      account_id: BITCOIN_ACCOUNT.account_id,
      network: 'bitcoin',
      outputs: [
        {address: 'bc1qrecipientone', amount: '125000000', comment: null},
        {address: 'bc1qrecipienttwo', amount: '225000000', comment: null},
      ],
      fee_policy: {tier: 'fast'},
    })
  })

  it('allocates a new Bitcoin receive address and reloads account state', async () => {
    let currentAccount = BITCOIN_ACCOUNT
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:status') return walletStatus([bitcoinStatus()]) as RpcCmdResult<typeof command>
      if (command === 'wallet:list') return {wallets: [BITCOIN_WALLET]} as RpcCmdResult<typeof command>
      if (command === 'wallet:accounts:list')
        return {accounts: [currentAccount]} as RpcCmdResult<typeof command>
      if (command === 'wallet:addresses:derive') {
        currentAccount = {...BITCOIN_ACCOUNT, current_receive_address: 'bc1qnextreceiveaddress'}
        return {
          account_id: BITCOIN_ACCOUNT.account_id,
          purpose: 'receive',
          address: 'bc1qnextreceiveaddress',
          public_key: 'public-key',
          derivation_path: "m/84'/0'/0'/0/1",
          index: 1,
        } as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:balance:get') {
        return {
          account_id: BITCOIN_ACCOUNT.account_id,
          network: 'bitcoin',
          balance: {spendable: '0', pending_in: '0', pending_out: '0', total: '0', amount_unit: 'satoshi'},
          fetched_at: 10,
        } as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:transactions:list') {
        return {transactions: [], next_cursor: null} as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()
    await model.deriveReceiveAddress()

    expect(findCall(calls, 'wallet:addresses:derive')).toEqual({
      account_id: BITCOIN_ACCOUNT.account_id,
      purpose: 'receive',
    })
    expect(model.selectedAccount()?.current_receive_address).toBe('bc1qnextreceiveaddress')
    expect(model.receiveAddressLoading()).toBe(false)
    expect(findCalls(calls, 'wallet:balance:get')).toHaveLength(1)
  })

  it('allows a fresh Bitcoin account to create its first address without provider access', async () => {
    let currentAccount = FRESH_BITCOIN_ACCOUNT
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:status') {
        return walletStatus([
          bitcoinStatus({
            provider_status: 'unavailable',
            broadcast_enabled: false,
            disabled_reason: 'Provider unavailable',
          }),
        ]) as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:list') return {wallets: [BITCOIN_WALLET]} as RpcCmdResult<typeof command>
      if (command === 'wallet:accounts:list') {
        return {accounts: [currentAccount]} as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:addresses:derive') {
        currentAccount = {
          ...FRESH_BITCOIN_ACCOUNT,
          current_receive_address: 'bc1qfirstreceiveaddress',
          current_receive_derivation_path: "m/84'/0'/0'/0/0",
          next_receive_index: 1,
        }
        return {
          account_id: FRESH_BITCOIN_ACCOUNT.account_id,
          purpose: 'receive',
          address: 'bc1qfirstreceiveaddress',
          public_key: 'public-key',
          derivation_path: "m/84'/0'/0'/0/0",
          index: 0,
        } as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:transactions:list') {
        return {transactions: [], next_cursor: null} as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)

    await model.load()

    expect(model.selectedAddress()).toBe('')
    expect(model.canDeriveReceiveAddress()).toBe(true)
    expect(model.toolbarContext().canReceive).toBe(true)
    expect(model.executeToolbarCommand('receive')).toBe(true)

    await model.deriveReceiveAddress()

    expect(model.selectedAddress()).toBe('bc1qfirstreceiveaddress')
    expect(findCalls(calls, 'wallet:balance:get')).toHaveLength(0)
  })

  it('shows cached spendable balance before an asynchronous quote replaces it', async () => {
    const {port} = createWalletRpcPort(async (command) => defaultResponse(command))
    const model = new WalletPageModel(port)
    await model.load()
    model.balances.set({[ACCOUNT.account_id]: CACHED_BALANCE})

    model.setSendDestination('EQDdestination')
    model.setSendAmount('1')

    expect(model.send.availableBaseUnits()).toBe(CACHED_BALANCE.balance.spendable)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(model.send.availableBaseUnits()).toBe('2000000000')
    expect(model.send.currentPreview()?.estimated_fee).toBe('5000000')
    model.send.reset()
  })

  it('ignores a stale quote response after the send request key changes', async () => {
    vi.useFakeTimers()
    const pending: Array<(value: WalletQuoteResponse) => void> = []
    const {port} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:transaction:quote') {
        return (await new Promise<WalletQuoteResponse>((resolve) => pending.push(resolve))) as RpcCmdResult<
          typeof command
        >
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)
    try {
      await model.load()
      model.setSendDestination('EQDdestination')
      model.setSendAmount('1')
      await vi.advanceTimersByTimeAsync(250)

      model.setSendAmount('2')
      await vi.advanceTimersByTimeAsync(250)
      expect(pending).toHaveLength(2)

      pending[1]!(quoteResponse({max_amount: '3000000000', quoted_at: 2}))
      await vi.advanceTimersByTimeAsync(0)
      pending[0]!(quoteResponse({max_amount: '1000000000', quoted_at: 1}))
      await vi.advanceTimersByTimeAsync(0)

      expect(model.send.quote()?.max_amount).toBe('3000000000')
    } finally {
      model.send.reset()
      vi.useRealTimers()
    }
  })

  it('keeps range, manual amount, and exact Max synchronized in base units', async () => {
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:transaction:prepare') return preparedResponse() as RpcCmdResult<typeof command>
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)
    await model.load()
    model.setSendDestination('EQDdestination')
    model.send.quote.set(quoteResponse({max_amount: '1000000000'}))

    model.send.setRangePercent(50)
    expect(model.sendAmount()).toBe('0.5')
    expect(model.send.amountMode()).toBe('manual')

    model.send.setRangePercent(100)
    expect(model.sendAmount()).toBe('1')
    expect(model.send.amountMode()).toBe('max')
    await model.prepareSend()

    expect(findCall(calls, 'wallet:transaction:prepare')).toMatchObject({
      maximize_output_index: 0,
      outputs: [{amount: '1000000000'}],
    })
    model.send.reset()
  })

  it('resets an incompatible send draft when the sender account changes', async () => {
    const {port} = createWalletRpcPort(async (command) => defaultResponse(command))
    const model = new WalletPageModel(port)
    await model.load()
    model.accounts.set([ACCOUNT, SECOND_ACCOUNT])
    model.setSendDestination('EQDdestination')
    model.setSendAmount('1')

    expect(model.ownRecipients()).toEqual([
      {
        accountId: SECOND_ACCOUNT.account_id,
        label: `${WALLET.label} · ${SECOND_ACCOUNT.label}`,
        address: SECOND_ACCOUNT.address,
      },
    ])

    model.selectAccount(SECOND_ACCOUNT.account_id)

    expect(model.sendDestination()).toBe('')
    expect(model.sendAmount()).toBe('')
    expect(model.send.quote()).toBeNull()
  })

  it('retargets Send to the wallet account whose network matches the pasted address and keeps the draft', async () => {
    const {port, calls} = createWalletRpcPort(async (command, data) => {
      if (command === 'wallet:status') {
        return walletStatus([bitcoinStatus(), tonStatus()]) as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:list') return {wallets: [BITCOIN_WALLET]} as RpcCmdResult<typeof command>
      if (command === 'wallet:accounts:list') {
        return {accounts: [BITCOIN_ACCOUNT, MULTICHAIN_TON_ACCOUNT]} as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:balance:get') {
        return {
          account_id: BITCOIN_ACCOUNT.account_id,
          network: 'bitcoin',
          balance: {spendable: '0', pending_in: '0', pending_out: '0', total: '0', amount_unit: 'satoshi'},
          fetched_at: 10,
        } as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:transactions:list') {
        return {transactions: [], next_cursor: null} as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:address:detect') {
        // Core owns the address rules; the mock only maps fixture addresses to networks.
        const address = (data as RpcCmdData<'wallet:address:detect'>).address
        const network = address === 'ton-address' ? 'ton' : address === 'eth-address' ? 'ethereum' : null
        return {
          address,
          network,
          normalized_address: network ? address : null,
          candidates: network ? [network] : [],
        } as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)
    await model.load()
    model.selectAccount(BITCOIN_ACCOUNT.account_id)
    expect(model.walletAssets().map((account) => account.network)).toEqual(['ton', 'bitcoin'])

    model.setSendDestination(' ton-address ')
    model.setSendAmount('1.5')
    expect(await model.retargetSendToDestination()).toBe(true)
    expect(findCalls(calls, 'wallet:address:detect')).toEqual([{address: 'ton-address'}])
    expect(model.sendDestinationNetwork()).toBe('ton')

    expect(model.selectedAccountId()).toBe(MULTICHAIN_TON_ACCOUNT.account_id)
    expect(model.sendDestination()).toBe(' ton-address ')
    expect(model.sendAmount()).toBe('1.5')
    expect(await model.retargetSendToDestination()).toBe(false)

    model.setSendDestination('eth-address')
    expect(await model.retargetSendToDestination()).toBe(false)
    expect(model.sendDestinationNetworkMismatch()).toBe('ethereum')
    expect(model.selectedAccountId()).toBe(MULTICHAIN_TON_ACCOUNT.account_id)

    model.setSendDestination('')
    expect(await model.detectSendDestination()).toBeNull()
    expect(model.sendDestinationNetwork()).toBeNull()
  })

  it('opens mobile Send from a usable network account when the selected one cannot transfer', async () => {
    const {port} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:status') {
        return walletStatus([bitcoinStatus(), tonStatus()]) as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:list') return {wallets: [RESTORED_BITCOIN_WALLET]} as RpcCmdResult<typeof command>
      if (command === 'wallet:accounts:list') {
        return {accounts: [BITCOIN_ACCOUNT, MULTICHAIN_TON_ACCOUNT]} as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:balance:get') {
        return {
          account_id: MULTICHAIN_TON_ACCOUNT.account_id,
          network: 'ton',
          balance: {spendable: '0', pending_in: '0', pending_out: '0', total: '0', amount_unit: 'nanoton'},
          fetched_at: 10,
        } as RpcCmdResult<typeof command>
      }
      if (command === 'wallet:transactions:list') {
        return {transactions: [], next_cursor: null} as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)
    await model.load()
    model.selectAccount(BITCOIN_ACCOUNT.account_id)
    // Bitcoin recovery discovery is still pending, so that account cannot send yet.
    expect(model.selectedTransactionReady()).toBe(false)
    expect(model.anyAccountTransactionReady()).toBe(true)

    model.openMobileSend()

    expect(model.selectedAccountId()).toBe(MULTICHAIN_TON_ACCOUNT.account_id)
    expect(model.overlay()).toBe('send')
  })

  it('closes mobile send by cancelling preparation while preserving the unprepared draft', async () => {
    const {port, calls} = createWalletRpcPort(async (command) => {
      if (command === 'wallet:transaction:cancel') {
        return {preparation_id: 'prep-1'} as RpcCmdResult<typeof command>
      }
      return defaultResponse(command)
    })
    const model = new WalletPageModel(port)
    await model.load()
    model.setSendDestination('EQDdestination')
    model.setSendAmount('1')
    model.prepared.set(preparedResponse())
    model.setSendMasterPassword('master-secret')
    model.openOverlay('send')

    model.closeOverlay()
    await Promise.resolve()

    expect(model.overlay()).toBeNull()
    expect(model.prepared()).toBeNull()
    expect(model.sendMasterPassword()).toBe('')
    expect(model.sendDestination()).toBe('EQDdestination')
    expect(model.sendAmount()).toBe('1')
    expect(findCall(calls, 'wallet:transaction:cancel')).toEqual({preparation_id: 'prep-1'})
    model.send.reset()
  })
})
