import {action, atom, type Atom} from '@reatom/core'
import {selectOnly as selectOnlyPrimitive, toggleSelection} from '../core/selection'
import {mapListboxKeyboardIntent} from '../interactions/keyboard-intents'

export type TreeSelectionMode = 'single' | 'multiple'

export interface TreeNode {
  id: string
  label?: string
  disabled?: boolean
  children?: readonly TreeNode[]
}

export interface CreateTreeviewOptions {
  nodes: readonly TreeNode[]
  idBase?: string
  ariaLabel?: string
  selectionMode?: TreeSelectionMode
  initialExpandedIds?: readonly string[]
  initialActiveId?: string | null
  initialSelectedIds?: readonly string[]
}

interface TreeNodeMeta {
  id: string
  parentId: string | null
  childIds: string[]
  level: number
  posInSet: number
  setSize: number
  disabled: boolean
}

export interface TreeviewState {
  activeId: Atom<string | null>
  selectedIds: Atom<string[]>
  expandedIds: Atom<string[]>
}

export interface TreeProps {
  role: 'tree'
  tabindex: '0'
  'aria-label'?: string
  'aria-multiselectable'?: 'true'
}

export interface TreeItemProps {
  id: string
  role: 'treeitem'
  tabindex: '0' | '-1'
  'aria-level': number
  'aria-posinset': number
  'aria-setsize': number
  'aria-expanded'?: 'true' | 'false'
  'aria-selected': 'true' | 'false'
  'aria-disabled'?: 'true'
  'data-active': 'true' | 'false'
  'data-expanded'?: 'true' | 'false'
}

export interface TreeviewActions {
  setActive(id: string | null): void
  moveNext(): void
  movePrev(): void
  moveFirst(): void
  moveLast(): void
  expand(id: string): void
  collapse(id: string): void
  toggleExpanded(id: string): void
  expandActive(): void
  collapseActive(): void
  select(id: string): void
  toggleSelected(id: string): void
  clearSelected(): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>): void
}

export interface TreeviewContracts {
  getTreeProps(): TreeProps
  getItemProps(id: string): TreeItemProps
  getVisibleNodeIds(): readonly string[]
}

export interface TreeviewModel {
  readonly state: TreeviewState
  readonly actions: TreeviewActions
  readonly contracts: TreeviewContracts
}

const normalizeIds = (ids: readonly string[], allowedIds: ReadonlySet<string>) => {
  const deduped: string[] = []
  for (const id of ids) {
    if (!allowedIds.has(id) || deduped.includes(id)) continue
    deduped.push(id)
  }
  return deduped
}

const collectDescendants = (metaById: Map<string, TreeNodeMeta>, id: string): string[] => {
  const descendants: string[] = []
  const queue = [...(metaById.get(id)?.childIds ?? [])]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    descendants.push(current)
    const children = metaById.get(current)?.childIds ?? []
    queue.push(...children)
  }

  return descendants
}

const buildTreeMeta = (nodes: readonly TreeNode[]) => {
  const metaById = new Map<string, TreeNodeMeta>()
  const rootIds: string[] = []

  const visit = (siblings: readonly TreeNode[], parentId: string | null, level: number) => {
    const setSize = siblings.length
    siblings.forEach((node, index) => {
      const childIds = (node.children ?? []).map((child) => child.id)
      metaById.set(node.id, {
        id: node.id,
        parentId,
        childIds,
        level,
        posInSet: index + 1,
        setSize,
        disabled: node.disabled === true,
      })

      if (parentId == null) rootIds.push(node.id)
      if ((node.children?.length ?? 0) > 0) visit(node.children ?? [], node.id, level + 1)
    })
  }

  visit(nodes, null, 1)
  return {metaById, rootIds}
}

export function createTreeview(options: CreateTreeviewOptions): TreeviewModel {
  const idBase = options.idBase ?? 'tree'
  const selectionMode = options.selectionMode ?? 'single'

  const {metaById, rootIds} = buildTreeMeta(options.nodes)
  const allIds = [...metaById.keys()]
  const allIdSet = new Set(allIds)

  const enabledIds = allIds.filter((id) => metaById.get(id)?.disabled !== true)
  const enabledIdSet = new Set(enabledIds)

  const isBranch = (id: string) => (metaById.get(id)?.childIds.length ?? 0) > 0

  const expandedIdsAtom = atom<string[]>(
    normalizeIds(options.initialExpandedIds ?? [], allIdSet).filter((id) => isBranch(id)),
    `${idBase}.expandedIds`,
  )
  const activeIdAtom = atom<string | null>(null, `${idBase}.activeId`)
  const selectedIdsAtom = atom<string[]>([], `${idBase}.selectedIds`)

  const isVisible = (id: string, expandedSet: ReadonlySet<string>) => {
    let parentId = metaById.get(id)?.parentId ?? null
    while (parentId != null) {
      if (!expandedSet.has(parentId)) {
        return false
      }
      parentId = metaById.get(parentId)?.parentId ?? null
    }
    return true
  }

  const getVisibleNodeIds = () => {
    const expandedSet = new Set(expandedIdsAtom())
    const visible: string[] = []

    const visit = (id: string) => {
      if (!metaById.has(id)) return

      visible.push(id)
      if (!expandedSet.has(id)) return

      const childIds = metaById.get(id)?.childIds ?? []
      for (const childId of childIds) {
        visit(childId)
      }
    }

    for (const rootId of rootIds) {
      visit(rootId)
    }

    return visible
  }

  const getVisibleEnabledNodeIds = () => getVisibleNodeIds().filter((id) => enabledIdSet.has(id))

  const setActive = (id: string | null) => {
    if (id == null) {
      activeIdAtom.set(null)
      return
    }

    if (!enabledIdSet.has(id)) return
    const visibleIds = getVisibleEnabledNodeIds()
    if (!visibleIds.includes(id)) return

    activeIdAtom.set(id)
  }

  const resolveInitialActive = () => {
    if (options.initialActiveId != null && enabledIdSet.has(options.initialActiveId)) {
      const visibleIds = getVisibleEnabledNodeIds()
      if (visibleIds.includes(options.initialActiveId)) {
        return options.initialActiveId
      }
    }

    return getVisibleEnabledNodeIds()[0] ?? null
  }

  activeIdAtom.set(resolveInitialActive())

  const initialSelectedIds = normalizeIds(options.initialSelectedIds ?? [], enabledIdSet)
  selectedIdsAtom.set(selectionMode === 'single' ? initialSelectedIds.slice(0, 1) : initialSelectedIds)

  const applySelectionFollowsFocus = (newActiveId: string | null) => {
    if (selectionMode === 'single' && newActiveId != null && enabledIdSet.has(newActiveId)) {
      selectedIdsAtom.set([newActiveId])
    }
  }

  const move = (direction: 1 | -1) => {
    const visibleEnabledIds = getVisibleEnabledNodeIds()
    if (visibleEnabledIds.length === 0) {
      activeIdAtom.set(null)
      return
    }

    const activeId = activeIdAtom()
    if (activeId == null || !visibleEnabledIds.includes(activeId)) {
      const newActiveId = visibleEnabledIds[0] ?? null
      activeIdAtom.set(newActiveId)
      applySelectionFollowsFocus(newActiveId)
      return
    }

    const currentIndex = visibleEnabledIds.indexOf(activeId)
    const nextIndex = (currentIndex + direction + visibleEnabledIds.length) % visibleEnabledIds.length
    const newActiveId = visibleEnabledIds[nextIndex] ?? null
    activeIdAtom.set(newActiveId)
    applySelectionFollowsFocus(newActiveId)
  }

  const collapseWithInvariant = (id: string) => {
    if (!isBranch(id)) return

    expandedIdsAtom.set(expandedIdsAtom().filter((item) => item !== id))

    const activeId = activeIdAtom()
    if (activeId == null || activeId === id) return

    const descendants = collectDescendants(metaById, id)
    if (descendants.includes(activeId)) {
      activeIdAtom.set(enabledIdSet.has(id) ? id : (getVisibleEnabledNodeIds()[0] ?? null))
    }
  }

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
    const newActiveId = getVisibleEnabledNodeIds()[0] ?? null
    activeIdAtom.set(newActiveId)
    applySelectionFollowsFocus(newActiveId)
  }, `${idBase}.moveFirst`)

  const moveLast = action(() => {
    const visibleEnabledIds = getVisibleEnabledNodeIds()
    const newActiveId = visibleEnabledIds[visibleEnabledIds.length - 1] ?? null
    activeIdAtom.set(newActiveId)
    applySelectionFollowsFocus(newActiveId)
  }, `${idBase}.moveLast`)

  const expand = action((id: string) => {
    if (!isBranch(id)) return
    if (!expandedIdsAtom().includes(id)) {
      expandedIdsAtom.set([...expandedIdsAtom(), id])
    }
  }, `${idBase}.expand`)

  const collapse = action((id: string) => {
    collapseWithInvariant(id)
  }, `${idBase}.collapse`)

  const toggleExpanded = action((id: string) => {
    if (!isBranch(id)) return
    if (expandedIdsAtom().includes(id)) {
      collapseWithInvariant(id)
    } else {
      expand(id)
    }
  }, `${idBase}.toggleExpanded`)

  const expandActive = action(() => {
    const activeId = activeIdAtom()
    if (activeId == null) return
    expand(activeId)
  }, `${idBase}.expandActive`)

  const collapseActive = action(() => {
    const activeId = activeIdAtom()
    if (activeId == null) return
    collapse(activeId)
  }, `${idBase}.collapseActive`)

  const select = action((id: string) => {
    if (!enabledIdSet.has(id)) return

    if (selectionMode === 'single') {
      selectedIdsAtom.set(selectOnlyPrimitive(id, enabledIdSet))
    } else {
      selectedIdsAtom.set([id])
    }

    activeIdAtom.set(id)
  }, `${idBase}.select`)

  const toggleSelected = action((id: string) => {
    selectedIdsAtom.set(toggleSelection(selectedIdsAtom(), id, selectionMode, enabledIdSet))
    if (enabledIdSet.has(id)) {
      activeIdAtom.set(id)
    }
  }, `${idBase}.toggleSelected`)

  const clearSelected = action(() => {
    selectedIdsAtom.set([])
  }, `${idBase}.clearSelected`)

  const handleKeyDown = action(
    (event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>) => {
      const activeId = activeIdAtom()

      if (event.key === 'ArrowRight') {
        if (activeId == null) {
          moveFirst()
          return
        }

        const meta = metaById.get(activeId)
        if (!meta) return

        const isExpanded = expandedIdsAtom().includes(activeId)
        if (meta.childIds.length > 0 && !isExpanded) {
          expand(activeId)
          return
        }

        if (meta.childIds.length > 0 && isExpanded) {
          const firstEnabledChild = meta.childIds.find((id) => enabledIdSet.has(id))
          if (firstEnabledChild != null && isVisible(firstEnabledChild, new Set(expandedIdsAtom()))) {
            activeIdAtom.set(firstEnabledChild)
          }
        }
        return
      }

      if (event.key === 'ArrowLeft') {
        if (activeId == null) {
          moveFirst()
          return
        }

        const meta = metaById.get(activeId)
        if (!meta) return

        if (meta.childIds.length > 0 && expandedIdsAtom().includes(activeId)) {
          collapse(activeId)
          return
        }

        let parentId = meta.parentId
        while (parentId != null) {
          if (enabledIdSet.has(parentId)) {
            activeIdAtom.set(parentId)
            return
          }
          parentId = metaById.get(parentId)?.parentId ?? null
        }
        return
      }

      const intent = mapListboxKeyboardIntent(event, {
        orientation: 'vertical',
        selectionMode,
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
        case 'TOGGLE_SELECTION': {
          const currentActiveId = activeIdAtom()
          if (currentActiveId != null) {
            toggleSelected(currentActiveId)
          }
          return
        }
        case 'ACTIVATE': {
          const currentActiveId = activeIdAtom()
          if (currentActiveId != null) {
            select(currentActiveId)
          }
          return
        }
        case 'SELECT_ALL':
          if (selectionMode === 'multiple') {
            selectedIdsAtom.set([...enabledIds])
          }
          return
        default:
          return
      }
    },
    `${idBase}.handleKeyDown`,
  )

  const actions: TreeviewActions = {
    setActive: setActiveAction,
    moveNext,
    movePrev,
    moveFirst,
    moveLast,
    expand,
    collapse,
    toggleExpanded,
    expandActive,
    collapseActive,
    select,
    toggleSelected,
    clearSelected,
    handleKeyDown,
  }

  const contracts: TreeviewContracts = {
    getTreeProps() {
      return {
        role: 'tree',
        tabindex: '0',
        'aria-label': options.ariaLabel,
        'aria-multiselectable': selectionMode === 'multiple' ? 'true' : undefined,
      }
    },
    getItemProps(id: string) {
      const meta = metaById.get(id)
      if (!meta) {
        throw new Error(`Unknown tree node id: ${id}`)
      }

      const expanded = meta.childIds.length > 0 ? expandedIdsAtom().includes(id) : undefined

      return {
        id: `${idBase}-item-${id}`,
        role: 'treeitem',
        tabindex: activeIdAtom() === id ? '0' : '-1',
        'aria-level': meta.level,
        'aria-posinset': meta.posInSet,
        'aria-setsize': meta.setSize,
        'aria-expanded': expanded == null ? undefined : expanded ? 'true' : 'false',
        'aria-selected': selectedIdsAtom().includes(id) ? 'true' : 'false',
        'aria-disabled': meta.disabled ? 'true' : undefined,
        'data-active': activeIdAtom() === id ? 'true' : 'false',
        'data-expanded': expanded == null ? undefined : expanded ? 'true' : 'false',
      }
    },
    getVisibleNodeIds,
  }

  const state: TreeviewState = {
    activeId: activeIdAtom,
    selectedIds: selectedIdsAtom,
    expandedIds: expandedIdsAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
