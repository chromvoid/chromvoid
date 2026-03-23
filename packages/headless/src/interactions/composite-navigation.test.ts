import {describe, expect, it} from 'vitest'
import {
  createCompositeNavigation,
  getNextCompositeIndex,
  mapCompositeNavigationIntent,
} from './composite-navigation'

describe('composite-navigation primitives', () => {
  it('resolves next index using wrap mode', () => {
    expect(getNextCompositeIndex(2, 1, 3, 'wrap')).toBe(0)
    expect(getNextCompositeIndex(0, -1, 3, 'wrap')).toBe(2)
  })

  it('resolves next index using clamp mode', () => {
    expect(getNextCompositeIndex(2, 1, 3, 'clamp')).toBe(2)
    expect(getNextCompositeIndex(0, -1, 3, 'clamp')).toBe(0)
  })

  it('maps intents deterministically by orientation', () => {
    expect(
      mapCompositeNavigationIntent(
        {key: 'ArrowDown', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false},
        {orientation: 'vertical'},
      ),
    ).toBe('NAV_NEXT')

    expect(
      mapCompositeNavigationIntent(
        {key: 'ArrowRight', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false},
        {orientation: 'horizontal'},
      ),
    ).toBe('NAV_NEXT')

    expect(
      mapCompositeNavigationIntent(
        {key: 'Home', shiftKey: false, ctrlKey: true, metaKey: false, altKey: false},
        {orientation: 'vertical'},
      ),
    ).toBeNull()
  })

  it('skips disabled items during navigation', () => {
    const model = createCompositeNavigation({
      idBase: 'cn-skip',
      orientation: 'horizontal',
      items: [{id: 'a'}, {id: 'b', disabled: true}, {id: 'c'}],
    })

    expect(model.state.activeId()).toBe('a')
    model.actions.moveNext()
    expect(model.state.activeId()).toBe('c')
    model.actions.movePrev()
    expect(model.state.activeId()).toBe('a')
  })

  it('uses wrap policy when moving with keyboard intents', () => {
    const model = createCompositeNavigation({
      idBase: 'cn-wrap',
      orientation: 'vertical',
      wrapMode: 'wrap',
      items: [{id: 'a'}, {id: 'b'}, {id: 'c'}],
      initialActiveId: 'c',
    })

    model.actions.handleKeyDown({
      key: 'ArrowDown',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    })

    expect(model.state.activeId()).toBe('a')
  })

  it('exposes deterministic focus props for roving and active-descendant strategies', () => {
    const roving = createCompositeNavigation({
      idBase: 'cn-roving',
      focusStrategy: 'roving-tabindex',
      items: [{id: 'a'}, {id: 'b'}],
      initialActiveId: 'b',
    })

    expect(roving.contracts.getContainerFocusProps()).toEqual({
      tabindex: '-1',
      'aria-activedescendant': undefined,
    })
    expect(roving.contracts.getItemFocusProps('a').tabindex).toBe('-1')
    expect(roving.contracts.getItemFocusProps('b').tabindex).toBe('0')

    const activeDescendant = createCompositeNavigation({
      idBase: 'cn-ad',
      focusStrategy: 'aria-activedescendant',
      items: [{id: 'x'}, {id: 'y'}],
      initialActiveId: 'y',
    })

    expect(activeDescendant.contracts.getContainerFocusProps()).toEqual({
      tabindex: '0',
      'aria-activedescendant': 'cn-ad-item-y',
    })
    expect(activeDescendant.contracts.getItemFocusProps('y').tabindex).toBe('-1')
  })
})
