import {action, atom, computed, type Atom, type Computed} from '@reatom/core'
import {mapListboxKeyboardIntent} from '../interactions/keyboard-intents'
import {
  advanceTypeaheadState,
  createInitialTypeaheadState,
  findTypeaheadMatch,
  isTypeaheadEvent,
  normalizeTypeaheadText,
} from '../interactions/typeahead'

export interface ComboboxOption {
  id: string
  label: string
  disabled?: boolean
}

export interface ComboboxOptionGroup {
  id: string
  label: string
  options: ComboboxOption[]
}

export interface ComboboxVisibleGroup {
  id: string
  label: string
  options: readonly ComboboxOption[]
}

export type ComboboxMatchMode = 'includes' | 'startsWith'

export type ComboboxType = 'editable' | 'select-only'

export interface CreateComboboxOptions {
  options: readonly (ComboboxOption | ComboboxOptionGroup)[]
  type?: ComboboxType
  multiple?: boolean
  clearable?: boolean
  closeOnSelect?: boolean
  matchMode?: ComboboxMatchMode
  filter?: (option: ComboboxOption, inputValue: string) => boolean
  typeahead?: boolean | {enabled?: boolean; timeoutMs?: number}
  idBase?: string
  ariaLabel?: string
  initialInputValue?: string
  initialSelectedId?: string | null
  initialSelectedIds?: string[]
  initialOpen?: boolean
}

export interface ComboboxState {
  inputValue: Atom<string>
  isOpen: Atom<boolean>
  activeId: Atom<string | null>
  selectedId: Atom<string | null>
  selectedIds: Atom<string[]>
  hasSelection: Computed<boolean>
  type: Computed<ComboboxType>
  multiple: Computed<boolean>
}

export interface ComboboxInputProps {
  id: string
  role: 'combobox'
  tabindex: '0'
  'aria-haspopup': 'listbox'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string
  'aria-autocomplete'?: 'list'
  'aria-activedescendant'?: string
  'aria-label'?: string
}

export interface ComboboxListboxProps {
  id: string
  role: 'listbox'
  tabindex: '-1'
  'aria-label'?: string
  'aria-multiselectable'?: 'true'
}

export interface ComboboxOptionProps {
  id: string
  role: 'option'
  tabindex: '-1'
  'aria-selected': 'true' | 'false'
  'aria-disabled'?: 'true'
  'data-active': 'true' | 'false'
}

export interface ComboboxGroupProps {
  id: string
  role: 'group'
  'aria-labelledby': string
}

export interface ComboboxGroupLabelProps {
  id: string
  role: 'presentation'
}

export interface ComboboxActions {
  open(): void
  close(): void
  setInputValue(value: string): void
  setActive(id: string | null): void
  moveNext(): void
  movePrev(): void
  moveFirst(): void
  moveLast(): void
  commitActive(): void
  select(id: string): void
  toggleOption(id: string): void
  removeSelected(id: string): void
  clearSelection(): void
  clear(): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>): void
}

export interface ComboboxContracts {
  getVisibleOptions(): readonly (ComboboxOption | ComboboxVisibleGroup)[]
  getFlatVisibleOptions(): readonly ComboboxOption[]
  getInputProps(): ComboboxInputProps
  getListboxProps(): ComboboxListboxProps
  getOptionProps(id: string): ComboboxOptionProps
  getGroupProps(groupId: string): ComboboxGroupProps
  getGroupLabelProps(groupId: string): ComboboxGroupLabelProps
}

export interface ComboboxModel {
  readonly state: ComboboxState
  readonly actions: ComboboxActions
  readonly contracts: ComboboxContracts
}

const normalizeText = (value: string) => value.trim().toLocaleLowerCase()

const createDefaultFilter =
  (matchMode: ComboboxMatchMode) =>
  (option: ComboboxOption, inputValue: string) => {
    const needle = normalizeText(inputValue)
    if (needle.length === 0) return true

    const haystack = normalizeText(option.label)
    if (matchMode === 'startsWith') {
      return haystack.startsWith(needle)
    }

    return haystack.includes(needle)
  }

function isOptionGroup(item: ComboboxOption | ComboboxOptionGroup): item is ComboboxOptionGroup {
  return 'options' in item && Array.isArray(item.options)
}

function flattenOptions(items: readonly (ComboboxOption | ComboboxOptionGroup)[]): ComboboxOption[] {
  const result: ComboboxOption[] = []
  for (const item of items) {
    if (isOptionGroup(item)) {
      result.push(...item.options)
    } else {
      result.push(item)
    }
  }
  return result
}

export function createCombobox(options: CreateComboboxOptions): ComboboxModel {
  const idBase = options.idBase ?? 'cb'
  const comboboxType: ComboboxType = options.type ?? 'editable'
  const isMultiple = options.multiple ?? false
  const closeOnSelect = options.closeOnSelect ?? (isMultiple ? false : true)
  const matchMode = options.matchMode ?? 'includes'
  const filter = options.filter ?? createDefaultFilter(matchMode)
  const isSelectOnly = comboboxType === 'select-only'

  const allFlatOptions = flattenOptions(options.options)
  const optionById = new Map(allFlatOptions.map((option) => [option.id, option]))

  const groupById = new Map<string, ComboboxOptionGroup>()
  for (const item of options.options) {
    if (isOptionGroup(item)) {
      groupById.set(item.id, item)
    }
  }

  const typeaheadEnabled =
    options.typeahead !== false &&
    !(typeof options.typeahead === 'object' && options.typeahead.enabled === false)
  const typeaheadTimeoutMs =
    typeof options.typeahead === 'object' && options.typeahead.timeoutMs != null
      ? Math.max(0, options.typeahead.timeoutMs)
      : 500

  const inputValueAtom = atom<string>(options.initialInputValue ?? '', `${idBase}.inputValue`)
  const isOpenAtom = atom<boolean>(options.initialOpen ?? false, `${idBase}.isOpen`)
  const activeIdAtom = atom<string | null>(null, `${idBase}.activeId`)

  // selectedIds is the canonical multi-select store
  const initialSelectedIds =
    options.initialSelectedIds ?? (options.initialSelectedId ? [options.initialSelectedId] : [])
  const selectedIdsAtom = atom<string[]>(initialSelectedIds, `${idBase}.selectedIds`)

  // selectedId remains a writable atom for backward compatibility (command-palette uses .set())
  const selectedIdAtom = atom<string | null>(
    initialSelectedIds.length > 0 ? initialSelectedIds[0]! : null,
    `${idBase}.selectedId`,
  )

  // Keep selectedId and selectedIds in sync
  const setSelectedIds = (ids: string[]) => {
    selectedIdsAtom.set(ids)
    selectedIdAtom.set(ids.length > 0 ? ids[0]! : null)
  }

  const setSelectedId = (id: string | null) => {
    selectedIdAtom.set(id)
    selectedIdsAtom.set(id != null ? [id] : [])
  }

  const hasSelectionAtom = computed(() => selectedIdsAtom().length > 0, `${idBase}.hasSelection`)
  const typeAtom = computed(() => comboboxType, `${idBase}.type`)
  const multipleAtom = computed(() => isMultiple, `${idBase}.multiple`)

  const inputId = `${idBase}-input`
  const listboxId = `${idBase}-listbox`
  const optionDomId = (id: string) => `${idBase}-option-${id}`
  const groupDomId = (groupId: string) => `${idBase}-group-${groupId}`
  const groupLabelDomId = (groupId: string) => `${idBase}-group-label-${groupId}`

  let typeaheadState = createInitialTypeaheadState()

  const resetTypeahead = () => {
    typeaheadState = createInitialTypeaheadState()
  }

  const getFlatVisibleOptions = (): ComboboxOption[] => {
    if (isSelectOnly) {
      return allFlatOptions
    }
    return allFlatOptions.filter((option) => filter(option, inputValueAtom()))
  }

  const getVisibleOptions = (): (ComboboxOption | ComboboxVisibleGroup)[] => {
    const inputValue = inputValueAtom()
    const hasGroups = options.options.some(isOptionGroup)

    if (!hasGroups) {
      if (isSelectOnly) {
        return [...allFlatOptions]
      }
      return allFlatOptions.filter((option) => filter(option, inputValue))
    }

    const result: (ComboboxOption | ComboboxVisibleGroup)[] = []
    for (const item of options.options) {
      if (isOptionGroup(item)) {
        const filteredOptions = isSelectOnly
          ? item.options
          : item.options.filter((opt) => filter(opt, inputValue))
        if (filteredOptions.length > 0) {
          result.push({id: item.id, label: item.label, options: filteredOptions})
        }
      } else {
        if (isSelectOnly || filter(item, inputValue)) {
          result.push(item)
        }
      }
    }
    return result
  }

  const getEnabledVisibleOptionIds = () =>
    getFlatVisibleOptions()
      .filter((option) => !option.disabled)
      .map((option) => option.id)

  const ensureActiveVisible = () => {
    const enabledIds = getEnabledVisibleOptionIds()
    if (enabledIds.length === 0) {
      activeIdAtom.set(null)
      return
    }

    const activeId = activeIdAtom()
    if (activeId != null && enabledIds.includes(activeId)) {
      return
    }

    activeIdAtom.set(enabledIds[0] ?? null)
  }

  const setActive = (id: string | null) => {
    if (id == null) {
      activeIdAtom.set(null)
      return
    }

    const option = optionById.get(id)
    if (!option || option.disabled) return

    const visibleIds = getFlatVisibleOptions().map((item) => item.id)
    if (!visibleIds.includes(id)) return

    activeIdAtom.set(id)
  }

  const move = (direction: 1 | -1) => {
    const enabledIds = getEnabledVisibleOptionIds()
    if (enabledIds.length === 0) {
      activeIdAtom.set(null)
      return
    }

    const activeId = activeIdAtom()
    if (activeId == null || !enabledIds.includes(activeId)) {
      activeIdAtom.set(enabledIds[0] ?? null)
      return
    }

    const currentIndex = enabledIds.indexOf(activeId)
    if (currentIndex < 0) {
      activeIdAtom.set(enabledIds[0] ?? null)
      return
    }

    const nextIndex = (currentIndex + direction + enabledIds.length) % enabledIds.length
    activeIdAtom.set(enabledIds[nextIndex] ?? null)
  }

  const toggleOptionInternal = (id: string) => {
    if (!isMultiple) return

    const option = optionById.get(id)
    if (!option || option.disabled) return

    const current = selectedIdsAtom()
    if (current.includes(id)) {
      setSelectedIds(current.filter((sid) => sid !== id))
    } else {
      setSelectedIds([...current, id])
    }
    activeIdAtom.set(id)
  }

  const commitById = (id: string) => {
    const option = optionById.get(id)
    if (!option || option.disabled) return

    if (isMultiple) {
      toggleOptionInternal(id)
      // In multi select-only mode, inputValue stays empty
      if (isSelectOnly) {
        inputValueAtom.set('')
      }
    } else {
      setSelectedId(id)
      inputValueAtom.set(option.label)
      activeIdAtom.set(id)
    }

    if (closeOnSelect) {
      isOpenAtom.set(false)
    }
  }

  const handleTypeahead = (
    event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  ) => {
    const effectiveTypeaheadEnabled = isSelectOnly || typeaheadEnabled
    if (!effectiveTypeaheadEnabled || !isTypeaheadEvent(event)) return false

    const enabledVisibleOptions = getFlatVisibleOptions().filter((option) => !option.disabled)
    if (enabledVisibleOptions.length === 0) return true

    const typeaheadItems = enabledVisibleOptions.map((option) => ({
      id: option.id,
      text: normalizeTypeaheadText(option.label),
    }))

    const activeEnabledIndex =
      activeIdAtom() == null ? -1 : enabledVisibleOptions.findIndex((option) => option.id === activeIdAtom())
    const startIndex = activeEnabledIndex < 0 ? 0 : (activeEnabledIndex + 1) % enabledVisibleOptions.length

    const now = Date.now()
    const {query, next} = advanceTypeaheadState(
      typeaheadState,
      normalizeTypeaheadText(event.key),
      now,
      typeaheadTimeoutMs,
    )
    const matchedId = findTypeaheadMatch(query, typeaheadItems, startIndex)

    if (matchedId != null) {
      setActive(matchedId)
    }

    typeaheadState = next
    return true
  }

  const open = action(() => {
    isOpenAtom.set(true)
    resetTypeahead()
    ensureActiveVisible()
  }, `${idBase}.open`)

  const close = action(() => {
    isOpenAtom.set(false)
    resetTypeahead()
  }, `${idBase}.close`)

  const setInputValue = action((value: string) => {
    if (isSelectOnly) return

    inputValueAtom.set(value)
    isOpenAtom.set(true)
    resetTypeahead()
    ensureActiveVisible()
  }, `${idBase}.setInputValue`)

  const setActiveAction = action((id: string | null) => {
    setActive(id)
  }, `${idBase}.setActive`)

  const moveNext = action(() => {
    isOpenAtom.set(true)
    move(1)
  }, `${idBase}.moveNext`)

  const movePrev = action(() => {
    isOpenAtom.set(true)
    move(-1)
  }, `${idBase}.movePrev`)

  const moveFirst = action(() => {
    isOpenAtom.set(true)
    const first = getEnabledVisibleOptionIds()[0]
    activeIdAtom.set(first ?? null)
  }, `${idBase}.moveFirst`)

  const moveLast = action(() => {
    isOpenAtom.set(true)
    const enabledIds = getEnabledVisibleOptionIds()
    activeIdAtom.set(enabledIds[enabledIds.length - 1] ?? null)
  }, `${idBase}.moveLast`)

  const commitActive = action(() => {
    const activeId = activeIdAtom()
    if (activeId == null) return
    commitById(activeId)
  }, `${idBase}.commitActive`)

  const selectAction = action((id: string) => {
    commitById(id)
  }, `${idBase}.select`)

  const toggleOption = action((id: string) => {
    toggleOptionInternal(id)
  }, `${idBase}.toggleOption`)

  const removeSelected = action((id: string) => {
    const current = selectedIdsAtom()
    if (!current.includes(id)) return
    setSelectedIds(current.filter((sid) => sid !== id))
  }, `${idBase}.removeSelected`)

  const clearSelection = action(() => {
    setSelectedIds([])
  }, `${idBase}.clearSelection`)

  const clearAction = action(() => {
    setSelectedIds([])
    inputValueAtom.set('')
  }, `${idBase}.clear`)

  const handleKeyDown = action(
    (event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>) => {
      // Select-only mode: Space handling
      if (isSelectOnly && (event.key === ' ' || event.key === 'Spacebar')) {
        if (!isOpenAtom()) {
          open()
        } else {
          commitActive()
        }
        return
      }

      // Select-only mode: Enter when closed opens popup
      if (isSelectOnly && event.key === 'Enter' && !isOpenAtom()) {
        open()
        return
      }

      // Select-only mode: typeahead for printable chars
      if (isSelectOnly && handleTypeahead(event)) {
        return
      }

      // Editable mode typeahead (existing behavior)
      if (!isSelectOnly && handleTypeahead(event)) {
        return
      }

      resetTypeahead()

      const intent = mapListboxKeyboardIntent(event, {
        orientation: 'vertical',
        selectionMode: 'single',
        rangeSelectionEnabled: false,
      })

      if (intent == null) return

      switch (intent) {
        case 'NAV_NEXT':
          moveNext()
          return
        case 'NAV_PREV':
          movePrev()
          return
        case 'NAV_FIRST':
          moveFirst()
          return
        case 'NAV_LAST':
          moveLast()
          return
        case 'ACTIVATE':
          commitActive()
          return
        case 'DISMISS':
          close()
          return
        default:
          return
      }
    },
    `${idBase}.handleKeyDown`,
  )

  const actions: ComboboxActions = {
    open,
    close,
    setInputValue,
    setActive: setActiveAction,
    moveNext,
    movePrev,
    moveFirst,
    moveLast,
    commitActive,
    select: selectAction,
    toggleOption,
    removeSelected,
    clearSelection,
    clear: clearAction,
    handleKeyDown,
  }

  // Initialize from selected id(s)
  const initialId = selectedIdAtom()
  if (initialId != null && !isMultiple) {
    const selected = optionById.get(initialId)
    if (selected != null) {
      inputValueAtom.set(selected.label)
      activeIdAtom.set(selected.id)
    } else {
      setSelectedId(null)
    }
  }

  const contracts: ComboboxContracts = {
    getVisibleOptions,
    getFlatVisibleOptions,
    getInputProps() {
      const activeId = activeIdAtom()
      const props: ComboboxInputProps = {
        id: inputId,
        role: 'combobox',
        tabindex: '0',
        'aria-haspopup': 'listbox',
        'aria-expanded': isOpenAtom() ? 'true' : 'false',
        'aria-controls': listboxId,
        'aria-activedescendant':
          isOpenAtom() && activeId != null ? optionDomId(activeId) : undefined,
        'aria-label': options.ariaLabel,
      }
      if (!isSelectOnly) {
        props['aria-autocomplete'] = 'list'
      }
      return props
    },
    getListboxProps() {
      const props: ComboboxListboxProps = {
        id: listboxId,
        role: 'listbox',
        tabindex: '-1',
        'aria-label': options.ariaLabel,
      }
      if (isMultiple) {
        props['aria-multiselectable'] = 'true'
      }
      return props
    },
    getOptionProps(id: string) {
      const option = optionById.get(id)
      if (!option) {
        throw new Error(`Unknown combobox option id: ${id}`)
      }

      const currentSelectedIds = selectedIdsAtom()

      return {
        id: optionDomId(id),
        role: 'option',
        tabindex: '-1',
        'aria-selected': currentSelectedIds.includes(id) ? 'true' : 'false',
        'aria-disabled': option.disabled ? 'true' : undefined,
        'data-active': activeIdAtom() === id ? 'true' : 'false',
      }
    },
    getGroupProps(groupId: string) {
      return {
        id: groupDomId(groupId),
        role: 'group',
        'aria-labelledby': groupLabelDomId(groupId),
      }
    },
    getGroupLabelProps(groupId: string) {
      return {
        id: groupLabelDomId(groupId),
        role: 'presentation',
      }
    },
  }

  const state: ComboboxState = {
    inputValue: inputValueAtom,
    isOpen: isOpenAtom,
    activeId: activeIdAtom,
    selectedId: selectedIdAtom,
    selectedIds: selectedIdsAtom,
    hasSelection: hasSelectionAtom,
    type: typeAtom,
    multiple: multipleAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
