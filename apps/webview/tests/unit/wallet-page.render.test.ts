import {render} from 'lit'
import {afterEach, describe, expect, it} from 'vitest'

import type {RpcCmdResult} from '../../src/core/transport/tauri/tauri-rpc-types'
import {i18n} from '../../src/i18n'
import {WalletPage} from '../../src/routes/wallet/wallet-page'
import {WalletPageDesktopLayout} from '../../src/routes/wallet/wallet-page-desktop'
import {WalletPageMobileLayout} from '../../src/routes/wallet/wallet-page-mobile'
import {walletPageModel} from '../../src/routes/wallet/wallet-page.model'
import type {WalletSendForm} from '../../src/routes/wallet/wallet-send-form'
import type {
  WalletAccount,
  WalletBalanceResponse,
  WalletPrepareResponse,
} from '../../src/routes/wallet/wallet-page.types'

WalletPage.define()

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
  derivation_profile: 'ton_bip39_v5r1_account',
  wallet_contract: 'wallet_v5r1',
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
  wallet_contract: 'Wallet V5R1',
  workchain: 0,
  raw_account: null,
  created_at: 1,
  updated_at: 1,
}

const BITCOIN_WALLET: WalletSummary = {
  ...WALLET,
  wallet_id: 'wallet-bitcoin',
  label: 'Bitcoin savings',
  supported_networks: ['bitcoin'],
}

const BITCOIN_ACCOUNT: WalletAccount = {
  ...ACCOUNT,
  account_id: 'account-bitcoin',
  wallet_id: BITCOIN_WALLET.wallet_id,
  network: 'bitcoin',
  account_model: 'utxo',
  derivation_profile: 'bitcoin_bip84_account',
  wallet_contract: null,
  workchain: null,
  label: 'Savings',
  address: null,
  current_receive_address: 'bc1qcurrentreceiveaddress',
  current_receive_derivation_path: "m/84'/0'/0'/0/0",
  derivation_path: "m/84'/0'/0'",
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

const REBROADCASTABLE_TRANSACTION: WalletTransaction = {
  tx_ref: 'tx-1',
  wallet_id: WALLET.wallet_id,
  account_id: ACCOUNT.account_id,
  network: 'ton',
  status: 'broadcast_unknown',
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
      {id: 'ton_connect_v1', state: 'disabled', disabled_reason: 'Not built'},
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

function walletStatus(networks: WalletNetworkStatus[]): WalletStatus {
  return {
    initialized: true,
    wallet_count: 1,
    enabled: true,
    disabled_reason: null,
    networks,
  }
}

function preparedResponse(): WalletPrepareResponse {
  return {
    preparation_id: 'prep-1',
    wallet_id: WALLET.wallet_id,
    account_id: ACCOUNT.account_id,
    network: 'ton',
    preview: {
      amount_unit: 'nanoton',
      outputs: [{address: 'EQDdestination', amount: '1250000000', comment: null}],
      estimated_fee: '5000000',
      total_debit: '1255000000',
      warnings: [],
      ton: {
        wallet_contract: 'wallet_v5r1',
        seqno: 7,
        account_state: 'active',
        valid_until: 1000,
        message_mode: 3,
        sender_state_init_included: false,
        destination_state: 'active',
      },
    },
    expires_at: 100,
  }
}

function resetWalletModel(): void {
  walletPageModel.clearSensitiveState()
  walletPageModel.status.set(null)
  walletPageModel.wallets.set([])
  walletPageModel.accounts.set([])
  walletPageModel.selectedWalletId.set(null)
  walletPageModel.selectedAccountId.set(null)
  walletPageModel.selectedAccountByWallet.set({})
  walletPageModel.balances.set({})
  walletPageModel.transactions.set([])
  walletPageModel.mainTab.set('overview')
  walletPageModel.setupFlow.set(null)
  walletPageModel.setupVisible.set(false)
  walletPageModel.overlay.set(null)
  walletPageModel.setup.restoreProfile.set('multichain')
  walletPageModel.setup.hdWalletLoading.set(false)
  walletPageModel.setup.wordCount.set(12)
  walletPageModel.setup.importNetwork.set('ton')
  walletPageModel.setup.importEncoding.set('hex')
  walletPageModel.loading.set(false)
  walletPageModel.refreshing.set(false)
  walletPageModel.txLoading.set(false)
  walletPageModel.preparing.set(false)
  walletPageModel.confirming.set(false)
  walletPageModel.deriveAccountLoading.set(false)
  walletPageModel.receiveAddressLoading.set(false)
  walletPageModel.refreshTxRef.set(null)
  walletPageModel.error.set(null)
  walletPageModel.notice.set(null)
  walletPageModel.sendDestination.set('')
  walletPageModel.sendAmountTon.set('')
  walletPageModel.additionalRecipients.set([])
  walletPageModel.sendComment.set('')
  walletPageModel.sendFeeTier.set('standard')
  walletPageModel.lastConfirm.set(null)
}

function renderWalletPage(externalToolbar = false): HTMLElement {
  const host = document.createElement('div')
  const page = new WalletPageDesktopLayout() as WalletPageDesktopLayout & {render: () => unknown}
  page.externalToolbar = externalToolbar
  render(page.render(), host, {host: page})
  document.body.append(host)
  return host
}

function renderMobileWalletPage(externalToolbar = false): HTMLElement {
  const host = document.createElement('div')
  const page = new WalletPageMobileLayout() as WalletPageMobileLayout & {render: () => unknown}
  page.externalToolbar = externalToolbar
  render(page.render(), host, {host: page})
  document.body.append(host)
  return host
}

function prepareWalletSurface(
  status: WalletStatus,
  wallets: WalletSummary[] = [WALLET],
  accounts: WalletAccount[] = [ACCOUNT],
): void {
  walletPageModel.status.set(status)
  walletPageModel.wallets.set(wallets)
  walletPageModel.accounts.set(accounts)
  walletPageModel.selectedWalletId.set(wallets[0]?.wallet_id ?? null)
  walletPageModel.selectedAccountId.set(accounts[0]?.account_id ?? null)
}

function findButton(host: ParentNode, label: string): HTMLButtonElement {
  const button = findOptionalButton(host, label)
  if (!button) throw new Error(`Missing button: ${label}`)
  return button
}

function findOptionalButton(host: ParentNode, label: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((item) => item.textContent?.includes(label))
}

async function sendFormRoot(host: HTMLElement): Promise<ShadowRoot> {
  const form = host.querySelector('wallet-send-form') as WalletSendForm | null
  if (!form) throw new Error('Missing wallet-send-form')
  await form.updateComplete
  if (!form.shadowRoot) throw new Error('wallet-send-form did not create a shadow root')
  return form.shadowRoot
}

afterEach(() => {
  document.body.innerHTML = ''
  resetWalletModel()
})

describe('WalletPage render contract', () => {
  it('creates every enabled network automatically without a network picker', () => {
    resetWalletModel()
    const bitcoinStatus: WalletNetworkStatus = {
      ...tonStatus(),
      network: 'bitcoin',
      capabilities: [{id: 'bitcoin_native_transfer', state: 'ready', disabled_reason: null}],
    }
    prepareWalletSurface(walletStatus([bitcoinStatus, tonStatus()]), [], [])

    const host = renderWalletPage()

    expect(host.textContent).toContain(i18n('wallet:create:networks-auto:title'))
    expect(host.textContent).toContain(i18n('wallet:create:networks-auto:body'))
    expect(host.querySelector('input[type="checkbox"][value="bitcoin"]')).toBeNull()
    expect(host.querySelector('input[type="checkbox"][value="ton"]')).toBeNull()
    expect(host.textContent).not.toContain(i18n('wallet:field:recovery-format'))
    expect(host.textContent).not.toContain(i18n('wallet:profile:ton-only:title'))
    expect(findButton(host, i18n('wallet:action:generate')).disabled).toBe(false)
    expect(findOptionalButton(host, i18n('wallet:action:refresh'))).toBeUndefined()
  })

  it('shows a pending state and prevents duplicate wallet creation', () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([tonStatus()]), [], [])
    walletPageModel.setup.generatedMnemonic.set(Array.from({length: 12}, () => 'word'))
    walletPageModel.setup.generatedMnemonicDraftId.set('draft-1')
    walletPageModel.setup.createConfirmed.set(true)
    walletPageModel.setup.hdWalletLoading.set(true)
    walletPageModel.setSetupFlow('create')

    const host = renderMobileWalletPage()
    const createButton = findButton(host, i18n('wallet:action:creating'))

    expect(createButton.disabled).toBe(true)
    expect(createButton.getAttribute('aria-busy')).toBe('true')
    expect(findButton(host, i18n('wallet:action:generate')).disabled).toBe(true)
  })

  it('shows a pending state and prevents duplicate mnemonic generation', () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([tonStatus()]), [], [])
    walletPageModel.setup.mnemonicLoading.set(true)
    walletPageModel.setSetupFlow('create')

    const host = renderMobileWalletPage()
    const generateButton = findButton(host, i18n('wallet:action:generating'))

    expect(generateButton.disabled).toBe(true)
    expect(generateButton.getAttribute('aria-busy')).toBe('true')
  })

  it('renders the strict TON-native restore contract without BIP39 passphrase controls', () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([tonStatus()]), [], [])
    walletPageModel.setMode('restore')
    walletPageModel.setup.setRestoreProfile('ton_only')

    const host = renderWalletPage()

    expect(host.textContent).toContain(i18n('wallet:profile:ton-only:restore-hint'))
    expect(host.textContent).toContain(i18n('wallet:field:recovery-format'))
    expect(host.textContent).not.toContain(i18n('wallet:field:passphrase-toggle'))
    expect(findButton(host, i18n('wallet:action:import-phrase')).disabled).toBe(true)
  })

  it('renders add account action for HD TON wallets', () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([tonStatus()]))

    const host = renderWalletPage()

    expect(findButton(host, i18n('wallet:action:add-account')).disabled).toBe(false)
  })

  it('renders create wallet mode after a wallet already exists', () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([tonStatus()]))

    let host = renderWalletPage()
    expect(findButton(host, i18n('wallet:mode:create')).disabled).toBe(false)

    walletPageModel.setMode('create')
    host = renderWalletPage()

    expect(host.textContent).toContain(i18n('wallet:create:title'))
    expect(host.textContent).toContain(i18n('wallet:action:generate'))
    expect(findButton(host, i18n('wallet:action:create')).disabled).toBe(true)
  })

  it('does not render add account action for imported wallets', () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([tonStatus()]), [IMPORTED_WALLET], [IMPORTED_ACCOUNT])

    const host = renderWalletPage()

    expect(findOptionalButton(host, i18n('wallet:action:add-account'))).toBeUndefined()
  })

  it('disables add account action while derivation is in progress', () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([tonStatus()]))
    walletPageModel.deriveAccountLoading.set(true)

    const host = renderWalletPage()

    expect(findButton(host, i18n('wallet:action:add-account')).disabled).toBe(true)
  })

  it('renders provider-unavailable state and disables balance refresh', () => {
    resetWalletModel()
    prepareWalletSurface(
      walletStatus([
        tonStatus({
          provider_status: 'unavailable',
          disabled_reason: 'Wallet provider unavailable',
        }),
      ]),
    )

    const host = renderWalletPage()

    expect(host.textContent).toContain(i18n('wallet:status:provider-unavailable:title'))
    expect(host.textContent).toContain('Wallet provider unavailable')
    expect(findButton(host, i18n('wallet:action:refresh-balance')).disabled).toBe(true)
  })

  it('renders a hydrated balance and its fetch timestamp on desktop and mobile', () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([tonStatus({provider_status: 'unavailable'})]))
    walletPageModel.balances.set({[ACCOUNT.account_id]: CACHED_BALANCE})
    const fetchedAt = new Date(CACHED_BALANCE.fetched_at).toLocaleString()

    const desktopHost = renderWalletPage()
    const mobileHost = renderMobileWalletPage()

    expect(desktopHost.textContent).toContain('2.34 TON')
    expect(desktopHost.textContent).toContain(fetchedAt)
    expect(mobileHost.textContent).toContain('2.34 TON')
    expect(mobileHost.textContent).toContain(fetchedAt)
  })

  it('renders TON-specific preview fields returned by Core', async () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([tonStatus()]))
    walletPageModel.setMode('send')
    walletPageModel.prepared.set(preparedResponse())

    const host = renderWalletPage()
    const sendRoot = await sendFormRoot(host)

    expect(sendRoot.textContent).toContain(i18n('wallet:preview:wallet-contract'))
    expect(sendRoot.textContent).toContain('wallet_v5r1')
    expect(sendRoot.textContent).toContain(i18n('wallet:preview:seqno'))
    expect(sendRoot.textContent).toContain('7')
    expect(sendRoot.textContent).toContain(i18n('wallet:preview:account-state'))
    expect(sendRoot.textContent).toContain('active')
    expect(sendRoot.querySelector('[id$="-address"]')?.getAttribute('dir')).toBe('ltr')
    expect(sendRoot.querySelector('[id$="-amount"]')?.getAttribute('dir')).toBe('ltr')
    expect(sendRoot.querySelector('#wallet-send-comment')?.getAttribute('dir')).toBe('auto')
    expect(sendRoot.querySelector('.context bdi[dir="auto"]')?.textContent).toBe(WALLET.label)
  })

  it('shows the TON amount-below-fee guard and disables confirmation on both layouts', async () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([tonStatus()]))
    walletPageModel.setMode('send')
    const prepared = preparedResponse()
    walletPageModel.prepared.set({
      ...prepared,
      preview: {
        ...prepared.preview,
        outputs: [{address: 'EQDdestination', amount: '4000000', comment: null}],
        estimated_fee: '5000000',
        total_debit: '9000000',
      },
    })
    walletPageModel.setSendMasterPassword('master-secret')

    const desktop = renderWalletPage()
    walletPageModel.openOverlay('send')
    const mobile = renderMobileWalletPage()

    for (const host of [desktop, mobile]) {
      const sendRoot = await sendFormRoot(host)
      expect(sendRoot.textContent).toContain(i18n('wallet:preview:amount-below-fee'))
      expect(findButton(sendRoot, i18n('wallet:action:confirm')).disabled).toBe(true)
    }
  })

  it('renders reconciliation and explicit rebroadcast as distinct actions', () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([tonStatus()]))
    walletPageModel.setMode('activity')
    walletPageModel.transactions.set([REBROADCASTABLE_TRANSACTION])

    let host = renderWalletPage()

    expect(findButton(host, i18n('wallet:action:refresh'))).toBeDefined()
    expect(findButton(host, i18n('wallet:action:rebroadcast'))).toBeDefined()
    expect(host.querySelector('input[type="password"]')).toBeNull()

    walletPageModel.beginRebroadcast(REBROADCASTABLE_TRANSACTION.tx_ref)
    walletPageModel.setRebroadcastMasterPassword('master-password')
    host = renderWalletPage()

    expect(host.textContent).toContain(i18n('wallet:activity:rebroadcast-help'))
    expect(host.querySelector('input[type="password"]')).not.toBeNull()
    expect(findButton(host, i18n('wallet:action:confirm-rebroadcast')).disabled).toBe(false)
  })

  it('renders cached TON transaction direction, signed amount, and counterparty on both layouts', () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([tonStatus()]))
    walletPageModel.setMode('activity')
    const incoming: WalletTransaction = {
      ...REBROADCASTABLE_TRANSACTION,
      tx_ref: 'ton-history-incoming',
      status: 'confirmed',
      tx_hash: 'incoming-hash',
      message_ref: 'incoming-message',
      broadcast_artifact_ref: null,
      direction: 'incoming',
      counterparty: 'EQ-source-address-for-history',
      amount: '2500000000',
      created_at: 20,
      updated_at: 20,
    }
    walletPageModel.transactions.set([incoming, REBROADCASTABLE_TRANSACTION])

    const desktop = renderWalletPage()
    const mobile = renderMobileWalletPage()

    for (const host of [desktop, mobile]) {
      expect(host.textContent).toContain('+2.5 TON')
      expect(host.textContent).toContain('−1.25 TON')
      expect(host.textContent).toContain(i18n('wallet:activity:incoming'))
      expect(host.textContent).toContain(i18n('wallet:activity:from'))
    }
    expect(desktop.querySelector('.tx-ref[dir="ltr"]')?.textContent).toBe(incoming.tx_hash)
    expect(
      [...mobile.querySelectorAll('code[dir="ltr"]')].some((code) =>
        code.textContent?.includes(incoming.tx_hash!),
      ),
    ).toBe(true)
    expect(
      [...mobile.querySelectorAll('bdi[dir="ltr"]')].some(
        (value) => value.textContent === incoming.status,
      ),
    ).toBe(true)
    expect(mobile.querySelector('cv-icon[name="arrow-down-left"]')).not.toBeNull()
    expect(mobile.querySelector('cv-icon[name="arrow-up-right"]')).not.toBeNull()
  })

  it('renders the mobile progressive method picker without duplicating shell navigation', () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([tonStatus()]), [], [])

    const host = renderMobileWalletPage()

    expect(host.textContent).toContain(i18n('wallet:method:create:title'))
    expect(host.textContent).toContain(i18n('wallet:method:import-existing:title'))
    expect(host.querySelectorAll('.method-list > button')).toHaveLength(2)
    expect(host.querySelector('.method-list > button[data-flow="create"]')).not.toBeNull()
    expect(host.querySelector('.method-list > button[data-flow="restore"]')).toBeNull()
    expect(host.querySelector('.method-list > button[data-flow="import"]')).toBeNull()
    expect(host.querySelector('nav')).toBeNull()
    expect(host.querySelector('cv-bottom-sheet')).not.toBeNull()

    walletPageModel.openOverlay('import-wallet')
    const importHost = renderMobileWalletPage()
    const importSheet = [...importHost.querySelectorAll('cv-bottom-sheet')].find(
      (sheet) => (sheet as HTMLElement & {open: boolean}).open,
    )
    expect(importSheet?.textContent).toContain(i18n('wallet:method:restore:title'))
    expect(importSheet?.textContent).toContain(i18n('wallet:method:import:title'))
  })

  it('renders wallet then account hierarchy with accessible mobile tabs', () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([tonStatus()]))

    const host = renderMobileWalletPage()

    expect(host.textContent).toContain(WALLET.label)
    expect(host.textContent).toContain(ACCOUNT.label)
    expect(host.querySelector('[role="listbox"]')).not.toBeNull()
    expect(host.querySelector('[role="option"][aria-selected="true"]')).not.toBeNull()
    expect(host.querySelector('[role="tablist"]')).not.toBeNull()
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(3)
    expect(
      [...host.querySelectorAll('[role="tab"]')].some((tab) => tab.textContent === i18n('wallet:mode:send')),
    ).toBe(false)
    expect(host.querySelector('.send-sheet wallet-send-form')).not.toBeNull()
    expect(host.querySelector('[role="tabpanel"]')).not.toBeNull()
  })

  it('suppresses populated local headers only when the dashboard shell owns the toolbar', () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([tonStatus()]))

    expect(renderWalletPage().querySelector('.wallet-header')).not.toBeNull()
    expect(renderMobileWalletPage().querySelector('.mobile-header')).not.toBeNull()

    const desktopExternal = renderWalletPage(true)
    const mobileExternal = renderMobileWalletPage(true)
    expect(desktopExternal.querySelector('.wallet-header')).toBeNull()
    expect(desktopExternal.querySelector('h1[id="wallet-title"]')).not.toBeNull()
    expect(mobileExternal.querySelector('.mobile-header')).toBeNull()
    expect(mobileExternal.querySelector('h1[id="wallet-mobile-title"]')).not.toBeNull()
  })

  it('opens Receive from the mobile hero and renders verified address context in the sheet', () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([bitcoinStatus()]), [BITCOIN_WALLET], [BITCOIN_ACCOUNT])

    const host = renderMobileWalletPage(true)
    findButton(host, i18n('wallet:receive:title')).click()
    expect(walletPageModel.overlay()).toBe('receive')

    const receiveHost = renderMobileWalletPage(true)
    const sheet = receiveHost.querySelector('.receive-sheet') as HTMLElement & {open: boolean}
    const qr = sheet.querySelector('cv-qr-code') as HTMLElement & {value: string; ariaLabel: string}
    expect(sheet.open).toBe(true)
    expect(sheet.textContent).toContain(BITCOIN_WALLET.label)
    expect(sheet.textContent).toContain(BITCOIN_ACCOUNT.label)
    expect(sheet.textContent).toContain('Bitcoin')
    expect(sheet.textContent).toContain(BITCOIN_ACCOUNT.current_receive_address)
    expect(sheet.querySelector('code[dir="ltr"]')?.textContent).toBe(BITCOIN_ACCOUNT.current_receive_address)
    expect([...sheet.querySelectorAll('bdi[dir="auto"]')].map((item) => item.textContent)).toEqual(
      expect.arrayContaining([BITCOIN_WALLET.label, BITCOIN_ACCOUNT.label]),
    )
    expect(qr.value).toBe(BITCOIN_ACCOUNT.current_receive_address)
    expect(qr.ariaLabel).toContain(i18n('wallet:receive:qr-label'))
    expect(findButton(sheet, i18n('wallet:action:copy-address'))).toBeDefined()
    expect(findButton(sheet, i18n('wallet:action:new-receive-address'))).toBeDefined()

    sheet.dispatchEvent(new CustomEvent('cv-change', {detail: {open: false}}))
    expect(walletPageModel.overlay()).toBeNull()
  })

  it('offers first-address generation for a fresh Bitcoin account', () => {
    resetWalletModel()
    prepareWalletSurface(
      walletStatus([
        bitcoinStatus({
          provider_status: 'unavailable',
          broadcast_enabled: false,
          disabled_reason: 'Provider unavailable',
        }),
      ]),
      [BITCOIN_WALLET],
      [FRESH_BITCOIN_ACCOUNT],
    )

    let host = renderWalletPage(true)
    expect(findButton(host, i18n('wallet:action:generate-receive-address')).disabled).toBe(false)
    expect(walletPageModel.executeToolbarCommand('receive')).toBe(true)

    host = renderWalletPage(true)
    const dialog = host.querySelector('cv-dialog.receive-dialog') as HTMLElement & {open: boolean}
    expect(dialog.open).toBe(true)
    expect(dialog.getAttribute('initial-focus-id')).toBe('wallet-receive-generate')
    expect(dialog.querySelector('cv-qr-code')).toBeNull()
    expect(dialog.textContent).toContain(i18n('wallet:receive:empty'))
    expect(findButton(dialog, i18n('wallet:action:generate-receive-address')).disabled).toBe(false)

    walletPageModel.closeOverlay()
    host = renderMobileWalletPage(true)
    findButton(host, i18n('wallet:receive:title')).click()
    const sheetHost = renderMobileWalletPage(true)
    const sheet = sheetHost.querySelector('.receive-sheet') as HTMLElement & {open: boolean}
    expect(sheet.open).toBe(true)
    expect(sheet.getAttribute('initial-focus-id')).toBe('wallet-receive-generate')
    expect(findButton(sheet, i18n('wallet:action:generate-receive-address')).disabled).toBe(false)
  })

  it('renders non-blocking Bitcoin recovery discovery status and disables sending', () => {
    resetWalletModel()
    prepareWalletSurface(walletStatus([bitcoinStatus()]), [RESTORED_BITCOIN_WALLET], [FRESH_BITCOIN_ACCOUNT])

    const desktop = renderWalletPage(true)
    expect(desktop.textContent).toContain(i18n('wallet:status:discovery:title'))
    expect(desktop.textContent).toContain(i18n('wallet:status:discovery:waiting'))

    const mobile = renderMobileWalletPage(true)
    expect(mobile.textContent).toContain(i18n('wallet:status:discovery:title'))
    expect(mobile.textContent).toContain(i18n('wallet:status:discovery:waiting'))
    expect(
      findButton(mobile.querySelector('.quick-actions') as HTMLElement, i18n('wallet:mode:send')).disabled,
    ).toBe(true)
  })

  it('renders desktop Receive and multi-wallet selector as controlled dialogs', () => {
    resetWalletModel()
    const secondWallet = {...WALLET, wallet_id: 'wallet-2', label: 'Travel wallet'}
    const secondAccount = {...ACCOUNT, account_id: 'account-2', wallet_id: secondWallet.wallet_id}
    prepareWalletSurface(walletStatus([tonStatus()]), [WALLET, secondWallet], [ACCOUNT, secondAccount])

    walletPageModel.openOverlay('wallet-switcher')
    let host = renderWalletPage(true)
    let dialog = host.querySelector('cv-dialog.wallet-dialog') as HTMLElement & {open: boolean}
    expect(dialog.open).toBe(true)
    expect(dialog.querySelectorAll('.wallet-option')).toHaveLength(2)
    expect(dialog.textContent).not.toContain(i18n('wallet:action:add-wallet'))

    walletPageModel.closeOverlay()
    expect(walletPageModel.executeToolbarCommand('receive')).toBe(true)
    host = renderWalletPage(true)
    dialog = host.querySelector('cv-dialog.receive-dialog') as HTMLElement & {open: boolean}
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector('cv-qr-code')).not.toBeNull()
    expect(dialog.textContent).toContain(ACCOUNT.address)
  })

  it('hides runtime network topology during creation but keeps it explicit for private-key import', () => {
    resetWalletModel()
    const ethereumStatus: WalletNetworkStatus = {
      network: 'ethereum',
      enabled: false,
      provider_status: 'unavailable',
      broadcast_enabled: false,
      capabilities: [
        {id: 'ethereum_native_transfer', state: 'disabled', disabled_reason: 'Provider not configured'},
      ],
      disabled_reason: 'Provider not configured',
    }
    prepareWalletSurface(walletStatus([tonStatus(), ethereumStatus]), [], [])
    walletPageModel.setSetupFlow('create')

    const host = renderMobileWalletPage()

    expect(host.textContent).not.toContain(i18n('wallet:network:ethereum'))
    expect(host.textContent).not.toContain('Provider not configured')

    walletPageModel.setSetupFlow('import')
    const importHost = renderMobileWalletPage()
    expect(importHost.textContent).toContain(i18n('wallet:network:ethereum'))
    expect(importHost.textContent).toContain('Provider not configured')
    const ethereumInput = importHost.querySelector<HTMLInputElement>('input[value="ethereum"]')
    expect(ethereumInput?.disabled).toBe(true)
  })
})
