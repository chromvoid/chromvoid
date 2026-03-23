import {describe, expect, it} from 'vitest'
import {createOverlayFocus, mapOverlayDismissIntent, shouldTrapOverlayFocus} from './overlay-focus'

describe('overlay-focus primitives', () => {
  it('maps escape to dismiss intent', () => {
    expect(mapOverlayDismissIntent({key: 'Escape'})).toBe('escape')
    expect(mapOverlayDismissIntent({key: 'Enter'})).toBeNull()
  })

  it('computes trap state from open and trap configuration', () => {
    expect(shouldTrapOverlayFocus(true, true)).toBe(true)
    expect(shouldTrapOverlayFocus(true, false)).toBe(false)
    expect(shouldTrapOverlayFocus(false, true)).toBe(false)
  })

  it('tracks trap lifecycle and restore target', () => {
    const model = createOverlayFocus({
      idBase: 'overlay-restore',
      trapFocus: true,
      restoreFocus: true,
      initialTriggerId: 'open-btn',
    })

    model.actions.open('keyboard')
    expect(model.state.isOpen()).toBe(true)
    expect(model.state.isFocusTrapped()).toBe(true)

    model.actions.close('programmatic')
    expect(model.state.isOpen()).toBe(false)
    expect(model.state.restoreTargetId()).toBe('open-btn')

    model.actions.restore()
    expect(model.state.restoreTargetId()).toBeNull()
  })

  it('dismisses on escape and stores intent', () => {
    const model = createOverlayFocus({
      idBase: 'overlay-escape',
      initialTriggerId: 'trigger-id',
    })

    model.actions.open('keyboard')
    model.actions.handleKeyDown({key: 'Escape'})

    expect(model.state.isOpen()).toBe(false)
    expect(model.state.lastDismissIntent()).toBe('escape')
    expect(model.state.restoreTargetId()).toBe('trigger-id')
  })

  it('dismisses on outside pointer and outside focus intents', () => {
    const model = createOverlayFocus({
      idBase: 'overlay-outside',
      initialTriggerId: 'trigger-id',
    })

    model.actions.open('pointer')
    model.actions.handleOutsidePointer()

    expect(model.state.lastDismissIntent()).toBe('outside-pointer')
    expect(model.state.isOpen()).toBe(false)

    model.actions.open('keyboard')
    model.actions.handleOutsideFocus()

    expect(model.state.lastDismissIntent()).toBe('outside-focus')
    expect(model.state.isOpen()).toBe(false)
  })
})
