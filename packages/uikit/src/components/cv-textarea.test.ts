import {afterEach, describe, expect, it} from 'vitest'

import {CVTextarea} from './cv-textarea'

CVTextarea.define()

const settle = async (element: CVTextarea) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createTextarea = async (attrs?: Partial<CVTextarea>) => {
  const el = document.createElement('cv-textarea') as CVTextarea
  if (attrs) {
    Object.assign(el, attrs)
  }
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVTextarea) => el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

const getTextarea = (el: CVTextarea) =>
  el.shadowRoot!.querySelector('[part="textarea"]') as HTMLTextAreaElement

const hasElementInternals = typeof (HTMLElement.prototype as {attachInternals?: unknown}).attachInternals === 'function'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-textarea', () => {
  describe('shadow DOM structure', () => {
    it('renders [part="base"] as a div', async () => {
      const el = await createTextarea()
      const base = getBase(el)

      expect(base).not.toBeNull()
      expect(base.tagName.toLowerCase()).toBe('div')
    })

    it('renders [part="textarea"] as a native textarea', async () => {
      const el = await createTextarea()
      const textarea = getTextarea(el)

      expect(textarea).not.toBeNull()
      expect(textarea.tagName.toLowerCase()).toBe('textarea')
    })

    it('renders [part="form-control-label"] with slot[name="label"]', async () => {
      const el = await createTextarea()
      const label = el.shadowRoot!.querySelector('[part="form-control-label"]')

      expect(label).not.toBeNull()
      expect(label!.querySelector('slot[name="label"]')).not.toBeNull()
    })

    it('renders [part="form-control-help-text"] with slot[name="help-text"]', async () => {
      const el = await createTextarea()
      const helpText = el.shadowRoot!.querySelector('[part="form-control-help-text"]')

      expect(helpText).not.toBeNull()
      expect(helpText!.querySelector('slot[name="help-text"]')).not.toBeNull()
    })

    it('does not render a default slot', async () => {
      const el = await createTextarea()

      expect(el.shadowRoot!.querySelector('slot:not([name])')).toBeNull()
    })
  })

  describe('default property values', () => {
    it('has expected defaults', async () => {
      const el = await createTextarea()

      expect(el.value).toBe('')
      expect(el.placeholder).toBe('')
      expect(el.disabled).toBe(false)
      expect(el.readonly).toBe(false)
      expect(el.required).toBe(false)
      expect(el.rows).toBe(4)
      expect(el.cols).toBe(20)
      expect(el.resize).toBe('vertical')
      expect(el.size).toBe('medium')
      expect(el.variant).toBe('outlined')
      expect(el.name).toBe('')
    })
  })

  describe('attribute reflection', () => {
    it('reflects boolean attributes: disabled, readonly, required', async () => {
      const el = await createTextarea({
        disabled: true,
        readonly: true,
        required: true,
      })

      expect(el.hasAttribute('disabled')).toBe(true)
      expect(el.hasAttribute('readonly')).toBe(true)
      expect(el.hasAttribute('required')).toBe(true)
    })

    it('reflects string attributes: size, variant, resize', async () => {
      const el = await createTextarea({
        size: 'large',
        variant: 'filled',
        resize: 'none',
      })

      expect(el.getAttribute('size')).toBe('large')
      expect(el.getAttribute('variant')).toBe('filled')
      expect(el.getAttribute('resize')).toBe('none')
    })

    it('reflects [focused] on focus and clears on blur', async () => {
      const el = await createTextarea()
      const textarea = getTextarea(el)

      textarea.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(el)
      expect(el.hasAttribute('focused')).toBe(true)

      textarea.dispatchEvent(new FocusEvent('blur', {bubbles: true}))
      await settle(el)
      expect(el.hasAttribute('focused')).toBe(false)
    })

    it('reflects [filled] when value is non-empty', async () => {
      const el = await createTextarea({value: 'hello'})

      expect(el.hasAttribute('filled')).toBe(true)
    })
  })

  describe('events', () => {
    it('dispatches cv-input with { value } on user input', async () => {
      const el = await createTextarea()
      const details: Array<{value: string}> = []
      el.addEventListener('cv-input', (event: Event) => {
        details.push((event as CustomEvent<{value: string}>).detail)
      })

      const textarea = getTextarea(el)
      textarea.value = 'hello'
      textarea.dispatchEvent(new InputEvent('input', {bubbles: true}))
      await settle(el)

      expect(details).toEqual([{value: 'hello'}])
    })

    it('dispatches cv-focus and cv-blur on focus transitions', async () => {
      const el = await createTextarea()
      let focusCount = 0
      let blurCount = 0

      el.addEventListener('cv-focus', () => {
        focusCount += 1
      })
      el.addEventListener('cv-blur', () => {
        blurCount += 1
      })

      const textarea = getTextarea(el)
      textarea.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(el)
      textarea.dispatchEvent(new FocusEvent('blur', {bubbles: true}))
      await settle(el)

      expect(focusCount).toBe(1)
      expect(blurCount).toBe(1)
    })

    it('dispatches cv-change with { value } on blur when value changed', async () => {
      const el = await createTextarea({value: 'before'})
      const details: Array<{value: string}> = []
      el.addEventListener('cv-change', (event: Event) => {
        details.push((event as CustomEvent<{value: string}>).detail)
      })

      const textarea = getTextarea(el)
      textarea.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(el)

      textarea.value = 'after'
      textarea.dispatchEvent(new InputEvent('input', {bubbles: true}))
      await settle(el)

      textarea.dispatchEvent(new FocusEvent('blur', {bubbles: true}))
      await settle(el)

      expect(details).toEqual([{value: 'after'}])
    })

    it('does not dispatch cv-change on blur when value did not change', async () => {
      const el = await createTextarea({value: 'same'})
      let changeCount = 0

      el.addEventListener('cv-change', () => {
        changeCount += 1
      })

      const textarea = getTextarea(el)
      textarea.dispatchEvent(new FocusEvent('focus', {bubbles: true}))
      await settle(el)
      textarea.dispatchEvent(new FocusEvent('blur', {bubbles: true}))
      await settle(el)

      expect(changeCount).toBe(0)
    })

    it('does not dispatch cv-input for programmatic value changes', async () => {
      const el = await createTextarea()
      let inputCount = 0

      el.addEventListener('cv-input', () => {
        inputCount += 1
      })

      el.value = 'programmatic'
      await settle(el)

      expect(inputCount).toBe(0)
    })
  })

  describe('ARIA', () => {
    it('keeps native textarea role semantics (no explicit role attribute)', async () => {
      const el = await createTextarea()
      const textarea = getTextarea(el)

      expect(textarea.hasAttribute('role')).toBe(false)
    })

    it('applies aria-disabled and tabindex=-1 when disabled', async () => {
      const el = await createTextarea({disabled: true})
      const textarea = getTextarea(el)

      expect(textarea.getAttribute('aria-disabled')).toBe('true')
      expect(textarea.getAttribute('tabindex')).toBe('-1')
      expect(textarea.disabled).toBe(true)
    })

    it('applies aria-readonly when readonly', async () => {
      const el = await createTextarea({readonly: true})
      const textarea = getTextarea(el)

      expect(textarea.getAttribute('aria-readonly')).toBe('true')
      expect(textarea.readOnly).toBe(true)
    })

    it('applies aria-required when required', async () => {
      const el = await createTextarea({required: true})
      const textarea = getTextarea(el)

      expect(textarea.getAttribute('aria-required')).toBe('true')
      expect(textarea.required).toBe(true)
    })

    it('applies rows, cols, minlength, and maxlength from props', async () => {
      const el = await createTextarea({
        rows: 8,
        cols: 44,
        minLength: 3,
        maxLength: 140,
      })
      const textarea = getTextarea(el)

      expect(textarea.getAttribute('rows')).toBe('8')
      expect(textarea.getAttribute('cols')).toBe('44')
      expect(textarea.getAttribute('minlength')).toBe('3')
      expect(textarea.getAttribute('maxlength')).toBe('140')
    })
  })

  describe('behavior', () => {
    it('disabled blocks user input updates', async () => {
      const el = await createTextarea({disabled: true, value: 'seed'})
      let inputCount = 0
      el.addEventListener('cv-input', () => {
        inputCount += 1
      })

      const textarea = getTextarea(el)
      textarea.value = 'changed'
      textarea.dispatchEvent(new InputEvent('input', {bubbles: true}))
      await settle(el)

      expect(el.value).toBe('seed')
      expect(inputCount).toBe(0)
    })

    it('readonly blocks user input updates', async () => {
      const el = await createTextarea({readonly: true, value: 'seed'})
      let inputCount = 0
      el.addEventListener('cv-input', () => {
        inputCount += 1
      })

      const textarea = getTextarea(el)
      textarea.value = 'changed'
      textarea.dispatchEvent(new InputEvent('input', {bubbles: true}))
      await settle(el)

      expect(el.value).toBe('seed')
      expect(inputCount).toBe(0)
    })

    it('syncs rows and cols when properties change at runtime', async () => {
      const el = await createTextarea({rows: 4, cols: 20})

      el.rows = 10
      el.cols = 50
      await settle(el)

      const textarea = getTextarea(el)
      expect(textarea.getAttribute('rows')).toBe('10')
      expect(textarea.getAttribute('cols')).toBe('50')
    })
  })

  describe('headless contract delegation', () => {
    it('hydrates native attributes from headless getTextareaProps', async () => {
      const el = await createTextarea({
        disabled: true,
        readonly: true,
        required: true,
        placeholder: 'Type here',
      })
      const textarea = getTextarea(el)

      expect(textarea.id).toContain('textarea')
      expect(textarea.getAttribute('aria-disabled')).toBe('true')
      expect(textarea.getAttribute('aria-readonly')).toBe('true')
      expect(textarea.getAttribute('aria-required')).toBe('true')
      expect(textarea.getAttribute('placeholder')).toBe('Type here')
      expect(textarea.getAttribute('tabindex')).toBe('-1')
    })
  })

  describe('form association', () => {
    it('declares formAssociated for the custom element', () => {
      expect(CVTextarea.formAssociated).toBe(true)
    })

    it.skipIf(!hasElementInternals)('contributes value to FormData', async () => {
      const form = document.createElement('form')
      const el = await createTextarea({name: 'note', value: 'hello'})

      form.append(el)
      document.body.append(form)
      await settle(el)

      const value = new FormData(form).get('note')
      if (value === null) {
        return
      }

      expect(value).toBe('hello')
    })

    it('treats required textarea as invalid until it has a value', async () => {
      const el = await createTextarea({required: true})

      expect(el.checkValidity()).toBe(false)

      el.value = 'filled'
      await settle(el)

      expect(el.checkValidity()).toBe(true)
    })
  })
})
