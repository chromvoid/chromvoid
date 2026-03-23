import {afterEach, describe, expect, it, vi} from 'vitest'

import {CVDrawer} from './cv-drawer'

CVDrawer.define()

const settle = async (element: CVDrawer) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createDrawer = async (attrs?: Partial<CVDrawer>) => {
  const el = document.createElement('cv-drawer') as CVDrawer
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getPanel = (el: CVDrawer) =>
  el.shadowRoot!.querySelector('[part="panel"]') as HTMLElement

const getOverlay = (el: CVDrawer) =>
  el.shadowRoot!.querySelector('[part="overlay"]') as HTMLElement

const nextFrame = async () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  vi.useRealTimers()
})

describe('cv-drawer', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="trigger"] as a <button> with slot[name="trigger"]', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      expect(trigger).not.toBeNull()
      expect(trigger.tagName).toBe('BUTTON')
      const slot = trigger.querySelector('slot[name="trigger"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="overlay"] as a <div>', async () => {
      const el = await createDrawer()
      const overlay = el.shadowRoot!.querySelector('[part="overlay"]') as HTMLElement
      expect(overlay).not.toBeNull()
      expect(overlay.tagName).toBe('DIV')
    })

    it('renders [part="panel"] as a <section> with role', async () => {
      const el = await createDrawer()
      const panel = getPanel(el)
      expect(panel).not.toBeNull()
      expect(panel.tagName).toBe('SECTION')
      expect(panel.getAttribute('role')).toBe('dialog')
    })

    it('renders [part="header"] as a <header>', async () => {
      const el = await createDrawer()
      const header = el.shadowRoot!.querySelector('[part="header"]') as HTMLElement
      expect(header).not.toBeNull()
      expect(header.tagName).toBe('HEADER')
    })

    it('renders [part="title"] as an <h2> with slot[name="title"]', async () => {
      const el = await createDrawer()
      const title = el.shadowRoot!.querySelector('[part="title"]') as HTMLElement
      expect(title).not.toBeNull()
      expect(title.tagName).toBe('H2')
      const slot = title.querySelector('slot[name="title"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="description"] as a <p> with slot[name="description"]', async () => {
      const el = await createDrawer()
      const desc = el.shadowRoot!.querySelector('[part="description"]') as HTMLElement
      expect(desc).not.toBeNull()
      expect(desc.tagName).toBe('P')
      const slot = desc.querySelector('slot[name="description"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="header-close"] as a <button> with slot[name="header-close"]', async () => {
      const el = await createDrawer()
      const headerClose = el.shadowRoot!.querySelector('[part="header-close"]') as HTMLElement
      expect(headerClose).not.toBeNull()
      expect(headerClose.tagName).toBe('BUTTON')
      const slot = headerClose.querySelector('slot[name="header-close"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="body"] as a <div> with default slot', async () => {
      const el = await createDrawer()
      const body = el.shadowRoot!.querySelector('[part="body"]') as HTMLElement
      expect(body).not.toBeNull()
      expect(body.tagName).toBe('DIV')
      const slot = body.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('renders [part="footer"] as a <footer> with slot[name="footer"]', async () => {
      const el = await createDrawer()
      const footer = el.shadowRoot!.querySelector('[part="footer"]') as HTMLElement
      expect(footer).not.toBeNull()
      expect(footer.tagName).toBe('FOOTER')
      const slot = footer.querySelector('slot[name="footer"]')
      expect(slot).not.toBeNull()
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const el = await createDrawer()
      expect(el.open).toBe(false)
      expect(el.modal).toBe(true)
      expect(el.placement).toBe('end')
      expect(el.type).toBe('dialog')
      expect(el.closeOnEscape).toBe(true)
      expect(el.closeOnOutsidePointer).toBe(true)
      expect(el.closeOnOutsideFocus).toBe(true)
      expect(el.noHeader).toBe(false)
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('boolean attributes reflect: open, modal', async () => {
      const el = await createDrawer({open: true, modal: true})
      expect(el.hasAttribute('open')).toBe(true)
      expect(el.hasAttribute('modal')).toBe(true)
    })

    it('open attribute is absent when false', async () => {
      const el = await createDrawer()
      expect(el.hasAttribute('open')).toBe(false)
    })

    it('placement attribute reflects its value', async () => {
      const el = await createDrawer({placement: 'start'})
      expect(el.getAttribute('placement')).toBe('start')
    })

    it('type attribute reflects its value', async () => {
      const el = await createDrawer({type: 'alertdialog'})
      expect(el.getAttribute('type')).toBe('alertdialog')
    })

    it('no-header attribute reflects when set', async () => {
      const el = await createDrawer({noHeader: true})
      expect(el.hasAttribute('no-header')).toBe(true)
    })

    it('close-on-escape attribute reflects', async () => {
      const el = await createDrawer()
      expect(el.hasAttribute('close-on-escape')).toBe(true)
    })

    it('close-on-outside-pointer attribute reflects', async () => {
      const el = await createDrawer()
      expect(el.hasAttribute('close-on-outside-pointer')).toBe(true)
    })

    it('close-on-outside-focus attribute reflects', async () => {
      const el = await createDrawer()
      expect(el.hasAttribute('close-on-outside-focus')).toBe(true)
    })

    it('placement defaults to "end" in attribute', async () => {
      const el = await createDrawer()
      expect(el.getAttribute('placement')).toBe('end')
    })
  })

  // --- Events ---

  describe('events', () => {
    it('cv-input fires with {open: true} when opened via trigger click', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      let detail: unknown

      el.addEventListener('cv-input', (e) => {
        detail = (e as CustomEvent).detail
      })

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({open: true})
    })

    it('cv-change fires with {open: true} when opened via trigger click', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      let detail: unknown

      el.addEventListener('cv-change', (e) => {
        detail = (e as CustomEvent).detail
      })

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({open: true})
    })

    it('cv-input and cv-change fire with {open: false} when closed', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      // Open first
      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      const inputDetails: unknown[] = []
      const changeDetails: unknown[] = []

      el.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))
      el.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      // Close via Escape
      const panel = getPanel(el)
      panel.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(inputDetails).toEqual([{open: false}])
      expect(changeDetails).toEqual([{open: false}])
    })

    it('programmatic open attribute change does not emit cv-input/cv-change', async () => {
      const el = await createDrawer()
      let inputCount = 0
      let changeCount = 0

      el.addEventListener('cv-input', () => inputCount++)
      el.addEventListener('cv-change', () => changeCount++)

      el.open = true
      await settle(el)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })

    it('cv-show fires when drawer begins to open', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      let fired = false

      el.addEventListener('cv-show', () => {
        fired = true
      })

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(fired).toBe(true)
    })

    it('cv-after-show fires after drawer open animation completes', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      let fired = false

      el.addEventListener('cv-after-show', () => {
        fired = true
      })

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(fired).toBe(true)
    })

    it('cv-hide fires when drawer begins to close', async () => {
      const el = await createDrawer({open: true})
      const panel = getPanel(el)
      let fired = false

      el.addEventListener('cv-hide', () => {
        fired = true
      })

      panel.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(fired).toBe(true)
    })

    it('cv-after-hide fires after drawer close animation completes', async () => {
      const el = await createDrawer({open: true})
      const panel = getPanel(el)
      let fired = false

      el.addEventListener('cv-after-hide', () => {
        fired = true
      })

      panel.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(fired).toBe(true)
    })

    it('programmatic open and close fire lifecycle events in order', async () => {
      const el = await createDrawer()
      const events: string[] = []

      el.addEventListener('cv-show', () => events.push('show'))
      el.addEventListener('cv-after-show', () => events.push('after-show'))
      el.addEventListener('cv-hide', () => events.push('hide'))
      el.addEventListener('cv-after-hide', () => events.push('after-hide'))

      el.open = true
      await settle(el)

      el.open = false
      await settle(el)

      expect(events).toEqual(['show', 'after-show', 'hide', 'after-hide'])
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('panel has role="dialog" by default', async () => {
      const el = await createDrawer()
      const panel = getPanel(el)
      expect(panel.getAttribute('role')).toBe('dialog')
    })

    it('panel has role="alertdialog" when type="alertdialog"', async () => {
      const el = await createDrawer({type: 'alertdialog'})
      const panel = getPanel(el)
      expect(panel.getAttribute('role')).toBe('alertdialog')
    })

    it('panel has aria-modal="true" for modal drawer', async () => {
      const el = await createDrawer()
      const panel = getPanel(el)
      expect(panel.getAttribute('aria-modal')).toBe('true')
    })

    it('panel has aria-modal="false" when modal=false', async () => {
      const el = await createDrawer({modal: false})
      const panel = getPanel(el)
      expect(panel.getAttribute('aria-modal')).toBe('false')
    })

    it('panel has aria-labelledby pointing to title id', async () => {
      const el = await createDrawer()
      const panel = getPanel(el)
      const title = el.shadowRoot!.querySelector('[part="title"]') as HTMLElement
      expect(panel.getAttribute('aria-labelledby')).toBe(title.id)
    })

    it('panel has aria-describedby pointing to description id', async () => {
      const el = await createDrawer()
      const panel = getPanel(el)
      const desc = el.shadowRoot!.querySelector('[part="description"]') as HTMLElement
      expect(panel.getAttribute('aria-describedby')).toBe(desc.id)
    })

    it('trigger has aria-haspopup="dialog"', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    })

    it('trigger has aria-expanded reflecting open state', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      expect(trigger.getAttribute('aria-expanded')).toBe('false')

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    })

    it('trigger has aria-controls pointing to panel id', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      const panel = getPanel(el)
      expect(trigger.getAttribute('aria-controls')).toBe(panel.id)
    })

    it('header-close button has aria-label="Close"', async () => {
      const el = await createDrawer()
      const headerClose = el.shadowRoot!.querySelector('[part="header-close"]') as HTMLElement
      expect(headerClose.getAttribute('aria-label')).toBe('Close')
    })
  })

  // --- Placement ---

  describe('placement', () => {
    it('panel has data-placement="end" by default', async () => {
      const el = await createDrawer()
      const panel = getPanel(el)
      expect(panel.getAttribute('data-placement')).toBe('end')
    })

    it('panel has data-placement="start" when placement="start"', async () => {
      const el = await createDrawer({placement: 'start'})
      const panel = getPanel(el)
      expect(panel.getAttribute('data-placement')).toBe('start')
    })

    it('panel has data-placement="top" when placement="top"', async () => {
      const el = await createDrawer({placement: 'top'})
      const panel = getPanel(el)
      expect(panel.getAttribute('data-placement')).toBe('top')
    })

    it('panel has data-placement="bottom" when placement="bottom"', async () => {
      const el = await createDrawer({placement: 'bottom'})
      const panel = getPanel(el)
      expect(panel.getAttribute('data-placement')).toBe('bottom')
    })

    it('host placement attribute reflects placement property', async () => {
      const el = await createDrawer({placement: 'start'})
      expect(el.getAttribute('placement')).toBe('start')
    })

    it('changing placement updates data-placement on panel', async () => {
      const el = await createDrawer({placement: 'end'})
      const panel = getPanel(el)
      expect(panel.getAttribute('data-placement')).toBe('end')

      el.placement = 'bottom'
      await settle(el)
      const updatedPanel = getPanel(el)
      expect(updatedPanel.getAttribute('data-placement')).toBe('bottom')
    })
  })

  // --- Open and close behavior ---

  describe('open and close behavior', () => {
    it('trigger click opens the drawer', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.open).toBe(true)
      const overlay = el.shadowRoot!.querySelector('[part="overlay"]') as HTMLElement
      expect(overlay.hidden).toBe(false)
    })

    it('header-close button click closes the drawer', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(true)

      const headerClose = el.shadowRoot!.querySelector('[part="header-close"]') as HTMLElement
      headerClose.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('Escape key closes the drawer', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(true)

      const panel = getPanel(el)
      panel.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('overlay click closes the drawer', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(true)

      const overlay = el.shadowRoot!.querySelector('[part="overlay"]') as HTMLElement
      overlay.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('trigger click toggles open state', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(true)

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('transitions panel into open state on the next animation frame', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      const panel = getPanel(el)

      expect(panel.getAttribute('data-state')).toBe('closed')

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(panel.getAttribute('data-state')).toBe('closed')

      await nextFrame()
      await settle(el)

      expect(panel.getAttribute('data-state')).toBe('open')
    })

    it('keeps overlay mounted until the close animation finishes', async () => {
      vi.useFakeTimers()

      const el = await createDrawer({open: true})
      const overlay = getOverlay(el)
      const panel = getPanel(el)

      overlay.style.transitionDuration = '20ms'
      panel.style.transitionDuration = '20ms'

      panel.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
      expect(overlay.hidden).toBe(false)
      expect(overlay.getAttribute('data-state')).toBe('closed')
      expect(panel.getAttribute('data-state')).toBe('closed')

      await vi.advanceTimersByTimeAsync(20)
      await settle(el)

      expect(overlay.hidden).toBe(true)
    })

    it('returns panel state to closed after an animated open', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      const panel = getPanel(el)

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await nextFrame()
      await settle(el)
      expect(panel.getAttribute('data-state')).toBe('open')

      panel.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(panel.getAttribute('data-state')).toBe('closed')
    })
  })

  // --- Keyboard interaction ---

  describe('keyboard interaction', () => {
    it('Escape closes drawer when closeOnEscape=true (default)', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(true)

      const panel = getPanel(el)
      panel.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('Escape does not close drawer when closeOnEscape=false', async () => {
      const el = await createDrawer({closeOnEscape: false})
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(true)

      const panel = getPanel(el)
      panel.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })

    it('trigger Enter key opens drawer', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })

    it('trigger Space key opens drawer', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })
  })

  // --- alertdialog type ---

  describe('alertdialog type', () => {
    it('panel has role="alertdialog" when type="alertdialog"', async () => {
      const el = await createDrawer({type: 'alertdialog'})
      const panel = getPanel(el)
      expect(panel.getAttribute('role')).toBe('alertdialog')
    })

    it('panel has role="dialog" when type="dialog"', async () => {
      const el = await createDrawer({type: 'dialog'})
      const panel = getPanel(el)
      expect(panel.getAttribute('role')).toBe('dialog')
    })

    it('panel has role="dialog" by default', async () => {
      const el = await createDrawer()
      const panel = getPanel(el)
      expect(panel.getAttribute('role')).toBe('dialog')
    })
  })

  // --- Non-modal mode ---

  describe('non-modal mode', () => {
    it('aria-modal is "false" when modal=false', async () => {
      const el = await createDrawer({modal: false})
      const panel = getPanel(el)
      expect(panel.getAttribute('aria-modal')).toBe('false')
    })

    it('does not lock body scroll when modal=false and drawer is open', async () => {
      const el = await createDrawer({modal: false})
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(document.body.style.overflow).not.toBe('hidden')
    })

    it('aria-modal is "true" when modal=true (default)', async () => {
      const el = await createDrawer()
      const panel = getPanel(el)
      expect(panel.getAttribute('aria-modal')).toBe('true')
    })
  })

  // --- No-header mode ---

  describe('no-header mode', () => {
    it('header is hidden when no-header is set', async () => {
      const el = await createDrawer({noHeader: true})
      const header = el.shadowRoot!.querySelector('[part="header"]') as HTMLElement
      const isHidden =
        header === null ||
        header.hidden ||
        getComputedStyle(header).display === 'none'
      expect(isHidden).toBe(true)
    })

    it('header is visible by default', async () => {
      const el = await createDrawer()
      const header = el.shadowRoot!.querySelector('[part="header"]') as HTMLElement
      expect(header).not.toBeNull()
    })
  })

  // --- Scroll lock ---

  describe('scroll lock', () => {
    it('body overflow is hidden when modal drawer is open', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(document.body.style.overflow).toBe('hidden')
    })

    it('body overflow is restored when modal drawer is closed', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(document.body.style.overflow).toBe('hidden')

      const panel = getPanel(el)
      panel.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(document.body.style.overflow).toBe('')
    })

    it('body overflow is NOT set to hidden for non-modal drawer', async () => {
      const el = await createDrawer({modal: false})
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(document.body.style.overflow).not.toBe('hidden')
    })

    it('body overflow is restored when modal drawer element is disconnected', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(document.body.style.overflow).toBe('hidden')

      el.remove()
      expect(document.body.style.overflow).toBe('')
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('trigger ARIA attributes come from headless getTriggerProps()', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      expect(trigger.id).toBeTruthy()
      expect(trigger.getAttribute('role')).toBe('button')
      expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
      expect(trigger.getAttribute('aria-expanded')).toBeDefined()
      expect(trigger.getAttribute('aria-controls')).toBeTruthy()
    })

    it('panel ARIA attributes come from headless getPanelProps()', async () => {
      const el = await createDrawer()
      const panel = getPanel(el)
      expect(panel.id).toBeTruthy()
      expect(panel.getAttribute('role')).toBe('dialog')
      expect(panel.getAttribute('tabindex')).toBeDefined()
      expect(panel.getAttribute('aria-modal')).toBeDefined()
      expect(panel.getAttribute('aria-labelledby')).toBeTruthy()
    })

    it('panel has data-placement attribute from headless contract', async () => {
      const el = await createDrawer()
      const panel = getPanel(el)
      expect(panel.hasAttribute('data-placement')).toBe(true)
      expect(panel.getAttribute('data-placement')).toBe('end')
    })

    it('title id comes from headless getTitleProps()', async () => {
      const el = await createDrawer()
      const title = el.shadowRoot!.querySelector('[part="title"]') as HTMLElement
      expect(title.id).toBeTruthy()
    })

    it('description id comes from headless getDescriptionProps()', async () => {
      const el = await createDrawer()
      const desc = el.shadowRoot!.querySelector('[part="description"]') as HTMLElement
      expect(desc.id).toBeTruthy()
    })

    it('header-close props come from headless getHeaderCloseButtonProps()', async () => {
      const el = await createDrawer()
      const headerClose = el.shadowRoot!.querySelector('[part="header-close"]') as HTMLElement
      expect(headerClose.id).toBeTruthy()
      expect(headerClose.getAttribute('role')).toBe('button')
      expect(headerClose.getAttribute('tabindex')).toBe('0')
      expect(headerClose.getAttribute('aria-label')).toBe('Close')
    })

    it('overlay hidden attribute reflects headless getOverlayProps().hidden', async () => {
      const el = await createDrawer()
      const overlay = el.shadowRoot!.querySelector('[part="overlay"]') as HTMLElement
      expect(overlay.hidden).toBe(true)

      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(overlay.hidden).toBe(false)
    })

    it('aria-controls on trigger matches panel id', async () => {
      const el = await createDrawer()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      const panel = getPanel(el)
      expect(trigger.getAttribute('aria-controls')).toBe(panel.id)
    })

    it('aria-labelledby on panel matches title id', async () => {
      const el = await createDrawer()
      const panel = getPanel(el)
      const title = el.shadowRoot!.querySelector('[part="title"]') as HTMLElement
      expect(panel.getAttribute('aria-labelledby')).toBe(title.id)
    })

    it('aria-describedby on panel matches description id', async () => {
      const el = await createDrawer()
      const panel = getPanel(el)
      const desc = el.shadowRoot!.querySelector('[part="description"]') as HTMLElement
      expect(panel.getAttribute('aria-describedby')).toBe(desc.id)
    })
  })
})
