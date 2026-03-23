import {describe, expect, it} from 'vitest'
import {createAccordion} from './index'

describe('createAccordion', () => {
  it('initializes with provided expanded sections', () => {
    const accordion = createAccordion({
      idBase: 'accordion-initial',
      sections: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      allowMultiple: true,
      initialExpandedIds: ['a', 'c'],
    })

    expect([...accordion.state.expandedIds()]).toEqual(['a', 'c'])
  })

  it('toggles expansion on Enter and Space keys', () => {
    const accordion = createAccordion({
      idBase: 'accordion-toggle',
      sections: [{id: 'a'}, {id: 'b'}],
      initialExpandedIds: ['a'],
    })

    accordion.actions.setFocused('a')
    accordion.actions.handleKeyDown({key: 'Enter'})
    expect(accordion.state.expandedIds().has('a')).toBe(false)

    accordion.actions.handleKeyDown({key: ' '})
    expect(accordion.state.expandedIds().has('a')).toBe(true)
  })

  it('respects allowMultiple false by collapsing other sections', () => {
    const accordion = createAccordion({
      idBase: 'accordion-single',
      sections: [{id: 'a'}, {id: 'b'}],
      allowMultiple: false,
      initialExpandedIds: ['a'],
    })

    accordion.actions.expand('b')

    expect([...accordion.state.expandedIds()]).toEqual(['b'])
  })

  it('respects allowZeroExpanded false and keeps one section expanded', () => {
    const accordion = createAccordion({
      idBase: 'accordion-nonzero',
      sections: [{id: 'a'}, {id: 'b'}],
      allowMultiple: false,
      allowZeroExpanded: false,
      initialExpandedIds: ['a'],
    })

    accordion.actions.collapse('a')
    expect([...accordion.state.expandedIds()]).toEqual(['a'])

    expect(accordion.contracts.getTriggerProps('a')['aria-disabled']).toBe('true')
  })

  it('navigates between triggers and skips disabled sections', () => {
    const accordion = createAccordion({
      idBase: 'accordion-nav',
      sections: [{id: 'a'}, {id: 'b', disabled: true}, {id: 'c'}],
    })

    accordion.actions.setFocused('a')
    accordion.actions.handleKeyDown({key: 'ArrowDown'})
    expect(accordion.state.focusedId()).toBe('c')

    accordion.actions.handleKeyDown({key: 'ArrowUp'})
    expect(accordion.state.focusedId()).toBe('a')

    accordion.actions.handleKeyDown({key: 'End'})
    expect(accordion.state.focusedId()).toBe('c')

    accordion.actions.handleKeyDown({key: 'Home'})
    expect(accordion.state.focusedId()).toBe('a')
  })

  it('keeps aria linkage between trigger and panel', () => {
    const accordion = createAccordion({
      idBase: 'accordion-a11y',
      sections: [{id: 'a'}],
      initialExpandedIds: ['a'],
    })

    const trigger = accordion.contracts.getTriggerProps('a')
    const panel = accordion.contracts.getPanelProps('a')

    expect(trigger['aria-controls']).toBe(panel.id)
    expect(panel['aria-labelledby']).toBe(trigger.id)
    expect(trigger['aria-expanded']).toBe('true')
    expect(panel.role).toBe('region')
  })

  it('disabled section cannot be expanded or collapsed via actions', () => {
    const accordion = createAccordion({
      idBase: 'accordion-disabled',
      sections: [{id: 'a', disabled: true}, {id: 'b'}],
    })

    accordion.actions.expand('a')
    expect(accordion.state.expandedIds().has('a')).toBe(false)

    accordion.actions.toggle('a')
    expect(accordion.state.expandedIds().has('a')).toBe(false)

    accordion.actions.expand('b')
    expect(accordion.state.expandedIds().has('b')).toBe(true)

    const trigger = accordion.contracts.getTriggerProps('a')
    expect(trigger['aria-disabled']).toBe('true')
    expect(trigger.tabindex).toBe('-1')
  })

  it('allowMultiple true allows expanding multiple sections sequentially', () => {
    const accordion = createAccordion({
      idBase: 'accordion-multi',
      sections: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      allowMultiple: true,
    })

    accordion.actions.expand('a')
    accordion.actions.expand('b')
    accordion.actions.expand('c')

    expect([...accordion.state.expandedIds()]).toEqual(['a', 'b', 'c'])

    accordion.actions.collapse('b')
    expect([...accordion.state.expandedIds()]).toEqual(['a', 'c'])
  })

  it('returns aria-disabled false for enabled non-forced triggers', () => {
    const accordion = createAccordion({
      idBase: 'accordion-aria-disabled',
      sections: [{id: 'a'}, {id: 'b'}],
      allowMultiple: true,
    })

    const trigger = accordion.contracts.getTriggerProps('a')
    expect(trigger['aria-disabled']).toBe('false')
  })

  it('initializes with first section expanded when allowZeroExpanded is false and no initialExpandedIds', () => {
    const accordion = createAccordion({
      idBase: 'accordion-auto-expand',
      sections: [{id: 'a'}, {id: 'b'}],
      allowZeroExpanded: false,
    })

    expect([...accordion.state.expandedIds()]).toEqual(['a'])
  })

  it('clamps initialExpandedIds to first when allowMultiple is false and multiple provided', () => {
    const accordion = createAccordion({
      idBase: 'accordion-clamp',
      sections: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      allowMultiple: false,
      initialExpandedIds: ['a', 'c'],
    })

    expect([...accordion.state.expandedIds()]).toEqual(['a'])
  })

  it('hides collapsed panels and shows expanded panels via hidden attribute', () => {
    const accordion = createAccordion({
      idBase: 'accordion-hidden',
      sections: [{id: 'a'}, {id: 'b'}],
      initialExpandedIds: ['a'],
    })

    expect(accordion.contracts.getPanelProps('a').hidden).toBe(false)
    expect(accordion.contracts.getPanelProps('b').hidden).toBe(true)
  })

  it('allowZeroExpanded false with allowMultiple true prevents collapsing the last expanded', () => {
    const accordion = createAccordion({
      idBase: 'accordion-multi-nonzero',
      sections: [{id: 'a'}, {id: 'b'}],
      allowMultiple: true,
      allowZeroExpanded: false,
      initialExpandedIds: ['a', 'b'],
    })

    accordion.actions.collapse('a')
    expect([...accordion.state.expandedIds()]).toEqual(['b'])

    accordion.actions.collapse('b')
    expect([...accordion.state.expandedIds()]).toEqual(['b'])
  })

  it('toggle via keyboard does not act on disabled sections (disabled never receives focus)', () => {
    const accordion = createAccordion({
      idBase: 'accordion-kb-disabled',
      sections: [{id: 'a'}, {id: 'b', disabled: true}, {id: 'c'}],
    })

    expect(accordion.state.focusedId()).toBe('a')
    accordion.actions.handleKeyDown({key: 'ArrowDown'})
    expect(accordion.state.focusedId()).toBe('c')

    accordion.actions.handleKeyDown({key: 'Enter'})
    expect(accordion.state.expandedIds().has('c')).toBe(true)

    expect(accordion.state.expandedIds().has('b')).toBe(false)
  })

  // --- Computed state ---

  it('exposes value as the first expanded section id', () => {
    const accordion = createAccordion({
      idBase: 'accordion-value',
      sections: [{id: 'a'}, {id: 'b'}],
      initialExpandedIds: ['a'],
    })

    expect(accordion.state.value()).toBe('a')

    accordion.actions.toggle('a')
    expect(accordion.state.value()).toBe(null)

    accordion.actions.expand('b')
    expect(accordion.state.value()).toBe('b')
  })

  it('exposes expandedValues as array of expanded section ids', () => {
    const accordion = createAccordion({
      idBase: 'accordion-expanded-values',
      sections: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      allowMultiple: true,
      initialExpandedIds: ['a', 'c'],
    })

    expect(accordion.state.expandedValues()).toEqual(['a', 'c'])

    accordion.actions.expand('b')
    expect(accordion.state.expandedValues()).toEqual(['a', 'c', 'b'])

    accordion.actions.collapse('a')
    expect(accordion.state.expandedValues()).toEqual(['c', 'b'])
  })

  // --- Reactive config ---

  it('setSections updates sections and removes stale expanded ids', () => {
    const accordion = createAccordion({
      idBase: 'accordion-set-sections',
      sections: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      allowMultiple: true,
      initialExpandedIds: ['a', 'c'],
    })

    expect([...accordion.state.expandedIds()]).toEqual(['a', 'c'])

    accordion.actions.setSections([{id: 'b'}, {id: 'c'}, {id: 'd'}])

    expect([...accordion.state.expandedIds()]).toEqual(['c'])
    expect(accordion.state.sections()).toEqual([{id: 'b'}, {id: 'c'}, {id: 'd'}])
  })

  it('setSections respects allowZeroExpanded after removing all expanded', () => {
    const accordion = createAccordion({
      idBase: 'accordion-set-sections-zero',
      sections: [{id: 'a'}, {id: 'b'}],
      allowZeroExpanded: false,
      initialExpandedIds: ['a'],
    })

    accordion.actions.setSections([{id: 'c'}, {id: 'd'}])

    expect(accordion.state.expandedIds().size).toBe(1)
    expect(accordion.state.expandedIds().has('c')).toBe(true)
  })

  it('setAllowMultiple false clamps expanded to first', () => {
    const accordion = createAccordion({
      idBase: 'accordion-set-allow-multi',
      sections: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      allowMultiple: true,
      initialExpandedIds: ['a', 'b', 'c'],
    })

    expect([...accordion.state.expandedIds()]).toEqual(['a', 'b', 'c'])

    accordion.actions.setAllowMultiple(false)

    expect(accordion.state.expandedIds().size).toBe(1)
    expect(accordion.state.expandedIds().has('a')).toBe(true)
  })

  it('setAllowZeroExpanded false expands first when none expanded', () => {
    const accordion = createAccordion({
      idBase: 'accordion-set-allow-zero',
      sections: [{id: 'a'}, {id: 'b'}],
      allowZeroExpanded: true,
    })

    expect(accordion.state.expandedIds().size).toBe(0)

    accordion.actions.setAllowZeroExpanded(false)

    expect(accordion.state.expandedIds().size).toBe(1)
    expect(accordion.state.expandedIds().has('a')).toBe(true)
  })

  it('setHeadingLevel clamps to 1-6 range', () => {
    const accordion = createAccordion({
      idBase: 'accordion-heading',
      sections: [{id: 'a'}],
    })

    expect(accordion.state.headingLevel()).toBe(3)

    accordion.actions.setHeadingLevel(1)
    expect(accordion.state.headingLevel()).toBe(1)

    accordion.actions.setHeadingLevel(6)
    expect(accordion.state.headingLevel()).toBe(6)

    accordion.actions.setHeadingLevel(0)
    expect(accordion.state.headingLevel()).toBe(1)

    accordion.actions.setHeadingLevel(9)
    expect(accordion.state.headingLevel()).toBe(6)
  })

  it('setAriaLabel updates reactive aria-label', () => {
    const accordion = createAccordion({
      idBase: 'accordion-aria',
      sections: [{id: 'a'}],
      ariaLabel: 'FAQ',
    })

    expect(accordion.contracts.getRootProps()['aria-label']).toBe('FAQ')

    accordion.actions.setAriaLabel('Help topics')
    expect(accordion.contracts.getRootProps()['aria-label']).toBe('Help topics')

    accordion.actions.setAriaLabel(undefined)
    expect(accordion.contracts.getRootProps()['aria-label']).toBeUndefined()
  })

  it('setExpandedIds programmatically sets expanded sections', () => {
    const accordion = createAccordion({
      idBase: 'accordion-set-expanded',
      sections: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      allowMultiple: true,
    })

    accordion.actions.setExpandedIds(['b', 'c'])
    expect([...accordion.state.expandedIds()]).toEqual(['b', 'c'])

    accordion.actions.setExpandedIds([])
    expect(accordion.state.expandedIds().size).toBe(0)
  })

  it('setExpandedIds respects allowMultiple false', () => {
    const accordion = createAccordion({
      idBase: 'accordion-set-expanded-single',
      sections: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      allowMultiple: false,
    })

    accordion.actions.setExpandedIds(['b', 'c'])
    expect([...accordion.state.expandedIds()]).toEqual(['b'])
  })

  it('setExpandedIds respects allowZeroExpanded false', () => {
    const accordion = createAccordion({
      idBase: 'accordion-set-expanded-nonzero',
      sections: [{id: 'a'}, {id: 'b'}],
      allowZeroExpanded: false,
      initialExpandedIds: ['a'],
    })

    accordion.actions.setExpandedIds([])
    expect(accordion.state.expandedIds().size).toBe(1)
    expect(accordion.state.expandedIds().has('a')).toBe(true)
  })

  it('setExpandedIds ignores unknown section ids', () => {
    const accordion = createAccordion({
      idBase: 'accordion-set-expanded-unknown',
      sections: [{id: 'a'}, {id: 'b'}],
      allowMultiple: true,
    })

    accordion.actions.setExpandedIds(['a', 'unknown', 'b'])
    expect([...accordion.state.expandedIds()]).toEqual(['a', 'b'])
  })

  it('reactive config atoms are readable from state', () => {
    const accordion = createAccordion({
      idBase: 'accordion-state-atoms',
      sections: [{id: 'a'}, {id: 'b'}],
      allowMultiple: true,
      allowZeroExpanded: false,
      headingLevel: 2,
      ariaLabel: 'Test',
    })

    expect(accordion.state.allowMultiple()).toBe(true)
    expect(accordion.state.allowZeroExpanded()).toBe(false)
    expect(accordion.state.headingLevel()).toBe(2)
    expect(accordion.state.ariaLabel()).toBe('Test')
    expect(accordion.state.sections()).toEqual([{id: 'a'}, {id: 'b'}])
  })

  it('expand after setAllowMultiple true allows multiple', () => {
    const accordion = createAccordion({
      idBase: 'accordion-toggle-multi',
      sections: [{id: 'a'}, {id: 'b'}],
      allowMultiple: false,
      initialExpandedIds: ['a'],
    })

    accordion.actions.setAllowMultiple(true)
    accordion.actions.expand('b')

    expect([...accordion.state.expandedIds()]).toEqual(['a', 'b'])
  })
})
