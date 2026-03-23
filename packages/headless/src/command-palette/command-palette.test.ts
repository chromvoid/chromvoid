import {describe, expect, it} from 'vitest'
import {expectAriaLinkage, expectRoleAndAria} from '../testing/apg-contract-harness'
import {createCommandPalette} from './index'

describe('createCommandPalette', () => {
  // === Global Shortcut Toggle ===

  it('toggles on Cmd/Ctrl+K global shortcut', () => {
    const model = createCommandPalette({
      idBase: 'palette-shortcut',
      commands: [{id: 'open', label: 'Open file'}],
    })

    model.actions.handleGlobalKeyDown({key: 'k', metaKey: true})
    expect(model.state.isOpen()).toBe(true)

    model.actions.handleGlobalKeyDown({key: 'k', ctrlKey: true})
    expect(model.state.isOpen()).toBe(false)
  })

  it('uses custom openShortcutKey', () => {
    const model = createCommandPalette({
      idBase: 'palette-custom-key',
      commands: [{id: 'cmd1', label: 'Command'}],
      openShortcutKey: 'p',
    })

    // default 'k' should not toggle
    model.actions.handleGlobalKeyDown({key: 'k', metaKey: true})
    expect(model.state.isOpen()).toBe(false)

    // custom 'p' should toggle
    model.actions.handleGlobalKeyDown({key: 'p', metaKey: true})
    expect(model.state.isOpen()).toBe(true)
  })

  it('ignores global shortcut without modifier key', () => {
    const model = createCommandPalette({
      idBase: 'palette-no-mod',
      commands: [{id: 'cmd1', label: 'Command'}],
    })

    model.actions.handleGlobalKeyDown({key: 'k'})
    expect(model.state.isOpen()).toBe(false)
  })

  // === Dialog Role + Escape Close ===

  it('exposes dialog contract and closes on Escape', () => {
    const model = createCommandPalette({
      idBase: 'palette-contracts',
      commands: [{id: 'open', label: 'Open file'}],
      ariaLabel: 'Command palette',
      initialOpen: true,
    })

    expectRoleAndAria(model.contracts.getDialogProps(), 'dialog', {
      'aria-modal': 'true',
      'aria-label': 'Command palette',
    })

    model.actions.handlePaletteKeyDown({key: 'Escape'})
    expect(model.state.isOpen()).toBe(false)
  })

  // === Trigger Contract ===

  it('exposes trigger props with correct role and aria attributes', () => {
    const model = createCommandPalette({
      idBase: 'palette-trigger',
      commands: [{id: 'cmd1', label: 'Command'}],
    })

    const triggerProps = model.contracts.getTriggerProps()
    expectRoleAndAria(triggerProps, 'button', {
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
    })
    expect(triggerProps.tabindex).toBe('0')
    expect(triggerProps['aria-controls']).toBe('palette-trigger-dialog')

    // trigger onClick toggles open
    triggerProps.onClick()
    expect(model.state.isOpen()).toBe(true)

    const openTriggerProps = model.contracts.getTriggerProps()
    expect(openTriggerProps['aria-expanded']).toBe('true')
  })

  it('trigger aria-controls links to dialog id', () => {
    const model = createCommandPalette({
      idBase: 'palette-link',
      commands: [{id: 'cmd1', label: 'Command'}],
    })

    expectAriaLinkage(
      model.contracts.getTriggerProps(),
      'aria-controls',
      model.contracts.getDialogProps(),
      'id',
    )
  })

  // === aria-expanded and hidden synchronized with isOpen ===

  it('dialog aria-expanded equivalent (hidden) and trigger aria-expanded stay synced with isOpen', () => {
    const model = createCommandPalette({
      idBase: 'palette-sync',
      commands: [{id: 'cmd1', label: 'Command'}],
    })

    // Initially closed
    expect(model.state.isOpen()).toBe(false)
    expect(model.contracts.getDialogProps().hidden).toBe(true)
    expect(model.contracts.getTriggerProps()['aria-expanded']).toBe('false')

    // Open
    model.actions.open()
    expect(model.state.isOpen()).toBe(true)
    expect(model.contracts.getDialogProps().hidden).toBe(false)
    expect(model.contracts.getTriggerProps()['aria-expanded']).toBe('true')

    // Close
    model.actions.close()
    expect(model.state.isOpen()).toBe(false)
    expect(model.contracts.getDialogProps().hidden).toBe(true)
    expect(model.contracts.getTriggerProps()['aria-expanded']).toBe('false')
  })

  // === Execute on Enter ===

  it('executes active command on Enter', () => {
    const executed: string[] = []
    const model = createCommandPalette({
      idBase: 'palette-execute',
      commands: [
        {id: 'open', label: 'Open file'},
        {id: 'close', label: 'Close file'},
      ],
      onExecute: (id) => executed.push(id),
    })

    model.actions.open()
    model.actions.handlePaletteKeyDown({key: 'ArrowDown'})
    model.actions.handlePaletteKeyDown({key: 'Enter'})

    expect(model.state.lastExecutedId()).toBe('close')
    expect(executed).toEqual(['close'])
    expect(model.state.isOpen()).toBe(false)
  })

  it('Enter falls back to first enabled visible command when no activeId', () => {
    const executed: string[] = []
    const model = createCommandPalette({
      idBase: 'palette-fallback',
      commands: [
        {id: 'disabled-cmd', label: 'Disabled', disabled: true},
        {id: 'enabled-cmd', label: 'Enabled'},
      ],
      onExecute: (id) => executed.push(id),
      initialOpen: true,
    })

    // Force activeId to null to test fallback
    model.state.activeId.set(null)

    model.actions.handlePaletteKeyDown({key: 'Enter'})
    expect(executed).toEqual(['enabled-cmd'])
    expect(model.state.lastExecutedId()).toBe('enabled-cmd')
  })

  // === Execute on Space ===

  it('executes active command on Space key', () => {
    const executed: string[] = []
    const model = createCommandPalette({
      idBase: 'palette-space',
      commands: [{id: 'cmd1', label: 'Command'}],
      onExecute: (id) => executed.push(id),
      initialOpen: true,
    })

    model.actions.handlePaletteKeyDown({key: ' '})
    expect(executed).toEqual(['cmd1'])
    expect(model.state.lastExecutedId()).toBe('cmd1')
  })

  // === Keep-Open Execute Mode ===

  it('supports keep-open execute mode', () => {
    const model = createCommandPalette({
      idBase: 'palette-keep-open',
      commands: [{id: 'open', label: 'Open file'}],
      closeOnExecute: false,
      initialOpen: true,
    })

    model.actions.handlePaletteKeyDown({key: 'Enter'})
    expect(model.state.lastExecutedId()).toBe('open')
    expect(model.state.isOpen()).toBe(true)
  })

  // === Outside Pointer Close Policy ===

  it('closes on outside pointer by default', () => {
    const model = createCommandPalette({
      idBase: 'palette-outside-default',
      commands: [{id: 'cmd1', label: 'Command'}],
      initialOpen: true,
    })

    expect(model.state.isOpen()).toBe(true)
    model.actions.handleOutsidePointer()
    expect(model.state.isOpen()).toBe(false)
  })

  it('does not close on outside pointer when closeOnOutsidePointer=false', () => {
    const model = createCommandPalette({
      idBase: 'palette-outside-disabled',
      commands: [{id: 'cmd1', label: 'Command'}],
      closeOnOutsidePointer: false,
      initialOpen: true,
    })

    expect(model.state.isOpen()).toBe(true)
    model.actions.handleOutsidePointer()
    expect(model.state.isOpen()).toBe(true)
  })

  // === lastExecutedId Invariant ===

  it('lastExecutedId updates only for known command ids', () => {
    const executed: string[] = []
    const model = createCommandPalette({
      idBase: 'palette-unknown',
      commands: [{id: 'known', label: 'Known command'}],
      onExecute: (id) => executed.push(id),
      initialOpen: true,
    })

    // Execute with unknown id — should be ignored
    model.actions.execute('unknown-id')
    expect(model.state.lastExecutedId()).toBe(null)
    expect(executed).toEqual([])

    // Execute with known id — should update
    model.actions.execute('known')
    expect(model.state.lastExecutedId()).toBe('known')
    expect(executed).toEqual(['known'])
  })

  // === restoreTargetId Invariant ===

  it('restoreTargetId is set on close paths', () => {
    const model = createCommandPalette({
      idBase: 'palette-restore',
      commands: [{id: 'cmd1', label: 'Command'}],
    })

    // Open should clear restoreTargetId
    model.actions.open()
    expect(model.state.restoreTargetId()).toBe(null)

    // Close should set restoreTargetId to trigger id
    model.actions.close()
    expect(model.state.restoreTargetId()).toBe('palette-restore-trigger')
  })

  it('restoreTargetId is set on Escape close', () => {
    const model = createCommandPalette({
      idBase: 'palette-restore-esc',
      commands: [{id: 'cmd1', label: 'Command'}],
      initialOpen: true,
    })

    model.actions.handlePaletteKeyDown({key: 'Escape'})
    expect(model.state.restoreTargetId()).toBe('palette-restore-esc-trigger')
  })

  it('restoreTargetId is set on outside pointer close', () => {
    const model = createCommandPalette({
      idBase: 'palette-restore-outside',
      commands: [{id: 'cmd1', label: 'Command'}],
      initialOpen: true,
    })

    model.actions.handleOutsidePointer()
    expect(model.state.restoreTargetId()).toBe('palette-restore-outside-trigger')
  })

  it('restoreTargetId is set on execute-close', () => {
    const model = createCommandPalette({
      idBase: 'palette-restore-exec',
      commands: [{id: 'cmd1', label: 'Command'}],
      closeOnExecute: true,
      initialOpen: true,
    })

    model.actions.execute('cmd1')
    expect(model.state.restoreTargetId()).toBe('palette-restore-exec-trigger')
  })

  // === Option Click Contract ===

  it('option click executes via same flow as keyboard', () => {
    const executed: string[] = []
    const model = createCommandPalette({
      idBase: 'palette-click',
      commands: [
        {id: 'cmd1', label: 'Command 1'},
        {id: 'cmd2', label: 'Command 2'},
      ],
      onExecute: (id) => executed.push(id),
      initialOpen: true,
    })

    // Click on option via getOptionProps.onClick
    const optionProps = model.contracts.getOptionProps('cmd2')
    optionProps.onClick()

    expect(executed).toEqual(['cmd2'])
    expect(model.state.lastExecutedId()).toBe('cmd2')
    expect(model.state.isOpen()).toBe(false)
  })

  // === getVisibleCommands ===

  it('getVisibleCommands filters by inputValue', () => {
    const model = createCommandPalette({
      idBase: 'palette-filter',
      commands: [
        {id: 'open', label: 'Open file'},
        {id: 'close', label: 'Close file'},
        {id: 'save', label: 'Save file'},
      ],
      initialOpen: true,
    })

    // All visible initially
    expect(model.contracts.getVisibleCommands().map((c) => c.id)).toEqual([
      'open',
      'close',
      'save',
    ])

    // Filter by input
    model.actions.setInputValue('close')
    expect(model.contracts.getVisibleCommands().map((c) => c.id)).toEqual(['close'])

    // Clear filter shows all
    model.actions.setInputValue('')
    expect(model.contracts.getVisibleCommands().map((c) => c.id)).toEqual([
      'open',
      'close',
      'save',
    ])
  })

  // === Combobox delegation ===

  it('delegates arrow/home/end keyboard events to combobox', () => {
    const model = createCommandPalette({
      idBase: 'palette-nav',
      commands: [
        {id: 'a', label: 'Alpha'},
        {id: 'b', label: 'Beta'},
        {id: 'c', label: 'Charlie'},
      ],
      initialOpen: true,
    })

    // combobox.open() calls ensureActiveVisible → sets activeId to 'a'
    expect(model.state.activeId()).toBe('a')

    // ArrowDown → 'b'
    model.actions.handlePaletteKeyDown({key: 'ArrowDown'})
    expect(model.state.activeId()).toBe('b')

    // ArrowDown → 'c'
    model.actions.handlePaletteKeyDown({key: 'ArrowDown'})
    expect(model.state.activeId()).toBe('c')

    // Home → 'a'
    model.actions.handlePaletteKeyDown({key: 'Home'})
    expect(model.state.activeId()).toBe('a')

    // End → 'c'
    model.actions.handlePaletteKeyDown({key: 'End'})
    expect(model.state.activeId()).toBe('c')
  })

  // === handlePaletteKeyDown when closed is no-op ===

  it('handlePaletteKeyDown is no-op when palette is closed', () => {
    const executed: string[] = []
    const model = createCommandPalette({
      idBase: 'palette-closed',
      commands: [{id: 'cmd1', label: 'Command'}],
      onExecute: (id) => executed.push(id),
    })

    expect(model.state.isOpen()).toBe(false)
    model.actions.handlePaletteKeyDown({key: 'Enter'})
    expect(executed).toEqual([])
  })

  // === Input/Listbox contract delegation ===

  it('getInputProps and getListboxProps delegate to combobox', () => {
    const model = createCommandPalette({
      idBase: 'palette-delegate',
      commands: [{id: 'cmd1', label: 'Command'}],
      ariaLabel: 'Test palette',
    })

    const inputProps = model.contracts.getInputProps()
    expect(inputProps.role).toBe('combobox')
    expect(inputProps['aria-haspopup']).toBe('listbox')
    expect(inputProps['aria-label']).toBe('Test palette')

    const listboxProps = model.contracts.getListboxProps()
    expect(listboxProps.role).toBe('listbox')

    // Input aria-controls links to listbox id
    expectAriaLinkage(inputProps, 'aria-controls', listboxProps, 'id')
  })
})
