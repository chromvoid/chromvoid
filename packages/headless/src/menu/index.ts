import {action, atom, computed, type Atom, type Computed} from '@reatom/core'
import {mapListboxKeyboardIntent} from '../interactions/keyboard-intents'
import {
  advanceTypeaheadState,
  createInitialTypeaheadState,
  findTypeaheadMatch,
  isTypeaheadEvent,
  normalizeTypeaheadText,
  type TypeaheadItem,
} from '../interactions/typeahead'

export type MenuOpenSource = 'keyboard' | 'pointer' | 'programmatic'

export interface MenuItem {
  id: string
  label?: string
  disabled?: boolean
  type?: 'normal' | 'checkbox' | 'radio'
  group?: string
  checked?: boolean
  hasSubmenu?: boolean
}

export interface MenuGroup {
  id: string
  type: 'checkbox' | 'radio'
  label?: string
}

export interface CreateMenuOptions {
  items: readonly MenuItem[]
  idBase?: string
  ariaLabel?: string
  initialOpen?: boolean
  initialActiveId?: string | null
  closeOnSelect?: boolean
  typeahead?: boolean
  typeaheadTimeout?: number
  groups?: readonly MenuGroup[]
  splitButton?: boolean
}

export interface MenuState {
  isOpen: Atom<boolean>
  activeId: Atom<string | null>
  selectedId: Atom<string | null>
  openedBy: Atom<MenuOpenSource | null>
  hasSelection: Computed<boolean>
  checkedIds: Atom<ReadonlySet<string>>
  openSubmenuId: Atom<string | null>
  submenuActiveId: Atom<string | null>
}

export interface MenuTriggerProps {
  id: string
  tabindex: '0'
  'aria-haspopup': 'menu'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string
  'aria-label'?: string
}

export interface MenuProps {
  id: string
  role: 'menu'
  tabindex: '-1'
  'aria-label'?: string
  'aria-activedescendant'?: string
}

export interface MenuItemProps {
  id: string
  role: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio'
  tabindex: '-1'
  'aria-disabled'?: 'true'
  'data-active': 'true' | 'false'
  'aria-checked'?: 'true' | 'false'
  'aria-haspopup'?: 'menu'
  'aria-expanded'?: 'true' | 'false'
}

export interface MenuSubmenuProps {
  id: string
  role: 'menu'
  tabindex: '-1'
  hidden: boolean
  'aria-label'?: string
}

export interface MenuSplitTriggerProps {
  id: string
  tabindex: '0'
  role: 'button'
}

export interface MenuSplitDropdownProps {
  id: string
  tabindex: '0'
  role: 'button'
  'aria-haspopup': 'menu'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string
  'aria-label': string
}

export interface MenuGroupProps {
  id: string
  role: 'group'
  'aria-label'?: string
}

export interface MenuKeyboardEventLike {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

export interface MenuActions {
  open(source?: MenuOpenSource): void
  close(): void
  toggle(source?: MenuOpenSource): void
  setActive(id: string | null): void
  moveNext(): void
  movePrev(): void
  moveFirst(): void
  moveLast(): void
  select(id: string): void
  toggleCheck(id: string): void
  openSubmenu(id: string): void
  closeSubmenu(): void
  handleTypeahead(char: string): void
  handleTriggerKeyDown(event: Pick<KeyboardEvent, 'key'>): void
  handleMenuKeyDown(event: MenuKeyboardEventLike): void
  handleItemPointerEnter(id: string): void
  handleItemPointerLeave(id: string): void
  setSubmenuItems(parentId: string, items: readonly MenuItem[]): void
}

export interface MenuContracts {
  getTriggerProps(): MenuTriggerProps
  getMenuProps(): MenuProps
  getItemProps(id: string): MenuItemProps
  getSubmenuProps(parentItemId: string): MenuSubmenuProps
  getSubmenuItemProps(parentItemId: string, childId: string): MenuItemProps
  getSplitTriggerProps(): MenuSplitTriggerProps
  getSplitDropdownProps(): MenuSplitDropdownProps
  getGroupProps(groupId: string): MenuGroupProps
}

export interface MenuModel {
  readonly state: MenuState
  readonly actions: MenuActions
  readonly contracts: MenuContracts
}

export function createMenu(options: CreateMenuOptions): MenuModel {
  const idBase = options.idBase ?? 'menu'
  const closeOnSelect = options.closeOnSelect ?? true
  const typeaheadEnabled = options.typeahead ?? true
  const typeaheadTimeout = options.typeaheadTimeout ?? 500
  const splitButton = options.splitButton ?? false

  const itemById = new Map(options.items.map((item) => [item.id, item]))
  const enabledIds = options.items.filter((item) => !item.disabled).map((item) => item.id)

  // Group definitions
  const groupById = new Map((options.groups ?? []).map((g) => [g.id, g]))

  // Submenu items storage: parentId -> MenuItem[]
  const submenuItemsMap = new Map<string, readonly MenuItem[]>()
  const submenuItemById = new Map<string, MenuItem>()
  const submenuEnabledIds = new Map<string, string[]>()

  const rebuildSubmenuMaps = (parentId: string, items: readonly MenuItem[]) => {
    submenuItemsMap.set(parentId, items)
    for (const item of items) {
      submenuItemById.set(item.id, item)
    }
    submenuEnabledIds.set(
      parentId,
      items.filter((item) => !item.disabled).map((item) => item.id),
    )
  }

  // Initialize checked set from items with checked: true
  const initialCheckedIds = new Set<string>()
  for (const item of options.items) {
    if (item.checked && (item.type === 'checkbox' || item.type === 'radio')) {
      initialCheckedIds.add(item.id)
    }
  }

  const isOpenAtom = atom<boolean>(options.initialOpen ?? false, `${idBase}.isOpen`)
  const activeIdAtom = atom<string | null>(null, `${idBase}.activeId`)
  const selectedIdAtom = atom<string | null>(null, `${idBase}.selectedId`)
  const openedByAtom = atom<MenuOpenSource | null>(null, `${idBase}.openedBy`)
  const hasSelectionAtom = computed(() => selectedIdAtom() != null, `${idBase}.hasSelection`)
  const checkedIdsAtom = atom<ReadonlySet<string>>(initialCheckedIds, `${idBase}.checkedIds`)
  const openSubmenuIdAtom = atom<string | null>(null, `${idBase}.openSubmenuId`)
  const submenuActiveIdAtom = atom<string | null>(null, `${idBase}.submenuActiveId`)

  // Typeahead state (mutable, not reactive — internal only)
  let typeaheadState = createInitialTypeaheadState()

  // Hover intent timer
  let hoverIntentTimer: ReturnType<typeof setTimeout> | null = null
  let hoverIntentTargetId: string | null = null

  const menuId = `${idBase}-menu`
  const itemDomId = (id: string) => `${idBase}-item-${id}`

  const setInitialActive = () => {
    if (options.initialActiveId != null && enabledIds.includes(options.initialActiveId)) {
      activeIdAtom.set(options.initialActiveId)
      return
    }
    activeIdAtom.set(enabledIds[0] ?? null)
  }

  const move = (direction: 1 | -1) => {
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
    const nextIndex = (currentIndex + direction + enabledIds.length) % enabledIds.length
    activeIdAtom.set(enabledIds[nextIndex] ?? null)
  }

  const moveSubmenu = (direction: 1 | -1) => {
    const parentId = openSubmenuIdAtom()
    if (parentId == null) return

    const enabled = submenuEnabledIds.get(parentId)
    if (!enabled || enabled.length === 0) return

    const currentId = submenuActiveIdAtom()
    if (currentId == null || !enabled.includes(currentId)) {
      submenuActiveIdAtom.set(enabled[0] ?? null)
      return
    }

    const currentIndex = enabled.indexOf(currentId)
    const nextIndex = (currentIndex + direction + enabled.length) % enabled.length
    submenuActiveIdAtom.set(enabled[nextIndex] ?? null)
  }

  const open = action((source: MenuOpenSource = 'programmatic') => {
    isOpenAtom.set(true)
    openedByAtom.set(source)
    openSubmenuIdAtom.set(null)
    submenuActiveIdAtom.set(null)
    const activeId = activeIdAtom()
    if (activeId == null || !enabledIds.includes(activeId)) {
      setInitialActive()
    }
  }, `${idBase}.open`)

  const close = action(() => {
    isOpenAtom.set(false)
    openedByAtom.set(null)
    activeIdAtom.set(null)
    openSubmenuIdAtom.set(null)
    submenuActiveIdAtom.set(null)
  }, `${idBase}.close`)

  const toggle = action((source: MenuOpenSource = 'programmatic') => {
    if (isOpenAtom()) {
      close()
    } else {
      open(source)
    }
  }, `${idBase}.toggle`)

  const setActiveAction = action((id: string | null) => {
    if (id == null) {
      activeIdAtom.set(null)
      return
    }

    if (!enabledIds.includes(id)) return
    activeIdAtom.set(id)
  }, `${idBase}.setActive`)

  const moveNext = action(() => {
    move(1)
  }, `${idBase}.moveNext`)

  const movePrev = action(() => {
    move(-1)
  }, `${idBase}.movePrev`)

  const moveFirst = action(() => {
    activeIdAtom.set(enabledIds[0] ?? null)
  }, `${idBase}.moveFirst`)

  const moveLast = action(() => {
    activeIdAtom.set(enabledIds[enabledIds.length - 1] ?? null)
  }, `${idBase}.moveLast`)

  const isCheckableItem = (item: MenuItem) =>
    item.type === 'checkbox' || item.type === 'radio'

  const performCheckToggle = (item: MenuItem) => {
    const current = new Set(checkedIdsAtom())
    if (item.type === 'checkbox') {
      if (current.has(item.id)) {
        current.delete(item.id)
      } else {
        current.add(item.id)
      }
    } else if (item.type === 'radio' && item.group) {
      // Remove all items in same group
      for (const otherItem of options.items) {
        if (otherItem.group === item.group && otherItem.type === 'radio') {
          current.delete(otherItem.id)
        }
      }
      // Also check submenu items
      for (const [, subItems] of submenuItemsMap) {
        for (const subItem of subItems) {
          if (subItem.group === item.group && subItem.type === 'radio') {
            current.delete(subItem.id)
          }
        }
      }
      current.add(item.id)
    }
    checkedIdsAtom.set(current)
  }

  const select = action((id: string) => {
    // Check both main items and submenu items
    const item = itemById.get(id) ?? submenuItemById.get(id)
    if (!item || item.disabled) return

    if (isCheckableItem(item)) {
      performCheckToggle(item)
      activeIdAtom.set(id)
      // Checkable items do not close menu by default
      return
    }

    selectedIdAtom.set(id)
    activeIdAtom.set(id)
    if (closeOnSelect) {
      close()
    }
  }, `${idBase}.select`)

  const toggleCheck = action((id: string) => {
    const item = itemById.get(id) ?? submenuItemById.get(id)
    if (!item || item.disabled) return
    if (!isCheckableItem(item)) return

    performCheckToggle(item)
  }, `${idBase}.toggleCheck`)

  const openSubmenu = action((id: string) => {
    const item = itemById.get(id)
    if (!item || !item.hasSubmenu) return

    openSubmenuIdAtom.set(id)
    const enabled = submenuEnabledIds.get(id)
    submenuActiveIdAtom.set(enabled?.[0] ?? null)
  }, `${idBase}.openSubmenu`)

  const closeSubmenu = action(() => {
    openSubmenuIdAtom.set(null)
    submenuActiveIdAtom.set(null)
  }, `${idBase}.closeSubmenu`)

  const buildTypeaheadItems = (items: readonly MenuItem[]): TypeaheadItem[] =>
    items
      .filter((item) => !item.disabled && item.label)
      .map((item) => ({id: item.id, text: normalizeTypeaheadText(item.label!)}))

  const handleTypeahead = action((char: string) => {
    if (!typeaheadEnabled || !isOpenAtom()) return

    const now = Date.now()
    const {query, next} = advanceTypeaheadState(typeaheadState, char, now, typeaheadTimeout)
    typeaheadState = next

    const parentId = openSubmenuIdAtom()
    if (parentId != null) {
      // Search within submenu items
      const subItems = submenuItemsMap.get(parentId) ?? []
      const typeaheadItems = buildTypeaheadItems(subItems)
      const currentId = submenuActiveIdAtom()
      const startIndex = currentId
        ? typeaheadItems.findIndex((item) => item.id === currentId) + 1
        : 0
      const matchId = findTypeaheadMatch(query, typeaheadItems, startIndex % typeaheadItems.length)
      if (matchId != null) {
        submenuActiveIdAtom.set(matchId)
      }
    } else {
      // Search within main menu items
      const typeaheadItems = buildTypeaheadItems(options.items)
      const currentId = activeIdAtom()
      const startIndex = currentId
        ? typeaheadItems.findIndex((item) => item.id === currentId) + 1
        : 0
      const matchId = findTypeaheadMatch(query, typeaheadItems, startIndex % typeaheadItems.length)
      if (matchId != null) {
        activeIdAtom.set(matchId)
      }
    }
  }, `${idBase}.handleTypeahead`)

  const handleTriggerKeyDown = action((event: Pick<KeyboardEvent, 'key'>) => {
    if (event.key === 'ArrowDown') {
      open('keyboard')
      activeIdAtom.set(enabledIds[0] ?? null)
      return
    }

    if (event.key === 'ArrowUp') {
      open('keyboard')
      activeIdAtom.set(enabledIds[enabledIds.length - 1] ?? null)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      toggle('keyboard')
    }
  }, `${idBase}.handleTriggerKeyDown`)

  const handleMenuKeyDown = action(
    (event: MenuKeyboardEventLike) => {
      if (!isOpenAtom()) return

      const submenuOpen = openSubmenuIdAtom() != null

      // Handle typeahead first (for printable chars that aren't handled by intent mapper)
      const typeaheadEvent = {
        key: event.key,
        shiftKey: event.shiftKey ?? false,
        ctrlKey: event.ctrlKey ?? false,
        metaKey: event.metaKey ?? false,
        altKey: event.altKey ?? false,
      }

      // Handle submenu-specific keys
      if (submenuOpen) {
        if (event.key === 'Escape') {
          closeSubmenu()
          return
        }
        if (event.key === 'ArrowLeft') {
          closeSubmenu()
          return
        }
        if (event.key === 'ArrowDown') {
          moveSubmenu(1)
          return
        }
        if (event.key === 'ArrowUp') {
          moveSubmenu(-1)
          return
        }
        if (event.key === 'Home') {
          const parentId = openSubmenuIdAtom()
          if (parentId) {
            const enabled = submenuEnabledIds.get(parentId)
            submenuActiveIdAtom.set(enabled?.[0] ?? null)
          }
          return
        }
        if (event.key === 'End') {
          const parentId = openSubmenuIdAtom()
          if (parentId) {
            const enabled = submenuEnabledIds.get(parentId)
            submenuActiveIdAtom.set(enabled?.[enabled.length - 1] ?? null)
          }
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          const subActiveId = submenuActiveIdAtom()
          if (subActiveId != null) {
            select(subActiveId)
          }
          return
        }

        // Typeahead in submenu
        if (isTypeaheadEvent(typeaheadEvent)) {
          handleTypeahead(event.key)
          return
        }
        return
      }

      // ArrowRight opens submenu if current item has one
      if (event.key === 'ArrowRight') {
        const currentActiveId = activeIdAtom()
        if (currentActiveId != null) {
          const item = itemById.get(currentActiveId)
          if (item?.hasSubmenu) {
            openSubmenu(currentActiveId)
          }
        }
        return
      }

      // ArrowLeft is no-op at top level
      if (event.key === 'ArrowLeft') {
        return
      }

      // Check for typeahead before falling through to intent mapper
      if (typeaheadEnabled && isTypeaheadEvent(typeaheadEvent)) {
        handleTypeahead(event.key)
        return
      }

      const intent = mapListboxKeyboardIntent(typeaheadEvent, {
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
        case 'ACTIVATE': {
          const activeId = activeIdAtom()
          if (activeId != null) {
            select(activeId)
          }
          return
        }
        case 'TOGGLE_SELECTION': {
          // Space for selection
          const activeId = activeIdAtom()
          if (activeId != null) {
            select(activeId)
          }
          return
        }
        case 'DISMISS':
          close()
          return
        default:
          return
      }
    },
    `${idBase}.handleMenuKeyDown`,
  )

  const cancelHoverIntent = () => {
    if (hoverIntentTimer != null) {
      clearTimeout(hoverIntentTimer)
      hoverIntentTimer = null
      hoverIntentTargetId = null
    }
  }

  const handleItemPointerEnter = action((id: string) => {
    // Always set activeId immediately
    if (enabledIds.includes(id)) {
      activeIdAtom.set(id)
    }

    const item = itemById.get(id)
    if (item?.hasSubmenu) {
      cancelHoverIntent()
      hoverIntentTargetId = id
      hoverIntentTimer = setTimeout(() => {
        openSubmenu(id)
        hoverIntentTimer = null
        hoverIntentTargetId = null
      }, 200)
    } else {
      cancelHoverIntent()
      // Close open submenu when hovering non-submenu item
      if (openSubmenuIdAtom() != null) {
        closeSubmenu()
      }
    }
  }, `${idBase}.handleItemPointerEnter`)

  const handleItemPointerLeave = action((id: string) => {
    if (hoverIntentTargetId === id) {
      cancelHoverIntent()
    }
  }, `${idBase}.handleItemPointerLeave`)

  const setSubmenuItems = (parentId: string, items: readonly MenuItem[]) => {
    rebuildSubmenuMaps(parentId, items)
  }

  const actions: MenuActions = {
    open,
    close,
    toggle,
    setActive: setActiveAction,
    moveNext,
    movePrev,
    moveFirst,
    moveLast,
    select,
    toggleCheck,
    openSubmenu,
    closeSubmenu,
    handleTypeahead,
    handleTriggerKeyDown,
    handleMenuKeyDown,
    handleItemPointerEnter,
    handleItemPointerLeave,
    setSubmenuItems,
  }

  if (isOpenAtom()) {
    setInitialActive()
  }

  const getItemRole = (item: MenuItem): 'menuitem' | 'menuitemcheckbox' | 'menuitemradio' => {
    if (item.type === 'checkbox') return 'menuitemcheckbox'
    if (item.type === 'radio') return 'menuitemradio'
    return 'menuitem'
  }

  const contracts: MenuContracts = {
    getTriggerProps() {
      if (splitButton) {
        // In split mode, getTriggerProps returns same as getSplitDropdownProps
        return this.getSplitDropdownProps() as unknown as MenuTriggerProps
      }
      return {
        id: `${idBase}-trigger`,
        tabindex: '0',
        'aria-haspopup': 'menu',
        'aria-expanded': isOpenAtom() ? 'true' : 'false',
        'aria-controls': menuId,
        'aria-label': options.ariaLabel,
      }
    },
    getMenuProps() {
      const activeId = activeIdAtom()
      const result: MenuProps = {
        id: menuId,
        role: 'menu',
        tabindex: '-1',
        'aria-label': options.ariaLabel,
      }
      if (isOpenAtom() && activeId != null) {
        result['aria-activedescendant'] = itemDomId(activeId)
      }
      return result
    },
    getItemProps(id: string) {
      const item = itemById.get(id)
      if (!item) {
        throw new Error(`Unknown menu item id: ${id}`)
      }

      const role = getItemRole(item)
      const checked = checkedIdsAtom()

      const result: MenuItemProps = {
        id: itemDomId(id),
        role,
        tabindex: '-1',
        'aria-disabled': item.disabled ? 'true' : undefined,
        'data-active': activeIdAtom() === id ? 'true' : 'false',
      }

      if (item.type === 'checkbox' || item.type === 'radio') {
        result['aria-checked'] = checked.has(id) ? 'true' : 'false'
      }

      if (item.hasSubmenu) {
        result['aria-haspopup'] = 'menu'
        result['aria-expanded'] = openSubmenuIdAtom() === id ? 'true' : 'false'
      }

      return result
    },
    getSubmenuProps(parentItemId: string) {
      const parentItem = itemById.get(parentItemId)
      return {
        id: `${idBase}-submenu-${parentItemId}`,
        role: 'menu',
        tabindex: '-1',
        hidden: openSubmenuIdAtom() !== parentItemId,
        'aria-label': parentItem?.label,
      }
    },
    getSubmenuItemProps(parentItemId: string, childId: string) {
      const item = submenuItemById.get(childId)
      if (!item) {
        throw new Error(`Unknown submenu item id: ${childId}`)
      }

      const role = getItemRole(item)
      const checked = checkedIdsAtom()

      const result: MenuItemProps = {
        id: `${idBase}-item-${childId}`,
        role,
        tabindex: '-1',
        'aria-disabled': item.disabled ? 'true' : undefined,
        'data-active': submenuActiveIdAtom() === childId ? 'true' : 'false',
      }

      if (item.type === 'checkbox' || item.type === 'radio') {
        result['aria-checked'] = checked.has(childId) ? 'true' : 'false'
      }

      return result
    },
    getSplitTriggerProps() {
      if (!splitButton) {
        throw new Error('getSplitTriggerProps requires splitButton option to be true')
      }
      return {
        id: `${idBase}-split-action`,
        tabindex: '0',
        role: 'button',
      }
    },
    getSplitDropdownProps() {
      if (!splitButton) {
        throw new Error('getSplitDropdownProps requires splitButton option to be true')
      }
      return {
        id: `${idBase}-split-dropdown`,
        tabindex: '0',
        role: 'button',
        'aria-haspopup': 'menu',
        'aria-expanded': isOpenAtom() ? 'true' : 'false',
        'aria-controls': menuId,
        'aria-label': options.ariaLabel ?? 'More options',
      }
    },
    getGroupProps(groupId: string) {
      const group = groupById.get(groupId)
      return {
        id: `${idBase}-group-${groupId}`,
        role: 'group',
        'aria-label': group?.label,
      }
    },
  }

  const state: MenuState = {
    isOpen: isOpenAtom,
    activeId: activeIdAtom,
    selectedId: selectedIdAtom,
    openedBy: openedByAtom,
    hasSelection: hasSelectionAtom,
    checkedIds: checkedIdsAtom,
    openSubmenuId: openSubmenuIdAtom,
    submenuActiveId: submenuActiveIdAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
