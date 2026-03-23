import {afterEach, describe, expect, it} from 'vitest'

import {CVCommandItem} from './cv-command-item'
import {CVCommandPalette} from './cv-command-palette'

const settle = async (element: CVCommandPalette) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

async function mountPalette(params: {closeOnExecute?: boolean; closeOnOutsidePointer?: boolean} = {}) {
  CVCommandItem.define()
  CVCommandPalette.define()

  const palette = document.createElement('cv-command-palette') as CVCommandPalette
  if (params.closeOnExecute === false) {
    palette.closeOnExecute = false
  }

  if (params.closeOnOutsidePointer === false) {
    palette.closeOnOutsidePointer = false
  }

  palette.innerHTML = `
    <span slot="trigger">Open palette</span>
    <cv-command-item value="open">Open file</cv-command-item>
    <cv-command-item value="close">Close file</cv-command-item>
    <cv-command-item value="delete" disabled>Delete file</cv-command-item>
  `

  document.body.append(palette)
  await settle(palette)

  const trigger = palette.shadowRoot?.querySelector('[part="trigger"]') as HTMLButtonElement
  const dialog = palette.shadowRoot?.querySelector('[part="dialog"]') as HTMLElement
  const input = palette.shadowRoot?.querySelector('[part="input"]') as HTMLInputElement
  const items = Array.from(palette.querySelectorAll('cv-command-item')) as CVCommandItem[]

  return {palette, trigger, dialog, input, items}
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-command-palette', () => {
  it('opens and closes from trigger click', async () => {
    const {palette, trigger, dialog} = await mountPalette()

    trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(palette)

    expect(palette.open).toBe(true)
    expect(dialog.hidden).toBe(false)

    trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(palette)

    expect(palette.open).toBe(false)
    expect(dialog.hidden).toBe(true)
  })

  it('toggles by global Cmd/Ctrl+K shortcut', async () => {
    const {palette} = await mountPalette()

    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'k', metaKey: true, bubbles: true}))
    await settle(palette)
    expect(palette.open).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'k', ctrlKey: true, bubbles: true}))
    await settle(palette)
    expect(palette.open).toBe(false)
  })

  it('filters visible commands from input value', async () => {
    const {palette, trigger, input, items} = await mountPalette()

    trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(palette)

    input.value = 'close'
    input.dispatchEvent(new Event('input', {bubbles: true, composed: true}))
    await settle(palette)

    expect(items[0]!.hidden).toBe(true)
    expect(items[1]!.hidden).toBe(false)
  })

  it('executes active command on Enter and emits execute', async () => {
    const {palette, trigger, input, items} = await mountPalette()
    const executed: Array<string | null> = []

    palette.addEventListener('cv-execute', (event) => {
      executed.push((event as CustomEvent<{lastExecutedValue: string | null}>).detail.lastExecutedValue)
    })

    trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(palette)

    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
    await settle(palette)

    expect(palette.value).toBe('close')
    expect(palette.lastExecutedValue).toBe('close')
    expect(palette.open).toBe(false)
    expect(items[1]!.selected).toBe(true)
    expect(executed.at(-1)).toBe('close')
  })

  it('keeps palette open when closeOnExecute is false', async () => {
    const {palette, trigger, items} = await mountPalette({closeOnExecute: false})

    trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(palette)

    items[0]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(palette)

    expect(palette.value).toBe('open')
    expect(palette.lastExecutedValue).toBe('open')
    expect(palette.open).toBe(true)
  })

  it('closes on outside pointer by default and can be disabled', async () => {
    const {palette, trigger} = await mountPalette({closeOnOutsidePointer: true})

    trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(palette)
    expect(palette.open).toBe(true)

    document.body.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true}))
    await settle(palette)
    expect(palette.open).toBe(false)

    const second = await mountPalette({closeOnOutsidePointer: false})
    second.trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(second.palette)

    document.body.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true}))
    await settle(second.palette)
    expect(second.palette.open).toBe(true)
  })
})
