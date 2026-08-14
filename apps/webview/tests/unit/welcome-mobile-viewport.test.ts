import {describe, expect, it} from 'vitest'

import {
  resolveWelcomeMobileViewportProfile,
  resolveWelcomeTabletViewportEligibility,
} from 'root/routes/welcome/welcome-mobile-viewport'

describe('welcome mobile viewport profile', () => {
  it.each([
    {blockSize: 844, profile: 'regular'},
    {blockSize: 701, profile: 'regular'},
    {blockSize: 700, profile: 'compact'},
    {blockSize: 621, profile: 'compact'},
    {blockSize: 620, profile: 'condensed'},
    {blockSize: 568, profile: 'condensed'},
  ] as const)('maps $blockSize px to $profile', ({blockSize, profile}) => {
    expect(resolveWelcomeMobileViewportProfile(blockSize)).toBe(profile)
  })

  it('falls back to regular before valid viewport geometry is available', () => {
    expect(resolveWelcomeMobileViewportProfile(0)).toBe('regular')
    expect(resolveWelcomeMobileViewportProfile(Number.NaN)).toBe('regular')
  })

  it('enables tablet composition only at the stable 600 px height threshold', () => {
    expect(resolveWelcomeTabletViewportEligibility(599)).toBe(false)
    expect(resolveWelcomeTabletViewportEligibility(600)).toBe(true)
    expect(resolveWelcomeTabletViewportEligibility(820)).toBe(true)
  })
})
