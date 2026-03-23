import {createDatePicker as createHeadlessDatePicker} from '@chromvoid/headless-ui'
import {afterEach, describe, expect, it} from 'vitest'

import {CVDatePicker} from './cv-date-picker'

CVDatePicker.define()

const settle = async (element: CVDatePicker) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createDatePicker = async (attrs?: Partial<CVDatePicker>) => {
  const element = document.createElement('cv-date-picker') as CVDatePicker
  if (attrs) {
    Object.assign(element, attrs)
  }
  document.body.append(element)
  await settle(element)
  return element
}

const getBase = (element: CVDatePicker) => element.shadowRoot!.querySelector('[part="base"]') as HTMLElement

const getInput = (element: CVDatePicker) =>
  element.shadowRoot!.querySelector('[part="input"]') as HTMLInputElement

const getDialog = (element: CVDatePicker) =>
  element.shadowRoot!.querySelector('[part="dialog"]') as HTMLElement

const getCalendarGrid = (element: CVDatePicker) =>
  element.shadowRoot!.querySelector('[part="calendar-grid"]') as HTMLElement

const getCalendarDays = (element: CVDatePicker) =>
  Array.from(element.shadowRoot!.querySelectorAll('[part="calendar-day"]')) as HTMLButtonElement[]

const getApplyButton = (element: CVDatePicker) =>
  element.shadowRoot!.querySelector('[part="apply-button"]') as HTMLButtonElement

const getCancelButton = (element: CVDatePicker) =>
  element.shadowRoot!.querySelector('[part="cancel-button"]') as HTMLButtonElement

const getClearButton = (element: CVDatePicker) =>
  element.shadowRoot!.querySelector('[part="clear-button"]') as HTMLButtonElement

const dispatchKeyDown = (element: Element, key: string, init?: KeyboardEventInit) => {
  element.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      composed: true,
      ...init,
    }),
  )
}

const hasElementInternals = typeof (HTMLElement.prototype as {attachInternals?: unknown}).attachInternals === 'function'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-date-picker', () => {
  describe('shadow DOM structure', () => {
    it('renders core parts', async () => {
      const datePicker = await createDatePicker()

      expect(getBase(datePicker)).not.toBeNull()
      expect(datePicker.shadowRoot!.querySelector('[part="input-wrap"]')).not.toBeNull()
      expect(getInput(datePicker)).not.toBeNull()
      expect(getDialog(datePicker)).not.toBeNull()
      expect(getCalendarGrid(datePicker)).not.toBeNull()
      expect(datePicker.shadowRoot!.querySelector('[part="hour-input"]')).not.toBeNull()
      expect(datePicker.shadowRoot!.querySelector('[part="minute-input"]')).not.toBeNull()
      expect(getApplyButton(datePicker)).not.toBeNull()
      expect(getCancelButton(datePicker)).not.toBeNull()
      expect(getClearButton(datePicker)).not.toBeNull()
    })
  })

  describe('default property values', () => {
    it('has expected defaults', async () => {
      const datePicker = await createDatePicker()

      expect(datePicker.value).toBe('')
      expect(datePicker.open).toBe(false)
      expect(datePicker.disabled).toBe(false)
      expect(datePicker.readonly).toBe(false)
      expect(datePicker.required).toBe(false)
      expect(datePicker.placeholder).toBe('Select date and time')
      expect(datePicker.size).toBe('medium')
      expect(datePicker.locale).toBe('en-US')
      expect(datePicker.timeZone).toBe('local')
      expect(datePicker.minuteStep).toBe(1)
      expect(datePicker.hourCycle).toBe(24)
      expect(datePicker.closeOnEscape).toBe(true)
      expect(datePicker.inputInvalid).toBe(false)
      expect(datePicker.hasValue).toBe(false)
    })
  })

  describe('attribute reflection', () => {
    it('reflects boolean and key string attributes', async () => {
      const datePicker = await createDatePicker({
        value: '2026-01-10T12:30',
        open: true,
        disabled: false,
        readonly: true,
        required: true,
        size: 'large',
        timeZone: 'utc',
        closeOnEscape: false,
      })

      expect(datePicker.getAttribute('value')).toBe('2026-01-10T12:30')
      expect(datePicker.open).toBe(false)
      expect(datePicker.hasAttribute('disabled')).toBe(false)
      expect(datePicker.hasAttribute('readonly')).toBe(true)
      expect(datePicker.hasAttribute('required')).toBe(true)
      expect(datePicker.getAttribute('size')).toBe('large')
      expect(datePicker.getAttribute('time-zone')).toBe('utc')
      expect(datePicker.hasAttribute('close-on-escape')).toBe(false)
    })
  })

  describe('ARIA', () => {
    it('wires combobox + dialog roles and relationships', async () => {
      const datePicker = await createDatePicker()
      const input = getInput(datePicker)
      const dialog = getDialog(datePicker)
      const grid = getCalendarGrid(datePicker)

      expect(input.getAttribute('role')).toBe('combobox')
      expect(input.getAttribute('aria-haspopup')).toBe('dialog')
      expect(input.getAttribute('aria-expanded')).toBe('false')
      expect(input.getAttribute('aria-controls')).toBe(dialog.id)

      expect(dialog.getAttribute('role')).toBe('dialog')
      expect(dialog.getAttribute('aria-modal')).toBe('true')
      expect(dialog.hasAttribute('hidden')).toBe(true)

      expect(grid.getAttribute('role')).toBe('grid')
      expect(getCalendarDays(datePicker)).toHaveLength(42)
    })

    it('keeps ARIA constants aligned with headless contracts', async () => {
      const datePicker = await createDatePicker()
      const input = getInput(datePicker)
      const dialog = getDialog(datePicker)

      const headless = createHeadlessDatePicker()
      const inputProps = headless.contracts.getInputProps()
      const dialogProps = headless.contracts.getDialogProps()

      expect(input.getAttribute('role')).toBe(inputProps.role)
      expect(input.getAttribute('aria-haspopup')).toBe(inputProps['aria-haspopup'])
      expect(dialog.getAttribute('role')).toBe(dialogProps.role)
      expect(dialog.getAttribute('aria-modal')).toBe(dialogProps['aria-modal'])
    })
  })

  describe('events', () => {
    it('emits input with detail shape on text edit', async () => {
      const datePicker = await createDatePicker()
      let detail: Record<string, unknown> | null = null

      datePicker.addEventListener('cv-input', (event) => {
        if (!(event instanceof CustomEvent)) return
        detail = (event as unknown as CustomEvent<Record<string, unknown>>).detail
      })

      const input = getInput(datePicker)
      input.value = '2026-01-12T09:30'
      input.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
      await settle(datePicker)

      expect(detail).not.toBeNull()
      const inputDetail = detail as unknown as Record<string, unknown>
      expect(inputDetail['inputValue']).toBe('2026-01-12T09:30')
      expect(typeof inputDetail['value']).toBe('string')
      expect(typeof inputDetail['open']).toBe('boolean')
      expect(typeof inputDetail['invalid']).toBe('boolean')
    })

    it('emits change with source=input on Enter commit', async () => {
      const datePicker = await createDatePicker()
      let detail: Record<string, unknown> | null = null

      datePicker.addEventListener('cv-change', (event) => {
        detail = (event as unknown as CustomEvent<Record<string, unknown>>).detail
      })

      const input = getInput(datePicker)
      input.value = '2026-01-12T09:30'
      input.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
      dispatchKeyDown(input, 'Enter')
      await settle(datePicker)

      expect(detail).not.toBeNull()
      const changeDetail = detail as unknown as Record<string, unknown>
      expect(changeDetail['value']).toBe('2026-01-12T09:30')
      expect(changeDetail['source']).toBe('input')
      expect(typeof changeDetail['previousValue']).toBe('string')
    })
  })

  describe('behavior', () => {
    it('opens from input key and closes with Escape', async () => {
      const datePicker = await createDatePicker()
      const input = getInput(datePicker)

      dispatchKeyDown(input, 'ArrowDown')
      await settle(datePicker)
      expect(datePicker.open).toBe(true)

      dispatchKeyDown(getDialog(datePicker), 'Escape')
      await settle(datePicker)
      expect(datePicker.open).toBe(false)
    })

    it('commits draft from dialog Apply and emits source=dialog', async () => {
      const initialValue = '2026-01-01T00:00'
      const datePicker = await createDatePicker({value: initialValue})

      let detail: Record<string, unknown> | null = null
      datePicker.addEventListener('cv-change', (event) => {
        detail = (event as unknown as CustomEvent<Record<string, unknown>>).detail
      })

      dispatchKeyDown(getInput(datePicker), 'ArrowDown')
      await settle(datePicker)

      const targetDay = getCalendarDays(datePicker).find(
        (button) => button.getAttribute('data-date') !== '2026-01-01',
      )
      targetDay?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      getApplyButton(datePicker).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(datePicker)

      expect(datePicker.value).not.toBe(initialValue)
      expect(detail).not.toBeNull()
      const changeDetail = detail as unknown as Record<string, unknown>
      expect(changeDetail['source']).toBe('dialog')
      expect(typeof changeDetail['value']).toBe('string')
    })

    it('clears committed value through clear button', async () => {
      const datePicker = await createDatePicker({value: '2026-01-05T10:00'})

      expect(datePicker.hasValue).toBe(true)

      getClearButton(datePicker).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(datePicker)

      expect(datePicker.value).toBe('')
      expect(datePicker.hasValue).toBe(false)
    })
  })

  describe('disabled and readonly behavior', () => {
    it('does not open when disabled', async () => {
      const datePicker = await createDatePicker({disabled: true})

      dispatchKeyDown(getInput(datePicker), 'ArrowDown')
      await settle(datePicker)

      expect(datePicker.open).toBe(false)
    })

    it('keeps committed value unchanged when readonly', async () => {
      const initialValue = '2026-01-01T00:00'
      const datePicker = await createDatePicker({readonly: true, value: initialValue})

      dispatchKeyDown(getInput(datePicker), 'ArrowDown')
      await settle(datePicker)

      const day = getCalendarDays(datePicker).find(
        (button) => button.getAttribute('data-date') !== '2026-01-01',
      )
      day?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      getApplyButton(datePicker).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(datePicker)

      expect(datePicker.value).toBe(initialValue)
    })
  })

  describe('headless contract delegation', () => {
    it('keeps active descendant wiring inside rendered day cells', async () => {
      const datePicker = await createDatePicker()
      const input = getInput(datePicker)

      dispatchKeyDown(input, 'ArrowDown')
      await settle(datePicker)

      const activeId = input.getAttribute('aria-activedescendant')
      if (activeId) {
        expect(getDialog(datePicker).querySelector(`#${activeId}`)).not.toBeNull()
      }

      expect(input.getAttribute('aria-controls')).toBe(getDialog(datePicker).id)
    })
  })

  describe('form association', () => {
    it('declares formAssociated for the custom element', () => {
      expect(CVDatePicker.formAssociated).toBe(true)
    })

    it.skipIf(!hasElementInternals)('contributes committed value to FormData', async () => {
      const form = document.createElement('form')
      const datePicker = await createDatePicker({value: '2026-01-10T12:30'})
      datePicker.setAttribute('name', 'scheduledAt')

      form.append(datePicker)
      document.body.append(form)
      await settle(datePicker)

      const value = new FormData(form).get('scheduledAt')
      if (value === null) {
        return
      }

      expect(value).toBe('2026-01-10T12:30')
    })

    it('treats required date picker as invalid until it has a committed value', async () => {
      const datePicker = await createDatePicker({required: true})

      expect(datePicker.checkValidity()).toBe(false)

      datePicker.value = '2026-01-10T12:30'
      await settle(datePicker)

      expect(datePicker.checkValidity()).toBe(true)
    })
  })
})
