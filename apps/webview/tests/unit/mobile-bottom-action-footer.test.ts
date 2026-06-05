import {afterEach, describe, expect, it} from 'vitest'

import {MobileBottomActionFooter} from '../../src/shared/ui/mobile-bottom-action-footer'

describe('MobileBottomActionFooter', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('defines the reusable mobile bottom action footer layout', async () => {
    MobileBottomActionFooter.define()

    const element = document.createElement(MobileBottomActionFooter.elementName) as MobileBottomActionFooter
    const button = document.createElement('button')
    button.textContent = 'Save'
    element.append(button)
    document.body.append(element)

    await element.updateComplete

    expect(element.shadowRoot?.querySelector('[part="container"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('[part="row"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('slot[name="message"]')).not.toBeNull()
    expect(element.contains(button)).toBe(true)
  })

})
