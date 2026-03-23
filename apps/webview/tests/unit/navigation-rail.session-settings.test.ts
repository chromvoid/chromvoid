import {describe, expect, it} from 'vitest'

import {NavigationRail} from '../../src/features/file-manager/components/navigation-rail'

describe('NavigationRail Session Settings', () => {
  it('defines navigation-rail custom element', () => {
    NavigationRail.define()
    const rail = document.createElement('navigation-rail') as unknown as NavigationRail
    expect(rail).toBeInstanceOf(NavigationRail)
  })
})
