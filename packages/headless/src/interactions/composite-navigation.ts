import {action, atom, computed, type Atom, type Computed} from '@reatom/core'

export type CompositeNavigationOrientation = 'horizontal' | 'vertical'
export type CompositeFocusStrategy = 'roving-tabindex' | 'aria-activedescendant'
export type CompositeWrapMode = 'wrap' | 'clamp'

export interface CompositeNavigationItem {
  id: string
  disabled?: boolean
}

export interface CompositeKeyboardEventLike {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}

export interface CompositeKeyboardIntentContext {
  orientation: CompositeNavigationOrientation
  homeEndEnabled?: boolean
}

export type CompositeKeyboardIntent = 'NAV_NEXT' | 'NAV_PREV' | 'NAV_FIRST' | 'NAV_LAST'

export interface CreateCompositeNavigationOptions {
  items: readonly CompositeNavigationItem[]
  idBase?: string
  orientation?: CompositeNavigationOrientation
  focusStrategy?: CompositeFocusStrategy
  wrapMode?: CompositeWrapMode
  initialActiveId?: string | null
}

export interface CompositeNavigationState {
  items: Atom<CompositeNavigationItem[]>
  activeId: Atom<string | null>
  enabledIds: Computed<readonly string[]>
  activeDomId: Computed<string | null>
  orientation: CompositeNavigationOrientation
  focusStrategy: CompositeFocusStrategy
  wrapMode: CompositeWrapMode
}

export interface CompositeNavigationActions {
  setItems(items: readonly CompositeNavigationItem[]): void
  setActive(id: string | null): void
  moveNext(): void
  movePrev(): void
  moveFirst(): void
  moveLast(): void
  handleKeyDown(event: CompositeKeyboardEventLike): void
}

export interface CompositeContainerFocusProps {
  tabindex: '0' | '-1'
  'aria-activedescendant'?: string
}

export interface CompositeItemFocusProps {
  id: string
  tabindex: '0' | '-1'
  'aria-disabled'?: 'true'
  'data-active': 'true' | 'false'
}

export interface CompositeNavigationContracts {
  getContainerFocusProps(): CompositeContainerFocusProps
  getItemFocusProps(id: string): CompositeItemFocusProps
}

export interface CompositeNavigationModel {
  readonly state: CompositeNavigationState
  readonly actions: CompositeNavigationActions
  readonly contracts: CompositeNavigationContracts
}

export const getEnabledCompositeIds = (items: readonly CompositeNavigationItem[]) =>
  items.filter((item) => !item.disabled).map((item) => item.id)

export const getNextCompositeIndex = (
  currentIndex: number,
  direction: 1 | -1,
  size: number,
  wrapMode: CompositeWrapMode,
) => {
  if (size <= 0) return -1

  if (wrapMode === 'wrap') {
    return (currentIndex + direction + size) % size
  }

  const candidate = currentIndex + direction
  if (candidate < 0) return 0
  if (candidate >= size) return size - 1
  return candidate
}

export const mapCompositeNavigationIntent = (
  event: CompositeKeyboardEventLike,
  context: CompositeKeyboardIntentContext,
): CompositeKeyboardIntent | null => {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null
  }

  const nextKey = context.orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
  const prevKey = context.orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'

  if (event.key === nextKey) return 'NAV_NEXT'
  if (event.key === prevKey) return 'NAV_PREV'

  if (context.homeEndEnabled !== false) {
    if (event.key === 'Home') return 'NAV_FIRST'
    if (event.key === 'End') return 'NAV_LAST'
  }

  return null
}

export function createCompositeNavigation(
  options: CreateCompositeNavigationOptions,
): CompositeNavigationModel {
  const idBase = options.idBase ?? 'composite-nav'
  const orientation = options.orientation ?? 'horizontal'
  const focusStrategy = options.focusStrategy ?? 'roving-tabindex'
  const wrapMode = options.wrapMode ?? 'wrap'

  const itemsAtom = atom<CompositeNavigationItem[]>([...options.items], `${idBase}.items`)
  const enabledIdsAtom = computed(() => getEnabledCompositeIds(itemsAtom()), `${idBase}.enabledIds`)

  const resolveInitialActiveId = () => {
    const enabledIds = getEnabledCompositeIds(options.items)

    if (options.initialActiveId != null && enabledIds.includes(options.initialActiveId)) {
      return options.initialActiveId
    }

    return enabledIds[0] ?? null
  }

  const activeIdAtom = atom<string | null>(resolveInitialActiveId(), `${idBase}.activeId`)
  const itemDomId = (id: string) => `${idBase}-item-${id}`
  const activeDomIdAtom = computed(() => {
    const activeId = activeIdAtom()
    return activeId == null ? null : itemDomId(activeId)
  }, `${idBase}.activeDomId`)

  const ensureActiveInvariant = () => {
    const enabledIds = enabledIdsAtom()
    if (enabledIds.length === 0) {
      activeIdAtom.set(null)
      return
    }

    const activeId = activeIdAtom()
    if (activeId == null || !enabledIds.includes(activeId)) {
      activeIdAtom.set(enabledIds[0] ?? null)
    }
  }

  const move = (direction: 1 | -1) => {
    const enabledIds = enabledIdsAtom()
    if (enabledIds.length === 0) {
      activeIdAtom.set(null)
      return
    }

    const activeId = activeIdAtom()
    if (activeId == null || !enabledIds.includes(activeId)) {
      activeIdAtom.set(
        direction === -1 ? (enabledIds[enabledIds.length - 1] ?? null) : (enabledIds[0] ?? null),
      )
      return
    }

    const currentIndex = enabledIds.indexOf(activeId)
    const nextIndex = getNextCompositeIndex(currentIndex, direction, enabledIds.length, wrapMode)
    activeIdAtom.set(enabledIds[nextIndex] ?? null)
  }

  const setItems = action((items: readonly CompositeNavigationItem[]) => {
    itemsAtom.set([...items])
    ensureActiveInvariant()
  }, `${idBase}.setItems`)

  const setActive = action((id: string | null) => {
    if (id == null) {
      activeIdAtom.set(null)
      return
    }

    if (!enabledIdsAtom().includes(id)) return
    activeIdAtom.set(id)
  }, `${idBase}.setActive`)

  const moveNext = action(() => {
    move(1)
  }, `${idBase}.moveNext`)

  const movePrev = action(() => {
    move(-1)
  }, `${idBase}.movePrev`)

  const moveFirst = action(() => {
    activeIdAtom.set(enabledIdsAtom()[0] ?? null)
  }, `${idBase}.moveFirst`)

  const moveLast = action(() => {
    const enabledIds = enabledIdsAtom()
    activeIdAtom.set(enabledIds[enabledIds.length - 1] ?? null)
  }, `${idBase}.moveLast`)

  const handleKeyDown = action((event: CompositeKeyboardEventLike) => {
    const intent = mapCompositeNavigationIntent(event, {orientation})

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
      default:
        return
    }
  }, `${idBase}.handleKeyDown`)

  const actions: CompositeNavigationActions = {
    setItems,
    setActive,
    moveNext,
    movePrev,
    moveFirst,
    moveLast,
    handleKeyDown,
  }

  const contracts: CompositeNavigationContracts = {
    getContainerFocusProps() {
      return {
        tabindex: focusStrategy === 'aria-activedescendant' ? '0' : '-1',
        'aria-activedescendant':
          focusStrategy === 'aria-activedescendant' ? (activeDomIdAtom() ?? undefined) : undefined,
      }
    },
    getItemFocusProps(id: string) {
      const item = itemsAtom().find((current) => current.id === id)
      if (!item) {
        throw new Error(`Unknown composite navigation item id: ${id}`)
      }

      const isActive = activeIdAtom() === id
      return {
        id: itemDomId(id),
        tabindex: focusStrategy === 'roving-tabindex' && isActive ? '0' : '-1',
        'aria-disabled': item.disabled ? 'true' : undefined,
        'data-active': isActive ? 'true' : 'false',
      }
    },
  }

  const state: CompositeNavigationState = {
    items: itemsAtom,
    activeId: activeIdAtom,
    enabledIds: enabledIdsAtom,
    activeDomId: activeDomIdAtom,
    orientation,
    focusStrategy,
    wrapMode,
  }

  return {
    state,
    actions,
    contracts,
  }
}
