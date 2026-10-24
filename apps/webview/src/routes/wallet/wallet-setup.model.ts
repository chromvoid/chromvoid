import {atom, computed} from '@reatom/core'

import type {RpcCmdResult} from 'root/core/transport/tauri/tauri-rpc-types'
import {normalizeMnemonicText} from './wallet-format'

type WalletStatus = RpcCmdResult<'wallet:status'>
type WalletSetupNetworkStatus = WalletStatus['networks'][number] & {network: WalletImportNetwork}

export type WalletRecoveryProfile = 'multichain' | 'telegram_multichain' | 'ton_only' | 'ton_legacy'
export type WalletWordCount = 12 | 24
export type WalletImportNetwork = 'bitcoin' | 'ethereum' | 'solana' | 'ton'
export type WalletEncoding = 'base58_keypair' | 'base64' | 'hex' | 'wif'

export const DEFAULT_HD_LABEL = 'Multichain Wallet'
export const DEFAULT_TON_ONLY_LABEL = 'TON Wallet'
export const TON_ONLY_WALLET_MODE = 'ton_only'
export const MULTICHAIN_WALLET_MODE = 'multichain'

const TON_NETWORK = 'ton'
const TON_NATIVE_MNEMONIC_STANDARD = 'ton_native'
const ROTATION_MNEMONIC_STANDARD = 'rotation'
const BIP39_MNEMONIC_STANDARD = 'bip39'
const TON_LEGACY_PROFILE = 'ton_legacy'
const TELEGRAM_MULTICHAIN_PROFILE = 'telegram_multichain'

export function isTonOnlyProfile(profile: WalletRecoveryProfile): boolean {
  return profile === TON_ONLY_WALLET_MODE || profile === TON_LEGACY_PROFILE
}
const MULTICHAIN_NETWORKS = new Set<WalletImportNetwork>(['bitcoin', 'ethereum', 'solana', 'ton'])
const MULTICHAIN_NETWORK_ORDER: WalletImportNetwork[] = ['bitcoin', 'ethereum', 'solana', 'ton']
const IMPORT_PROFILES: Record<
  WalletImportNetwork,
  {curve: 'ed25519' | 'secp256k1'; encodings: WalletEncoding[]}
> = {
  bitcoin: {curve: 'secp256k1', encodings: ['wif']},
  ethereum: {curve: 'secp256k1', encodings: ['hex']},
  solana: {curve: 'ed25519', encodings: ['base58_keypair']},
  ton: {curve: 'ed25519', encodings: ['hex', 'base64']},
}

export class WalletSetupModel {
  private mnemonicGenerationId = 0

  readonly createLabel = atom(DEFAULT_HD_LABEL, 'wallet.createLabel')
  readonly wordCount = atom<WalletWordCount>(12, 'wallet.setupWordCount')
  readonly generatedMnemonic = atom<string[]>([], 'wallet.generatedMnemonic')
  readonly generatedMnemonicDraftId = atom<string | null>(null, 'wallet.generatedMnemonicDraftId')
  readonly generatedMnemonicExpiresAt = atom<number | null>(null, 'wallet.generatedMnemonicExpiresAt')
  readonly mnemonicLoading = atom(false, 'wallet.mnemonicLoading')
  readonly createConfirmed = atom(false, 'wallet.createConfirmed')
  readonly hdWalletLoading = atom(false, 'wallet.hdWalletLoading')
  readonly restoreLabel = atom(DEFAULT_HD_LABEL, 'wallet.restoreLabel')
  readonly restoreProfile = atom<WalletRecoveryProfile>('multichain', 'wallet.restoreProfile')
  readonly restoreMnemonicText = atom('', 'wallet.restoreMnemonicText')
  readonly bip39Passphrase = atom('', 'wallet.bip39Passphrase')
  readonly useBip39Passphrase = atom(false, 'wallet.useBip39Passphrase')
  readonly importLabel = atom('Imported wallet', 'wallet.importLabel')
  readonly importNetwork = atom<WalletImportNetwork>('ton', 'wallet.importNetwork')
  readonly importPrivateKey = atom('', 'wallet.importPrivateKey')
  readonly importEncoding = atom<WalletEncoding>('hex', 'wallet.importEncoding')

  readonly availableMultichainNetworks = computed(() => {
    return (
      this.getStatus()
        ?.networks.filter(
          (network): network is WalletStatus['networks'][number] & {network: WalletImportNetwork} =>
            network.enabled && MULTICHAIN_NETWORKS.has(network.network as WalletImportNetwork),
        )
        .map((network) => network.network) ?? []
    )
  }, 'wallet.availableMultichainNetworks')

  readonly multichainNetworkStatuses = computed<WalletSetupNetworkStatus[]>(() => {
    const statuses = this.getStatus()?.networks ?? []
    return MULTICHAIN_NETWORK_ORDER.map((network) => {
      const status = statuses.find((item) => item.network === network)
      return status
        ? {...status, network}
        : {
            network,
            enabled: false,
            provider_status: 'unavailable' as const,
            broadcast_enabled: false,
            capabilities: [],
            disabled_reason: 'Not registered in this runtime',
          }
    })
  }, 'wallet.multichainNetworkStatuses')

  readonly restoreNetworks = computed(() => {
    if (isTonOnlyProfile(this.restoreProfile())) {
      return this.availableMultichainNetworks().includes(TON_NETWORK) ? [TON_NETWORK] : []
    }
    return this.availableMultichainNetworks()
  }, 'wallet.restoreNetworks')

  readonly restoreMnemonicStandard = computed(() => {
    switch (this.restoreProfile()) {
      case TON_ONLY_WALLET_MODE:
      case TELEGRAM_MULTICHAIN_PROFILE:
        return ROTATION_MNEMONIC_STANDARD
      case TON_LEGACY_PROFILE:
        return TON_NATIVE_MNEMONIC_STANDARD
      default:
        return BIP39_MNEMONIC_STANDARD
    }
  }, 'wallet.restoreMnemonicStandard')

  /** Core `wallet_mode`: both TON profiles are `ton_only`, they differ only in mnemonic standard. */
  readonly restoreWalletMode = computed(
    () => (isTonOnlyProfile(this.restoreProfile()) ? TON_ONLY_WALLET_MODE : MULTICHAIN_WALLET_MODE),
    'wallet.restoreWalletMode',
  )

  readonly canGenerateMnemonic = computed(
    () => this.availableMultichainNetworks().length > 0 && !this.mnemonicLoading() && !this.hdWalletLoading(),
    'wallet.canGenerateMnemonic',
  )

  /**
   * Creation never shows the phrase: the draft is generated on the way when missing. The words
   * stay exportable for other wallet apps from Recovery.
   */
  readonly canCreateGeneratedWallet = computed(
    () => this.canGenerateMnemonic() && this.passphraseOk(),
    'wallet.canCreateGeneratedWallet',
  )

  /** An enabled but empty passphrase is a mistake the user must notice, not a silent default. */
  readonly passphraseOk = computed(
    () => !this.useBip39Passphrase() || this.bip39Passphrase().trim().length > 0,
    'wallet.passphraseOk',
  )

  readonly canRestoreHdWallet = computed(() => {
    const wordCount = normalizeMnemonicText(this.restoreMnemonicText()).length
    const validWordCount =
      this.restoreProfile() === TON_LEGACY_PROFILE ? wordCount === 24 : wordCount === 12 || wordCount === 24
    return !this.hdWalletLoading() && this.restoreNetworks().length > 0 && validWordCount && this.passphraseOk()
  }, 'wallet.canRestoreHdWallet')

  readonly importEncodings = computed(
    () => IMPORT_PROFILES[this.importNetwork()].encodings,
    'wallet.importEncodings',
  )

  constructor(private readonly getStatus: () => WalletStatus | null) {}

  setCreateLabel(value: string): void {
    this.createLabel.set(value)
  }

  setCreateConfirmed(value: boolean): void {
    this.createConfirmed.set(value)
  }

  setRestoreLabel(value: string): void {
    this.restoreLabel.set(value)
  }

  setRestoreMnemonicText(value: string): void {
    this.restoreMnemonicText.set(value)
  }

  setBip39Passphrase(value: string): void {
    this.bip39Passphrase.set(value)
  }

  setImportLabel(value: string): void {
    this.importLabel.set(value)
  }

  setImportPrivateKey(value: string): void {
    this.importPrivateKey.set(value)
  }

  setRestoreProfile(profile: WalletRecoveryProfile): void {
    if (this.restoreProfile() === profile) return
    this.restoreProfile.set(profile)
    if (isTonOnlyProfile(profile)) {
      this.setUseBip39Passphrase(false)
      if (this.restoreLabel() === DEFAULT_HD_LABEL) this.restoreLabel.set(DEFAULT_TON_ONLY_LABEL)
      return
    }
    this.ensureOptions()
    if (this.restoreLabel() === DEFAULT_TON_ONLY_LABEL) this.restoreLabel.set(DEFAULT_HD_LABEL)
  }

  setWordCount(value: WalletWordCount): void {
    if (this.wordCount() === value) return
    this.wordCount.set(value)
    this.cancelMnemonicGeneration()
    this.invalidateGeneratedMnemonic()
  }

  setUseBip39Passphrase(value: boolean): void {
    this.useBip39Passphrase.set(value)
    if (!value) this.bip39Passphrase.set('')
  }

  setImportNetwork(value: WalletImportNetwork): void {
    if (!this.availableMultichainNetworks().includes(value)) return
    this.importNetwork.set(value)
    this.importEncoding.set(IMPORT_PROFILES[value].encodings[0]!)
  }

  setImportEncoding(value: WalletEncoding): void {
    if (this.importEncodings().includes(value)) this.importEncoding.set(value)
  }

  importProfile(): {curve: 'ed25519' | 'secp256k1'; encodings: WalletEncoding[]} {
    return IMPORT_PROFILES[this.importNetwork()]
  }

  ensureOptions(): void {
    const available = this.availableMultichainNetworks()
    if (!available.includes(this.importNetwork())) {
      const fallback = available[0]
      if (fallback) {
        this.importNetwork.set(fallback)
        this.importEncoding.set(IMPORT_PROFILES[fallback].encodings[0]!)
      }
    }
  }

  invalidateGeneratedMnemonic(): void {
    this.generatedMnemonic.set([])
    this.generatedMnemonicDraftId.set(null)
    this.generatedMnemonicExpiresAt.set(null)
    this.createConfirmed.set(false)
  }

  beginMnemonicGeneration(): number {
    this.invalidateGeneratedMnemonic()
    this.mnemonicLoading.set(true)
    return ++this.mnemonicGenerationId
  }

  isMnemonicGenerationCurrent(generationId: number): boolean {
    return this.mnemonicGenerationId === generationId
  }

  finishMnemonicGeneration(generationId: number): void {
    if (this.isMnemonicGenerationCurrent(generationId)) this.mnemonicLoading.set(false)
  }

  cancelMnemonicGeneration(): void {
    this.mnemonicGenerationId += 1
    this.mnemonicLoading.set(false)
  }

  clearSensitiveState(): void {
    this.cancelMnemonicGeneration()
    this.invalidateGeneratedMnemonic()
    this.restoreProfile.set(MULTICHAIN_WALLET_MODE)
    this.restoreMnemonicText.set('')
    this.bip39Passphrase.set('')
    this.useBip39Passphrase.set(false)
    this.importPrivateKey.set('')
  }
}
