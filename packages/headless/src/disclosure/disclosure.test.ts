import {describe, expect, it, vi} from 'vitest'
import {createDisclosure} from './index'

describe('createDisclosure', () => {
  it('initializes in open and closed states', () => {
    const opened = createDisclosure({
      idBase: 'disclosure-opened',
      isOpen: true,
    })
    const closed = createDisclosure({
      idBase: 'disclosure-closed',
      isOpen: false,
    })

    expect(opened.state.isOpen()).toBe(true)
    expect(closed.state.isOpen()).toBe(false)
  })

  it('toggles state via toggle action', () => {
    const model = createDisclosure({
      idBase: 'disclosure-toggle',
      isOpen: false,
    })

    model.actions.toggle()
    expect(model.state.isOpen()).toBe(true)

    model.actions.toggle()
    expect(model.state.isOpen()).toBe(false)
  })

  it('toggles via Enter and Space keys', () => {
    const model = createDisclosure({
      idBase: 'disclosure-keyboard',
      isOpen: false,
    })

    model.actions.handleKeyDown({key: 'Enter'})
    expect(model.state.isOpen()).toBe(true)

    model.actions.handleKeyDown({key: ' '})
    expect(model.state.isOpen()).toBe(false)
  })

  it('keeps aria-expanded and controls linkage in sync', () => {
    const model = createDisclosure({
      idBase: 'disclosure-a11y',
      isOpen: false,
    })

    const triggerClosed = model.contracts.getTriggerProps()
    const panelClosed = model.contracts.getPanelProps()

    expect(triggerClosed['aria-expanded']).toBe('false')
    expect(triggerClosed['aria-controls']).toBe(panelClosed.id)

    model.actions.open()

    const triggerOpen = model.contracts.getTriggerProps()
    const panelOpen = model.contracts.getPanelProps()

    expect(triggerOpen['aria-expanded']).toBe('true')
    expect(triggerOpen['aria-controls']).toBe(panelOpen.id)
    expect(panelOpen.hidden).toBe(false)
  })

  it('does not toggle when disabled', () => {
    const onOpenChange = vi.fn()
    const model = createDisclosure({
      idBase: 'disclosure-disabled',
      isOpen: false,
      isDisabled: true,
      onOpenChange,
    })

    model.actions.toggle()
    model.actions.handleKeyDown({key: 'Enter'})
    model.actions.handleClick()

    expect(model.state.isOpen()).toBe(false)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(model.contracts.getTriggerProps()).toMatchObject({
      tabindex: '-1',
      'aria-disabled': 'true',
    })
  })

  it('opens and closes via open/close actions', () => {
    const model = createDisclosure({
      idBase: 'disclosure-open-close',
      isOpen: false,
    })

    model.actions.open()
    expect(model.state.isOpen()).toBe(true)

    model.actions.open()
    expect(model.state.isOpen()).toBe(true)

    model.actions.close()
    expect(model.state.isOpen()).toBe(false)

    model.actions.close()
    expect(model.state.isOpen()).toBe(false)
  })

  it('calls onOpenChange callback on state change', () => {
    const onOpenChange = vi.fn()
    const model = createDisclosure({
      idBase: 'disclosure-callback',
      isOpen: false,
      onOpenChange,
    })

    model.actions.toggle()
    expect(onOpenChange).toHaveBeenCalledWith(true)

    model.actions.toggle()
    expect(onOpenChange).toHaveBeenCalledWith(false)

    expect(onOpenChange).toHaveBeenCalledTimes(2)
  })

  it('does not toggle on non-activation keys', () => {
    const model = createDisclosure({
      idBase: 'disclosure-nonkeys',
      isOpen: false,
    })

    model.actions.handleKeyDown({key: 'Tab'})
    model.actions.handleKeyDown({key: 'Escape'})
    model.actions.handleKeyDown({key: 'a'})

    expect(model.state.isOpen()).toBe(false)
  })

  it('calls preventDefault on Enter and Space', () => {
    const model = createDisclosure({
      idBase: 'disclosure-prevent',
      isOpen: false,
    })

    const preventDefault = vi.fn()

    model.actions.handleKeyDown({key: 'Enter', preventDefault})
    expect(preventDefault).toHaveBeenCalledTimes(1)

    model.actions.handleKeyDown({key: ' ', preventDefault})
    expect(preventDefault).toHaveBeenCalledTimes(2)
  })

  it('does not call preventDefault on non-activation keys', () => {
    const model = createDisclosure({
      idBase: 'disclosure-no-prevent',
      isOpen: false,
    })

    const preventDefault = vi.fn()

    model.actions.handleKeyDown({key: 'Tab', preventDefault})
    model.actions.handleKeyDown({key: 'Escape', preventDefault})

    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('does not call preventDefault on Space/Enter when disabled', () => {
    const model = createDisclosure({
      idBase: 'disclosure-disabled-prevent',
      isOpen: false,
      isDisabled: true,
    })

    const preventDefault = vi.fn()

    model.actions.handleKeyDown({key: 'Enter', preventDefault})
    model.actions.handleKeyDown({key: ' ', preventDefault})

    expect(model.state.isOpen()).toBe(false)
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('panel hidden attribute reflects isOpen state', () => {
    const model = createDisclosure({
      idBase: 'disclosure-hidden',
      isOpen: false,
    })

    expect(model.contracts.getPanelProps().hidden).toBe(true)

    model.actions.open()
    expect(model.contracts.getPanelProps().hidden).toBe(false)

    model.actions.close()
    expect(model.contracts.getPanelProps().hidden).toBe(true)
  })

  // --- Arrow key tests ---

  it('ArrowDown opens a closed disclosure', () => {
    const model = createDisclosure({isOpen: false})
    const preventDefault = vi.fn()

    model.actions.handleKeyDown({key: 'ArrowDown', preventDefault})

    expect(model.state.isOpen()).toBe(true)
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('ArrowRight opens a closed disclosure', () => {
    const model = createDisclosure({isOpen: false})
    const preventDefault = vi.fn()

    model.actions.handleKeyDown({key: 'ArrowRight', preventDefault})

    expect(model.state.isOpen()).toBe(true)
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('ArrowUp closes an open disclosure', () => {
    const model = createDisclosure({isOpen: true})
    const preventDefault = vi.fn()

    model.actions.handleKeyDown({key: 'ArrowUp', preventDefault})

    expect(model.state.isOpen()).toBe(false)
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('ArrowLeft closes an open disclosure', () => {
    const model = createDisclosure({isOpen: true})
    const preventDefault = vi.fn()

    model.actions.handleKeyDown({key: 'ArrowLeft', preventDefault})

    expect(model.state.isOpen()).toBe(false)
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('ArrowDown/ArrowRight are no-ops on already open disclosure', () => {
    const onOpenChange = vi.fn()
    const model = createDisclosure({isOpen: true, onOpenChange})
    const preventDefault = vi.fn()

    model.actions.handleKeyDown({key: 'ArrowDown', preventDefault})
    model.actions.handleKeyDown({key: 'ArrowRight', preventDefault})

    expect(model.state.isOpen()).toBe(true)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalledTimes(2)
  })

  it('ArrowUp/ArrowLeft are no-ops on already closed disclosure', () => {
    const onOpenChange = vi.fn()
    const model = createDisclosure({isOpen: false, onOpenChange})
    const preventDefault = vi.fn()

    model.actions.handleKeyDown({key: 'ArrowUp', preventDefault})
    model.actions.handleKeyDown({key: 'ArrowLeft', preventDefault})

    expect(model.state.isOpen()).toBe(false)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalledTimes(2)
  })

  it('arrow keys are no-ops when disabled (no preventDefault)', () => {
    const model = createDisclosure({isOpen: false, isDisabled: true})
    const preventDefault = vi.fn()

    model.actions.handleKeyDown({key: 'ArrowDown', preventDefault})
    model.actions.handleKeyDown({key: 'ArrowRight', preventDefault})
    model.actions.handleKeyDown({key: 'ArrowUp', preventDefault})
    model.actions.handleKeyDown({key: 'ArrowLeft', preventDefault})

    expect(model.state.isOpen()).toBe(false)
    expect(preventDefault).not.toHaveBeenCalled()
  })

  // --- Name-based grouping tests ---

  it('name state signal reflects the provided name option', () => {
    const named = createDisclosure({name: 'group-a'})
    const unnamed = createDisclosure({})

    expect(named.state.name()).toBe('group-a')
    expect(unnamed.state.name()).toBe(null)
  })

  it('opening one named disclosure closes others with same name', () => {
    const a = createDisclosure({name: 'grp', idBase: 'a', isOpen: false})
    const b = createDisclosure({name: 'grp', idBase: 'b', isOpen: false})
    const c = createDisclosure({name: 'grp', idBase: 'c', isOpen: false})

    a.actions.open()
    expect(a.state.isOpen()).toBe(true)
    expect(b.state.isOpen()).toBe(false)
    expect(c.state.isOpen()).toBe(false)

    b.actions.open()
    expect(a.state.isOpen()).toBe(false)
    expect(b.state.isOpen()).toBe(true)
    expect(c.state.isOpen()).toBe(false)

    // cleanup
    a.actions.destroy()
    b.actions.destroy()
    c.actions.destroy()
  })

  it('disclosures with different names do not affect each other', () => {
    const a = createDisclosure({name: 'x', idBase: 'a', isOpen: false})
    const b = createDisclosure({name: 'y', idBase: 'b', isOpen: false})

    a.actions.open()
    b.actions.open()

    expect(a.state.isOpen()).toBe(true)
    expect(b.state.isOpen()).toBe(true)

    a.actions.destroy()
    b.actions.destroy()
  })

  it('unnamed disclosures are independent of named groups', () => {
    const named = createDisclosure({name: 'g', idBase: 'named', isOpen: true})
    const unnamed = createDisclosure({idBase: 'unnamed', isOpen: true})

    named.actions.close()
    named.actions.open()

    expect(unnamed.state.isOpen()).toBe(true)

    named.actions.destroy()
  })

  it('closing a named disclosure does not open others in the group', () => {
    const a = createDisclosure({name: 'grp2', idBase: 'a', isOpen: true})
    const b = createDisclosure({name: 'grp2', idBase: 'b', isOpen: false})

    a.actions.close()
    expect(a.state.isOpen()).toBe(false)
    expect(b.state.isOpen()).toBe(false)

    a.actions.destroy()
    b.actions.destroy()
  })

  it('destroy removes from registry — opening should not close destroyed instance', () => {
    const a = createDisclosure({name: 'grp3', idBase: 'a', isOpen: true})
    const b = createDisclosure({name: 'grp3', idBase: 'b', isOpen: false})

    a.actions.destroy()

    b.actions.open()
    expect(b.state.isOpen()).toBe(true)
    // a was destroyed, so it should not have been closed by b opening
    expect(a.state.isOpen()).toBe(true)

    b.actions.destroy()
  })

  it('setName re-registers in new group', () => {
    const a = createDisclosure({name: 'old', idBase: 'a', isOpen: false})
    const b = createDisclosure({name: 'old', idBase: 'b', isOpen: false})
    const c = createDisclosure({name: 'new', idBase: 'c', isOpen: false})

    // a and b are in 'old' group, c is in 'new' group
    a.actions.open()
    expect(b.state.isOpen()).toBe(false)

    // Move a to 'new' group
    a.actions.setName('new')
    expect(a.state.name()).toBe('new')

    // Now opening c should close a (same group 'new')
    c.actions.open()
    expect(a.state.isOpen()).toBe(false)
    expect(c.state.isOpen()).toBe(true)

    // And b should be unaffected (alone in 'old' group)
    b.actions.open()
    expect(b.state.isOpen()).toBe(true)
    expect(c.state.isOpen()).toBe(true)

    a.actions.destroy()
    b.actions.destroy()
    c.actions.destroy()
  })

  it('toggle on named disclosure triggers group exclusivity', () => {
    const a = createDisclosure({name: 'tgrp', idBase: 'a', isOpen: true})
    const b = createDisclosure({name: 'tgrp', idBase: 'b', isOpen: false})

    b.actions.toggle()
    expect(b.state.isOpen()).toBe(true)
    expect(a.state.isOpen()).toBe(false)

    a.actions.destroy()
    b.actions.destroy()
  })

  it('handleClick on named disclosure triggers group exclusivity', () => {
    const a = createDisclosure({name: 'cgrp', idBase: 'a', isOpen: true})
    const b = createDisclosure({name: 'cgrp', idBase: 'b', isOpen: false})

    b.actions.handleClick()
    expect(b.state.isOpen()).toBe(true)
    expect(a.state.isOpen()).toBe(false)

    a.actions.destroy()
    b.actions.destroy()
  })

  it('handleKeyDown arrow on named disclosure triggers group exclusivity', () => {
    const a = createDisclosure({name: 'kgrp', idBase: 'a', isOpen: true})
    const b = createDisclosure({name: 'kgrp', idBase: 'b', isOpen: false})

    b.actions.handleKeyDown({key: 'ArrowDown'})
    expect(b.state.isOpen()).toBe(true)
    expect(a.state.isOpen()).toBe(false)

    a.actions.destroy()
    b.actions.destroy()
  })

  it('setName to null removes from group', () => {
    const a = createDisclosure({name: 'rmgrp', idBase: 'a', isOpen: false})
    const b = createDisclosure({name: 'rmgrp', idBase: 'b', isOpen: false})

    a.actions.setName(null)
    expect(a.state.name()).toBe(null)

    // Now opening b should not affect a since a has no name
    b.actions.open()
    a.actions.open()
    expect(a.state.isOpen()).toBe(true)
    expect(b.state.isOpen()).toBe(true)

    a.actions.destroy()
    b.actions.destroy()
  })
})
