import {getWalletNetworkProfile, getWalletNetworkProfileByUnit} from './wallet-network'

function decimalFactor(fractionDigits: number): bigint {
  return 10n ** BigInt(fractionDigits)
}

export function parseWalletDecimal(value: string, network: string): string {
  const profile = getWalletNetworkProfile(network)
  if (!profile) throw new Error('This network is not supported by the wallet interface')

  const trimmed = value.trim()
  if (!trimmed) throw new Error('Amount is required')

  const match = /^(\d+)(?:\.(\d*))?$|^\.(\d+)$/.exec(trimmed)
  if (!match) throw new Error(`Amount must be a positive ${profile.symbol} decimal`)

  const whole = match[1] ?? '0'
  const fraction = match[2] ?? match[3] ?? ''
  if (fraction.length > profile.fractionDigits) {
    throw new Error(`${profile.symbol} amount supports up to ${profile.fractionDigits} decimal places`)
  }

  const factor = decimalFactor(profile.fractionDigits)
  const wholeBaseUnits = BigInt(whole) * factor
  const fractionBaseUnits = BigInt(fraction.padEnd(profile.fractionDigits, '0') || '0')
  return (wholeBaseUnits + fractionBaseUnits).toString()
}

export function isPositiveBaseUnitAmount(value: string): boolean {
  try {
    return BigInt(value) > 0n
  } catch {
    return false
  }
}

export function formatWalletAmount(
  value: string | null | undefined,
  amountUnit: string,
  network?: string,
): string {
  const profile =
    (network ? getWalletNetworkProfile(network) : null) ?? getWalletNetworkProfileByUnit(amountUnit)
  if (!profile) return value ? `${value} ${amountUnit}` : `0 ${amountUnit}`
  if (!value) return `0 ${profile.symbol}`

  let amount: bigint
  try {
    amount = BigInt(value)
  } catch {
    return `${value} ${amountUnit}`
  }

  const factor = decimalFactor(profile.fractionDigits)
  const whole = amount / factor
  const fraction = amount % factor
  if (fraction === 0n) return `${whole.toString()} ${profile.symbol}`

  const fractionText = fraction.toString().padStart(profile.fractionDigits, '0').replace(/0+$/, '')
  return `${whole.toString()}.${fractionText} ${profile.symbol}`
}

export function formatWalletDecimal(value: string, network: string): string {
  const profile = getWalletNetworkProfile(network)
  if (!profile) return value

  let amount: bigint
  try {
    amount = BigInt(value)
  } catch {
    return value
  }

  const factor = decimalFactor(profile.fractionDigits)
  const whole = amount / factor
  const fraction = amount % factor
  if (fraction === 0n) return whole.toString()
  return `${whole.toString()}.${fraction.toString().padStart(profile.fractionDigits, '0').replace(/0+$/, '')}`
}

export function parseTonDecimalToNanoton(value: string): string {
  return parseWalletDecimal(value, 'ton')
}

export const isPositiveNanoton = isPositiveBaseUnitAmount

export function formatNanoton(value: string | null | undefined): string {
  return formatWalletAmount(value, 'nanoton', 'ton')
}

export function shortenAddress(value: string | null | undefined): string {
  if (!value) return ''
  if (value.length <= 18) return value
  return `${value.slice(0, 8)}...${value.slice(-8)}`
}

export function normalizeMnemonicText(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean)
}
