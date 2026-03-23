import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {CVCopyButton} from './cv-copy-button'

CVCopyButton.define()

const settle = async (element: CVCopyButton) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createCopyButton = async (attrs?: Partial<CVCopyButton>) => {
  const el = document.createElement('cv-copy-button') as CVCopyButton
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVCopyButton) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Shadow DOM structure
// ---------------------------------------------------------------------------
describe('cv-copy-button', () => {
  describe('shadow DOM structure', () => {
    it('renders [part="base"] as a div', async () => {
      const el = await createCopyButton()
      const base = getBase(el)
      expect(base).not.toBeNull()
      expect(base.tagName.toLowerCase()).toBe('div')
    })

    it('renders [part="copy-icon"] as a span', async () => {
      const el = await createCopyButton()
      const part = el.shadowRoot!.querySelector('[part="copy-icon"]')
      expect(part).not.toBeNull()
      expect(part!.tagName.toLowerCase()).toBe('span')
    })

    it('renders [part="copy-icon"] containing slot[name="copy-icon"]', async () => {
      const el = await createCopyButton()
      const part = el.shadowRoot!.querySelector('[part="copy-icon"]')
      const slot = part!.querySelector('slot[name="copy-icon"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="success-icon"] as a span', async () => {
      const el = await createCopyButton()
      const part = el.shadowRoot!.querySelector('[part="success-icon"]')
      expect(part).not.toBeNull()
      expect(part!.tagName.toLowerCase()).toBe('span')
    })

    it('renders [part="success-icon"] containing slot[name="success-icon"]', async () => {
      const el = await createCopyButton()
      const part = el.shadowRoot!.querySelector('[part="success-icon"]')
      const slot = part!.querySelector('slot[name="success-icon"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="error-icon"] as a span', async () => {
      const el = await createCopyButton()
      const part = el.shadowRoot!.querySelector('[part="error-icon"]')
      expect(part).not.toBeNull()
      expect(part!.tagName.toLowerCase()).toBe('span')
    })

    it('renders [part="error-icon"] containing slot[name="error-icon"]', async () => {
      const el = await createCopyButton()
      const part = el.shadowRoot!.querySelector('[part="error-icon"]')
      const slot = part!.querySelector('slot[name="error-icon"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="status"] as a span', async () => {
      const el = await createCopyButton()
      const part = el.shadowRoot!.querySelector('[part="status"]')
      expect(part).not.toBeNull()
      expect(part!.tagName.toLowerCase()).toBe('span')
    })
  })

  // ---------------------------------------------------------------------------
  // Default property values
  // ---------------------------------------------------------------------------
  describe('default property values', () => {
    it('has correct defaults', async () => {
      const el = await createCopyButton()
      expect(el.value).toBe('')
      expect(el.disabled).toBe(false)
      expect(el.feedbackDuration).toBe(1500)
      expect(el.size).toBe('medium')
    })
  })

  // ---------------------------------------------------------------------------
  // Attribute reflection
  // ---------------------------------------------------------------------------
  describe('attribute reflection', () => {
    it('disabled boolean attribute reflects to DOM', async () => {
      const el = await createCopyButton({disabled: true})
      expect(el.hasAttribute('disabled')).toBe(true)
    })

    it('disabled false removes attribute', async () => {
      const el = await createCopyButton({disabled: false})
      expect(el.hasAttribute('disabled')).toBe(false)
    })

    it('size string attribute reflects to DOM', async () => {
      const el = await createCopyButton({size: 'large'} as Partial<CVCopyButton>)
      expect(el.getAttribute('size')).toBe('large')
    })

    it('feedback-duration numeric attribute reflects to DOM', async () => {
      const el = await createCopyButton({feedbackDuration: 3000})
      expect(el.getAttribute('feedback-duration')).toBe('3000')
    })

    it('status attribute reflects current state on host', async () => {
      const el = await createCopyButton()
      expect(el.getAttribute('status')).toBe('idle')
    })

    it('value property does NOT reflect as attribute (security)', async () => {
      const el = await createCopyButton({value: 'secret'})
      expect(el.hasAttribute('value')).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  describe('events', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('cv-copy fires with {value} detail on successful copy', async () => {
      const clip = {writeText: vi.fn().mockResolvedValue(undefined)}
      const el = await createCopyButton({value: 'hello'})
      // Inject mock clipboard — the component should pass it to createCopyButton
      ;(el as any)._clipboard = clip

      let detail: unknown
      el.addEventListener('cv-copy', ((e: CustomEvent) => {
        detail = e.detail
      }) as EventListener)

      getBase(el).click()
      await settle(el)
      // Allow the async copy to complete
      await vi.advanceTimersByTimeAsync(0)
      await settle(el)

      expect(detail).toEqual({value: 'hello'})
    })

    it('cv-error fires with {error} detail on clipboard failure', async () => {
      const error = new Error('denied')
      const clip = {writeText: vi.fn().mockRejectedValue(error)}
      const el = await createCopyButton({value: 'test'})
      ;(el as any)._clipboard = clip

      let detail: unknown
      el.addEventListener('cv-error', ((e: CustomEvent) => {
        detail = e.detail
      }) as EventListener)

      getBase(el).click()
      await settle(el)
      await vi.advanceTimersByTimeAsync(0)
      await settle(el)

      expect(detail).toEqual({error})
    })
  })

  // ---------------------------------------------------------------------------
  // ARIA
  // ---------------------------------------------------------------------------
  describe('ARIA', () => {
    it('role="button" on base', async () => {
      const el = await createCopyButton()
      expect(getBase(el).getAttribute('role')).toBe('button')
    })

    it('tabindex="0" when enabled', async () => {
      const el = await createCopyButton()
      expect(getBase(el).getAttribute('tabindex')).toBe('0')
    })

    it('tabindex="-1" when disabled', async () => {
      const el = await createCopyButton({disabled: true})
      expect(getBase(el).getAttribute('tabindex')).toBe('-1')
    })

    it('aria-disabled="true" when disabled', async () => {
      const el = await createCopyButton({disabled: true})
      expect(getBase(el).getAttribute('aria-disabled')).toBe('true')
    })

    it('aria-disabled="false" when enabled', async () => {
      const el = await createCopyButton()
      expect(getBase(el).getAttribute('aria-disabled')).toBe('false')
    })

    it('status region has role="status"', async () => {
      const el = await createCopyButton()
      const status = el.shadowRoot!.querySelector('[part="status"]')!
      expect(status.getAttribute('role')).toBe('status')
    })

    it('status region has aria-live="polite"', async () => {
      const el = await createCopyButton()
      const status = el.shadowRoot!.querySelector('[part="status"]')!
      expect(status.getAttribute('aria-live')).toBe('polite')
    })

    it('status region has aria-atomic="true"', async () => {
      const el = await createCopyButton()
      const status = el.shadowRoot!.querySelector('[part="status"]')!
      expect(status.getAttribute('aria-atomic')).toBe('true')
    })
  })

  // ---------------------------------------------------------------------------
  // Visual states
  // ---------------------------------------------------------------------------
  describe('visual states', () => {
    it('status attribute on host is "idle" by default', async () => {
      const el = await createCopyButton()
      expect(el.getAttribute('status')).toBe('idle')
    })

    it('status attribute on host reflects "success" after copy', async () => {
      vi.useFakeTimers()
      const clip = {writeText: vi.fn().mockResolvedValue(undefined)}
      const el = await createCopyButton({value: 'test'})
      ;(el as any)._clipboard = clip

      getBase(el).click()
      await vi.advanceTimersByTimeAsync(0)
      await settle(el)

      expect(el.getAttribute('status')).toBe('success')
      vi.useRealTimers()
    })

    it('status attribute on host reflects "error" after failed copy', async () => {
      vi.useFakeTimers()
      const clip = {writeText: vi.fn().mockRejectedValue(new Error('fail'))}
      const el = await createCopyButton({value: 'test'})
      ;(el as any)._clipboard = clip

      getBase(el).click()
      await vi.advanceTimersByTimeAsync(0)
      await settle(el)

      expect(el.getAttribute('status')).toBe('error')
      vi.useRealTimers()
    })

    it('copying attribute is set while async copy is in-flight', async () => {
      let resolveClip!: () => void
      const clip = {
        writeText: vi.fn().mockImplementation(
          () => new Promise<void>((resolve) => {
            resolveClip = resolve
          }),
        ),
      }
      const el = await createCopyButton({value: 'test'})
      ;(el as any)._clipboard = clip

      getBase(el).click()
      await settle(el)
      // While in-flight, copying attribute should be present
      expect(el.hasAttribute('copying')).toBe(true)

      resolveClip()
      await settle(el)
    })
  })

  // ---------------------------------------------------------------------------
  // Copy behavior
  // ---------------------------------------------------------------------------
  describe('copy behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('click on base triggers copy', async () => {
      const clip = {writeText: vi.fn().mockResolvedValue(undefined)}
      const el = await createCopyButton({value: 'click-test'})
      ;(el as any)._clipboard = clip

      getBase(el).click()
      await vi.advanceTimersByTimeAsync(0)
      await settle(el)

      expect(clip.writeText).toHaveBeenCalledWith('click-test')
    })

    it('Enter keydown triggers copy', async () => {
      const clip = {writeText: vi.fn().mockResolvedValue(undefined)}
      const el = await createCopyButton({value: 'enter-test'})
      ;(el as any)._clipboard = clip

      getBase(el).dispatchEvent(
        new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}),
      )
      await vi.advanceTimersByTimeAsync(0)
      await settle(el)

      expect(clip.writeText).toHaveBeenCalledWith('enter-test')
    })

    it('Space keyup triggers copy (keydown alone does not)', async () => {
      const clip = {writeText: vi.fn().mockResolvedValue(undefined)}
      const el = await createCopyButton({value: 'space-test'})
      ;(el as any)._clipboard = clip

      // keydown should NOT trigger copy
      getBase(el).dispatchEvent(
        new KeyboardEvent('keydown', {key: ' ', bubbles: true}),
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(clip.writeText).not.toHaveBeenCalled()

      // keyup should trigger copy
      getBase(el).dispatchEvent(
        new KeyboardEvent('keyup', {key: ' ', bubbles: true}),
      )
      await vi.advanceTimersByTimeAsync(0)
      await settle(el)

      expect(clip.writeText).toHaveBeenCalledWith('space-test')
    })

    it('async value is resolved before writing to clipboard', async () => {
      const clip = {writeText: vi.fn().mockResolvedValue(undefined)}
      const asyncGetter = async () => 'async-resolved-value'
      const el = await createCopyButton({value: asyncGetter as any})
      ;(el as any)._clipboard = clip

      getBase(el).click()
      await vi.advanceTimersByTimeAsync(0)
      await settle(el)

      expect(clip.writeText).toHaveBeenCalledWith('async-resolved-value')
    })

    it('disabled blocks copy', async () => {
      const clip = {writeText: vi.fn().mockResolvedValue(undefined)}
      const el = await createCopyButton({value: 'blocked', disabled: true})
      ;(el as any)._clipboard = clip

      getBase(el).click()
      await vi.advanceTimersByTimeAsync(0)
      await settle(el)

      expect(clip.writeText).not.toHaveBeenCalled()
      expect(el.getAttribute('status')).toBe('idle')
    })

    it('disabled blocks Enter key copy', async () => {
      const clip = {writeText: vi.fn().mockResolvedValue(undefined)}
      const el = await createCopyButton({value: 'blocked', disabled: true})
      ;(el as any)._clipboard = clip

      getBase(el).dispatchEvent(
        new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}),
      )
      await vi.advanceTimersByTimeAsync(0)
      await settle(el)

      expect(clip.writeText).not.toHaveBeenCalled()
    })

    it('disabled blocks Space key copy', async () => {
      const clip = {writeText: vi.fn().mockResolvedValue(undefined)}
      const el = await createCopyButton({value: 'blocked', disabled: true})
      ;(el as any)._clipboard = clip

      getBase(el).dispatchEvent(
        new KeyboardEvent('keydown', {key: ' ', bubbles: true}),
      )
      getBase(el).dispatchEvent(
        new KeyboardEvent('keyup', {key: ' ', bubbles: true}),
      )
      await vi.advanceTimersByTimeAsync(0)
      await settle(el)

      expect(clip.writeText).not.toHaveBeenCalled()
    })

    it('success reverts to idle after feedbackDuration', async () => {
      const clip = {writeText: vi.fn().mockResolvedValue(undefined)}
      const el = await createCopyButton({value: 'test', feedbackDuration: 2000})
      ;(el as any)._clipboard = clip

      getBase(el).click()
      await vi.advanceTimersByTimeAsync(0)
      await settle(el)
      expect(el.getAttribute('status')).toBe('success')

      vi.advanceTimersByTime(1999)
      await settle(el)
      expect(el.getAttribute('status')).toBe('success')

      vi.advanceTimersByTime(1)
      await settle(el)
      expect(el.getAttribute('status')).toBe('idle')
    })

    it('error reverts to idle after feedbackDuration', async () => {
      const clip = {writeText: vi.fn().mockRejectedValue(new Error('fail'))}
      const el = await createCopyButton({value: 'test', feedbackDuration: 1000})
      ;(el as any)._clipboard = clip

      getBase(el).click()
      await vi.advanceTimersByTimeAsync(0)
      await settle(el)
      expect(el.getAttribute('status')).toBe('error')

      vi.advanceTimersByTime(1000)
      await settle(el)
      expect(el.getAttribute('status')).toBe('idle')
    })
  })

  // ---------------------------------------------------------------------------
  // Headless contract delegation
  // ---------------------------------------------------------------------------
  describe('headless contract delegation', () => {
    it('base element role comes from getButtonProps()', async () => {
      const el = await createCopyButton()
      const base = getBase(el)
      // role="button" is provided by the headless contracts.getButtonProps()
      expect(base.getAttribute('role')).toBe('button')
    })

    it('base element aria-disabled comes from getButtonProps()', async () => {
      const el = await createCopyButton({disabled: true})
      const base = getBase(el)
      expect(base.getAttribute('aria-disabled')).toBe('true')
    })

    it('base element tabindex comes from getButtonProps()', async () => {
      const el = await createCopyButton()
      const base = getBase(el)
      expect(base.getAttribute('tabindex')).toBe('0')
    })

    it('status element attributes come from getStatusProps()', async () => {
      const el = await createCopyButton()
      const status = el.shadowRoot!.querySelector('[part="status"]')!
      expect(status.getAttribute('role')).toBe('status')
      expect(status.getAttribute('aria-live')).toBe('polite')
      expect(status.getAttribute('aria-atomic')).toBe('true')
    })

    it('icon containers have aria-hidden="true" from getIconContainerProps()', async () => {
      const el = await createCopyButton()
      const copyIcon = el.shadowRoot!.querySelector('[part="copy-icon"]')!
      const successIcon = el.shadowRoot!.querySelector('[part="success-icon"]')!
      const errorIcon = el.shadowRoot!.querySelector('[part="error-icon"]')!
      expect(copyIcon.getAttribute('aria-hidden')).toBe('true')
      expect(successIcon.getAttribute('aria-hidden')).toBe('true')
      expect(errorIcon.getAttribute('aria-hidden')).toBe('true')
    })

    it('only active icon is visible (idle shows copy, hides success+error)', async () => {
      const el = await createCopyButton()
      const copyIcon = el.shadowRoot!.querySelector('[part="copy-icon"]') as HTMLElement
      const successIcon = el.shadowRoot!.querySelector('[part="success-icon"]') as HTMLElement
      const errorIcon = el.shadowRoot!.querySelector('[part="error-icon"]') as HTMLElement

      // copy icon should be visible (no hidden attribute)
      expect(copyIcon.hidden).toBe(false)
      // success and error icons should be hidden
      expect(successIcon.hidden).toBe(true)
      expect(errorIcon.hidden).toBe(true)
    })

    it('success state shows success icon, hides copy+error', async () => {
      vi.useFakeTimers()
      const clip = {writeText: vi.fn().mockResolvedValue(undefined)}
      const el = await createCopyButton({value: 'test'})
      ;(el as any)._clipboard = clip

      getBase(el).click()
      await vi.advanceTimersByTimeAsync(0)
      await settle(el)

      const copyIcon = el.shadowRoot!.querySelector('[part="copy-icon"]') as HTMLElement
      const successIcon = el.shadowRoot!.querySelector('[part="success-icon"]') as HTMLElement
      const errorIcon = el.shadowRoot!.querySelector('[part="error-icon"]') as HTMLElement

      expect(copyIcon.hidden).toBe(true)
      expect(successIcon.hidden).toBe(false)
      expect(errorIcon.hidden).toBe(true)
      vi.useRealTimers()
    })

    it('error state shows error icon, hides copy+success', async () => {
      vi.useFakeTimers()
      const clip = {writeText: vi.fn().mockRejectedValue(new Error('fail'))}
      const el = await createCopyButton({value: 'test'})
      ;(el as any)._clipboard = clip

      getBase(el).click()
      await vi.advanceTimersByTimeAsync(0)
      await settle(el)

      const copyIcon = el.shadowRoot!.querySelector('[part="copy-icon"]') as HTMLElement
      const successIcon = el.shadowRoot!.querySelector('[part="success-icon"]') as HTMLElement
      const errorIcon = el.shadowRoot!.querySelector('[part="error-icon"]') as HTMLElement

      expect(copyIcon.hidden).toBe(true)
      expect(successIcon.hidden).toBe(true)
      expect(errorIcon.hidden).toBe(false)
      vi.useRealTimers()
    })
  })

  // ---------------------------------------------------------------------------
  // Sizes
  // ---------------------------------------------------------------------------
  describe('sizes', () => {
    it('size defaults to "medium"', async () => {
      const el = await createCopyButton()
      expect(el.size).toBe('medium')
    })

    it('size="small" reflects on host attribute', async () => {
      const el = await createCopyButton({size: 'small'} as Partial<CVCopyButton>)
      expect(el.getAttribute('size')).toBe('small')
    })

    it('size="medium" reflects on host attribute', async () => {
      const el = await createCopyButton({size: 'medium'} as Partial<CVCopyButton>)
      expect(el.getAttribute('size')).toBe('medium')
    })

    it('size="large" reflects on host attribute', async () => {
      const el = await createCopyButton({size: 'large'} as Partial<CVCopyButton>)
      expect(el.getAttribute('size')).toBe('large')
    })
  })

  // ---------------------------------------------------------------------------
  // Dynamic state updates
  // ---------------------------------------------------------------------------
  describe('dynamic state updates', () => {
    it('changing disabled at runtime syncs aria-disabled', async () => {
      const el = await createCopyButton()
      expect(getBase(el).getAttribute('aria-disabled')).toBe('false')

      el.disabled = true
      await settle(el)
      expect(getBase(el).getAttribute('aria-disabled')).toBe('true')

      el.disabled = false
      await settle(el)
      expect(getBase(el).getAttribute('aria-disabled')).toBe('false')
    })

    it('changing disabled at runtime syncs tabindex', async () => {
      const el = await createCopyButton()
      expect(getBase(el).getAttribute('tabindex')).toBe('0')

      el.disabled = true
      await settle(el)
      expect(getBase(el).getAttribute('tabindex')).toBe('-1')

      el.disabled = false
      await settle(el)
      expect(getBase(el).getAttribute('tabindex')).toBe('0')
    })

    it('changing feedbackDuration at runtime updates the model', async () => {
      const el = await createCopyButton()
      expect(el.feedbackDuration).toBe(1500)

      el.feedbackDuration = 3000
      await settle(el)
      expect(el.feedbackDuration).toBe(3000)
    })
  })
})
