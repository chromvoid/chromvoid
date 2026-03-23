import {action, atom, type Atom} from '@reatom/core'
import {mapListboxKeyboardIntent} from '../interactions/keyboard-intents'

export type TabsOrientation = 'horizontal' | 'vertical'
export type TabsActivationMode = 'automatic' | 'manual'

export interface TabItem {
  id: string
  disabled?: boolean
}

export interface CreateTabsOptions {
  tabs: readonly TabItem[]
  idBase?: string
  ariaLabel?: string
  orientation?: TabsOrientation
  activationMode?: TabsActivationMode
  initialActiveTabId?: string | null
  initialSelectedTabId?: string | null
}

export interface TabsState {
  activeTabId: Atom<string | null>
  selectedTabId: Atom<string | null>
}

export interface TabListProps {
  id: string
  role: 'tablist'
  'aria-orientation': TabsOrientation
  'aria-label'?: string
}

export interface TabProps {
  id: string
  role: 'tab'
  tabindex: '0' | '-1'
  'aria-selected': 'true' | 'false'
  'aria-controls': string
  'aria-disabled'?: 'true'
  'data-active': 'true' | 'false'
  'data-selected': 'true' | 'false'
}

export interface TabPanelProps {
  id: string
  role: 'tabpanel'
  tabindex: '0' | '-1'
  'aria-labelledby': string
  hidden: boolean
}

export interface TabsActions {
  setActive(id: string | null): void
  select(id: string): void
  moveNext(): void
  movePrev(): void
  moveFirst(): void
  moveLast(): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>): void
}

export interface TabsContracts {
  getTabListProps(): TabListProps
  getTabProps(id: string): TabProps
  getPanelProps(id: string): TabPanelProps
}

export interface TabsModel {
  readonly state: TabsState
  readonly actions: TabsActions
  readonly contracts: TabsContracts
}

export function createTabs(options: CreateTabsOptions): TabsModel {
  const idBase = options.idBase ?? 'tabs'
  const orientation = options.orientation ?? 'horizontal'
  const activationMode = options.activationMode ?? 'automatic'

  const tabById = new Map(options.tabs.map((tab) => [tab.id, tab]))
  const enabledTabIds = options.tabs.filter((tab) => !tab.disabled).map((tab) => tab.id)

  const resolveInitial = (candidate: string | null | undefined) => {
    if (candidate != null && enabledTabIds.includes(candidate)) {
      return candidate
    }
    return enabledTabIds[0] ?? null
  }

  const initialSelected = resolveInitial(options.initialSelectedTabId)
  const initialActive = resolveInitial(options.initialActiveTabId ?? initialSelected)

  const activeTabIdAtom = atom<string | null>(initialActive, `${idBase}.activeTabId`)
  const selectedTabIdAtom = atom<string | null>(initialSelected, `${idBase}.selectedTabId`)

  if (selectedTabIdAtom() == null && activeTabIdAtom() != null) {
    selectedTabIdAtom.set(activeTabIdAtom())
  }

  const tabListId = `${idBase}-tablist`
  const tabDomId = (id: string) => `${idBase}-tab-${id}`
  const panelDomId = (id: string) => `${idBase}-panel-${id}`

  const applyAutoActivation = () => {
    if (activationMode === 'automatic' && activeTabIdAtom() != null) {
      selectedTabIdAtom.set(activeTabIdAtom())
    }
  }

  const move = (direction: 1 | -1) => {
    if (enabledTabIds.length === 0) {
      activeTabIdAtom.set(null)
      return
    }

    const activeTabId = activeTabIdAtom()
    if (activeTabId == null || !enabledTabIds.includes(activeTabId)) {
      activeTabIdAtom.set(enabledTabIds[0] ?? null)
      applyAutoActivation()
      return
    }

    const currentIndex = enabledTabIds.indexOf(activeTabId)
    const nextIndex = (currentIndex + direction + enabledTabIds.length) % enabledTabIds.length
    activeTabIdAtom.set(enabledTabIds[nextIndex] ?? null)
    applyAutoActivation()
  }

  const setActive = action((id: string | null) => {
    if (id == null) {
      activeTabIdAtom.set(null)
      return
    }

    if (!enabledTabIds.includes(id)) return

    activeTabIdAtom.set(id)
    applyAutoActivation()
  }, `${idBase}.setActive`)

  const select = action((id: string) => {
    if (!enabledTabIds.includes(id)) return

    activeTabIdAtom.set(id)
    selectedTabIdAtom.set(id)
  }, `${idBase}.select`)

  const moveNext = action(() => {
    move(1)
  }, `${idBase}.moveNext`)

  const movePrev = action(() => {
    move(-1)
  }, `${idBase}.movePrev`)

  const moveFirst = action(() => {
    activeTabIdAtom.set(enabledTabIds[0] ?? null)
    applyAutoActivation()
  }, `${idBase}.moveFirst`)

  const moveLast = action(() => {
    activeTabIdAtom.set(enabledTabIds[enabledTabIds.length - 1] ?? null)
    applyAutoActivation()
  }, `${idBase}.moveLast`)

  const handleKeyDown = action(
    (event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>) => {
      const intent = mapListboxKeyboardIntent(event, {
        orientation,
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
        case 'TOGGLE_SELECTION': {
          const activeTabId = activeTabIdAtom()
          if (activeTabId != null) {
            select(activeTabId)
          }
          return
        }
        default:
          return
      }
    },
    `${idBase}.handleKeyDown`,
  )

  const actions: TabsActions = {
    setActive,
    select,
    moveNext,
    movePrev,
    moveFirst,
    moveLast,
    handleKeyDown,
  }

  const contracts: TabsContracts = {
    getTabListProps() {
      const props: TabListProps = {
        id: tabListId,
        role: 'tablist',
        'aria-orientation': orientation,
      }
      if (options.ariaLabel != null) {
        props['aria-label'] = options.ariaLabel
      }
      return props
    },
    getTabProps(id: string) {
      const tab = tabById.get(id)
      if (!tab) {
        throw new Error(`Unknown tab id: ${id}`)
      }

      const isActive = activeTabIdAtom() === id
      const isSelected = selectedTabIdAtom() === id

      const props: TabProps = {
        id: tabDomId(id),
        role: 'tab',
        tabindex: isActive ? '0' : '-1',
        'aria-selected': isSelected ? 'true' : 'false',
        'aria-controls': panelDomId(id),
        'data-active': isActive ? 'true' : 'false',
        'data-selected': isSelected ? 'true' : 'false',
      }
      if (tab.disabled) {
        props['aria-disabled'] = 'true'
      }
      return props
    },
    getPanelProps(id: string) {
      if (!tabById.has(id)) {
        throw new Error(`Unknown tab id for panel: ${id}`)
      }

      const isSelected = selectedTabIdAtom() === id

      return {
        id: panelDomId(id),
        role: 'tabpanel',
        tabindex: isSelected ? '0' : '-1',
        'aria-labelledby': tabDomId(id),
        hidden: !isSelected,
      }
    },
  }

  const state: TabsState = {
    activeTabId: activeTabIdAtom,
    selectedTabId: selectedTabIdAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
