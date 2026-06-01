import {beforeAll, describe, expect, it} from 'vitest'

describe('webview uikit registration', () => {
  beforeAll(async () => {
    await import('../../src/index')
  })

  it('registers accordion components used by entry edit', () => {
    expect(customElements.get('cv-accordion')).toBeDefined()
    expect(customElements.get('cv-accordion-item')).toBeDefined()
  })

  it('registers cv-popover for passwords mobile context menus', () => {
    expect(customElements.get('cv-popover')).toBeDefined()
  })

  it('registers guidance primitives for product guidance surfaces', () => {
    expect(customElements.get('cv-guidance-panel')).toBeDefined()
    expect(customElements.get('cv-guidance-anchor')).toBeDefined()
  })
})
