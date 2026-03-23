import {action, atom, computed, type Atom, type Computed} from '@reatom/core'
import type {FocusStrategy, ItemA11yProps, RootA11yProps} from '../a11y-contracts'
import {
  normalizeSelection,
  selectOnly as selectOnlyPrimitive,
  selectRangeByOrder,
  toggleSelection,
} from '../core/selection'
import {mapListboxKeyboardIntent} from '../interactions/keyboard-intents'
import {
  advanceTypeaheadState,
  createInitialTypeaheadState,
  findTypeaheadMatch,
  isTypeaheadEvent,
  normalizeTypeaheadText,
} from '../interactions/typeahead'

export type ListboxSelectionMode = 'single' | 'multiple'
export type ListboxOrientation = 'vertical' | 'horizontal'

export interface ListboxOption {
  id: string
  label?: string
  disabled?: boolean
  groupId?: string
}

export interface ListboxGroup {
  id: string
  label: string
}

export interface ListboxTypeaheadOptions {
  enabled?: boolean
  timeoutMs?: number
}

export interface ListboxRangeSelectionOptions {
  enabled?: boolean
}

export interface CreateListboxOptions {
  options: readonly ListboxOption[]
  groups?: readonly ListboxGroup[]
  selectionMode?: ListboxSelectionMode
  focusStrategy?: FocusStrategy
  selectionFollowsFocus?: boolean
  rangeSelection?: boolean | ListboxRangeSelectionOptions
  orientation?: ListboxOrientation
  typeahead?: boolean | ListboxTypeaheadOptions
  ariaLabel?: string
  idBase?: string
  initialActiveId?: string | null
  initialSelectedIds?: readonly string[]
}

export interface ListboxState {
  activeId: Atom<string | null>
  selectedIds: Atom<string[]>
  isOpen: Atom<boolean>
  hasSelection: Computed<boolean>
  selectionMode: ListboxSelectionMode
  focusStrategy: FocusStrategy
  orientation: ListboxOrientation
  optionCount: number
  groups: readonly ListboxGroup[]
}

export interface ListboxActions {
  open(): void
  close(): void
  setActive(id: string | null): void
  moveNext(): void
  movePrev(): void
  moveFirst(): void
  moveLast(): void
  toggleSelected(id: string): void
  selectOnly(id: string): void
  clearSelected(): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>): void
}

export interface ListboxOptionProps {
  id: string
  role: 'option'
  tabindex: '0' | '-1'
  'aria-disabled'?: 'true'
  'aria-selected': 'true' | 'false'
  'aria-setsize': string
  'aria-posinset': string
  'data-active': 'true' | 'false'
}

export interface ListboxGroupProps {
  id: string
  role: 'group'
  'aria-labelledby': string
}

export interface ListboxGroupLabelProps {
  id: string
  role: 'presentation'
}

export interface ListboxContracts {
  getRootProps(): RootA11yProps
  getOptionProps(id: string): ListboxOptionProps
  getGroupProps(groupId: string): ListboxGroupProps
  getGroupLabelProps(groupId: string): ListboxGroupLabelProps
  getGroupOptions(groupId: string): readonly ListboxOption[]
  getUngroupedOptions(): readonly ListboxOption[]
}

export interface ListboxModel {
  readonly state: ListboxState
  readonly actions: ListboxActions
  readonly contracts: ListboxContracts
}

export function createListbox(options: CreateListboxOptions): ListboxModel {
  const selectionMode = options.selectionMode ?? 'single'
  const focusStrategy = options.focusStrategy ?? 'aria-activedescendant'
  const selectionFollowsFocus = options.selectionFollowsFocus ?? false
  const rangeSelectionEnabled =
    options.rangeSelection === true ||
    (typeof options.rangeSelection === 'object' && options.rangeSelection.enabled !== false)
  const orientation = options.orientation ?? 'vertical'
  const idBase = options.idBase ?? 'lb'

  const typeaheadEnabled =
    options.typeahead !== false &&
    !(typeof options.typeahead === 'object' && options.typeahead.enabled === false)
  const typeaheadTimeoutMs =
    typeof options.typeahead === 'object' && options.typeahead.timeoutMs != null
      ? Math.max(0, options.typeahead.timeoutMs)
      : 500

  const groups: readonly ListboxGroup[] = options.groups ?? []
  const groupsById = new Map(groups.map((g) => [g.id, g]))

  const optionsById = new Map(options.options.map((option) => [option.id, option]))
  const optionSearchTextById = new Map(
    options.options.map((option) => [option.id, normalizeTypeaheadText(option.label ?? option.id)]),
  )

  const optionIds = options.options.map((option) => option.id)
  const optionCount = optionIds.length

  const optionPositionById = new Map(optionIds.map((id, index) => [id, index + 1]))
  const enabledOptionIds = options.options.filter((option) => !option.disabled).map((option) => option.id)
  const selectableIds = new Set(enabledOptionIds)

  const typeaheadItems = enabledOptionIds.map((id) => ({
    id,
    text: optionSearchTextById.get(id) ?? '',
  }))

  let typeaheadState = createInitialTypeaheadState()

  const resolveInitialActive = () => {
    if (options.initialActiveId != null && selectableIds.has(options.initialActiveId)) {
      return options.initialActiveId
    }

    const preselected = normalizeSelection(options.initialSelectedIds ?? [], selectableIds, selectionMode)[0]
    if (preselected != null) {
      return preselected
    }

    return enabledOptionIds[0] ?? null
  }

  const activeIdAtom = atom<string | null>(resolveInitialActive(), `${idBase}.activeId`)
  const selectedIdsAtom = atom<string[]>(
    normalizeSelection(options.initialSelectedIds ?? [], selectableIds, selectionMode),
    `${idBase}.selectedIds`,
  )
  const isOpenAtom = atom<boolean>(false, `${idBase}.isOpen`)
  const hasSelectionAtom = computed(() => selectedIdsAtom().length > 0, `${idBase}.hasSelection`)

  let rangeAnchorId: string | null = selectedIdsAtom()[0] ?? activeIdAtom()

  const optionDomId = (id: string) => `${idBase}-option-${id}`

  const resetTypeahead = () => {
    typeaheadState = createInitialTypeaheadState()
  }

  const setActive = (id: string | null) => {
    if (id == null) {
      activeIdAtom.set(null)
      return
    }

    const option = optionsById.get(id)
    if (!option || option.disabled) return

    activeIdAtom.set(id)
    if (selectionMode === 'single' && selectionFollowsFocus) {
      selectedIdsAtom.set([id])
    }
  }

  const selectRangeBetween = (fromId: string, toId: string) => {
    const range = selectRangeByOrder(enabledOptionIds, fromId, toId)
    if (range.length === 0) return
    selectedIdsAtom.set(range)
  }

  const findNextEnabled = (fromIndex: number, step: 1 | -1) => {
    let index = fromIndex + step
    while (index >= 0 && index < optionIds.length) {
      const id = optionIds[index]
      if (id != null && selectableIds.has(id)) return id
      index += step
    }
    return null
  }

  const move = (direction: 1 | -1) => {
    const activeId = activeIdAtom()
    if (activeId == null) {
      setActive(enabledOptionIds[0] ?? null)
      return
    }

    const currentIndex = optionIds.indexOf(activeId)
    if (currentIndex < 0) {
      setActive(enabledOptionIds[0] ?? null)
      return
    }

    const nextId = findNextEnabled(currentIndex, direction)
    if (nextId != null) setActive(nextId)
  }

  const handleTypeahead = (
    event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  ) => {
    if (!typeaheadEnabled || !isTypeaheadEvent(event)) return false

    const now = Date.now()
    const {query, next} = advanceTypeaheadState(
      typeaheadState,
      normalizeTypeaheadText(event.key),
      now,
      typeaheadTimeoutMs,
    )

    const activeId = activeIdAtom()
    const activeEnabledIndex = activeId == null ? -1 : enabledOptionIds.indexOf(activeId)
    const startIndex = activeEnabledIndex < 0 ? 0 : (activeEnabledIndex + 1) % enabledOptionIds.length
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
  }, `${idBase}.open`)

  const close = action(() => {
    isOpenAtom.set(false)
    resetTypeahead()
  }, `${idBase}.close`)

  const setActiveAction = action((id: string | null) => {
    setActive(id)
  }, `${idBase}.setActive`)

  const moveNext = action(() => {
    move(1)
  }, `${idBase}.moveNext`)

  const movePrev = action(() => {
    move(-1)
  }, `${idBase}.movePrev`)

  const moveFirst = action(() => {
    setActive(enabledOptionIds[0] ?? null)
  }, `${idBase}.moveFirst`)

  const moveLast = action(() => {
    setActive(enabledOptionIds[enabledOptionIds.length - 1] ?? null)
  }, `${idBase}.moveLast`)

  const toggleSelectedAction = action((id: string) => {
    if (!selectableIds.has(id)) return
    const nextSelected = toggleSelection(selectedIdsAtom(), id, selectionMode, selectableIds)
    selectedIdsAtom.set(nextSelected)
    rangeAnchorId = id
  }, `${idBase}.toggleSelected`)

  const selectOnlyAction = action((id: string) => {
    const nextSelected = selectOnlyPrimitive(id, selectableIds)
    if (nextSelected.length === 0) return
    selectedIdsAtom.set(nextSelected)
    rangeAnchorId = id
  }, `${idBase}.selectOnly`)

  const clearSelected = action(() => {
    selectedIdsAtom.set([])
    rangeAnchorId = null
  }, `${idBase}.clearSelected`)

  const handleKeyDown = action(
    (event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>) => {
      if (handleTypeahead(event)) {
        return
      }

      resetTypeahead()

      const intent = mapListboxKeyboardIntent(event, {
        orientation,
        selectionMode,
        rangeSelectionEnabled,
      })

      if (intent == null) return

      const activeId = activeIdAtom()

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
        case 'DISMISS':
          close()
          return
        case 'RANGE_NEXT': {
          const previousActive = activeIdAtom()
          moveNext()
          const currentActive = activeIdAtom()
          if (currentActive == null) return
          rangeAnchorId = rangeAnchorId ?? previousActive ?? currentActive
          if (rangeAnchorId != null) {
            selectRangeBetween(rangeAnchorId, currentActive)
          }
          return
        }
        case 'RANGE_PREV': {
          const previousActive = activeIdAtom()
          movePrev()
          const currentActive = activeIdAtom()
          if (currentActive == null) return
          rangeAnchorId = rangeAnchorId ?? previousActive ?? currentActive
          if (rangeAnchorId != null) {
            selectRangeBetween(rangeAnchorId, currentActive)
          }
          return
        }
        case 'RANGE_SELECT_ACTIVE':
          if (activeId == null) return
          rangeAnchorId = rangeAnchorId ?? activeId
          if (rangeAnchorId != null) {
            selectRangeBetween(rangeAnchorId, activeId)
          }
          return
        case 'TOGGLE_SELECTION':
          if (activeId == null) return
          toggleSelectedAction(activeId)
          return
        case 'ACTIVATE':
          if (activeId == null) return
          if (selectionMode === 'multiple') toggleSelectedAction(activeId)
          else selectOnlyAction(activeId)
          return
        case 'SELECT_ALL':
          selectedIdsAtom.set([...enabledOptionIds])
          rangeAnchorId = activeIdAtom() ?? enabledOptionIds[0] ?? null
          return
      }
    },
    `${idBase}.handleKeyDown`,
  )

  const actions: ListboxActions = {
    open,
    close,
    setActive: setActiveAction,
    moveNext,
    movePrev,
    moveFirst,
    moveLast,
    toggleSelected: toggleSelectedAction,
    selectOnly: selectOnlyAction,
    clearSelected,
    handleKeyDown,
  }

  const optionsByGroupId = new Map<string, ListboxOption[]>()
  for (const option of options.options) {
    if (option.groupId != null && groupsById.has(option.groupId)) {
      let list = optionsByGroupId.get(option.groupId)
      if (!list) {
        list = []
        optionsByGroupId.set(option.groupId, list)
      }
      list.push(option)
    }
  }

  const contracts: ListboxContracts = {
    getRootProps() {
      const activeId = activeIdAtom()
      const base: RootA11yProps = {
        role: 'listbox',
        tabindex: focusStrategy === 'aria-activedescendant' ? '0' : '-1',
        'aria-label': options.ariaLabel,
        'aria-orientation': orientation,
      }

      if (selectionMode === 'multiple') {
        base['aria-multiselectable'] = 'true'
      }

      if (focusStrategy === 'aria-activedescendant' && activeId != null) {
        base['aria-activedescendant'] = optionDomId(activeId)
      }

      return base
    },
    getOptionProps(id: string): ListboxOptionProps {
      const option = optionsById.get(id)
      if (!option) {
        throw new Error(`Unknown listbox option id: ${id}`)
      }

      const selectedIds = selectedIdsAtom()
      const activeId = activeIdAtom()
      const isSelected = selectedIds.includes(id)
      const isActive = activeId === id
      const tabindex = focusStrategy === 'roving-tabindex' && isActive ? '0' : '-1'

      return {
        id: optionDomId(id),
        role: 'option',
        tabindex,
        'aria-disabled': option.disabled ? 'true' : undefined,
        'aria-selected': isSelected ? 'true' : 'false',
        'aria-setsize': String(optionCount),
        'aria-posinset': String(optionPositionById.get(id)),
        'data-active': isActive ? 'true' : 'false',
      }
    },
    getGroupProps(groupId: string): ListboxGroupProps {
      const group = groupsById.get(groupId)
      if (!group) {
        throw new Error(`Unknown listbox group id: ${groupId}`)
      }

      return {
        id: groupId,
        role: 'group',
        'aria-labelledby': `${idBase}-group-${groupId}-label`,
      }
    },
    getGroupLabelProps(groupId: string): ListboxGroupLabelProps {
      const group = groupsById.get(groupId)
      if (!group) {
        throw new Error(`Unknown listbox group id: ${groupId}`)
      }

      return {
        id: `${idBase}-group-${groupId}-label`,
        role: 'presentation',
      }
    },
    getGroupOptions(groupId: string): readonly ListboxOption[] {
      return optionsByGroupId.get(groupId) ?? []
    },
    getUngroupedOptions(): readonly ListboxOption[] {
      return options.options.filter(
        (option) => option.groupId == null || !groupsById.has(option.groupId),
      )
    },
  }

  const state: ListboxState = {
    activeId: activeIdAtom,
    selectedIds: selectedIdsAtom,
    isOpen: isOpenAtom,
    hasSelection: hasSelectionAtom,
    selectionMode,
    focusStrategy,
    orientation,
    optionCount,
    groups,
  }

  return {
    state,
    actions,
    contracts,
  }
}
