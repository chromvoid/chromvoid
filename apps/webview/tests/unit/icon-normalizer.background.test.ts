import {describe, expect, it} from 'vitest'

import {pickIconBackgroundColorFromPixels} from '../../src/features/passmanager/service/icon-normalizer'

function luminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  const toLinear = (value: number) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue)
}

describe('icon background color analysis', () => {
  it('chooses a dark background for a light icon', () => {
    const background = pickIconBackgroundColorFromPixels(
      new Uint8ClampedArray([246, 246, 246, 255, 255, 255, 255, 255]),
      2,
      1,
    )

    expect(background).toMatch(/^#[0-9a-f]{6}$/)
    expect(luminance(background!)).toBeLessThan(0.2)
  })

  it('chooses a light background for a dark icon and ignores transparent pixels', () => {
    const background = pickIconBackgroundColorFromPixels(
      new Uint8ClampedArray([255, 255, 255, 0, 12, 18, 24, 255]),
      2,
      1,
    )

    expect(background).toMatch(/^#[0-9a-f]{6}$/)
    expect(luminance(background!)).toBeGreaterThan(0.65)
  })

  it('returns no color for fully transparent icons', () => {
    expect(pickIconBackgroundColorFromPixels(new Uint8ClampedArray([255, 255, 255, 0]), 1, 1)).toBeUndefined()
  })
})
