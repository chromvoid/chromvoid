import {action, atom, type Atom} from '@reatom/core'
import {createMenu, type MenuItem} from '../menu'
import {
  isTypeaheadEvent,
  advanceTypeaheadState,
  findTypeaheadMatch,
  createInitialTypeaheadState,
  normalizeTypeaheadText,
  type TypeaheadItem,
} from '../interactions/typeahead'

export type ContextMenuOpenSource = 'pointer' | 'keyboard' | 'programmatic'

export type ContextMenuItemType = 'item' | 'separator' | 'group-label' | 'checkbox' | 'radio' | 'submenu'

export interface ContextMenuItem {
  id: string
  label?: string
  disabled?: boolean
  type?: ContextMenuItemType
  /** Initial checked state for checkbox/radio items */
  checked?: boolean
  /** Radio group name for radio items */
  group?: string
  /** Children for submenu items */
  children?: readonly ContextMenuItem[]
}

export interface CreateContextMenuOptions {
  items: readonly ContextMenuItem[]
  idBase?: string
  ariaLabel?: string
  closeOnSelect?: boolean
  closeOnOutsidePointer?: boolean
  /** Long-press duration in ms for touch devices. Default: 500 */
  longPressDuration?: number
}

export interface ContextMenuState {
  isOpen: Atom<boolean>
  activeId: Atom<string | null>
  anchorX: Atom<number>
  anchorY: Atom<number>
  openedBy: Atom<ContextMenuOpenSource | null>
  restoreTargetId: Atom<string | null>
  checkedIds: Atom<ReadonlySet<string>>
  openSubmenuId: Atom<string | null>
  submenuActiveId: Atom<string | null>
}

export interface ContextMenuKeyboardEventLike {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

export interface ContextMenuActions {
  openAt(x: number, y: number, source?: ContextMenuOpenSource): void
  close(): void
  select(id: string): void
  handleTargetKeyDown(event: ContextMenuKeyboardEventLike): void
  handleKeyDown(event: ContextMenuKeyboardEventLike): void
  handleOutsidePointer(): void
  handleTouchStart(point: {clientX: number; clientY: number}): void
  handleTouchMove(): void
  handleTouchEnd(): void
}

export interface ContextMenuTargetProps {
  id: string
  onContextMenu: (event: {clientX: number; clientY: number; preventDefault?: () => void}) => void
  onKeyDown: (event: ContextMenuKeyboardEventLike) => void
}

export interface ContextMenuProps {
  id: string
  role: 'menu'
  tabindex: '-1'
  hidden: boolean
  'aria-label'?: string
  'data-anchor-x': string
  'data-anchor-y': string
  onKeyDown: (event: ContextMenuKeyboardEventLike) => void
}

export interface ContextMenuItemProps {
  id: string
  role: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio'
  tabindex: '-1'
  'aria-disabled'?: 'true'
  'data-active': 'true' | 'false'
  'aria-checked'?: 'true' | 'false'
  'aria-haspopup'?: 'menu'
  'aria-expanded'?: 'true' | 'false'
  onClick: () => void
}

export interface ContextMenuSeparatorProps {
  id: string
  role: 'separator'
}

export interface ContextMenuGroupLabelProps {
  id: string
  role: 'presentation'
  'aria-label'?: string
}

export interface ContextMenuSubmenuProps {
  id: string
  role: 'menu'
  tabindex: '-1'
  hidden: boolean
}

export interface ContextMenuContracts {
  getTargetProps(): ContextMenuTargetProps
  getMenuProps(): ContextMenuProps
  getItemProps(id: string): ContextMenuItemProps
  getSeparatorProps(id: string): ContextMenuSeparatorProps
  getGroupLabelProps(id: string): ContextMenuGroupLabelProps
  getSubmenuProps(id: string): ContextMenuSubmenuProps
}

export interface ContextMenuModel {
  readonly state: ContextMenuState
  readonly actions: ContextMenuActions
  readonly contracts: ContextMenuContracts
}

/** Returns true if the item is actionable (participates in navigation/selection) */
const isActionableItem = (item: ContextMenuItem): boolean =>
  item.type == null || item.type === 'item' || item.type === 'checkbox' || item.type === 'radio' || item.type === 'submenu'

/** Collects all items (including submenu children) into a flat id->item map */
const buildItemMap = (items: readonly ContextMenuItem[]): Map<string, ContextMenuItem> => {
  const map = new Map<string, ContextMenuItem>()
  for (const item of items) {
    map.set(item.id, item)
    if (item.type === 'submenu' && item.children) {
      for (const child of item.children) {
        map.set(child.id, child)
      }
    }
  }
  return map
}

const TYPEAHEAD_TIMEOUT = 500

export function createContextMenu(options: CreateContextMenuOptions): ContextMenuModel {
  const idBase = options.idBase ?? 'context-menu'
  const longPressDuration = options.longPressDuration ?? 500

  // Build full item map for lookups
  const allItemMap = buildItemMap(options.items)

  // Filter to actionable items for the composed menu
  const actionableItems: MenuItem[] = options.items
    .filter(isActionableItem)
    .map((item) => ({id: item.id, label: item.label, disabled: item.disabled}))

  const anchorXAtom = atom<number>(0, `${idBase}.anchorX`)
  const anchorYAtom = atom<number>(0, `${idBase}.anchorY`)
  const openedByAtom = atom<ContextMenuOpenSource | null>(null, `${idBase}.openedBy`)
  const restoreTargetIdAtom = atom<string | null>(null, `${idBase}.restoreTargetId`)

  // Checked state for checkbox/radio items
  const initialCheckedIds = new Set<string>()
  for (const item of options.items) {
    if ((item.type === 'checkbox' || item.type === 'radio') && item.checked) {
      initialCheckedIds.add(item.id)
    }
  }
  const checkedIdsAtom = atom<ReadonlySet<string>>(initialCheckedIds, `${idBase}.checkedIds`)

  // Sub-menu state
  const openSubmenuIdAtom = atom<string | null>(null, `${idBase}.openSubmenuId`)
  const submenuActiveIdAtom = atom<string | null>(null, `${idBase}.submenuActiveId`)

  // Build sub-menu maps: parentId -> children info
  const submenuItems = new Map<string, {enabledIds: string[]; allChildren: readonly ContextMenuItem[]}>()
  for (const item of options.items) {
    if (item.type === 'submenu' && item.children) {
      const enabledIds = item.children.filter((c) => !c.disabled).map((c) => c.id)
      submenuItems.set(item.id, {enabledIds, allChildren: item.children})
    }
  }

  // Typeahead state
  let typeaheadState = createInitialTypeaheadState()
  const typeaheadItems: TypeaheadItem[] = actionableItems
    .filter((item) => !item.disabled && item.label != null)
    .map((item) => ({id: item.id, text: normalizeTypeaheadText(item.label!)}))

  // Long-press timer
  let longPressTimer: ReturnType<typeof setTimeout> | null = null

  const menu = createMenu({
    idBase,
    items: actionableItems,
    ariaLabel: options.ariaLabel,
    closeOnSelect: options.closeOnSelect,
  })

  const clearLongPressTimer = () => {
    if (longPressTimer != null) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  const openAt = action((x: number, y: number, source: ContextMenuOpenSource = 'programmatic') => {
    anchorXAtom.set(x)
    anchorYAtom.set(y)
    openedByAtom.set(source)
    restoreTargetIdAtom.set(null)
    openSubmenuIdAtom.set(null)
    submenuActiveIdAtom.set(null)
    menu.actions.open(source)
  }, `${idBase}.openAt`)

  const close = action(() => {
    menu.actions.close()
    menu.actions.setActive(null)
    openedByAtom.set(null)
    restoreTargetIdAtom.set(`${idBase}-target`)
    openSubmenuIdAtom.set(null)
    submenuActiveIdAtom.set(null)
  }, `${idBase}.close`)

  const closeSubmenu = () => {
    openSubmenuIdAtom.set(null)
    submenuActiveIdAtom.set(null)
  }

  const handleCheckableSelect = (id: string): boolean => {
    const item = allItemMap.get(id)
    if (!item) return false

    if (item.type === 'checkbox') {
      const current = new Set(checkedIdsAtom())
      if (current.has(id)) {
        current.delete(id)
      } else {
        current.add(id)
      }
      checkedIdsAtom.set(current)
      return true
    }

    if (item.type === 'radio' && item.group) {
      const current = new Set(checkedIdsAtom())
      // Uncheck all items in the same radio group
      for (const groupItem of options.items) {
        if (groupItem.type === 'radio' && groupItem.group === item.group) {
          current.delete(groupItem.id)
        }
      }
      current.add(id)
      checkedIdsAtom.set(current)
      return true
    }

    return false
  }

  const select = action((id: string) => {
    const item = allItemMap.get(id)
    if (!item || item.disabled) return

    // Skip non-actionable items
    if (item.type === 'separator' || item.type === 'group-label') return

    // Handle checkable items
    handleCheckableSelect(id)

    // Check if it's a submenu child
    const isSubmenuChild = !actionableItems.some((ai) => ai.id === id)

    if (isSubmenuChild) {
      // Submenu child selected - close entire menu if closeOnSelect
      const closeOnSelect = options.closeOnSelect ?? true
      if (closeOnSelect) {
        close()
      }
      return
    }

    const wasOpen = menu.state.isOpen()
    menu.actions.select(id)

    if (wasOpen && !menu.state.isOpen()) {
      openedByAtom.set(null)
      restoreTargetIdAtom.set(`${idBase}-target`)
      openSubmenuIdAtom.set(null)
      submenuActiveIdAtom.set(null)
    }
  }, `${idBase}.select`)

  const handleTargetKeyDown = action((event: ContextMenuKeyboardEventLike) => {
    const isContextKey = event.key === 'ContextMenu'
    const isShiftF10 = event.key === 'F10' && event.shiftKey === true

    if (isContextKey || isShiftF10) {
      openAt(anchorXAtom(), anchorYAtom(), 'keyboard')
    }
  }, `${idBase}.handleTargetKeyDown`)

  const handleSubmenuKeyDown = (event: ContextMenuKeyboardEventLike): boolean => {
    const openSubId = openSubmenuIdAtom()
    if (openSubId == null) return false

    const subInfo = submenuItems.get(openSubId)
    if (!subInfo) return false

    if (event.key === 'Escape' || event.key === 'ArrowLeft') {
      closeSubmenu()
      return true
    }

    if (event.key === 'ArrowDown') {
      const activeId = submenuActiveIdAtom()
      const idx = activeId != null ? subInfo.enabledIds.indexOf(activeId) : -1
      const nextIdx = (idx + 1) % subInfo.enabledIds.length
      submenuActiveIdAtom.set(subInfo.enabledIds[nextIdx] ?? null)
      return true
    }

    if (event.key === 'ArrowUp') {
      const activeId = submenuActiveIdAtom()
      const idx = activeId != null ? subInfo.enabledIds.indexOf(activeId) : 0
      const nextIdx = (idx - 1 + subInfo.enabledIds.length) % subInfo.enabledIds.length
      submenuActiveIdAtom.set(subInfo.enabledIds[nextIdx] ?? null)
      return true
    }

    if (event.key === 'Home') {
      submenuActiveIdAtom.set(subInfo.enabledIds[0] ?? null)
      return true
    }

    if (event.key === 'End') {
      submenuActiveIdAtom.set(subInfo.enabledIds[subInfo.enabledIds.length - 1] ?? null)
      return true
    }

    if (event.key === 'Enter' || event.key === ' ') {
      const activeId = submenuActiveIdAtom()
      if (activeId != null) {
        select(activeId)
      }
      return true
    }

    return false
  }

  const handleKeyDown = action((event: ContextMenuKeyboardEventLike) => {
    if (!menu.state.isOpen()) return

    const keyEvent = {
      key: event.key,
      shiftKey: event.shiftKey ?? false,
      ctrlKey: event.ctrlKey ?? false,
      metaKey: event.metaKey ?? false,
      altKey: event.altKey ?? false,
    }

    // If a sub-menu is open, delegate to sub-menu handler first
    if (handleSubmenuKeyDown(event)) return

    if (event.key === 'Escape' || event.key === 'Tab') {
      close()
      return
    }

    // Check for ArrowRight to open sub-menu
    if (event.key === 'ArrowRight') {
      const activeId = menu.state.activeId()
      if (activeId != null && submenuItems.has(activeId)) {
        const subInfo = submenuItems.get(activeId)!
        openSubmenuIdAtom.set(activeId)
        submenuActiveIdAtom.set(subInfo.enabledIds[0] ?? null)
        return
      }
    }

    // Typeahead: check for printable character
    if (isTypeaheadEvent(keyEvent)) {
      const {query, next} = advanceTypeaheadState(typeaheadState, event.key, Date.now(), TYPEAHEAD_TIMEOUT)
      typeaheadState = next

      const currentActiveId = menu.state.activeId()
      const startIndex = currentActiveId != null
        ? typeaheadItems.findIndex((item) => item.id === currentActiveId)
        : 0

      const matchId = findTypeaheadMatch(query, typeaheadItems, startIndex >= 0 ? startIndex : 0)
      if (matchId != null) {
        menu.actions.setActive(matchId)
      }
      return
    }

    menu.actions.handleMenuKeyDown(keyEvent)
  }, `${idBase}.handleKeyDown`)

  const handleOutsidePointer = action(() => {
    if (options.closeOnOutsidePointer === false) return
    if (!menu.state.isOpen()) return
    close()
  }, `${idBase}.handleOutsidePointer`)

  const handleTouchStart = action((point: {clientX: number; clientY: number}) => {
    clearLongPressTimer()
    longPressTimer = setTimeout(() => {
      openAt(point.clientX, point.clientY, 'pointer')
      longPressTimer = null
    }, longPressDuration)
  }, `${idBase}.handleTouchStart`)

  const handleTouchMove = action(() => {
    clearLongPressTimer()
  }, `${idBase}.handleTouchMove`)

  const handleTouchEnd = action(() => {
    clearLongPressTimer()
  }, `${idBase}.handleTouchEnd`)

  const actions: ContextMenuActions = {
    openAt,
    close,
    select,
    handleTargetKeyDown,
    handleKeyDown,
    handleOutsidePointer,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  }

  const contracts: ContextMenuContracts = {
    getTargetProps() {
      return {
        id: `${idBase}-target`,
        onContextMenu: (event) => {
          event.preventDefault?.()
          openAt(event.clientX, event.clientY, 'pointer')
        },
        onKeyDown: handleTargetKeyDown,
      }
    },
    getMenuProps() {
      const menuProps = menu.contracts.getMenuProps()
      return {
        ...menuProps,
        hidden: !menu.state.isOpen(),
        'data-anchor-x': String(anchorXAtom()),
        'data-anchor-y': String(anchorYAtom()),
        onKeyDown: handleKeyDown,
      }
    },
    getItemProps(id: string) {
      const contextItem = allItemMap.get(id)
      if (!contextItem) {
        throw new Error(`Unknown context-menu item id: ${id}`)
      }

      const itemType = contextItem.type ?? 'item'

      // For submenu items, they are in the composed menu
      if (itemType === 'submenu') {
        const baseItem = menu.contracts.getItemProps(id)
        const isSubOpen = openSubmenuIdAtom() === id
        return {
          ...baseItem,
          role: 'menuitem' as const,
          'aria-haspopup': 'menu' as const,
          'aria-expanded': isSubOpen ? 'true' as const : 'false' as const,
          onClick: () => select(id),
        }
      }

      // For checkbox items
      if (itemType === 'checkbox') {
        const baseItem = menu.contracts.getItemProps(id)
        const isChecked = checkedIdsAtom().has(id)
        return {
          ...baseItem,
          role: 'menuitemcheckbox' as const,
          'aria-checked': isChecked ? 'true' as const : 'false' as const,
          onClick: () => select(id),
        }
      }

      // For radio items
      if (itemType === 'radio') {
        const baseItem = menu.contracts.getItemProps(id)
        const isChecked = checkedIdsAtom().has(id)
        return {
          ...baseItem,
          role: 'menuitemradio' as const,
          'aria-checked': isChecked ? 'true' as const : 'false' as const,
          onClick: () => select(id),
        }
      }

      // Regular item or submenu child
      // Check if it's a submenu child (not in actionable items)
      const isInMenu = actionableItems.some((ai) => ai.id === id)
      if (!isInMenu) {
        // Sub-menu child item - build props manually
        const subActiveId = submenuActiveIdAtom()
        return {
          id: `${idBase}-item-${id}`,
          role: 'menuitem' as const,
          tabindex: '-1' as const,
          'aria-disabled': contextItem.disabled ? 'true' as const : undefined,
          'data-active': (subActiveId === id ? 'true' : 'false') as 'true' | 'false',
          onClick: () => select(id),
        }
      }

      const item = menu.contracts.getItemProps(id)
      return {
        ...item,
        onClick: () => select(id),
      }
    },
    getSeparatorProps(id: string): ContextMenuSeparatorProps {
      return {
        id: `${idBase}-separator-${id}`,
        role: 'separator',
      }
    },
    getGroupLabelProps(id: string): ContextMenuGroupLabelProps {
      const item = allItemMap.get(id)
      return {
        id: `${idBase}-group-${id}`,
        role: 'presentation',
        'aria-label': item?.label,
      }
    },
    getSubmenuProps(id: string): ContextMenuSubmenuProps {
      return {
        id: `${idBase}-submenu-${id}`,
        role: 'menu',
        tabindex: '-1',
        hidden: openSubmenuIdAtom() !== id,
      }
    },
  }

  const state: ContextMenuState = {
    isOpen: menu.state.isOpen,
    activeId: menu.state.activeId,
    anchorX: anchorXAtom,
    anchorY: anchorYAtom,
    openedBy: openedByAtom,
    restoreTargetId: restoreTargetIdAtom,
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
