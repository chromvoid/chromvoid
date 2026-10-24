import {wrap} from '@reatom/core'

import {i18n} from 'root/i18n'
import {normalizeMnemonicText} from './wallet-format'
import type {WalletRpcPort} from './wallet-page.types'
import {
  DEFAULT_HD_LABEL,
  DEFAULT_TON_ONLY_LABEL,
  MULTICHAIN_WALLET_MODE,
  TON_ONLY_WALLET_MODE,
  type WalletSetupModel,
} from './wallet-setup.model'

type WalletSetupControllerDeps = {
  setup: WalletSetupModel
  rpcPort: WalletRpcPort
  reloadWalletStructure: () => Promise<void>
  selectCreated: (walletId: string, accountId: string | null) => void
  finishSetup: (notice: string) => void
  setError: (error: unknown) => void
}

function clientRequestId(scope: string): string {
  const randomUUID = globalThis.crypto?.randomUUID?.()
  if (randomUUID) return `${scope}:${randomUUID}`
  return `${scope}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
}

export class WalletSetupController {
  private generateMnemonicInFlight: {generationId: number; promise: Promise<void>} | null = null

  constructor(private readonly deps: WalletSetupControllerDeps) {}

  generateMnemonic(): Promise<void> {
    const {setup} = this.deps
    if (
      this.generateMnemonicInFlight &&
      setup.isMnemonicGenerationCurrent(this.generateMnemonicInFlight.generationId)
    ) {
      return this.generateMnemonicInFlight.promise
    }
    const generationId = setup.beginMnemonicGeneration()
    const promise = this.runGenerateMnemonic(generationId).finally(() => {
      if (this.generateMnemonicInFlight?.generationId === generationId) {
        this.generateMnemonicInFlight = null
      }
    })
    this.generateMnemonicInFlight = {generationId, promise}
    return promise
  }

  private async runGenerateMnemonic(generationId: number): Promise<void> {
    const {setup, rpcPort} = this.deps
    try {
      const response = await wrap(
        rpcPort.rpc('wallet:hd:generateMnemonic', {
          // The only creation shape: a universal rotation root (TEP-0003), 12 words.
          wallet_mode: MULTICHAIN_WALLET_MODE,
          mnemonic_standard: 'rotation',
          word_count: 12,
          wordlist: 'english',
        }),
      )
      if (!setup.isMnemonicGenerationCurrent(generationId)) return
      setup.generatedMnemonic.set(response.mnemonic)
      setup.generatedMnemonicDraftId.set(response.mnemonic_draft_id)
      setup.generatedMnemonicExpiresAt.set(response.expires_at)
    } catch (error) {
      if (setup.isMnemonicGenerationCurrent(generationId)) this.deps.setError(error)
    } finally {
      setup.finishMnemonicGeneration(generationId)
    }
  }

  async createGeneratedWallet(): Promise<void> {
    if (!this.deps.setup.canCreateGeneratedWallet()) return
    if (!this.deps.setup.generatedMnemonicDraftId()) await this.generateMnemonic()
    const mnemonicDraftId = this.deps.setup.generatedMnemonicDraftId()
    if (!mnemonicDraftId || !this.deps.setup.canCreateGeneratedWallet()) return
    const created = await this.createHdWallet({
      label: this.deps.setup.createLabel(),
      mnemonic: null,
      mnemonicDraftId,
      walletMode: MULTICHAIN_WALLET_MODE,
      mnemonicStandard: 'rotation',
      supportedNetworks: this.deps.setup.availableMultichainNetworks(),
      // The passphrase is an optional extra for the non-TON accounts; off means none at all.
      bip39Passphrase: this.deps.setup.useBip39Passphrase() ? this.deps.setup.bip39Passphrase() : null,
    })
    if (created) this.deps.setup.invalidateGeneratedMnemonic()
  }

  async restoreHdWallet(): Promise<void> {
    const {setup} = this.deps
    if (!setup.canRestoreHdWallet()) return
    const created = await this.createHdWallet({
      label: setup.restoreLabel(),
      mnemonic: normalizeMnemonicText(setup.restoreMnemonicText()),
      mnemonicDraftId: null,
      walletMode: setup.restoreWalletMode(),
      mnemonicStandard: setup.restoreMnemonicStandard(),
      supportedNetworks: setup.restoreNetworks(),
      bip39Passphrase:
        setup.restoreWalletMode() === MULTICHAIN_WALLET_MODE && setup.useBip39Passphrase()
          ? setup.bip39Passphrase()
          : null,
    })
    if (created) setup.restoreMnemonicText.set('')
  }

  async importWallet(): Promise<void> {
    const {setup, rpcPort} = this.deps
    try {
      const response = await wrap(
        rpcPort.rpc('wallet:import:create', {
          label: setup.importLabel().trim() || 'Imported wallet',
          network: setup.importNetwork(),
          curve: setup.importProfile().curve,
          private_key: setup.importPrivateKey().trim(),
          encoding: setup.importEncoding(),
          client_request_id: clientRequestId('wallet-import-create'),
        }),
      )
      setup.importPrivateKey.set('')
      await wrap(this.deps.reloadWalletStructure())
      this.deps.selectCreated(response.wallet_id, response.account_id)
      this.deps.finishSetup(i18n('wallet:notice:imported'))
    } catch (error) {
      this.deps.setError(error)
    }
  }

  private async createHdWallet(input: {
    label: string
    mnemonic: string[] | null
    mnemonicDraftId: string | null
    walletMode: typeof MULTICHAIN_WALLET_MODE | typeof TON_ONLY_WALLET_MODE
    mnemonicStandard: 'bip39' | 'ton_native' | 'rotation'
    supportedNetworks: string[]
    bip39Passphrase: string | null
  }): Promise<boolean> {
    const {rpcPort, setup} = this.deps
    if (setup.hdWalletLoading()) return false
    setup.hdWalletLoading.set(true)
    try {
      const expectedWordCounts = input.mnemonicStandard === 'ton_native' ? [24] : [12, 24]
      // `rotation` (Telegram Wallet, TEP-0003) accepts the 12-word initial form and the 24-word rotated form.
      if (input.mnemonic && !expectedWordCounts.includes(input.mnemonic.length)) {
        throw new Error(i18n('wallet:error:mnemonic-length'))
      }
      if (input.supportedNetworks.length === 0) return false
      const response = await wrap(
        rpcPort.rpc('wallet:hd:create', {
          label:
            input.label.trim() ||
            (input.walletMode === TON_ONLY_WALLET_MODE ? DEFAULT_TON_ONLY_LABEL : DEFAULT_HD_LABEL),
          wallet_mode: input.walletMode,
          mnemonic: input.mnemonic,
          mnemonic_draft_id: input.mnemonicDraftId,
          wordlist: 'english',
          mnemonic_standard: input.mnemonicStandard,
          bip39_passphrase: input.bip39Passphrase,
          supported_networks: input.supportedNetworks,
          client_request_id: clientRequestId('wallet-hd-create'),
        }),
      )
      await wrap(this.deps.reloadWalletStructure())
      this.deps.selectCreated(response.wallet_id, response.accounts[0]?.account_id ?? null)
      this.deps.finishSetup(i18n('wallet:notice:created'))
      return true
    } catch (error) {
      this.deps.setError(error)
      return false
    } finally {
      setup.hdWalletLoading.set(false)
    }
  }
}
