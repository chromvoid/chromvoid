import {afterEach, describe, expect, it} from 'vitest'

import {CVCard} from './cv-card'

CVCard.define()

const settle = async (element: CVCard) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createCard = async (attrs?: Partial<CVCard>) => {
  const el = document.createElement('cv-card') as CVCard
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVCard) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

const getHeader = (el: CVCard) =>
  el.shadowRoot!.querySelector('[part="header"]') as HTMLElement

const getBody = (el: CVCard) =>
  el.shadowRoot!.querySelector('[part="body"]') as HTMLElement

const getFooter = (el: CVCard) =>
  el.shadowRoot!.querySelector('[part="footer"]') as HTMLElement

const getImage = (el: CVCard) =>
  el.shadowRoot!.querySelector('[part="image"]') as HTMLElement

const getIndicator = (el: CVCard) =>
  el.shadowRoot!.querySelector('[part="indicator"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-card', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as a <div>', async () => {
      const el = await createCard()
      const base = getBase(el)
      expect(base).not.toBeNull()
      expect(base.tagName).toBe('DIV')
    })

    it('renders [part="image"] containing slot[name="image"]', async () => {
      const el = await createCard()
      const image = getImage(el)
      expect(image).not.toBeNull()
      const slot = image.querySelector('slot[name="image"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="header"] containing slot[name="header"]', async () => {
      const el = await createCard()
      const header = getHeader(el)
      expect(header).not.toBeNull()
      const slot = header.querySelector('slot[name="header"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="body"] containing default slot', async () => {
      const el = await createCard()
      const body = getBody(el)
      expect(body).not.toBeNull()
      const slot = body.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('renders [part="footer"] containing slot[name="footer"]', async () => {
      const el = await createCard()
      const footer = getFooter(el)
      expect(footer).not.toBeNull()
      const slot = footer.querySelector('slot[name="footer"]')
      expect(slot).not.toBeNull()
    })

    it('does NOT render [part="indicator"] when not expandable', async () => {
      const el = await createCard()
      const indicator = getIndicator(el)
      expect(indicator).toBeNull()
    })

    it('renders [part="indicator"] when expandable', async () => {
      const el = await createCard({expandable: true})
      const indicator = getIndicator(el)
      expect(indicator).not.toBeNull()
      expect(indicator.tagName).toBe('SPAN')
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const el = await createCard()
      expect(el.variant).toBe('elevated')
      expect(el.expandable).toBe(false)
      expect(el.expanded).toBe(false)
      expect(el.disabled).toBe(false)
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('boolean attributes reflect when true: expandable, expanded, disabled', async () => {
      const el = await createCard({
        expandable: true,
        expanded: true,
        disabled: true,
      })
      expect(el.hasAttribute('expandable')).toBe(true)
      expect(el.hasAttribute('expanded')).toBe(true)
      expect(el.hasAttribute('disabled')).toBe(true)
    })

    it('boolean attributes absent when false', async () => {
      const el = await createCard()
      expect(el.hasAttribute('expandable')).toBe(false)
      expect(el.hasAttribute('expanded')).toBe(false)
      expect(el.hasAttribute('disabled')).toBe(false)
    })

    it('variant string attribute reflects to DOM', async () => {
      const el = await createCard({variant: 'outlined'})
      expect(el.getAttribute('variant')).toBe('outlined')
    })

    it('changing variant at runtime updates host attribute', async () => {
      const el = await createCard()
      expect(el.getAttribute('variant')).toBe('elevated')

      el.variant = 'outlined'
      await settle(el)
      expect(el.getAttribute('variant')).toBe('outlined')

      el.variant = 'filled'
      await settle(el)
      expect(el.getAttribute('variant')).toBe('filled')
    })
  })

  // --- Variant ---

  describe('variant', () => {
    it.each(['elevated', 'outlined', 'filled'] as const)(
      'variant="%s" reflects to host attribute',
      async (v) => {
        const el = await createCard({variant: v})
        expect(el.getAttribute('variant')).toBe(v)
      },
    )
  })

  // --- Events ---

  describe('events', () => {
    it('fires input event with {expanded: boolean} detail on toggle open', async () => {
      const el = await createCard({expandable: true})
      let detail: unknown

      el.addEventListener('cv-input', (e) => {
        detail = (e as CustomEvent).detail
      })

      getHeader(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({expanded: true})
    })

    it('fires change event with {expanded: boolean} detail on toggle open', async () => {
      const el = await createCard({expandable: true})
      let detail: unknown

      el.addEventListener('cv-change', (e) => {
        detail = (e as CustomEvent).detail
      })

      getHeader(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({expanded: true})
    })

    it('fires input and change with {expanded: false} on toggle close', async () => {
      const el = await createCard({expandable: true, expanded: true})
      const inputDetails: unknown[] = []
      const changeDetails: unknown[] = []

      el.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))
      el.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      getHeader(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(inputDetails).toEqual([{expanded: false}])
      expect(changeDetails).toEqual([{expanded: false}])
    })

    it('does not fire events when not expandable', async () => {
      const el = await createCard()
      let inputCount = 0
      let changeCount = 0

      el.addEventListener('cv-input', () => inputCount++)
      el.addEventListener('cv-change', () => changeCount++)

      getHeader(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })

    it('does not fire events on programmatic expanded attribute change', async () => {
      const el = await createCard({expandable: true})
      let inputCount = 0
      let changeCount = 0

      el.addEventListener('cv-input', () => inputCount++)
      el.addEventListener('cv-change', () => changeCount++)

      el.expanded = true
      await settle(el)
      el.expanded = false
      await settle(el)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })
  })

  // --- ARIA (static card — not expandable) ---

  describe('ARIA (static card)', () => {
    it('no role on base when not expandable', async () => {
      const el = await createCard()
      const base = getBase(el)
      expect(base.hasAttribute('role')).toBe(false)
    })

    it('header has no role when not expandable', async () => {
      const el = await createCard()
      const header = getHeader(el)
      expect(header.hasAttribute('role')).toBe(false)
    })

    it('header has no tabindex when not expandable', async () => {
      const el = await createCard()
      const header = getHeader(el)
      expect(header.hasAttribute('tabindex')).toBe(false)
    })

    it('header has no aria-expanded when not expandable', async () => {
      const el = await createCard()
      const header = getHeader(el)
      expect(header.hasAttribute('aria-expanded')).toBe(false)
    })

    it('header has no aria-controls when not expandable', async () => {
      const el = await createCard()
      const header = getHeader(el)
      expect(header.hasAttribute('aria-controls')).toBe(false)
    })

    it('body has no role when not expandable', async () => {
      const el = await createCard()
      const body = getBody(el)
      expect(body.hasAttribute('role')).toBe(false)
    })

    it('body has no aria-labelledby when not expandable', async () => {
      const el = await createCard()
      const body = getBody(el)
      expect(body.hasAttribute('aria-labelledby')).toBe(false)
    })

    it('body is not hidden when not expandable', async () => {
      const el = await createCard()
      const body = getBody(el)
      expect(body.hasAttribute('hidden')).toBe(false)
    })
  })

  // --- ARIA (expandable card) ---

  describe('ARIA (expandable card)', () => {
    it('header has role="button" when expandable', async () => {
      const el = await createCard({expandable: true})
      expect(getHeader(el).getAttribute('role')).toBe('button')
    })

    it('header has aria-expanded="false" when collapsed', async () => {
      const el = await createCard({expandable: true})
      expect(getHeader(el).getAttribute('aria-expanded')).toBe('false')
    })

    it('header has aria-expanded="true" when expanded', async () => {
      const el = await createCard({expandable: true, expanded: true})
      expect(getHeader(el).getAttribute('aria-expanded')).toBe('true')
    })

    it('header has aria-controls pointing to body id', async () => {
      const el = await createCard({expandable: true})
      const header = getHeader(el)
      const body = getBody(el)
      expect(header.getAttribute('aria-controls')).toBe(body.id)
    })

    it('body has role="region" when expandable', async () => {
      const el = await createCard({expandable: true})
      expect(getBody(el).getAttribute('role')).toBe('region')
    })

    it('body has aria-labelledby pointing to header id', async () => {
      const el = await createCard({expandable: true})
      const header = getHeader(el)
      const body = getBody(el)
      expect(body.getAttribute('aria-labelledby')).toBe(header.id)
    })

    it('body has hidden attribute when collapsed', async () => {
      const el = await createCard({expandable: true})
      expect(getBody(el).hasAttribute('hidden')).toBe(true)
    })

    it('body does not have hidden attribute when expanded', async () => {
      const el = await createCard({expandable: true, expanded: true})
      expect(getBody(el).hasAttribute('hidden')).toBe(false)
    })

    it('header has tabindex="0" when enabled', async () => {
      const el = await createCard({expandable: true})
      expect(getHeader(el).getAttribute('tabindex')).toBe('0')
    })

    it('header has tabindex="-1" when disabled', async () => {
      const el = await createCard({expandable: true, disabled: true})
      expect(getHeader(el).getAttribute('tabindex')).toBe('-1')
    })

    it('header has aria-disabled="true" when disabled', async () => {
      const el = await createCard({expandable: true, disabled: true})
      expect(getHeader(el).getAttribute('aria-disabled')).toBe('true')
    })

    it('header does not have aria-disabled when enabled', async () => {
      const el = await createCard({expandable: true})
      expect(getHeader(el).hasAttribute('aria-disabled')).toBe(false)
    })
  })

  // --- Expandable behavior: click interaction ---

  describe('expandable behavior', () => {
    it('click on header toggles from collapsed to expanded', async () => {
      const el = await createCard({expandable: true})
      getHeader(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.expanded).toBe(true)
    })

    it('click on header toggles from expanded to collapsed', async () => {
      const el = await createCard({expandable: true, expanded: true})
      getHeader(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.expanded).toBe(false)
    })

    it('click emits input and change events', async () => {
      const el = await createCard({expandable: true})
      const inputDetails: Array<{expanded: boolean}> = []
      const changeDetails: Array<{expanded: boolean}> = []

      el.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))
      el.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      getHeader(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(inputDetails).toEqual([{expanded: true}])
      expect(changeDetails).toEqual([{expanded: true}])
    })

    it('multiple clicks toggle expanded back and forth', async () => {
      const el = await createCard({expandable: true})
      const header = getHeader(el)
      const changes: boolean[] = []

      el.addEventListener('cv-change', (e) => changes.push((e as CustomEvent).detail.expanded))

      header.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.expanded).toBe(true)

      header.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.expanded).toBe(false)

      header.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.expanded).toBe(true)

      expect(changes).toEqual([true, false, true])
    })

    it('click on header does not toggle when not expandable', async () => {
      const el = await createCard()
      getHeader(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.expanded).toBe(false)
    })
  })

  // --- Keyboard interaction ---

  describe('keyboard interaction', () => {
    it('Enter toggles from collapsed to expanded', async () => {
      const el = await createCard({expandable: true})
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)
      expect(el.expanded).toBe(true)
    })

    it('Enter toggles from expanded to collapsed', async () => {
      const el = await createCard({expandable: true, expanded: true})
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)
      expect(el.expanded).toBe(false)
    })

    it('Space toggles from collapsed to expanded', async () => {
      const el = await createCard({expandable: true})
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)
      expect(el.expanded).toBe(true)
    })

    it('Space toggles from expanded to collapsed', async () => {
      const el = await createCard({expandable: true, expanded: true})
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)
      expect(el.expanded).toBe(false)
    })

    it('Enter emits input and change events', async () => {
      const el = await createCard({expandable: true})
      const inputDetails: unknown[] = []
      const changeDetails: unknown[] = []

      el.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))
      el.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)

      expect(inputDetails).toEqual([{expanded: true}])
      expect(changeDetails).toEqual([{expanded: true}])
    })

    it('Enter does not toggle when disabled', async () => {
      const el = await createCard({expandable: true, disabled: true})
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)
      expect(el.expanded).toBe(false)
    })

    it('Space does not toggle when disabled', async () => {
      const el = await createCard({expandable: true, disabled: true})
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)
      expect(el.expanded).toBe(false)
    })

    it('Enter/Space do nothing when not expandable', async () => {
      const el = await createCard()
      let inputCount = 0
      el.addEventListener('cv-input', () => inputCount++)

      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)

      expect(el.expanded).toBe(false)
      expect(inputCount).toBe(0)
    })
  })

  // --- Arrow key interaction ---

  describe('arrow key interaction', () => {
    it('ArrowDown opens a collapsed card', async () => {
      const el = await createCard({expandable: true})
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)
      expect(el.expanded).toBe(true)
    })

    it('ArrowRight opens a collapsed card', async () => {
      const el = await createCard({expandable: true})
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)
      expect(el.expanded).toBe(true)
    })

    it('ArrowDown is a no-op on an already expanded card', async () => {
      const el = await createCard({expandable: true, expanded: true})
      let eventCount = 0
      el.addEventListener('cv-input', () => eventCount++)

      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)

      expect(el.expanded).toBe(true)
      expect(eventCount).toBe(0)
    })

    it('ArrowRight is a no-op on an already expanded card', async () => {
      const el = await createCard({expandable: true, expanded: true})
      let eventCount = 0
      el.addEventListener('cv-input', () => eventCount++)

      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)

      expect(el.expanded).toBe(true)
      expect(eventCount).toBe(0)
    })

    it('ArrowUp closes an expanded card', async () => {
      const el = await createCard({expandable: true, expanded: true})
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(el)
      expect(el.expanded).toBe(false)
    })

    it('ArrowLeft closes an expanded card', async () => {
      const el = await createCard({expandable: true, expanded: true})
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
      await settle(el)
      expect(el.expanded).toBe(false)
    })

    it('ArrowUp is a no-op on an already collapsed card', async () => {
      const el = await createCard({expandable: true})
      let eventCount = 0
      el.addEventListener('cv-input', () => eventCount++)

      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(el)

      expect(el.expanded).toBe(false)
      expect(eventCount).toBe(0)
    })

    it('ArrowLeft is a no-op on an already collapsed card', async () => {
      const el = await createCard({expandable: true})
      let eventCount = 0
      el.addEventListener('cv-input', () => eventCount++)

      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
      await settle(el)

      expect(el.expanded).toBe(false)
      expect(eventCount).toBe(0)
    })

    it('arrow keys do not toggle when disabled', async () => {
      const el = await createCard({expandable: true, disabled: true})

      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)
      expect(el.expanded).toBe(false)

      // Also test close arrows when disabled+expanded (set expanded programmatically)
      el.expanded = true
      await settle(el)
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
      await settle(el)
      expect(el.expanded).toBe(true)
    })
  })

  // --- Disabled state blocks all interaction ---

  describe('disabled state blocks all interaction', () => {
    it('click does not toggle when disabled', async () => {
      const el = await createCard({expandable: true, disabled: true})
      getHeader(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.expanded).toBe(false)
    })

    it('Enter does not toggle when disabled', async () => {
      const el = await createCard({expandable: true, disabled: true})
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)
      expect(el.expanded).toBe(false)
    })

    it('Space does not toggle when disabled', async () => {
      const el = await createCard({expandable: true, disabled: true})
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)
      expect(el.expanded).toBe(false)
    })

    it('no input/change events fire when disabled', async () => {
      const el = await createCard({expandable: true, disabled: true})
      let inputCount = 0
      let changeCount = 0
      el.addEventListener('cv-input', () => inputCount++)
      el.addEventListener('cv-change', () => changeCount++)

      getHeader(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      getHeader(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(el)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })

    it('header has aria-disabled="true" and tabindex="-1" when disabled', async () => {
      const el = await createCard({expandable: true, disabled: true})
      const header = getHeader(el)
      expect(header.getAttribute('aria-disabled')).toBe('true')
      expect(header.getAttribute('tabindex')).toBe('-1')
    })
  })

  // --- Dynamic state updates ---

  describe('dynamic state updates', () => {
    it('changing disabled at runtime syncs ARIA attributes on header', async () => {
      const el = await createCard({expandable: true})
      const header = getHeader(el)

      expect(header.hasAttribute('aria-disabled')).toBe(false)
      expect(header.getAttribute('tabindex')).toBe('0')

      el.disabled = true
      await settle(el)
      expect(header.getAttribute('aria-disabled')).toBe('true')
      expect(header.getAttribute('tabindex')).toBe('-1')

      el.disabled = false
      await settle(el)
      expect(header.hasAttribute('aria-disabled')).toBe(false)
      expect(header.getAttribute('tabindex')).toBe('0')
    })

    it('changing expandable at runtime toggles ARIA semantics', async () => {
      const el = await createCard()
      const header = getHeader(el)
      const body = getBody(el)

      // Initially not expandable — no ARIA roles on header/body
      expect(header.hasAttribute('role')).toBe(false)
      expect(body.hasAttribute('role')).toBe(false)

      el.expandable = true
      await settle(el)
      expect(header.getAttribute('role')).toBe('button')
      expect(body.getAttribute('role')).toBe('region')

      el.expandable = false
      await settle(el)
      expect(header.hasAttribute('role')).toBe(false)
      expect(body.hasAttribute('role')).toBe(false)
    })

    it('programmatic expanded change updates aria-expanded and body hidden', async () => {
      const el = await createCard({expandable: true})
      const header = getHeader(el)
      const body = getBody(el)

      expect(header.getAttribute('aria-expanded')).toBe('false')
      expect(body.hasAttribute('hidden')).toBe(true)

      el.expanded = true
      await settle(el)
      expect(header.getAttribute('aria-expanded')).toBe('true')
      expect(body.hasAttribute('hidden')).toBe(false)

      el.expanded = false
      await settle(el)
      expect(header.getAttribute('aria-expanded')).toBe('false')
      expect(body.hasAttribute('hidden')).toBe(true)
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('static card: getCardProps() produces no interactive attributes on base', async () => {
      const el = await createCard()
      const base = getBase(el)
      expect(base.hasAttribute('role')).toBe(false)
      expect(base.hasAttribute('tabindex')).toBe(false)
      expect(base.hasAttribute('aria-expanded')).toBe(false)
    })

    it('static card: getTriggerProps() produces no ARIA attributes on header', async () => {
      const el = await createCard()
      const header = getHeader(el)
      expect(header.hasAttribute('role')).toBe(false)
      expect(header.hasAttribute('aria-expanded')).toBe(false)
      expect(header.hasAttribute('aria-controls')).toBe(false)
      expect(header.hasAttribute('tabindex')).toBe(false)
    })

    it('static card: getContentProps() produces no ARIA attributes on body', async () => {
      const el = await createCard()
      const body = getBody(el)
      expect(body.hasAttribute('role')).toBe(false)
      expect(body.hasAttribute('aria-labelledby')).toBe(false)
      expect(body.hasAttribute('hidden')).toBe(false)
    })

    it('expandable card: trigger ARIA attributes originate from getTriggerProps()', async () => {
      const el = await createCard({expandable: true})
      const header = getHeader(el)

      // The header must have id, role, tabindex, aria-expanded, aria-controls
      expect(header.id).toBeTruthy()
      expect(header.getAttribute('role')).toBe('button')
      expect(header.getAttribute('tabindex')).toBeTruthy()
      expect(header.getAttribute('aria-expanded')).toBeTruthy()
      expect(header.getAttribute('aria-controls')).toBeTruthy()
    })

    it('expandable card: content ARIA attributes originate from getContentProps()', async () => {
      const el = await createCard({expandable: true})
      const body = getBody(el)

      // The body must have id, role, aria-labelledby, hidden
      expect(body.id).toBeTruthy()
      expect(body.getAttribute('role')).toBe('region')
      expect(body.getAttribute('aria-labelledby')).toBeTruthy()
      expect(body.hasAttribute('hidden')).toBe(true)
    })

    it('trigger aria-controls value matches body id', async () => {
      const el = await createCard({expandable: true})
      const header = getHeader(el)
      const body = getBody(el)
      expect(header.getAttribute('aria-controls')).toBe(body.id)
    })

    it('body aria-labelledby value matches header id', async () => {
      const el = await createCard({expandable: true})
      const header = getHeader(el)
      const body = getBody(el)
      expect(body.getAttribute('aria-labelledby')).toBe(header.id)
    })

    it('aria-expanded updates when expanded state changes via user action', async () => {
      const el = await createCard({expandable: true})
      const header = getHeader(el)

      expect(header.getAttribute('aria-expanded')).toBe('false')

      getHeader(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(header.getAttribute('aria-expanded')).toBe('true')

      getHeader(el).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(header.getAttribute('aria-expanded')).toBe('false')
    })

    it('body hidden attribute updates when expanded state changes', async () => {
      const el = await createCard({expandable: true})
      const body = getBody(el)

      expect(body.hasAttribute('hidden')).toBe(true)

      el.expanded = true
      await settle(el)
      expect(body.hasAttribute('hidden')).toBe(false)

      el.expanded = false
      await settle(el)
      expect(body.hasAttribute('hidden')).toBe(true)
    })

    it('expandable card root (base) carries no interactive attributes', async () => {
      const el = await createCard({expandable: true})
      const base = getBase(el)
      // Per headless spec invariant #9: getCardProps() never produces interactive attributes
      expect(base.hasAttribute('tabindex')).toBe(false)
      expect(base.hasAttribute('aria-expanded')).toBe(false)
      expect(base.hasAttribute('role')).toBe(false)
    })
  })
})
