import {afterEach, describe, expect, it, vi} from 'vitest'

import {CVTooltip} from './cv-tooltip'

CVTooltip.define()

const settle = async (element: CVTooltip) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createTooltip = async (attrs?: Partial<CVTooltip>) => {
  const el = document.createElement('cv-tooltip') as CVTooltip
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVTooltip) => el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helper: mount a tooltip with slotted trigger + content children
// ---------------------------------------------------------------------------
async function mountTooltip(
  params: {
    disabled?: boolean
    showDelay?: number
    hideDelay?: number
    trigger?: string
    arrow?: boolean
    open?: boolean
  } = {},
) {
  const el = document.createElement('cv-tooltip') as CVTooltip
  if (params.disabled) el.disabled = true
  if (params.showDelay != null) el.showDelay = params.showDelay
  if (params.hideDelay != null) el.hideDelay = params.hideDelay
  if (params.trigger != null) el.trigger = params.trigger
  if (params.arrow != null) el.arrow = params.arrow
  if (params.open != null) el.open = params.open

  el.innerHTML = `
    <button slot="trigger" type="button">Hover me</button>
    <span slot="content">Tooltip content</span>
  `

  document.body.append(el)
  await settle(el)

  const triggerEl = el.querySelector('button[slot="trigger"]') as HTMLButtonElement
  const triggerWrap = el.shadowRoot?.querySelector('[part="trigger"]') as HTMLElement
  const contentPart = el.shadowRoot?.querySelector('[part="content"]') as HTMLElement

  return {el, triggerEl, triggerWrap, contentPart}
}

// ===========================================================================
// 1. Shadow DOM structure
// ===========================================================================

describe('cv-tooltip', () => {
  describe('shadow DOM structure', () => {
    it('renders [part="base"]', async () => {
      const el = await createTooltip()
      const base = getBase(el)
      expect(base).not.toBeNull()
    })

    it('renders [part="trigger"] inside [part="base"]', async () => {
      const el = await createTooltip()
      const base = getBase(el)
      const trigger = base.querySelector('[part="trigger"]')
      expect(trigger).not.toBeNull()
    })

    it('renders [part="content"] inside [part="base"]', async () => {
      const el = await createTooltip()
      const base = getBase(el)
      const content = base.querySelector('[part="content"]')
      expect(content).not.toBeNull()
    })

    it('renders slot[name="trigger"] inside [part="trigger"]', async () => {
      const el = await createTooltip()
      const triggerPart = el.shadowRoot!.querySelector('[part="trigger"]')!
      const slot = triggerPart.querySelector('slot[name="trigger"]')
      expect(slot).not.toBeNull()
    })

    it('renders slot[name="content"] inside [part="content"]', async () => {
      const el = await createTooltip()
      const contentPart = el.shadowRoot!.querySelector('[part="content"]')!
      const slot = contentPart.querySelector('slot[name="content"]')
      expect(slot).not.toBeNull()
    })

    it('does NOT render [part="arrow"] when arrow attribute is absent', async () => {
      const el = await createTooltip()
      const arrow = el.shadowRoot!.querySelector('[part="arrow"]')
      expect(arrow).toBeNull()
    })

    it('renders [part="arrow"] when arrow attribute is set', async () => {
      const el = await createTooltip({arrow: true})
      const arrow = el.shadowRoot!.querySelector('[part="arrow"]')
      expect(arrow).not.toBeNull()
    })
  })

  // ===========================================================================
  // 2. Default property values
  // ===========================================================================

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const el = await createTooltip()
      expect(el.open).toBe(false)
      expect(el.disabled).toBe(false)
      expect(el.showDelay).toBe(120)
      expect(el.hideDelay).toBe(80)
      expect(el.trigger).toBe('hover focus')
      expect(el.arrow).toBe(false)
    })
  })

  // ===========================================================================
  // 3. Attribute reflection
  // ===========================================================================

  describe('attribute reflection', () => {
    it('boolean attributes reflect: open, disabled, arrow', async () => {
      const el = await createTooltip({open: true, disabled: true, arrow: true})
      expect(el.hasAttribute('open')).toBe(true)
      expect(el.hasAttribute('disabled')).toBe(true)
      expect(el.hasAttribute('arrow')).toBe(true)
    })

    it('string attribute reflects: trigger', async () => {
      const el = await createTooltip({trigger: 'click'})
      expect(el.getAttribute('trigger')).toBe('click')
    })

    it('number attributes reflect: show-delay, hide-delay', async () => {
      const el = await createTooltip({showDelay: 300, hideDelay: 200})
      expect(el.getAttribute('show-delay')).toBe('300')
      expect(el.getAttribute('hide-delay')).toBe('200')
    })

    it(':host([open]) present when open', async () => {
      const el = await createTooltip({open: true})
      expect(el.hasAttribute('open')).toBe(true)
    })

    it(':host([disabled]) present when disabled', async () => {
      const el = await createTooltip({disabled: true})
      expect(el.hasAttribute('disabled')).toBe(true)
    })

    it(':host([arrow]) present when arrow set', async () => {
      const el = await createTooltip({arrow: true})
      expect(el.hasAttribute('arrow')).toBe(true)
    })
  })

  // ===========================================================================
  // 4. ARIA
  // ===========================================================================

  describe('ARIA', () => {
    it('[part="content"] has role="tooltip"', async () => {
      const {contentPart} = await mountTooltip()
      expect(contentPart.getAttribute('role')).toBe('tooltip')
    })

    it('[part="content"] has tabindex="-1"', async () => {
      const {contentPart} = await mountTooltip()
      expect(contentPart.getAttribute('tabindex')).toBe('-1')
    })

    it('slotted trigger element receives aria-describedby when not disabled', async () => {
      const {triggerEl} = await mountTooltip({showDelay: 0, hideDelay: 0})
      expect(triggerEl.getAttribute('aria-describedby')).not.toBeNull()
    })

    it('aria-describedby on trigger matches [part="content"] id', async () => {
      const {triggerEl, contentPart} = await mountTooltip({showDelay: 0, hideDelay: 0})
      const describedBy = triggerEl.getAttribute('aria-describedby')
      expect(describedBy).toBe(contentPart.getAttribute('id'))
    })

    it('aria-describedby is removed from trigger when disabled', async () => {
      const {triggerEl} = await mountTooltip({disabled: true, showDelay: 0, hideDelay: 0})
      expect(triggerEl.getAttribute('aria-describedby')).toBeNull()
    })

    it('aria-describedby persists regardless of open state (when enabled)', async () => {
      const {el, triggerEl, triggerWrap} = await mountTooltip({showDelay: 0, hideDelay: 0})

      // closed
      expect(triggerEl.getAttribute('aria-describedby')).not.toBeNull()

      // open
      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)
      expect(el.open).toBe(true)
      expect(triggerEl.getAttribute('aria-describedby')).not.toBeNull()

      // closed again
      triggerWrap.dispatchEvent(new MouseEvent('pointerleave', {bubbles: true}))
      await settle(el)
      expect(el.open).toBe(false)
      expect(triggerEl.getAttribute('aria-describedby')).not.toBeNull()
    })

    it('[part="content"] is hidden when tooltip is closed', async () => {
      const {contentPart} = await mountTooltip()
      expect(contentPart.hidden).toBe(true)
    })

    it('[part="content"] is visible when tooltip is open', async () => {
      const {contentPart} = await mountTooltip({open: true})
      expect(contentPart.hidden).toBe(false)
    })
  })

  // ===========================================================================
  // 5. Events
  // ===========================================================================

  describe('events', () => {
    it('input event fires on open transition with detail { open: true }', async () => {
      const {el, triggerWrap} = await mountTooltip({showDelay: 0, hideDelay: 0})
      let detail: unknown
      el.addEventListener('cv-input', (e) => {
        detail = (e as CustomEvent).detail
      })

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)

      expect(detail).toEqual({open: true})
    })

    it('change event fires on open transition with detail { open: true }', async () => {
      const {el, triggerWrap} = await mountTooltip({showDelay: 0, hideDelay: 0})
      let detail: unknown
      el.addEventListener('cv-change', (e) => {
        detail = (e as CustomEvent).detail
      })

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)

      expect(detail).toEqual({open: true})
    })

    it('input event fires on close transition with detail { open: false }', async () => {
      const {el, triggerWrap} = await mountTooltip({showDelay: 0, hideDelay: 0})
      const inputDetails: Array<{open: boolean}> = []
      el.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)
      triggerWrap.dispatchEvent(new MouseEvent('pointerleave', {bubbles: true}))
      await settle(el)

      expect(inputDetails).toEqual([{open: true}, {open: false}])
    })

    it('change event fires on close transition with detail { open: false }', async () => {
      const {el, triggerWrap} = await mountTooltip({showDelay: 0, hideDelay: 0})
      const changeDetails: Array<{open: boolean}> = []
      el.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)
      triggerWrap.dispatchEvent(new MouseEvent('pointerleave', {bubbles: true}))
      await settle(el)

      expect(changeDetails).toEqual([{open: true}, {open: false}])
    })

    it('both input and change events bubble and are composed', async () => {
      const {el, triggerWrap} = await mountTooltip({showDelay: 0, hideDelay: 0})
      let inputBubbles = false
      let inputComposed = false
      let changeBubbles = false
      let changeComposed = false

      el.addEventListener('cv-input', (e) => {
        inputBubbles = e.bubbles
        inputComposed = e.composed
      })
      el.addEventListener('cv-change', (e) => {
        changeBubbles = e.bubbles
        changeComposed = e.composed
      })

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)

      expect(inputBubbles).toBe(true)
      expect(inputComposed).toBe(true)
      expect(changeBubbles).toBe(true)
      expect(changeComposed).toBe(true)
    })

    it('no events fire when programmatic open does not change state (already open)', async () => {
      const {el} = await mountTooltip({open: true, showDelay: 0, hideDelay: 0})
      let count = 0
      el.addEventListener('cv-input', () => count++)
      el.addEventListener('cv-change', () => count++)

      el.open = true
      await settle(el)

      expect(count).toBe(0)
    })
  })

  // ===========================================================================
  // 6. Hover trigger
  // ===========================================================================

  describe('hover trigger', () => {
    it('pointerenter on trigger wrapper opens tooltip (zero delay)', async () => {
      const {el, triggerWrap} = await mountTooltip({showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })

    it('pointerleave on trigger wrapper closes tooltip (zero delay)', async () => {
      const {el, triggerWrap} = await mountTooltip({showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)
      triggerWrap.dispatchEvent(new MouseEvent('pointerleave', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('pointerenter does not open when trigger="focus"', async () => {
      const {el, triggerWrap} = await mountTooltip({trigger: 'focus', showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('respects showDelay before opening', async () => {
      vi.useFakeTimers()
      const {el, triggerWrap} = await mountTooltip({showDelay: 20, hideDelay: 10})

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      vi.advanceTimersByTime(19)
      await settle(el)
      expect(el.open).toBe(false)

      vi.advanceTimersByTime(1)
      await settle(el)
      expect(el.open).toBe(true)
    })

    it('respects hideDelay before closing', async () => {
      vi.useFakeTimers()
      const {el, triggerWrap} = await mountTooltip({showDelay: 0, hideDelay: 10})

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)
      expect(el.open).toBe(true)

      triggerWrap.dispatchEvent(new MouseEvent('pointerleave', {bubbles: true}))
      vi.advanceTimersByTime(9)
      await settle(el)
      expect(el.open).toBe(true)

      vi.advanceTimersByTime(1)
      await settle(el)
      expect(el.open).toBe(false)
    })
  })

  // ===========================================================================
  // 7. Focus trigger
  // ===========================================================================

  describe('focus trigger', () => {
    it('focusin on trigger wrapper opens tooltip (zero delay)', async () => {
      const {el, triggerWrap} = await mountTooltip({showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new FocusEvent('focusin', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })

    it('focusout on trigger wrapper closes tooltip (zero delay)', async () => {
      const {el, triggerWrap} = await mountTooltip({showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new FocusEvent('focusin', {bubbles: true}))
      await settle(el)
      triggerWrap.dispatchEvent(new FocusEvent('focusout', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('focusin does not open when trigger="hover"', async () => {
      const {el, triggerWrap} = await mountTooltip({trigger: 'hover', showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new FocusEvent('focusin', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })
  })

  // ===========================================================================
  // 8. Click trigger
  // ===========================================================================

  describe('click trigger', () => {
    it('click on trigger wrapper opens tooltip when closed', async () => {
      const {el, triggerWrap} = await mountTooltip({trigger: 'click', showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })

    it('click on trigger wrapper closes tooltip when open', async () => {
      const {el, triggerWrap} = await mountTooltip({trigger: 'click', showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(true)

      triggerWrap.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('click toggles multiple times correctly', async () => {
      const {el, triggerWrap} = await mountTooltip({trigger: 'click', showDelay: 0, hideDelay: 0})
      const changes: boolean[] = []
      el.addEventListener('cv-change', (e) => changes.push((e as CustomEvent).detail.open))

      triggerWrap.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      triggerWrap.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      triggerWrap.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(changes).toEqual([true, false, true])
    })

    it('Escape closes tooltip in click mode', async () => {
      const {el, triggerWrap} = await mountTooltip({trigger: 'click', showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)
      expect(el.open).toBe(true)

      triggerWrap.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('click does not open tooltip when disabled', async () => {
      const {el, triggerWrap} = await mountTooltip({
        trigger: 'click',
        disabled: true,
        showDelay: 0,
        hideDelay: 0,
      })

      triggerWrap.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('pointerenter does not open when trigger="click"', async () => {
      const {el, triggerWrap} = await mountTooltip({trigger: 'click', showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })
  })

  // ===========================================================================
  // 9. Manual trigger
  // ===========================================================================

  describe('manual trigger', () => {
    it('pointerenter does not open tooltip in manual mode', async () => {
      const {el, triggerWrap} = await mountTooltip({trigger: 'manual', showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('focusin does not open tooltip in manual mode', async () => {
      const {el, triggerWrap} = await mountTooltip({trigger: 'manual', showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new FocusEvent('focusin', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('click does not open tooltip in manual mode', async () => {
      const {el, triggerWrap} = await mountTooltip({trigger: 'manual', showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('show() opens tooltip programmatically in manual mode (zero delay)', async () => {
      const {el} = await mountTooltip({trigger: 'manual', showDelay: 0, hideDelay: 0})

      el.show()
      await settle(el)

      expect(el.open).toBe(true)
    })

    it('hide() closes tooltip programmatically in manual mode (zero delay)', async () => {
      const {el} = await mountTooltip({trigger: 'manual', showDelay: 0, hideDelay: 0})

      el.show()
      await settle(el)
      expect(el.open).toBe(true)

      el.hide()
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('show() is no-op when disabled in manual mode', async () => {
      const {el} = await mountTooltip({trigger: 'manual', disabled: true, showDelay: 0, hideDelay: 0})

      el.show()
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('Escape still dismisses in manual mode', async () => {
      const {el, triggerWrap} = await mountTooltip({trigger: 'manual', showDelay: 0, hideDelay: 0})

      el.show()
      await settle(el)
      expect(el.open).toBe(true)

      triggerWrap.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })
  })

  // ===========================================================================
  // 10. Disabled state
  // ===========================================================================

  describe('disabled state', () => {
    it('does not open on pointerenter when disabled', async () => {
      const {el, triggerWrap} = await mountTooltip({disabled: true, showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('does not open on focusin when disabled', async () => {
      const {el, triggerWrap} = await mountTooltip({disabled: true, showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new FocusEvent('focusin', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(false)
    })

    it('aria-describedby is removed from slotted trigger when disabled', async () => {
      const {triggerEl} = await mountTooltip({disabled: true})

      expect(triggerEl.getAttribute('aria-describedby')).toBeNull()
    })

    it('no input/change events fire when disabled interactions occur', async () => {
      const {el, triggerWrap} = await mountTooltip({disabled: true, showDelay: 0, hideDelay: 0})
      let count = 0
      el.addEventListener('cv-input', () => count++)
      el.addEventListener('cv-change', () => count++)

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      triggerWrap.dispatchEvent(new FocusEvent('focusin', {bubbles: true}))
      await settle(el)

      expect(count).toBe(0)
    })

    it('disabling at runtime closes an open tooltip', async () => {
      const {el, triggerWrap} = await mountTooltip({showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)
      expect(el.open).toBe(true)

      el.disabled = true
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('re-enabling allows interactions again', async () => {
      const {el, triggerWrap} = await mountTooltip({disabled: true, showDelay: 0, hideDelay: 0})

      el.disabled = false
      await settle(el)

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)

      expect(el.open).toBe(true)
    })
  })

  // ===========================================================================
  // 11. Arrow indicator
  // ===========================================================================

  describe('arrow indicator', () => {
    it('[part="arrow"] is NOT in shadow DOM when arrow=false', async () => {
      const el = await createTooltip({arrow: false})
      expect(el.shadowRoot!.querySelector('[part="arrow"]')).toBeNull()
    })

    it('[part="arrow"] IS in shadow DOM when arrow=true', async () => {
      const el = await createTooltip({arrow: true})
      expect(el.shadowRoot!.querySelector('[part="arrow"]')).not.toBeNull()
    })

    it(':host([arrow]) attribute present when arrow=true', async () => {
      const el = await createTooltip({arrow: true})
      expect(el.hasAttribute('arrow')).toBe(true)
    })

    it(':host([arrow]) attribute absent when arrow=false', async () => {
      const el = await createTooltip({arrow: false})
      expect(el.hasAttribute('arrow')).toBe(false)
    })

    it('adding arrow at runtime renders [part="arrow"]', async () => {
      const el = await createTooltip()
      expect(el.shadowRoot!.querySelector('[part="arrow"]')).toBeNull()

      el.arrow = true
      await settle(el)
      expect(el.shadowRoot!.querySelector('[part="arrow"]')).not.toBeNull()
    })

    it('removing arrow at runtime removes [part="arrow"]', async () => {
      const el = await createTooltip({arrow: true})
      expect(el.shadowRoot!.querySelector('[part="arrow"]')).not.toBeNull()

      el.arrow = false
      await settle(el)
      expect(el.shadowRoot!.querySelector('[part="arrow"]')).toBeNull()
    })
  })

  // ===========================================================================
  // 12. Keyboard behavior
  // ===========================================================================

  describe('keyboard behavior', () => {
    it('Escape closes tooltip (hover trigger)', async () => {
      const {el, triggerWrap} = await mountTooltip({showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)
      expect(el.open).toBe(true)

      triggerWrap.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })

    it('non-Escape keys do not close tooltip', async () => {
      const {el, triggerWrap} = await mountTooltip({showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)
      expect(el.open).toBe(true)

      triggerWrap.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)
      expect(el.open).toBe(true)
    })
  })

  // ===========================================================================
  // 13. Programmatic open/close via attribute
  // ===========================================================================

  describe('programmatic open via attribute', () => {
    it('setting open=true shows the tooltip', async () => {
      const {el, contentPart} = await mountTooltip()

      el.open = true
      await settle(el)

      expect(el.open).toBe(true)
      expect(contentPart.hidden).toBe(false)
    })

    it('setting open=false hides the tooltip', async () => {
      const {el, contentPart} = await mountTooltip({open: true})

      el.open = false
      await settle(el)

      expect(el.open).toBe(false)
      expect(contentPart.hidden).toBe(true)
    })
  })

  // ===========================================================================
  // 14. Headless contract delegation
  // ===========================================================================

  describe('headless contract delegation', () => {
    it('[part="content"] id matches aria-describedby on slotted trigger (linked via headless contract)', async () => {
      const {triggerEl, contentPart} = await mountTooltip({showDelay: 0, hideDelay: 0})
      const tooltipId = contentPart.getAttribute('id')
      const describedBy = triggerEl.getAttribute('aria-describedby')

      // IDs must be non-empty and match (headless getTriggerProps/getTooltipProps cross-reference)
      expect(tooltipId).toBeTruthy()
      expect(describedBy).toBeTruthy()
      expect(describedBy).toBe(tooltipId)
    })

    it('[part="trigger"] has an id from headless getTriggerProps', async () => {
      const {triggerWrap} = await mountTooltip()
      expect(triggerWrap.getAttribute('id')).toBeTruthy()
    })

    it('[part="content"] role="tooltip" comes from headless getTooltipProps', async () => {
      const {contentPart} = await mountTooltip()
      // role is sourced from getTooltipProps().role — not hardcoded in template
      expect(contentPart.getAttribute('role')).toBe('tooltip')
    })

    it('[part="content"] tabindex="-1" comes from headless getTooltipProps', async () => {
      const {contentPart} = await mountTooltip()
      expect(contentPart.getAttribute('tabindex')).toBe('-1')
    })

    it('[part="content"] hidden attribute reflects headless isOpen state', async () => {
      const {el, triggerWrap, contentPart} = await mountTooltip({showDelay: 0, hideDelay: 0})

      expect(contentPart.hidden).toBe(true) // closed → hidden

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)

      expect(contentPart.hidden).toBe(false) // open → not hidden
    })

    it('IDs use a consistent idBase prefix (trigger id and content id share common prefix)', async () => {
      const {triggerWrap, contentPart} = await mountTooltip()
      const triggerId = triggerWrap.getAttribute('id') ?? ''
      const contentId = contentPart.getAttribute('id') ?? ''

      expect(triggerId).toBeTruthy()
      expect(contentId).toBeTruthy()

      // Both IDs should share a common prefix (the idBase)
      const triggerPrefix = triggerId.replace(/-trigger$/, '')
      const contentPrefix = contentId.replace(/-content$/, '')
      expect(triggerPrefix).toBe(contentPrefix)
    })
  })

  // ===========================================================================
  // 15. Dynamic state updates
  // ===========================================================================

  describe('dynamic state updates', () => {
    it('changing showDelay at runtime recreates model preserving open state', async () => {
      const {el, triggerWrap} = await mountTooltip({showDelay: 0, hideDelay: 0})

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)
      expect(el.open).toBe(true)

      el.showDelay = 500
      await settle(el)

      // open state preserved after model recreation
      expect(el.open).toBe(true)
    })

    it('changing trigger at runtime updates interaction mode', async () => {
      const {el, triggerWrap} = await mountTooltip({trigger: 'hover', showDelay: 0, hideDelay: 0})

      // pointerenter should open in hover mode
      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)
      expect(el.open).toBe(true)

      // close it
      triggerWrap.dispatchEvent(new MouseEvent('pointerleave', {bubbles: true}))
      await settle(el)
      expect(el.open).toBe(false)

      // switch to manual
      el.trigger = 'manual'
      await settle(el)

      // pointerenter should now be a no-op
      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)
      expect(el.open).toBe(false)
    })
  })

  describe('positioning fallback', () => {
    it('uses JS fallback fixed positioning and bottom placement when there is more space below', async () => {
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
        (callback: FrameRequestCallback): number => {
          callback(0)
          return 1
        },
      )
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((): void => {})

      const {el, triggerWrap, contentPart} = await mountTooltip({showDelay: 0, hideDelay: 0})
      triggerWrap.getBoundingClientRect = () => new DOMRect(120, 40, 20, 20)
      contentPart.getBoundingClientRect = () => new DOMRect(0, 0, 140, 56)

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)

      expect(contentPart.getAttribute('data-anchor-positioning')).toBe('false')
      expect(contentPart.style.position).toBe('fixed')
      expect(contentPart.getAttribute('data-placement')).toBe('bottom')
      expect(contentPart.style.top).not.toBe('')
      expect(contentPart.style.left).not.toBe('')
    })

    it('switches fallback placement to top when space below is insufficient', async () => {
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
        (callback: FrameRequestCallback): number => {
          callback(0)
          return 1
        },
      )
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((): void => {})

      const {el, triggerWrap, contentPart} = await mountTooltip({showDelay: 0, hideDelay: 0})
      triggerWrap.getBoundingClientRect = () => new DOMRect(120, 720, 20, 20)
      contentPart.getBoundingClientRect = () => new DOMRect(0, 0, 140, 80)

      triggerWrap.dispatchEvent(new MouseEvent('pointerenter', {bubbles: true}))
      await settle(el)

      expect(contentPart.style.position).toBe('fixed')
      expect(contentPart.getAttribute('data-placement')).toBe('top')
    })
  })
})
