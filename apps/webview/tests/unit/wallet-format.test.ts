import {describe, expect, it} from 'vitest'

import {
  formatNanoton,
  formatWalletAmount,
  normalizeMnemonicText,
  parseWalletDecimal,
  parseTonDecimalToNanoton,
  shortenAddress,
} from '../../src/routes/wallet/wallet-format'

describe('wallet TON formatting', () => {
  it('parses TON decimal input into nanoton strings', () => {
    expect(parseTonDecimalToNanoton('1')).toBe('1000000000')
    expect(parseTonDecimalToNanoton('0.000000001')).toBe('1')
    expect(parseTonDecimalToNanoton('12.34')).toBe('12340000000')
    expect(parseTonDecimalToNanoton(' 001.2300 ')).toBe('1230000000')
  })

  it('rejects invalid TON decimal input before Core prepare', () => {
    expect(() => parseTonDecimalToNanoton('')).toThrow('Amount is required')
    expect(() => parseTonDecimalToNanoton('1.0000000001')).toThrow(
      'TON amount supports up to 9 decimal places',
    )
    expect(() => parseTonDecimalToNanoton('1e3')).toThrow('Amount must be a positive TON decimal')
    expect(() => parseTonDecimalToNanoton('-1')).toThrow('Amount must be a positive TON decimal')
  })

  it('formats nanoton balances without floating point conversion', () => {
    expect(formatNanoton('0')).toBe('0 TON')
    expect(formatNanoton('1')).toBe('0.000000001 TON')
    expect(formatNanoton('1230000000')).toBe('1.23 TON')
    expect(formatNanoton('120000000000')).toBe('120 TON')
  })

  it('converts every supported native amount without floating point precision loss', () => {
    expect(parseWalletDecimal('1.00000001', 'bitcoin')).toBe('100000001')
    expect(parseWalletDecimal('0.000000000000000001', 'ethereum')).toBe('1')
    expect(parseWalletDecimal('12.000000001', 'solana')).toBe('12000000001')
    expect(parseWalletDecimal('9007199254740993.123456789012345678', 'ethereum')).toBe(
      '9007199254740993123456789012345678',
    )

    expect(formatWalletAmount('123456789', 'satoshi', 'bitcoin')).toBe('1.23456789 BTC')
    expect(formatWalletAmount('1000000000000000001', 'wei', 'ethereum')).toBe('1.000000000000000001 ETH')
    expect(formatWalletAmount('1500000000', 'lamport', 'solana')).toBe('1.5 SOL')
    expect(formatWalletAmount('42', 'future-unit', 'future-chain')).toBe('42 future-unit')
  })

  it('normalizes mnemonic text and shortens long addresses for display', () => {
    expect(normalizeMnemonicText(' Alpha  beta\nGamma ')).toEqual(['alpha', 'beta', 'gamma'])
    expect(shortenAddress('EQBabcdefghijklmnopqrstuvwxyz1234567890')).toBe('EQBabcde...34567890')
    expect(shortenAddress('short')).toBe('short')
  })
})
