import type {RpcCmdResult} from 'root/core/transport/tauri/tauri-rpc-types'

export type WalletKnownNetwork = 'bitcoin' | 'ethereum' | 'solana' | 'ton'
export type WalletFeeTier = 'slow' | 'standard' | 'fast'

export type WalletNetworkUiProfile = {
  network: WalletKnownNetwork
  label: string
  symbol: string
  amountUnit: string
  fractionDigits: number
  capabilityId: string
  multipleOutputs: boolean
  supportsComment: boolean
  allocatesReceiveAddresses: boolean
}

const NETWORK_PROFILES: Record<WalletKnownNetwork, WalletNetworkUiProfile> = {
  bitcoin: {
    network: 'bitcoin',
    label: 'Bitcoin',
    symbol: 'BTC',
    amountUnit: 'satoshi',
    fractionDigits: 8,
    capabilityId: 'bitcoin_native_transfer',
    multipleOutputs: true,
    supportsComment: false,
    allocatesReceiveAddresses: true,
  },
  ethereum: {
    network: 'ethereum',
    label: 'Ethereum',
    symbol: 'ETH',
    amountUnit: 'wei',
    fractionDigits: 18,
    capabilityId: 'ethereum_native_transfer',
    multipleOutputs: false,
    supportsComment: false,
    allocatesReceiveAddresses: false,
  },
  solana: {
    network: 'solana',
    label: 'Solana',
    symbol: 'SOL',
    amountUnit: 'lamport',
    fractionDigits: 9,
    capabilityId: 'solana_native_transfer',
    multipleOutputs: false,
    supportsComment: false,
    allocatesReceiveAddresses: false,
  },
  ton: {
    network: 'ton',
    label: 'TON',
    symbol: 'TON',
    amountUnit: 'nanoton',
    fractionDigits: 9,
    capabilityId: 'ton_native_transfer',
    multipleOutputs: false,
    supportsComment: true,
    allocatesReceiveAddresses: false,
  },
}

export function isKnownWalletNetwork(network: string): network is WalletKnownNetwork {
  return Object.hasOwn(NETWORK_PROFILES, network)
}

export function getWalletNetworkProfile(network: string): WalletNetworkUiProfile | null {
  return isKnownWalletNetwork(network) ? NETWORK_PROFILES[network] : null
}

export function getWalletNetworkProfileByUnit(amountUnit: string): WalletNetworkUiProfile | null {
  return Object.values(NETWORK_PROFILES).find((profile) => profile.amountUnit === amountUnit) ?? null
}

export function walletNetworkReady(
  status: RpcCmdResult<'wallet:status'>['networks'][number] | null | undefined,
): boolean {
  if (!status) return false
  const profile = getWalletNetworkProfile(status.network)
  if (!profile) return false
  const capability = status.capabilities.find((item) => item.id === profile.capabilityId)
  return Boolean(
    status.enabled &&
    status.provider_status === 'ready' &&
    status.broadcast_enabled &&
    capability?.state === 'ready',
  )
}

export function walletNetworkUnavailableReason(
  status: RpcCmdResult<'wallet:status'>['networks'][number] | null | undefined,
): string | null {
  if (!status) return 'Network is not registered in this runtime.'
  if (!status.enabled) return status.disabled_reason ?? 'Network is disabled.'
  if (status.provider_status !== 'ready') {
    return status.disabled_reason ?? 'Network provider is unavailable.'
  }
  const profile = getWalletNetworkProfile(status.network)
  if (!profile) return 'This network is not supported by the wallet interface.'
  const capability = status.capabilities.find((item) => item.id === profile.capabilityId)
  if (capability?.state !== 'ready') {
    return capability?.disabled_reason ?? 'Native transfers are unavailable for this network.'
  }
  if (!status.broadcast_enabled) return status.disabled_reason ?? 'Broadcast is disabled.'
  return null
}

export const walletNetworkProfiles = NETWORK_PROFILES
