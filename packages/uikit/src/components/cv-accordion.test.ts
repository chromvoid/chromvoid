import {afterEach, describe, expect, it, vi} from 'vitest'

import {CVAccordion} from './cv-accordion'
import {CVAccordionItem} from './cv-accordion-item'

const settle = async (element: CVAccordion) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createItem = (value: string, label: string, content: string) => {
  const item = document.createElement('cv-accordion-item') as CVAccordionItem
  item.value = value

  const trigger = document.createElement('span')
  trigger.slot = 'trigger'
  trigger.textContent = label

  const panel = document.createElement('div')
  panel.textContent = content

  item.append(trigger, panel)
  return item
}

const getTrigger = (item: CVAccordionItem) => item.shadowRoot?.querySelector('[part="trigger"]') as HTMLButtonElement

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('cv-accordion', () => {
  it('toggles sections in single mode and emits change', async () => {
    CVAccordionItem.define()
    CVAccordion.define()

    const accordion = document.createElement('cv-accordion') as CVAccordion
    const itemA = createItem('a', 'A', 'Panel A')
    const itemB = createItem('b', 'B', 'Panel B')
    const changeValues: string[][] = []

    accordion.addEventListener('cv-change', (event) => {
      changeValues.push((event as CustomEvent<{values: string[]}>).detail.values)
    })

    accordion.append(itemA, itemB)
    document.body.append(accordion)
    await settle(accordion)

    getTrigger(itemA).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(accordion)

    expect(accordion.value).toBe('a')
    expect(accordion.expandedValues).toEqual(['a'])
    expect(itemA.expanded).toBe(true)
    expect(itemB.expanded).toBe(false)

    getTrigger(itemB).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(accordion)

    expect(accordion.value).toBe('b')
    expect(accordion.expandedValues).toEqual(['b'])
    expect(itemA.expanded).toBe(false)
    expect(itemB.expanded).toBe(true)
    expect(changeValues).toEqual([['a'], ['b']])
  })

  it('supports keyboard navigation and activation', async () => {
    CVAccordionItem.define()
    CVAccordion.define()

    const accordion = document.createElement('cv-accordion') as CVAccordion
    const itemA = createItem('a', 'A', 'Panel A')
    const itemB = createItem('b', 'B', 'Panel B')
    const itemC = createItem('c', 'C', 'Panel C')
    itemB.disabled = true

    accordion.append(itemA, itemB, itemC)
    document.body.append(accordion)
    await settle(accordion)

    getTrigger(itemA).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true, composed: true}))
    await settle(accordion)

    expect(itemA.active).toBe(false)
    expect(itemC.active).toBe(true)

    getTrigger(itemC).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, composed: true}))
    await settle(accordion)

    expect(accordion.value).toBe('c')
    expect(accordion.expandedValues).toEqual(['c'])
    expect(itemC.expanded).toBe(true)
  })

  it('reveals a newly expanded item when revealExpanded is enabled', async () => {
    CVAccordionItem.define()
    CVAccordion.define()

    const accordion = document.createElement('cv-accordion') as CVAccordion
    accordion.revealExpanded = true

    const itemA = createItem('a', 'A', 'Panel A')
    const itemB = createItem('b', 'B', 'Panel B')
    const scrollIntoViewSpy = vi.fn()

    Object.defineProperty(itemB, 'scrollIntoView', {
      value: scrollIntoViewSpy,
      configurable: true,
    })

    accordion.append(itemA, itemB)
    document.body.append(accordion)
    await settle(accordion)

    getTrigger(itemB).dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(accordion)
    await Promise.resolve()

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({block: 'nearest', inline: 'nearest'})
  })

  it('does not reveal items for programmatic expandedValues changes', async () => {
    CVAccordionItem.define()
    CVAccordion.define()

    const accordion = document.createElement('cv-accordion') as CVAccordion
    accordion.allowMultiple = true
    accordion.revealExpanded = true

    const itemA = createItem('a', 'A', 'Panel A')
    const itemB = createItem('b', 'B', 'Panel B')
    const scrollIntoViewSpy = vi.fn()

    Object.defineProperty(itemB, 'scrollIntoView', {
      value: scrollIntoViewSpy,
      configurable: true,
    })

    accordion.append(itemA, itemB)
    document.body.append(accordion)
    await settle(accordion)

    accordion.expandedValues = ['b']
    await settle(accordion)
    await Promise.resolve()

    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })

  it('supports allowMultiple with expandedValues control', async () => {
    CVAccordionItem.define()
    CVAccordion.define()

    const accordion = document.createElement('cv-accordion') as CVAccordion
    accordion.allowMultiple = true
    accordion.expandedValues = ['a', 'c']

    const itemA = createItem('a', 'A', 'Panel A')
    const itemB = createItem('b', 'B', 'Panel B')
    const itemC = createItem('c', 'C', 'Panel C')

    accordion.append(itemA, itemB, itemC)
    document.body.append(accordion)
    await settle(accordion)

    expect(accordion.expandedValues).toEqual(['a', 'c'])
    expect(itemA.expanded).toBe(true)
    expect(itemB.expanded).toBe(false)
    expect(itemC.expanded).toBe(true)

    accordion.expandedValues = ['b']
    await settle(accordion)

    expect(accordion.expandedValues).toEqual(['b'])
    expect(itemA.expanded).toBe(false)
    expect(itemB.expanded).toBe(true)
    expect(itemC.expanded).toBe(false)
  })

  it('rebuilds on slotchange and preserves valid expanded state', async () => {
    CVAccordionItem.define()
    CVAccordion.define()

    const accordion = document.createElement('cv-accordion') as CVAccordion
    accordion.allowMultiple = true
    accordion.expandedValues = ['a', 'b']

    const itemA = createItem('a', 'A', 'Panel A')
    const itemB = createItem('b', 'B', 'Panel B')
    const itemC = createItem('c', 'C', 'Panel C')

    accordion.append(itemA, itemB, itemC)
    document.body.append(accordion)
    await settle(accordion)

    itemA.remove()
    await settle(accordion)

    expect(accordion.expandedValues).toEqual(['b'])
    expect(accordion.value).toBe('b')
    expect(itemB.expanded).toBe(true)
    expect(itemC.expanded).toBe(false)
  })
})
