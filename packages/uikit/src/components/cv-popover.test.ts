import {afterEach, describe, expect, it} from 'vitest'

import {CVPopover} from './cv-popover'

CVPopover.define()

const settle = async (element: CVPopover) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createPopover = async (attrs?: Partial<CVPopover>) => {
  const el = document.createElement('cv-popover') as CVPopover
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVPopover) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

const getTrigger = (el: CVPopover) =>
  el.shadowRoot!.querySelector('[part="trigger"]') as HTMLButtonElement

const getContent = (el: CVPopover) =>
  el.shadowRoot!.querySelector('[part="content"]') as HTMLElement

const getArrow = (el: CVPopover) =>
  el.shadowRoot!.querySelector('[part="arrow"]') as HTMLElement | null

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-popover', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as a div', async () => {
      const el = await createPopover()
      const base = getBase(el)
      expect(base).not.toBeNull()
      expect(base.tagName).toBe('DIV')
    })

    it('renders [part="trigger"] as a button with type="button"', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)
      expect(trigger).not.toBeNull()
      expect(trigger.tagName).toBe('BUTTON')
      expect(trigger.getAttribute('type')).toBe('button')
    })

    it('renders [part="trigger"] containing slot[name="trigger"]', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)
      const slot = trigger.querySelector('slot[name="trigger"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="content"] as a div with role="dialog"', async () => {
      const el = await createPopover()
      const content = getContent(el)
      expect(content).not.toBeNull()
      expect(content.tagName).toBe('DIV')
      expect(content.getAttribute('role')).toBe('dialog')
    })

    it('renders [part="content"] containing default slot', async () => {
      const el = await createPopover()
      const content = getContent(el)
      const slot = content.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('does NOT render [part="arrow"] when arrow=false (default)', async () => {
      const el = await createPopover()
      expect(getArrow(el)).toBeNull()
    })

    it('renders [part="arrow"] as a span when arrow=true', async () => {
      const el = await createPopover({arrow: true})
      const arrow = getArrow(el)
      expect(arrow).not.toBeNull()
      expect(arrow!.tagName).toBe('SPAN')
    })

    it('renders [part="arrow"] containing slot[name="arrow"] when arrow=true', async () => {
      const el = await createPopover({arrow: true})
      const arrow = getArrow(el)
      const slot = arrow!.querySelector('slot[name="arrow"]')
      expect(slot).not.toBeNull()
    })

    it('[part="arrow"] is inside [part="content"]', async () => {
      const el = await createPopover({arrow: true})
      const content = getContent(el)
      const arrow = content.querySelector('[part="arrow"]')
      expect(arrow).not.toBeNull()
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const el = await createPopover()
      expect(el.open).toBe(false)
      expect(el.placement).toBe('bottom-start')
      expect(el.anchor).toBe('trigger')
      expect(el.offset).toBe(4)
      expect(el.arrow).toBe(false)
      expect(el.closeOnEscape).toBe(true)
      expect(el.closeOnOutsidePointer).toBe(true)
      expect(el.closeOnOutsideFocus).toBe(true)
      expect(el.ariaLabel).toBe('')
      expect(el.ariaLabelledBy).toBe('')
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('boolean attributes reflect: open, arrow, close-on-escape, close-on-outside-pointer, close-on-outside-focus', async () => {
      const el = await createPopover({
        open: true,
        arrow: true,
        closeOnEscape: true,
        closeOnOutsidePointer: true,
        closeOnOutsideFocus: true,
      })
      expect(el.hasAttribute('open')).toBe(true)
      expect(el.hasAttribute('arrow')).toBe(true)
      expect(el.hasAttribute('close-on-escape')).toBe(true)
      expect(el.hasAttribute('close-on-outside-pointer')).toBe(true)
      expect(el.hasAttribute('close-on-outside-focus')).toBe(true)
    })

    it('string attributes reflect: placement, anchor', async () => {
      const el = await createPopover({placement: 'top-end', anchor: 'host'})
      expect(el.getAttribute('placement')).toBe('top-end')
      expect(el.getAttribute('anchor')).toBe('host')
    })

    it('number attribute reflects: offset', async () => {
      const el = await createPopover({offset: 12})
      expect(el.getAttribute('offset')).toBe('12')
    })
  })

  // --- Events ---

  describe('events', () => {
    it('fires beforetoggle before opening with correct detail shape', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)
      let detail: unknown = null

      el.addEventListener('beforetoggle', (e) => {
        detail = (e as CustomEvent).detail
      })

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({
        open: true,
        openedBy: expect.any(String),
        dismissIntent: null,
      })
    })

    it('fires toggle after open state changes with correct detail shape', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)
      let detail: unknown = null

      el.addEventListener('toggle', (e) => {
        detail = (e as CustomEvent).detail
      })

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({
        open: true,
        openedBy: expect.any(String),
        dismissIntent: null,
      })
    })

    it('beforetoggle fires before toggle', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)
      const order: string[] = []

      el.addEventListener('beforetoggle', () => order.push('beforetoggle'))
      el.addEventListener('toggle', () => order.push('toggle'))

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(order).toEqual(['beforetoggle', 'toggle'])
    })

    it('beforetoggle is cancelable on open (preventDefault prevents opening)', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)

      el.addEventListener('beforetoggle', (e) => {
        if ((e as CustomEvent).detail.open) {
          e.preventDefault()
        }
      })

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('toggle is not cancelable', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)
      let cancelable: boolean | null = null

      el.addEventListener('toggle', (e) => {
        cancelable = e.cancelable
      })

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(cancelable).toBe(false)
    })

    it('toggle detail includes dismissIntent on close', async () => {
      const el = await createPopover({open: true})
      const content = getContent(el)
      let detail: unknown = null

      el.addEventListener('toggle', (e) => {
        detail = (e as CustomEvent).detail
      })

      content.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(detail).toEqual({
        open: false,
        openedBy: null,
        dismissIntent: 'escape',
      })
    })

    it('toggle detail includes openedBy="pointer" on click open', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)
      let detail: unknown = null

      el.addEventListener('toggle', (e) => {
        detail = (e as CustomEvent).detail
      })

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect((detail as {openedBy: string}).openedBy).toBe('pointer')
    })

    it('toggle detail includes openedBy="keyboard" on keyboard open', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)
      let detail: unknown = null

      el.addEventListener('toggle', (e) => {
        detail = (e as CustomEvent).detail
      })

      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)

      expect((detail as {openedBy: string}).openedBy).toBe('keyboard')
    })

    it('toggle detail includes dismissIntent="outside-pointer" on outside click', async () => {
      const el = await createPopover({open: true})
      let detail: unknown = null

      el.addEventListener('toggle', (e) => {
        detail = (e as CustomEvent).detail
      })

      document.body.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true}))
      await settle(el)

      expect((detail as {dismissIntent: string}).dismissIntent).toBe('outside-pointer')
    })

    it('toggle detail includes dismissIntent="outside-focus" on outside focus', async () => {
      const el = await createPopover({open: true})
      let detail: unknown = null

      el.addEventListener('toggle', (e) => {
        detail = (e as CustomEvent).detail
      })

      document.body.dispatchEvent(new FocusEvent('focusin', {bubbles: true}))
      await settle(el)

      expect((detail as {dismissIntent: string}).dismissIntent).toBe('outside-focus')
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('content has role="dialog"', async () => {
      const el = await createPopover()
      expect(getContent(el).getAttribute('role')).toBe('dialog')
    })

    it('trigger has aria-haspopup="dialog"', async () => {
      const el = await createPopover()
      expect(getTrigger(el).getAttribute('aria-haspopup')).toBe('dialog')
    })

    it('trigger has aria-expanded="false" when closed', async () => {
      const el = await createPopover()
      expect(getTrigger(el).getAttribute('aria-expanded')).toBe('false')
    })

    it('trigger has aria-expanded="true" when open', async () => {
      const el = await createPopover({open: true})
      expect(getTrigger(el).getAttribute('aria-expanded')).toBe('true')
    })

    it('trigger aria-controls links to content id', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)
      const content = getContent(el)
      expect(trigger.getAttribute('aria-controls')).toBe(content.id)
    })

    it('content has aria-modal="false"', async () => {
      const el = await createPopover()
      expect(getContent(el).getAttribute('aria-modal')).toBe('false')
    })

    it('content applies aria-label when set', async () => {
      const el = await createPopover({ariaLabel: 'Options menu'})
      expect(getContent(el).getAttribute('aria-label')).toBe('Options menu')
    })

    it('content applies aria-labelledby when set', async () => {
      const el = await createPopover({ariaLabelledBy: 'heading-1'})
      expect(getContent(el).getAttribute('aria-labelledby')).toBe('heading-1')
    })
  })

  // --- Open/close behavior ---

  describe('open/close behavior', () => {
    it('opens on trigger click', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.open).toBe(true)
      expect(getContent(el).hidden).toBe(false)
    })

    it('closes on trigger click when already open', async () => {
      const el = await createPopover({open: true})
      const trigger = getTrigger(el)

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('closes on Escape key', async () => {
      const el = await createPopover({open: true})
      const content = getContent(el)

      content.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
      expect(content.hidden).toBe(true)
    })

    it('content is hidden when closed', async () => {
      const el = await createPopover()
      expect(getContent(el).hidden).toBe(true)
    })

    it('content is visible when open', async () => {
      const el = await createPopover({open: true})
      expect(getContent(el).hidden).toBe(false)
    })

    it('programmatic open=true opens the popover', async () => {
      const el = await createPopover()
      el.open = true
      await settle(el)
      expect(getContent(el).hidden).toBe(false)
    })

    it('programmatic open=false closes the popover', async () => {
      const el = await createPopover({open: true})
      el.open = false
      await settle(el)
      expect(getContent(el).hidden).toBe(true)
    })
  })

  // --- Keyboard behavior ---

  describe('keyboard behavior', () => {
    it('Enter key on trigger opens the popover', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)

      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })

    it('Space key on trigger opens the popover', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)

      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })

    it('ArrowDown key on trigger opens the popover', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)

      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })

    it('Escape key on content closes the popover', async () => {
      const el = await createPopover({open: true})
      const content = getContent(el)

      content.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('does not close on Escape when closeOnEscape=false', async () => {
      const el = await createPopover({open: true, closeOnEscape: false})
      const content = getContent(el)

      content.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })
  })

  // --- Outside dismiss behavior ---

  describe('outside dismiss behavior', () => {
    it('closes on outside pointer by default', async () => {
      const el = await createPopover({open: true})

      document.body.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('does not close on outside pointer when closeOnOutsidePointer=false', async () => {
      const el = await createPopover({open: true, closeOnOutsidePointer: false})

      document.body.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })

    it('closes on outside focus by default', async () => {
      const el = await createPopover({open: true})

      document.body.dispatchEvent(new FocusEvent('focusin', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('does not close on outside focus when closeOnOutsideFocus=false', async () => {
      const el = await createPopover({open: true, closeOnOutsideFocus: false})

      document.body.dispatchEvent(new FocusEvent('focusin', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })
  })

  // --- Placement ---

  describe('placement', () => {
    it('content has data-placement matching the placement attribute', async () => {
      const el = await createPopover()
      expect(getContent(el).getAttribute('data-placement')).toBe('bottom-start')
    })

    it('data-placement updates when placement changes', async () => {
      const el = await createPopover()
      el.placement = 'top-end'
      await settle(el)
      expect(getContent(el).getAttribute('data-placement')).toBe('top-end')
    })

    it('content has data-anchor matching the anchor attribute', async () => {
      const el = await createPopover()
      expect(getContent(el).getAttribute('data-anchor')).toBe('trigger')
    })

    it('data-anchor updates when anchor changes', async () => {
      const el = await createPopover()
      el.anchor = 'host'
      await settle(el)
      expect(getContent(el).getAttribute('data-anchor')).toBe('host')
    })

    it('offset maps to --cv-popover-offset CSS custom property', async () => {
      const el = await createPopover({offset: 12})
      expect(getContent(el).getAttribute('style')).toContain('--cv-popover-offset:12px')
    })
  })

  // --- Arrow ---

  describe('arrow', () => {
    it('arrow element is not rendered when arrow=false', async () => {
      const el = await createPopover()
      expect(getArrow(el)).toBeNull()
    })

    it('arrow element is rendered inside content when arrow=true', async () => {
      const el = await createPopover({arrow: true})
      const content = getContent(el)
      const arrow = content.querySelector('[part="arrow"]')
      expect(arrow).not.toBeNull()
    })

    it('arrow element contains slot[name="arrow"]', async () => {
      const el = await createPopover({arrow: true})
      const arrow = getArrow(el)!
      const slot = arrow.querySelector('slot[name="arrow"]')
      expect(slot).not.toBeNull()
    })

    it('host reflects arrow boolean attribute', async () => {
      const el = await createPopover({arrow: true})
      expect(el.hasAttribute('arrow')).toBe(true)
    })

    it('toggling arrow dynamically adds/removes the arrow element', async () => {
      const el = await createPopover()
      expect(getArrow(el)).toBeNull()

      el.arrow = true
      await settle(el)
      expect(getArrow(el)).not.toBeNull()

      el.arrow = false
      await settle(el)
      expect(getArrow(el)).toBeNull()
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('trigger element receives headless trigger props (role, aria-haspopup, aria-expanded, aria-controls, tabindex)', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)

      expect(trigger.getAttribute('role')).toBeTruthy()
      expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(trigger.getAttribute('aria-controls')).toBeTruthy()
      expect(trigger.getAttribute('tabindex')).not.toBeNull()
    })

    it('content element receives headless content props (role, aria-modal, tabindex, hidden)', async () => {
      const el = await createPopover()
      const content = getContent(el)

      expect(content.getAttribute('role')).toBe('dialog')
      expect(content.getAttribute('aria-modal')).toBe('false')
      expect(content.getAttribute('tabindex')).not.toBeNull()
      expect(content.hidden).toBe(true)
    })

    it('trigger aria-expanded syncs with headless open state', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)
      expect(trigger.getAttribute('aria-expanded')).toBe('false')

      el.open = true
      await settle(el)
      expect(trigger.getAttribute('aria-expanded')).toBe('true')

      el.open = false
      await settle(el)
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    })

    it('content hidden syncs with headless open state', async () => {
      const el = await createPopover()
      const content = getContent(el)
      expect(content.hidden).toBe(true)

      el.open = true
      await settle(el)
      expect(content.hidden).toBe(false)

      el.open = false
      await settle(el)
      expect(content.hidden).toBe(true)
    })

    it('trigger id and content id are linked via aria-controls', async () => {
      const el = await createPopover()
      const trigger = getTrigger(el)
      const content = getContent(el)

      const triggerId = trigger.id
      const contentId = content.id

      expect(triggerId).toBeTruthy()
      expect(contentId).toBeTruthy()
      expect(trigger.getAttribute('aria-controls')).toBe(contentId)
    })
  })
})
