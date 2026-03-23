import {action, atom, computed, type Atom, type Computed} from '@reatom/core'
import {createListbox, type ListboxOption, type ListboxSelectionMode} from '../listbox'

export interface CreateSelectOptions {
  options: readonly ListboxOption[]
  idBase?: string
  ariaLabel?: string
  initialOpen?: boolean
  initialSelectedId?: string | null
  initialSelectedIds?: string[]
  selectionMode?: ListboxSelectionMode
  closeOnSelect?: boolean
  placeholder?: string
  disabled?: boolean
  required?: boolean
  onSelectedIdChange?: (selectedId: string | null) => void
}

export interface SelectState {
  isOpen: Atom<boolean>
  activeId: Atom<string | null>
  selectedIds: Atom<string[]>
  selectedId: Computed<string | null>
  selectedLabel: Computed<string | null>
  selectedLabels: Computed<string[]>
  restoreTargetId: Atom<string | null>
  disabled: Atom<boolean>
  required: Atom<boolean>
}

export interface SelectKeyboardEventLike {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

export interface SelectActions {
  open(): void
  close(): void
  toggle(): void
  select(id: string): void
  clear(): void
  setDisabled(value: boolean): void
  setRequired(value: boolean): void
  handleTriggerKeyDown(event: Pick<KeyboardEvent, 'key'>): void
  handleListboxKeyDown(event: SelectKeyboardEventLike): void
}

export interface SelectTriggerProps {
  id: string
  role: 'combobox'
  tabindex: '0'
  'aria-haspopup': 'listbox'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string
  'aria-activedescendant'?: string
  'aria-label'?: string
  'aria-disabled'?: 'true'
  'aria-required'?: 'true'
  'data-selected-id'?: string
  'data-selected-label'?: string
  onClick: () => void
  onKeyDown: (event: Pick<KeyboardEvent, 'key'>) => void
}

export interface SelectListboxProps {
  id: string
  role: 'listbox'
  tabindex: '0' | '-1'
  'aria-label'?: string
  'aria-activedescendant'?: string
  'aria-multiselectable'?: 'true'
  hidden: boolean
  onKeyDown: (event: SelectKeyboardEventLike) => void
}

export interface SelectOptionProps {
  id: string
  role: 'option'
  tabindex: '-1'
  'aria-selected': 'true' | 'false'
  'aria-disabled'?: 'true'
  'data-active': 'true' | 'false'
  onClick: () => void
}

export interface SelectContracts {
  getTriggerProps(): SelectTriggerProps
  getListboxProps(): SelectListboxProps
  getOptionProps(id: string): SelectOptionProps
  getValueText(): string
}

export interface SelectModel {
  readonly state: SelectState
  readonly actions: SelectActions
  readonly contracts: SelectContracts
}

const isSpaceKey = (key: string) => key === ' ' || key === 'Spacebar'

export function createSelect(options: CreateSelectOptions): SelectModel {
  const idBase = options.idBase ?? 'select'
  const closeOnSelect = options.closeOnSelect ?? true
  const selectionMode = options.selectionMode ?? 'single'
  const isMultiple = selectionMode === 'multiple'
  const optionById = new Map(options.options.map((option) => [option.id, option]))

  const listbox = createListbox({
    idBase: `${idBase}.listbox`,
    options: options.options,
    selectionMode,
    ariaLabel: options.ariaLabel,
    initialSelectedIds: options.initialSelectedIds
      ?? (options.initialSelectedId != null ? [options.initialSelectedId] : []),
  })

  const isOpenAtom = atom<boolean>(options.initialOpen ?? false, `${idBase}.isOpen`)
  const restoreTargetIdAtom = atom<string | null>(null, `${idBase}.restoreTargetId`)
  const disabledAtom = atom<boolean>(options.disabled ?? false, `${idBase}.disabled`)
  const requiredAtom = atom<boolean>(options.required ?? false, `${idBase}.required`)

  const selectedIdAtom = computed<string | null>(
    () => listbox.state.selectedIds()[0] ?? null,
    `${idBase}.selectedId`,
  )
  const selectedLabelAtom = computed<string | null>(() => {
    const selectedId = selectedIdAtom()
    if (selectedId == null) return null
    const option = optionById.get(selectedId)
    if (!option) return null
    return option.label ?? selectedId
  }, `${idBase}.selectedLabel`)

  const selectedLabelsAtom = computed<string[]>(() => {
    return listbox.state.selectedIds()
      .map(id => optionById.get(id))
      .filter((opt): opt is ListboxOption => opt != null)
      .map(opt => opt.label ?? opt.id)
  }, `${idBase}.selectedLabels`)

  const openWithFocus = (focus: 'selected' | 'first' | 'last') => {
    if (disabledAtom()) return

    isOpenAtom.set(true)
    listbox.actions.open()
    restoreTargetIdAtom.set(null)

    switch (focus) {
      case 'first':
        listbox.actions.moveFirst()
        return
      case 'last':
        listbox.actions.moveLast()
        return
      case 'selected': {
        const selectedId = selectedIdAtom()
        if (selectedId != null) {
          listbox.actions.setActive(selectedId)
          return
        }
        listbox.actions.moveFirst()
      }
    }
  }

  const open = action(() => {
    openWithFocus('selected')
  }, `${idBase}.open`)

  const close = action(() => {
    isOpenAtom.set(false)
    listbox.actions.close()
    restoreTargetIdAtom.set(`${idBase}-trigger`)
  }, `${idBase}.close`)

  const toggle = action(() => {
    if (disabledAtom()) return

    if (isOpenAtom()) {
      close()
      return
    }

    open()
  }, `${idBase}.toggle`)

  const select = action((id: string) => {
    if (disabledAtom()) return

    const previous = selectedIdAtom()

    if (isMultiple) {
      listbox.actions.toggleSelected(id)
    } else {
      listbox.actions.selectOnly(id)
    }

    const next = selectedIdAtom()
    if (previous !== next) {
      options.onSelectedIdChange?.(next)
    }

    if (closeOnSelect) {
      close()
    }
  }, `${idBase}.select`)

  const clear = action(() => {
    if (disabledAtom()) return

    const previous = selectedIdAtom()
    listbox.actions.clearSelected()
    const next = selectedIdAtom()
    if (previous !== next) {
      options.onSelectedIdChange?.(next)
    }
  }, `${idBase}.clear`)

  const setDisabled = action((value: boolean) => {
    disabledAtom.set(value)
  }, `${idBase}.setDisabled`)

  const setRequired = action((value: boolean) => {
    requiredAtom.set(value)
  }, `${idBase}.setRequired`)

  const handleTriggerKeyDown = action((event: Pick<KeyboardEvent, 'key'>) => {
    if (disabledAtom()) return

    if (event.key === 'ArrowDown' || event.key === 'Home') {
      openWithFocus('first')
      return
    }

    if (event.key === 'ArrowUp' || event.key === 'End') {
      openWithFocus('last')
      return
    }

    if (event.key === 'Enter' || isSpaceKey(event.key)) {
      toggle()
    }
  }, `${idBase}.handleTriggerKeyDown`)

  const handleListboxKeyDown = action((event: SelectKeyboardEventLike) => {
    if (disabledAtom()) return
    if (!isOpenAtom()) return

    if (event.key === 'Escape' || event.key === 'Tab') {
      close()
      return
    }

    if (event.key === 'Enter' || isSpaceKey(event.key)) {
      const activeId = listbox.state.activeId()
      if (activeId != null) {
        select(activeId)
      }
      return
    }

    listbox.actions.handleKeyDown({
      key: event.key,
      shiftKey: event.shiftKey ?? false,
      ctrlKey: event.ctrlKey ?? false,
      metaKey: event.metaKey ?? false,
      altKey: event.altKey ?? false,
    })
  }, `${idBase}.handleListboxKeyDown`)

  const actions: SelectActions = {
    open,
    close,
    toggle,
    select,
    clear,
    setDisabled,
    setRequired,
    handleTriggerKeyDown,
    handleListboxKeyDown,
  }

  const contracts: SelectContracts = {
    getTriggerProps() {
      const isOpen = isOpenAtom()
      const activeId = listbox.state.activeId()
      const isDisabled = disabledAtom()
      const isRequired = requiredAtom()

      let activedescendant: string | undefined
      if (isOpen && activeId != null) {
        activedescendant = listbox.contracts.getOptionProps(activeId).id
      }

      return {
        id: `${idBase}-trigger`,
        role: 'combobox',
        tabindex: '0',
        'aria-haspopup': 'listbox',
        'aria-expanded': isOpen ? 'true' : 'false',
        'aria-controls': `${idBase}-listbox`,
        'aria-activedescendant': activedescendant,
        'aria-label': options.ariaLabel,
        'aria-disabled': isDisabled ? 'true' as const : undefined,
        'aria-required': isRequired ? 'true' as const : undefined,
        'data-selected-id': selectedIdAtom() ?? undefined,
        'data-selected-label': selectedLabelAtom() ?? undefined,
        onClick: toggle,
        onKeyDown: handleTriggerKeyDown,
      }
    },
    getListboxProps() {
      const rootProps = listbox.contracts.getRootProps()

      return {
        id: `${idBase}-listbox`,
        role: 'listbox',
        tabindex: isOpenAtom() ? '0' : '-1',
        'aria-label': rootProps['aria-label'],
        'aria-activedescendant': rootProps['aria-activedescendant'],
        'aria-multiselectable': isMultiple ? 'true' as const : undefined,
        hidden: !isOpenAtom(),
        onKeyDown: handleListboxKeyDown,
      }
    },
    getOptionProps(id: string) {
      const optionProps = listbox.contracts.getOptionProps(id)

      return {
        id: optionProps.id,
        role: 'option',
        tabindex: '-1',
        'aria-selected': optionProps['aria-selected'] ?? 'false',
        'aria-disabled': optionProps['aria-disabled'],
        'data-active': optionProps['data-active'] ?? 'false',
        onClick: () => select(id),
      }
    },
    getValueText() {
      const labels = selectedLabelsAtom()
      if (labels.length === 0) return options.placeholder ?? ''
      if (isMultiple) return labels.join(', ')
      return labels[0] ?? options.placeholder ?? ''
    },
  }

  const state: SelectState = {
    isOpen: isOpenAtom,
    activeId: listbox.state.activeId,
    selectedIds: listbox.state.selectedIds,
    selectedId: selectedIdAtom,
    selectedLabel: selectedLabelAtom,
    selectedLabels: selectedLabelsAtom,
    restoreTargetId: restoreTargetIdAtom,
    disabled: disabledAtom,
    required: requiredAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
