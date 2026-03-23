import {action, atom, type Atom} from '@reatom/core'
import {
  createCompositeNavigation,
  type CompositeNavigationOrientation,
} from '../interactions/composite-navigation'

export interface ToolbarItem {
  id: string
  disabled?: boolean
  separator?: boolean
}

export interface CreateToolbarOptions {
  items: readonly ToolbarItem[]
  idBase?: string
  orientation?: CompositeNavigationOrientation
  wrap?: boolean
  ariaLabel?: string
  initialActiveId?: string | null
}

export interface ToolbarState {
  activeId: Atom<string | null>
  lastActiveId: Atom<string | null>
  orientation: CompositeNavigationOrientation
}

export interface ToolbarActions {
  setActive(id: string): void
  moveNext(): void
  movePrev(): void
  moveFirst(): void
  moveLast(): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key'>): void
  handleToolbarFocus(): void
  handleToolbarBlur(): void
}

export interface ToolbarRootProps {
  id: string
  role: 'toolbar'
  'aria-orientation': CompositeNavigationOrientation
  'aria-label'?: string
}

export interface ToolbarItemProps {
  id: string
  tabindex: '0' | '-1'
  'aria-disabled'?: 'true'
  'data-active': 'true' | 'false'
  onFocus: () => void
}

export interface ToolbarSeparatorProps {
  id: string
  role: 'separator'
  'aria-orientation': 'vertical' | 'horizontal'
}

export interface ToolbarContracts {
  getRootProps(): ToolbarRootProps
  getItemProps(id: string): ToolbarItemProps
  getSeparatorProps(id: string): ToolbarSeparatorProps
}

export interface ToolbarModel {
  readonly state: ToolbarState
  readonly actions: ToolbarActions
  readonly contracts: ToolbarContracts
}

export function createToolbar(options: CreateToolbarOptions): ToolbarModel {
  const idBase = options.idBase ?? 'toolbar'
  const orientation = options.orientation ?? 'horizontal'
  const allItems = options.items

  // Separate navigable items (non-separator) from separator items
  const navigableItems = allItems.filter((item) => !item.separator)

  // Resolve initialActiveId: must be a navigable, enabled item
  const resolveInitialActiveId = (): string | null => {
    const enabledNavigable = navigableItems.filter((item) => !item.disabled)
    if (
      options.initialActiveId != null &&
      enabledNavigable.some((item) => item.id === options.initialActiveId)
    ) {
      return options.initialActiveId
    }
    return enabledNavigable[0]?.id ?? null
  }

  const navigation = createCompositeNavigation({
    idBase: `${idBase}.nav`,
    items: navigableItems,
    orientation,
    focusStrategy: 'roving-tabindex',
    wrapMode: options.wrap === false ? 'clamp' : 'wrap',
    initialActiveId: resolveInitialActiveId(),
  })

  const lastActiveIdAtom = atom<string | null>(null, `${idBase}.lastActiveId`)

  const setActive = action((id: string) => {
    // Only allow setting active to navigable (non-separator) items
    // The composite navigation already filters by disabled,
    // but we also need to reject separator ids
    const item = allItems.find((i) => i.id === id)
    if (!item || item.separator) return
    navigation.actions.setActive(id)
  }, `${idBase}.setActive`)

  const moveNext = action(() => {
    navigation.actions.moveNext()
  }, `${idBase}.moveNext`)

  const movePrev = action(() => {
    navigation.actions.movePrev()
  }, `${idBase}.movePrev`)

  const moveFirst = action(() => {
    navigation.actions.moveFirst()
  }, `${idBase}.moveFirst`)

  const moveLast = action(() => {
    navigation.actions.moveLast()
  }, `${idBase}.moveLast`)

  const handleKeyDown = action((event: Pick<KeyboardEvent, 'key'>) => {
    switch (event.key) {
      case 'Home':
        moveFirst()
        return
      case 'End':
        moveLast()
        return
      case 'ArrowRight':
        if (orientation === 'horizontal') {
          moveNext()
        }
        return
      case 'ArrowLeft':
        if (orientation === 'horizontal') {
          movePrev()
        }
        return
      case 'ArrowDown':
        if (orientation === 'vertical') {
          moveNext()
        }
        return
      case 'ArrowUp':
        if (orientation === 'vertical') {
          movePrev()
        }
        return
      default:
        return
    }
  }, `${idBase}.handleKeyDown`)

  const handleToolbarBlur = action(() => {
    lastActiveIdAtom.set(navigation.state.activeId())
  }, `${idBase}.handleToolbarBlur`)

  const handleToolbarFocus = action(() => {
    const lastId = lastActiveIdAtom()
    if (lastId == null) return

    // Check if lastActiveId still refers to a navigable (enabled, non-separator) item
    const item = navigableItems.find((i) => i.id === lastId)
    if (!item || item.disabled) return

    navigation.actions.setActive(lastId)
  }, `${idBase}.handleToolbarFocus`)

  const actions: ToolbarActions = {
    setActive,
    moveNext,
    movePrev,
    moveFirst,
    moveLast,
    handleKeyDown,
    handleToolbarFocus,
    handleToolbarBlur,
  }

  const contracts: ToolbarContracts = {
    getRootProps() {
      return {
        id: `${idBase}-root`,
        role: 'toolbar',
        'aria-orientation': orientation,
        'aria-label': options.ariaLabel,
      }
    },
    getItemProps(id: string) {
      const item = navigation.contracts.getItemFocusProps(id)

      return {
        ...item,
        onFocus: () => setActive(id),
      }
    },
    getSeparatorProps(id: string) {
      const item = allItems.find((i) => i.id === id)
      if (!item) {
        throw new Error(`Unknown toolbar item id: ${id}`)
      }
      if (!item.separator) {
        throw new Error(`Item "${id}" is not a separator`)
      }

      const perpendicularOrientation =
        orientation === 'horizontal' ? ('vertical' as const) : ('horizontal' as const)

      return {
        id: `${idBase}-separator-${id}`,
        role: 'separator' as const,
        'aria-orientation': perpendicularOrientation,
      }
    },
  }

  const state: ToolbarState = {
    activeId: navigation.state.activeId,
    lastActiveId: lastActiveIdAtom,
    orientation,
  }

  return {
    state,
    actions,
    contracts,
  }
}
