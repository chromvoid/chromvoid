import {action, atom, computed, type Atom, type Computed} from '@reatom/core'
import {createCompositeNavigation} from '../interactions/composite-navigation'

export interface AccordionSection {
  id: string
  disabled?: boolean
}

export interface CreateAccordionOptions {
  sections: readonly AccordionSection[]
  idBase?: string
  allowMultiple?: boolean
  allowZeroExpanded?: boolean
  initialExpandedIds?: readonly string[]
  ariaLabel?: string
  headingLevel?: number
}

export interface AccordionState {
  expandedIds: Atom<Set<string>>
  focusedId: Atom<string | null>
  value: Computed<string | null>
  expandedValues: Computed<string[]>
  sections: Atom<readonly AccordionSection[]>
  allowMultiple: Atom<boolean>
  allowZeroExpanded: Atom<boolean>
  headingLevel: Atom<number>
  ariaLabel: Atom<string | undefined>
}

export interface AccordionActions {
  toggle(id: string): void
  expand(id: string): void
  collapse(id: string): void
  setFocused(id: string): void
  moveNext(): void
  movePrev(): void
  moveFirst(): void
  moveLast(): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key'>): void
  setSections(sections: readonly AccordionSection[]): void
  setAllowMultiple(value: boolean): void
  setAllowZeroExpanded(value: boolean): void
  setHeadingLevel(level: number): void
  setAriaLabel(label: string | undefined): void
  setExpandedIds(ids: readonly string[]): void
}

export interface AccordionRootProps {
  id: string
  'aria-label'?: string
}

export interface AccordionHeaderProps {
  id: string
}

export interface AccordionTriggerProps {
  id: string
  role: 'button'
  tabindex: '0' | '-1'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string
  'aria-disabled': 'true' | 'false'
  onClick: () => void
  onFocus: () => void
  onKeyDown: (event: Pick<KeyboardEvent, 'key'>) => void
}

export interface AccordionPanelProps {
  id: string
  role: 'region'
  'aria-labelledby': string
  hidden: boolean
}

export interface AccordionContracts {
  getRootProps(): AccordionRootProps
  getHeaderProps(id: string): AccordionHeaderProps
  getTriggerProps(id: string): AccordionTriggerProps
  getPanelProps(id: string): AccordionPanelProps
}

export interface AccordionModel {
  readonly state: AccordionState
  readonly actions: AccordionActions
  readonly contracts: AccordionContracts
}

const isSpaceKey = (key: string) => key === ' ' || key === 'Spacebar'

export function createAccordion(options: CreateAccordionOptions): AccordionModel {
  const idBase = options.idBase ?? 'accordion'

  const allowMultipleAtom = atom(options.allowMultiple ?? false, `${idBase}.allowMultiple`)
  const allowZeroExpandedAtom = atom(options.allowZeroExpanded ?? true, `${idBase}.allowZeroExpanded`)
  const headingLevelAtom = atom(options.headingLevel ?? 3, `${idBase}.headingLevel`)
  const ariaLabelAtom = atom<string | undefined>(options.ariaLabel, `${idBase}.ariaLabel`)
  const sectionsAtom = atom<readonly AccordionSection[]>([...options.sections], `${idBase}.sections`)

  const sectionIdsComputed = computed(
    () => new Set(sectionsAtom().map((s) => s.id)),
    `${idBase}.sectionIds`,
  )
  const sectionByIdComputed = computed(
    () => new Map(sectionsAtom().map((s) => [s.id, s])),
    `${idBase}.sectionById`,
  )

  const normalizeInitialExpandedIds = (): Set<string> => {
    const sectionIdSet = new Set(options.sections.map((s) => s.id))
    const unique = [...new Set(options.initialExpandedIds ?? [])].filter((id) => sectionIdSet.has(id))
    const allowMultiple = options.allowMultiple ?? false
    const allowZeroExpanded = options.allowZeroExpanded ?? true

    if (!allowMultiple && unique.length > 1) {
      const first = unique[0]
      return first == null ? new Set<string>() : new Set([first])
    }

    if (!allowZeroExpanded && unique.length === 0) {
      const first = options.sections[0]?.id
      return first == null ? new Set<string>() : new Set([first])
    }

    return new Set(unique)
  }

  const expandedIdsAtom = atom<Set<string>>(normalizeInitialExpandedIds(), `${idBase}.expandedIds`)

  const valueComputed = computed(() => {
    const ids = expandedIdsAtom()
    const first = ids.values().next()
    return first.done ? null : first.value
  }, `${idBase}.value`)

  const expandedValuesComputed = computed(() => [...expandedIdsAtom()], `${idBase}.expandedValues`)

  const navigation = createCompositeNavigation({
    idBase: `${idBase}.nav`,
    orientation: 'vertical',
    focusStrategy: 'roving-tabindex',
    wrapMode: 'wrap',
    items: options.sections,
  })

  const canExpand = (id: string) =>
    sectionIdsComputed().has(id) && sectionByIdComputed().get(id)?.disabled !== true

  const isOnlyExpanded = (id: string, expandedIds: Set<string>) =>
    expandedIds.size === 1 && expandedIds.has(id)

  const updateExpanded = (updater: (current: Set<string>) => Set<string>) => {
    const current = expandedIdsAtom()
    const next = updater(current)
    expandedIdsAtom.set(next)
  }

  const enforceExpandedInvariants = () => {
    const allowMultiple = allowMultipleAtom()
    const allowZeroExpanded = allowZeroExpandedAtom()
    const sectionIds = sectionIdsComputed()
    const current = expandedIdsAtom()

    let next = new Set([...current].filter((id) => sectionIds.has(id)))

    if (!allowMultiple && next.size > 1) {
      const first = next.values().next().value
      next = first != null ? new Set([first]) : new Set()
    }

    if (!allowZeroExpanded && next.size === 0) {
      const sections = sectionsAtom()
      const firstEnabled = sections.find((s) => !s.disabled)
      if (firstEnabled) {
        next = new Set([firstEnabled.id])
      }
    }

    expandedIdsAtom.set(next)
  }

  const expand = action((id: string) => {
    if (!canExpand(id)) return

    updateExpanded((current) => {
      if (current.has(id)) return current

      if (!allowMultipleAtom()) {
        return new Set([id])
      }

      const next = new Set(current)
      next.add(id)
      return next
    })
  }, `${idBase}.expand`)

  const collapse = action((id: string) => {
    if (!canExpand(id)) return

    updateExpanded((current) => {
      if (!current.has(id)) return current
      if (!allowZeroExpandedAtom() && isOnlyExpanded(id, current)) {
        return current
      }

      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, `${idBase}.collapse`)

  const toggle = action((id: string) => {
    if (!canExpand(id)) return

    if (expandedIdsAtom().has(id)) {
      collapse(id)
    } else {
      expand(id)
    }
  }, `${idBase}.toggle`)

  const setFocused = action((id: string) => {
    navigation.actions.setActive(id)
  }, `${idBase}.setFocused`)

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
      case 'ArrowDown':
        moveNext()
        return
      case 'ArrowUp':
        movePrev()
        return
      case 'Home':
        moveFirst()
        return
      case 'End':
        moveLast()
        return
      default: {
        if (event.key === 'Enter' || isSpaceKey(event.key)) {
          const focusedId = navigation.state.activeId()
          if (focusedId != null) {
            toggle(focusedId)
          }
        }
      }
    }
  }, `${idBase}.handleKeyDown`)

  const setSections = action((sections: readonly AccordionSection[]) => {
    sectionsAtom.set([...sections])
    navigation.actions.setItems(sections)
    enforceExpandedInvariants()
  }, `${idBase}.setSections`)

  const setAllowMultiple = action((value: boolean) => {
    allowMultipleAtom.set(value)
    enforceExpandedInvariants()
  }, `${idBase}.setAllowMultiple`)

  const setAllowZeroExpanded = action((value: boolean) => {
    allowZeroExpandedAtom.set(value)
    enforceExpandedInvariants()
  }, `${idBase}.setAllowZeroExpanded`)

  const setHeadingLevel = action((level: number) => {
    headingLevelAtom.set(Math.max(1, Math.min(6, level)))
  }, `${idBase}.setHeadingLevel`)

  const setAriaLabel = action((label: string | undefined) => {
    ariaLabelAtom.set(label)
  }, `${idBase}.setAriaLabel`)

  const setExpandedIds = action((ids: readonly string[]) => {
    const sectionIds = sectionIdsComputed()
    const allowMultiple = allowMultipleAtom()
    const valid = ids.filter((id) => sectionIds.has(id))

    if (!allowMultiple && valid.length > 1) {
      expandedIdsAtom.set(new Set(valid.slice(0, 1)))
    } else {
      expandedIdsAtom.set(new Set(valid))
    }

    if (!allowZeroExpandedAtom() && expandedIdsAtom().size === 0) {
      const firstEnabled = sectionsAtom().find((s) => !s.disabled)
      if (firstEnabled) {
        expandedIdsAtom.set(new Set([firstEnabled.id]))
      }
    }
  }, `${idBase}.setExpandedIds`)

  const triggerId = (id: string) => `${idBase}-trigger-${id}`
  const panelId = (id: string) => `${idBase}-panel-${id}`

  const actions: AccordionActions = {
    toggle,
    expand,
    collapse,
    setFocused,
    moveNext,
    movePrev,
    moveFirst,
    moveLast,
    handleKeyDown,
    setSections,
    setAllowMultiple,
    setAllowZeroExpanded,
    setHeadingLevel,
    setAriaLabel,
    setExpandedIds,
  }

  const contracts: AccordionContracts = {
    getRootProps() {
      return {
        id: `${idBase}-root`,
        'aria-label': ariaLabelAtom(),
      }
    },
    getHeaderProps(id: string) {
      if (!sectionIdsComputed().has(id)) {
        throw new Error(`Unknown accordion header id: ${id}`)
      }

      return {
        id: `${idBase}-header-${id}`,
      }
    },
    getTriggerProps(id: string) {
      const section = sectionByIdComputed().get(id)
      if (!section) {
        throw new Error(`Unknown accordion trigger id: ${id}`)
      }

      const expandedIds = expandedIdsAtom()
      const expanded = expandedIds.has(id)
      const forcedExpanded = !allowZeroExpandedAtom() && isOnlyExpanded(id, expandedIds)
      const disabled = section.disabled === true || forcedExpanded

      return {
        id: triggerId(id),
        role: 'button' as const,
        tabindex: (navigation.state.activeId() === id && section.disabled !== true
          ? '0'
          : '-1') as '0' | '-1',
        'aria-expanded': (expanded ? 'true' : 'false') as 'true' | 'false',
        'aria-controls': panelId(id),
        'aria-disabled': (disabled ? 'true' : 'false') as 'true' | 'false',
        onClick: () => toggle(id),
        onFocus: () => setFocused(id),
        onKeyDown: handleKeyDown,
      }
    },
    getPanelProps(id: string) {
      if (!sectionIdsComputed().has(id)) {
        throw new Error(`Unknown accordion panel id: ${id}`)
      }

      return {
        id: panelId(id),
        role: 'region' as const,
        'aria-labelledby': triggerId(id),
        hidden: !expandedIdsAtom().has(id),
      }
    },
  }

  const state: AccordionState = {
    expandedIds: expandedIdsAtom,
    focusedId: navigation.state.activeId,
    value: valueComputed,
    expandedValues: expandedValuesComputed,
    sections: sectionsAtom,
    allowMultiple: allowMultipleAtom,
    allowZeroExpanded: allowZeroExpandedAtom,
    headingLevel: headingLevelAtom,
    ariaLabel: ariaLabelAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
