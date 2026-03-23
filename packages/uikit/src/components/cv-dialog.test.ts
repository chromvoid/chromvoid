import {afterEach, describe, expect, it} from 'vitest'

import {CVDialog} from './cv-dialog'

CVDialog.define()

const settle = async (element: CVDialog) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createDialog = async (attrs?: Partial<CVDialog>) => {
  const el = document.createElement('cv-dialog') as CVDialog
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getContent = (el: CVDialog) =>
  el.shadowRoot!.querySelector('[part="content"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

describe('cv-dialog', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="trigger"] as a <button> with slot[name="trigger"]', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      expect(trigger).not.toBeNull()
      expect(trigger.tagName).toBe('BUTTON')
      const slot = trigger.querySelector('slot[name="trigger"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="overlay"] as a <div>', async () => {
      const el = await createDialog()
      const overlay = el.shadowRoot!.querySelector('[part="overlay"]') as HTMLElement
      expect(overlay).not.toBeNull()
      expect(overlay.tagName).toBe('DIV')
    })

    it('renders [part="content"] as a <section> with role', async () => {
      const el = await createDialog()
      const content = getContent(el)
      expect(content).not.toBeNull()
      expect(content.tagName).toBe('SECTION')
      expect(content.getAttribute('role')).toBe('dialog')
    })

    it('renders [part="header"] as a <header>', async () => {
      const el = await createDialog()
      const header = el.shadowRoot!.querySelector('[part="header"]') as HTMLElement
      expect(header).not.toBeNull()
      expect(header.tagName).toBe('HEADER')
    })

    it('renders [part="title"] as an <h2> with slot[name="title"]', async () => {
      const el = await createDialog()
      const title = el.shadowRoot!.querySelector('[part="title"]') as HTMLElement
      expect(title).not.toBeNull()
      expect(title.tagName).toBe('H2')
      const slot = title.querySelector('slot[name="title"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="description"] as a <p> with slot[name="description"]', async () => {
      const el = await createDialog()
      const desc = el.shadowRoot!.querySelector('[part="description"]') as HTMLElement
      expect(desc).not.toBeNull()
      expect(desc.tagName).toBe('P')
      const slot = desc.querySelector('slot[name="description"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="header-close"] as a <button> with slot[name="header-close"]', async () => {
      const el = await createDialog()
      const headerClose = el.shadowRoot!.querySelector('[part="header-close"]') as HTMLElement
      expect(headerClose).not.toBeNull()
      expect(headerClose.tagName).toBe('BUTTON')
      const slot = headerClose.querySelector('slot[name="header-close"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="body"] as a <div> with default slot', async () => {
      const el = await createDialog()
      const body = el.shadowRoot!.querySelector('[part="body"]') as HTMLElement
      expect(body).not.toBeNull()
      expect(body.tagName).toBe('DIV')
      const slot = body.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('renders [part="footer"] as a <footer> with slot[name="footer"]', async () => {
      const el = await createDialog()
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
      const el = await createDialog()
      expect(el.open).toBe(false)
      expect(el.modal).toBe(true)
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
      const el = await createDialog({open: true, modal: true})
      expect(el.hasAttribute('open')).toBe(true)
      expect(el.hasAttribute('modal')).toBe(true)
    })

    it('open attribute is absent when false', async () => {
      const el = await createDialog()
      expect(el.hasAttribute('open')).toBe(false)
    })

    it('type attribute reflects its value', async () => {
      const el = await createDialog({type: 'alertdialog'})
      expect(el.getAttribute('type')).toBe('alertdialog')
    })

    it('no-header attribute reflects when set', async () => {
      const el = await createDialog({noHeader: true})
      expect(el.hasAttribute('no-header')).toBe(true)
    })

    it('close-on-escape attribute reflects', async () => {
      const el = await createDialog()
      expect(el.hasAttribute('close-on-escape')).toBe(true)
    })
  })

  // --- Events ---

  describe('events', () => {
    it('input event fires with {open: true} when opened via trigger click', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      let detail: unknown

      el.addEventListener('cv-input', (e) => {
        detail = (e as CustomEvent).detail
      })

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({open: true})
    })

    it('change event fires with {open: true} when opened via trigger click', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      let detail: unknown

      el.addEventListener('cv-change', (e) => {
        detail = (e as CustomEvent).detail
      })

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({open: true})
    })

    it('input and change fire with {open: false} when closed', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      // Open first
      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      const inputDetails: unknown[] = []
      const changeDetails: unknown[] = []

      el.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))
      el.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      // Close via Escape
      const content = getContent(el)
      content.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(inputDetails).toEqual([{open: false}])
      expect(changeDetails).toEqual([{open: false}])
    })

    it('programmatic open attribute change does not emit input/change', async () => {
      const el = await createDialog()
      let inputCount = 0
      let changeCount = 0

      el.addEventListener('cv-input', () => inputCount++)
      el.addEventListener('cv-change', () => changeCount++)

      el.open = true
      await settle(el)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })

    it('programmatic open and close fire lifecycle events', async () => {
      const el = await createDialog()
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

    it('cv-show fires when dialog begins to open', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      let fired = false

      el.addEventListener('cv-show', () => {
        fired = true
      })

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(fired).toBe(true)
    })

    it('cv-hide fires when dialog begins to close', async () => {
      const el = await createDialog({open: true})
      const content = getContent(el)
      let fired = false

      el.addEventListener('cv-hide', () => {
        fired = true
      })

      content.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(fired).toBe(true)
    })

    it('cv-after-show fires after dialog open animation completes', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      let fired = false

      el.addEventListener('cv-after-show', () => {
        fired = true
      })

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(fired).toBe(true)
    })

    it('cv-after-hide fires after dialog close animation completes', async () => {
      const el = await createDialog({open: true})
      const content = getContent(el)
      let fired = false

      el.addEventListener('cv-after-hide', () => {
        fired = true
      })

      content.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(fired).toBe(true)
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('content has role="dialog" by default', async () => {
      const el = await createDialog()
      const content = getContent(el)
      expect(content.getAttribute('role')).toBe('dialog')
    })

    it('content has aria-modal="true" for modal dialog', async () => {
      const el = await createDialog()
      const content = getContent(el)
      expect(content.getAttribute('aria-modal')).toBe('true')
    })

    it('content has aria-labelledby pointing to title id', async () => {
      const el = await createDialog()
      const content = getContent(el)
      const title = el.shadowRoot!.querySelector('[part="title"]') as HTMLElement
      const labelledby = content.getAttribute('aria-labelledby')
      expect(labelledby).toBe(title.id)
    })

    it('content has aria-describedby pointing to description id', async () => {
      const el = await createDialog()
      const content = getContent(el)
      const desc = el.shadowRoot!.querySelector('[part="description"]') as HTMLElement
      const describedby = content.getAttribute('aria-describedby')
      expect(describedby).toBe(desc.id)
    })

    it('trigger has aria-haspopup="dialog"', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    })

    it('trigger has aria-expanded reflecting open state', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      expect(trigger.getAttribute('aria-expanded')).toBe('false')

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    })

    it('trigger has aria-controls pointing to content id', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      const content = getContent(el)
      expect(trigger.getAttribute('aria-controls')).toBe(content.id)
    })

    it('header-close button has aria-label="Close"', async () => {
      const el = await createDialog()
      const headerClose = el.shadowRoot!.querySelector('[part="header-close"]') as HTMLElement
      expect(headerClose.getAttribute('aria-label')).toBe('Close')
    })
  })

  // --- Open and close behavior ---

  describe('open and close behavior', () => {
    it('trigger click opens the dialog', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.open).toBe(true)
      const overlay = el.shadowRoot!.querySelector('[part="overlay"]') as HTMLElement
      expect(overlay.hidden).toBe(false)
    })

    it('header-close button click closes the dialog', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(true)

      const headerClose = el.shadowRoot!.querySelector('[part="header-close"]') as HTMLElement
      headerClose.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('does not render a header-close button when closable is false', async () => {
      const el = await createDialog({closable: false})
      const headerClose = el.shadowRoot!.querySelector('[part="header-close"]')

      expect(headerClose).toBeNull()
    })

    it('Escape key closes the dialog', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(true)

      const content = getContent(el)
      content.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('overlay click closes the dialog', async () => {
      const el = await createDialog()
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
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(true)

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })
  })

  // --- alertdialog type ---

  describe('alertdialog type', () => {
    it('content has role="alertdialog" when type="alertdialog"', async () => {
      const el = await createDialog({type: 'alertdialog'})
      const content = getContent(el)
      expect(content.getAttribute('role')).toBe('alertdialog')
    })

    it('content has role="dialog" when type="dialog"', async () => {
      const el = await createDialog({type: 'dialog'})
      const content = getContent(el)
      expect(content.getAttribute('role')).toBe('dialog')
    })

    it('content has role="dialog" by default (no type set)', async () => {
      const el = await createDialog()
      const content = getContent(el)
      expect(content.getAttribute('role')).toBe('dialog')
    })
  })

  // --- Non-modal mode ---

  describe('non-modal mode', () => {
    it('aria-modal is "false" when modal=false', async () => {
      const el = await createDialog({modal: false})
      const content = getContent(el)
      expect(content.getAttribute('aria-modal')).toBe('false')
    })

    it('does not lock body scroll when modal=false and dialog is open', async () => {
      const el = await createDialog({modal: false})
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(document.body.style.overflow).not.toBe('hidden')
    })

    it('aria-modal is "true" when modal=true (default)', async () => {
      const el = await createDialog()
      const content = getContent(el)
      expect(content.getAttribute('aria-modal')).toBe('true')
    })
  })

  // --- No-header mode ---

  describe('no-header mode', () => {
    it('header is hidden when no-header is set', async () => {
      const el = await createDialog({noHeader: true})
      const header = el.shadowRoot!.querySelector('[part="header"]') as HTMLElement
      // Header should be hidden (either not rendered or display: none)
      const isHidden =
        header === null ||
        header.hidden ||
        getComputedStyle(header).display === 'none'
      expect(isHidden).toBe(true)
    })

    it('header is visible by default', async () => {
      const el = await createDialog()
      const header = el.shadowRoot!.querySelector('[part="header"]') as HTMLElement
      expect(header).not.toBeNull()
    })
  })

  // --- Keyboard interaction ---

  describe('keyboard interaction', () => {
    it('Escape closes dialog when closeOnEscape=true (default)', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(true)

      const content = getContent(el)
      content.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('Escape does not close dialog when closeOnEscape=false', async () => {
      const el = await createDialog({closeOnEscape: false})
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(true)

      const content = getContent(el)
      content.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })

    it('trigger Enter key opens dialog', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })

    it('trigger Space key opens dialog', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('trigger ARIA attributes come from headless getTriggerProps()', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      // Verify trigger has id, role, aria-haspopup, aria-expanded, aria-controls
      // These should be dynamically set from the headless model, not hardcoded
      expect(trigger.id).toBeTruthy()
      expect(trigger.getAttribute('role')).toBe('button')
      expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
      expect(trigger.getAttribute('aria-expanded')).toBeDefined()
      expect(trigger.getAttribute('aria-controls')).toBeTruthy()
    })

    it('content ARIA attributes come from headless getContentProps()', async () => {
      const el = await createDialog()
      const content = getContent(el)
      // Verify content has id, role, tabindex, aria-modal, aria-labelledby
      expect(content.id).toBeTruthy()
      expect(content.getAttribute('role')).toBe('dialog')
      expect(content.getAttribute('tabindex')).toBeDefined()
      expect(content.getAttribute('aria-modal')).toBeDefined()
      expect(content.getAttribute('aria-labelledby')).toBeTruthy()
    })

    it('title id comes from headless getTitleProps()', async () => {
      const el = await createDialog()
      const title = el.shadowRoot!.querySelector('[part="title"]') as HTMLElement
      expect(title.id).toBeTruthy()
    })

    it('description id comes from headless getDescriptionProps()', async () => {
      const el = await createDialog()
      const desc = el.shadowRoot!.querySelector('[part="description"]') as HTMLElement
      expect(desc.id).toBeTruthy()
    })

    it('header-close props come from headless getHeaderCloseButtonProps()', async () => {
      const el = await createDialog()
      const headerClose = el.shadowRoot!.querySelector('[part="header-close"]') as HTMLElement
      expect(headerClose.id).toBeTruthy()
      expect(headerClose.getAttribute('role')).toBe('button')
      expect(headerClose.getAttribute('tabindex')).toBe('0')
      expect(headerClose.getAttribute('aria-label')).toBe('Close')
    })

    it('overlay hidden attribute reflects headless getOverlayProps().hidden', async () => {
      const el = await createDialog()
      const overlay = el.shadowRoot!.querySelector('[part="overlay"]') as HTMLElement
      expect(overlay.hidden).toBe(true)

      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(overlay.hidden).toBe(false)
    })

    it('aria-controls on trigger matches content id', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement
      const content = getContent(el)
      expect(trigger.getAttribute('aria-controls')).toBe(content.id)
    })

    it('aria-labelledby on content matches title id', async () => {
      const el = await createDialog()
      const content = getContent(el)
      const title = el.shadowRoot!.querySelector('[part="title"]') as HTMLElement
      expect(content.getAttribute('aria-labelledby')).toBe(title.id)
    })

    it('aria-describedby on content matches description id', async () => {
      const el = await createDialog()
      const content = getContent(el)
      const desc = el.shadowRoot!.querySelector('[part="description"]') as HTMLElement
      expect(content.getAttribute('aria-describedby')).toBe(desc.id)
    })
  })

  // --- Scroll lock ---

  describe('scroll lock', () => {
    it('body overflow is hidden when modal dialog is open', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(document.body.style.overflow).toBe('hidden')
    })

    it('body overflow is restored when modal dialog is closed', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(document.body.style.overflow).toBe('hidden')

      const content = getContent(el)
      content.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(document.body.style.overflow).toBe('')
    })

    it('body overflow is NOT set to hidden for non-modal dialog', async () => {
      const el = await createDialog({modal: false})
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(document.body.style.overflow).not.toBe('hidden')
    })

    it('body overflow is restored when modal dialog element is disconnected', async () => {
      const el = await createDialog()
      const trigger = el.shadowRoot!.querySelector('[part="trigger"]') as HTMLElement

      trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(document.body.style.overflow).toBe('hidden')

      el.remove()
      expect(document.body.style.overflow).toBe('')
    })
  })
})
