import {action, atom, type Atom} from '@reatom/core'
import {
  createCombobox,
  type ComboboxInputProps,
  type ComboboxListboxProps,
  type ComboboxOption,
  type ComboboxOptionProps,
} from '../combobox'

export interface CommandPaletteKeyboardEventLike {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

export interface CreateCommandPaletteOptions {
  commands: readonly ComboboxOption[]
  idBase?: string
  ariaLabel?: string
  initialOpen?: boolean
  openShortcutKey?: string
  closeOnExecute?: boolean
  closeOnOutsidePointer?: boolean
  onExecute?: (commandId: string) => void
}

export interface CommandPaletteState {
  isOpen: Atom<boolean>
  inputValue: Atom<string>
  activeId: Atom<string | null>
  selectedId: Atom<string | null>
  lastExecutedId: Atom<string | null>
  restoreTargetId: Atom<string | null>
}

export interface CommandPaletteActions {
  open(): void
  close(): void
  toggle(): void
  execute(id: string): void
  setInputValue(value: string): void
  handleGlobalKeyDown(event: CommandPaletteKeyboardEventLike): void
  handlePaletteKeyDown(event: CommandPaletteKeyboardEventLike): void
  handleOutsidePointer(): void
}

export interface CommandPaletteTriggerProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-haspopup': 'dialog'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string
  onClick: () => void
}

export interface CommandPaletteDialogProps {
  id: string
  role: 'dialog'
  tabindex: '-1'
  hidden: boolean
  'aria-modal': 'true'
  'aria-label'?: string
  onKeyDown: (event: CommandPaletteKeyboardEventLike) => void
  onPointerDownOutside: () => void
}

export interface CommandPaletteOptionProps extends ComboboxOptionProps {
  onClick: () => void
}

export interface CommandPaletteContracts {
  getTriggerProps(): CommandPaletteTriggerProps
  getDialogProps(): CommandPaletteDialogProps
  getInputProps(): ComboboxInputProps
  getListboxProps(): ComboboxListboxProps
  getOptionProps(id: string): CommandPaletteOptionProps
  getVisibleCommands(): readonly ComboboxOption[]
}

export interface CommandPaletteModel {
  readonly state: CommandPaletteState
  readonly actions: CommandPaletteActions
  readonly contracts: CommandPaletteContracts
}

export function createCommandPalette(options: CreateCommandPaletteOptions): CommandPaletteModel {
  const idBase = options.idBase ?? 'command-palette'
  const openShortcutKey = options.openShortcutKey ?? 'k'
  const closeOnExecute = options.closeOnExecute ?? true
  const commandIds = new Set(options.commands.map((command) => command.id))
  const lastExecutedIdAtom = atom<string | null>(null, `${idBase}.lastExecutedId`)
  const restoreTargetIdAtom = atom<string | null>(null, `${idBase}.restoreTargetId`)

  const combobox = createCombobox({
    idBase: `${idBase}.combobox`,
    options: options.commands,
    ariaLabel: options.ariaLabel,
    initialOpen: options.initialOpen ?? false,
  })

  const open = action(() => {
    combobox.actions.open()
    restoreTargetIdAtom.set(null)
  }, `${idBase}.open`)

  const close = action(() => {
    combobox.actions.close()
    restoreTargetIdAtom.set(`${idBase}-trigger`)
  }, `${idBase}.close`)

  const toggle = action(() => {
    if (combobox.state.isOpen()) {
      close()
      return
    }
    open()
  }, `${idBase}.toggle`)

  const execute = action((id: string) => {
    if (!commandIds.has(id)) return

    // Avoid combobox.actions.select() — it closes popup and resets inputValue.
    combobox.state.selectedId.set(id)
    combobox.state.activeId.set(id)
    lastExecutedIdAtom.set(id)
    options.onExecute?.(id)

    if (closeOnExecute) {
      close()
    }
  }, `${idBase}.execute`)

  const setInputValue = action((value: string) => {
    combobox.actions.setInputValue(value)
  }, `${idBase}.setInputValue`)

  const handleGlobalKeyDown = action((event: CommandPaletteKeyboardEventLike) => {
    const isShortcut =
      (event.ctrlKey === true || event.metaKey === true) && event.key.toLowerCase() === openShortcutKey
    if (isShortcut) {
      toggle()
    }
  }, `${idBase}.handleGlobalKeyDown`)

  const handlePaletteKeyDown = action((event: CommandPaletteKeyboardEventLike) => {
    if (!combobox.state.isOpen()) return

    if (event.key === 'Escape') {
      close()
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      const activeId =
        combobox.state.activeId() ??
        combobox.contracts.getFlatVisibleOptions().find((option) => !option.disabled)?.id ??
        null
      if (activeId != null) {
        execute(activeId)
      }
      return
    }

    combobox.actions.handleKeyDown({
      key: event.key,
      shiftKey: event.shiftKey ?? false,
      ctrlKey: event.ctrlKey ?? false,
      metaKey: event.metaKey ?? false,
      altKey: event.altKey ?? false,
    })
  }, `${idBase}.handlePaletteKeyDown`)

  const handleOutsidePointer = action(() => {
    if (options.closeOnOutsidePointer === false) return
    close()
  }, `${idBase}.handleOutsidePointer`)

  const actions: CommandPaletteActions = {
    open,
    close,
    toggle,
    execute,
    setInputValue,
    handleGlobalKeyDown,
    handlePaletteKeyDown,
    handleOutsidePointer,
  }

  const contracts: CommandPaletteContracts = {
    getTriggerProps() {
      return {
        id: `${idBase}-trigger`,
        role: 'button',
        tabindex: '0',
        'aria-haspopup': 'dialog',
        'aria-expanded': combobox.state.isOpen() ? 'true' : 'false',
        'aria-controls': `${idBase}-dialog`,
        onClick: toggle,
      }
    },
    getDialogProps() {
      return {
        id: `${idBase}-dialog`,
        role: 'dialog',
        tabindex: '-1',
        hidden: !combobox.state.isOpen(),
        'aria-modal': 'true',
        'aria-label': options.ariaLabel,
        onKeyDown: handlePaletteKeyDown,
        onPointerDownOutside: handleOutsidePointer,
      }
    },
    getInputProps() {
      return combobox.contracts.getInputProps()
    },
    getListboxProps() {
      return combobox.contracts.getListboxProps()
    },
    getOptionProps(id: string) {
      const optionProps = combobox.contracts.getOptionProps(id)
      return {
        ...optionProps,
        onClick: () => execute(id),
      }
    },
    getVisibleCommands() {
      return combobox.contracts.getVisibleOptions()
    },
  }

  const state: CommandPaletteState = {
    isOpen: combobox.state.isOpen,
    inputValue: combobox.state.inputValue,
    activeId: combobox.state.activeId,
    selectedId: combobox.state.selectedId,
    lastExecutedId: lastExecutedIdAtom,
    restoreTargetId: restoreTargetIdAtom,
  }

  if (options.initialOpen) {
    open()
  }

  return {
    state,
    actions,
    contracts,
  }
}
