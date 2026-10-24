import type {Page} from 'playwright'

// Seed deterministic wallet state directly; let Lit/Reatom flush on a frame before evaluate returns.
export async function seedWalletFixture(
  page: Page,
  options: {multipleWallets?: boolean} = {},
): Promise<void> {
  const multipleWallets = options.multipleWallets ?? false

  await page.evaluate(async (includeSecondWallet) => {
    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const inner = deepFind(element.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }

    type Setter<T> = {set(value: T): void}
    type WalletFixtureModel = {
      status: Setter<unknown>
      wallets: Setter<unknown[]>
      accounts: Setter<unknown[]>
      selectedWalletId: Setter<string | null>
      selectedAccountId: Setter<string | null>
      selectedAccountByWallet: Setter<Record<string, string>>
      balances: Setter<Record<string, unknown>>
      transactions: Setter<unknown[]>
      mainTab: Setter<string>
      setupFlow: Setter<null>
      setupVisible: Setter<boolean>
      overlay: Setter<null>
      loading: Setter<boolean>
      refreshing: Setter<boolean>
      preparing: Setter<boolean>
      confirming: Setter<boolean>
      error: Setter<string | null>
      notice: Setter<string | null>
    }

    const layout = deepFind(
      document,
      'wallet-page-mobile-layout, wallet-page-desktop-layout',
    ) as (HTMLElement & {model?: WalletFixtureModel}) | null
    const model = layout?.model
    if (!model) throw new Error('Wallet model is unavailable')

    const primaryWallet = {
      wallet_id: 'wallet-personal',
      kind: 'hd',
      label: 'Personal Wallet',
      wallet_mode: 'multichain',
      mnemonic_standard: 'bip39',
      supported_networks: ['bitcoin'],
      created_at: 1,
      updated_at: 1,
    }
    const secondaryWallet = {
      ...primaryWallet,
      wallet_id: 'wallet-travel',
      label: 'Travel Wallet',
      created_at: 2,
      updated_at: 2,
    }
    const primaryAccount = {
      kind: 'derived',
      account_id: 'account-savings',
      wallet_id: primaryWallet.wallet_id,
      network: 'bitcoin',
      wallet_mode: 'multichain',
      mnemonic_standard: 'bip39',
      account_model: 'utxo',
      derivation_profile: 'bitcoin_bip84_account',
      wallet_contract: null,
      account_index: 0,
      workchain: null,
      label: 'Savings',
      address: null,
      raw_account: null,
      public_key: 'visual-public-key',
      derivation_path: "m/84'/0'/0'",
      current_receive_address: 'bc1qchromvoidvisualwalletaddress000000000000',
      current_receive_derivation_path: "m/84'/0'/0'/0/0",
      next_receive_index: 1,
      next_change_index: 0,
      created_at: 1,
      updated_at: 1,
    }
    const secondaryAccount = {
      ...primaryAccount,
      account_id: 'account-daily',
      wallet_id: secondaryWallet.wallet_id,
      label: 'Daily spending',
      public_key: 'visual-public-key-2',
      current_receive_address: 'bc1qchromvoidtravelwalletaddress000000000000',
      created_at: 2,
      updated_at: 2,
    }
    const wallets = includeSecondWallet ? [primaryWallet, secondaryWallet] : [primaryWallet]
    const accounts = includeSecondWallet ? [primaryAccount, secondaryAccount] : [primaryAccount]
    const selectedAccountByWallet = Object.fromEntries(
      accounts.map((account) => [account.wallet_id, account.account_id]),
    )
    const balances = Object.fromEntries(
      accounts.map((account, index) => [
        account.account_id,
        {
          account_id: account.account_id,
          network: account.network,
          balance: {
            spendable: index === 0 ? '12450000' : '3200000',
            pending_in: '0',
            pending_out: '0',
            total: index === 0 ? '12500000' : '3200000',
            amount_unit: 'satoshi',
          },
          fetched_at: Date.now(),
        },
      ]),
    )

    model.status.set({
      initialized: true,
      wallet_count: wallets.length,
      enabled: true,
      disabled_reason: null,
      networks: [
        {
          network: 'bitcoin',
          enabled: true,
          provider_status: 'ready',
          broadcast_enabled: true,
          capabilities: [{id: 'bitcoin_native_transfer', state: 'ready', disabled_reason: null}],
          disabled_reason: null,
        },
      ],
    })
    model.wallets.set(wallets)
    model.accounts.set(accounts)
    model.selectedWalletId.set(primaryWallet.wallet_id)
    model.selectedAccountId.set(primaryAccount.account_id)
    model.selectedAccountByWallet.set(selectedAccountByWallet)
    model.balances.set(balances)
    model.transactions.set([])
    model.mainTab.set('overview')
    model.setupFlow.set(null)
    model.setupVisible.set(false)
    model.overlay.set(null)
    model.loading.set(false)
    model.refreshing.set(false)
    model.preparing.set(false)
    model.confirming.set(false)
    model.error.set(null)
    model.notice.set(null)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }, multipleWallets)

  await page.waitForFunction(() => {
    function deepFind<T extends Element = Element>(
      root: Document | ShadowRoot | Element | null | undefined,
      selector: string,
    ): T | null {
      if (!root) return null
      const found = root.querySelector<T>(selector)
      if (found) return found
      if (root instanceof Element && root.shadowRoot) {
        const inner = deepFind<T>(root.shadowRoot, selector)
        if (inner) return inner
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind<T>(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }

    const toolbar = deepFind(document, '[data-testid="mobile-toolbar"]') as HTMLElement | null
    const desktopToolbar = deepFind(document, '[data-testid="desktop-toolbar"][data-surface="wallet"]')
    return deepFind(toolbar, '.title')?.textContent?.trim() === 'Personal Wallet' || Boolean(desktopToolbar)
  })
}
