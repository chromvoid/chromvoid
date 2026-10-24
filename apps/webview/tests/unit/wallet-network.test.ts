import {describe, expect, it} from 'vitest'

import {walletNetworkRank} from '../../src/routes/wallet/wallet-network'

describe('walletNetworkRank', () => {
  it('orders the universal wallet networks TON first and unknown networks last', () => {
    expect(
      ['ethereum', 'other', 'bitcoin', 'ton'].sort((a, b) => walletNetworkRank(a) - walletNetworkRank(b)),
    ).toEqual(['ton', 'bitcoin', 'ethereum', 'other'])
  })
})
