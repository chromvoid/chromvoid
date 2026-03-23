import {beforeAll, describe, expect, it} from 'vitest'

describe('webview uikit registration', () => {
  beforeAll(async () => {
    await import('../../src/index')
  })

  it('registers accordion components used by entry edit', () => {
    expect(customElements.get('cv-accordion')).toBeDefined()
    expect(customElements.get('cv-accordion-item')).toBeDefined()
  })
})
