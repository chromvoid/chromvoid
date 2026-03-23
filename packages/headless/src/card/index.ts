import {action, atom, type Atom} from '@reatom/core'

export interface CreateCardOptions {
  idBase?: string
  isExpandable?: boolean
  isExpanded?: boolean
  isDisabled?: boolean
  onExpandedChange?: (isExpanded: boolean) => void
}

export interface CardState {
  isExpandable: Atom<boolean>
  isExpanded: Atom<boolean>
  isDisabled: Atom<boolean>
}

export interface CardActions {
  toggle(): void
  expand(): void
  collapse(): void
  setDisabled(value: boolean): void
  handleClick(): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}): void
}

export interface CardProps {
  // empty — card root carries no interactive attributes
}

export interface CardTriggerProps {
  id: string
  role: 'button'
  tabindex: '0' | '-1'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string
  'aria-disabled'?: 'true'
  onClick: () => void
  onKeyDown: (event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}) => void
}

export interface CardContentProps {
  id: string
  role: 'region'
  'aria-labelledby': string
  hidden: boolean
}

export interface CardContracts {
  getCardProps(): CardProps
  getTriggerProps(): CardTriggerProps | Record<string, never>
  getContentProps(): CardContentProps | Record<string, never>
}

export interface CardModel {
  readonly state: CardState
  readonly actions: CardActions
  readonly contracts: CardContracts
}

const isSpaceKey = (key: string) => key === ' ' || key === 'Spacebar'

export function createCard(options: CreateCardOptions = {}): CardModel {
  const idBase = options.idBase ?? 'card'

  const isExpandableAtom = atom(options.isExpandable ?? false, `${idBase}.isExpandable`)
  const isExpandedAtom = atom(options.isExpanded ?? false, `${idBase}.isExpanded`)
  const isDisabledAtom = atom(options.isDisabled ?? false, `${idBase}.isDisabled`)

  const notifyExpandedChange = (next: boolean) => {
    if (isExpandedAtom() === next) return
    isExpandedAtom.set(next)
    options.onExpandedChange?.(next)
  }

  const toggle = action(() => {
    if (!isExpandableAtom() || isDisabledAtom()) return
    notifyExpandedChange(!isExpandedAtom())
  }, `${idBase}.toggle`)

  const expand = action(() => {
    if (!isExpandableAtom() || isDisabledAtom()) return
    notifyExpandedChange(true)
  }, `${idBase}.expand`)

  const collapse = action(() => {
    if (!isExpandableAtom() || isDisabledAtom()) return
    notifyExpandedChange(false)
  }, `${idBase}.collapse`)

  const setDisabled = action((value: boolean) => {
    isDisabledAtom.set(value)
  }, `${idBase}.setDisabled`)

  const handleClick = action(() => {
    toggle()
  }, `${idBase}.handleClick`)

  const handleKeyDown = action((event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}) => {
    if (!isExpandableAtom() || isDisabledAtom()) return

    if (event.key === 'Enter' || isSpaceKey(event.key)) {
      event.preventDefault?.()
      toggle()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault?.()
      expand()
      return
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault?.()
      collapse()
      return
    }
  }, `${idBase}.handleKeyDown`)

  const triggerId = `${idBase}-trigger`
  const contentId = `${idBase}-content`

  const actions: CardActions = {
    toggle,
    expand,
    collapse,
    setDisabled,
    handleClick,
    handleKeyDown,
  }

  const contracts: CardContracts = {
    getCardProps(): CardProps {
      return {}
    },

    getTriggerProps() {
      if (!isExpandableAtom()) return {} as Record<string, never>

      return {
        id: triggerId,
        role: 'button',
        tabindex: isDisabledAtom() ? '-1' : '0',
        'aria-expanded': isExpandedAtom() ? 'true' : 'false',
        'aria-controls': contentId,
        'aria-disabled': isDisabledAtom() ? 'true' : undefined,
        onClick: handleClick,
        onKeyDown: handleKeyDown,
      } as CardTriggerProps
    },

    getContentProps() {
      if (!isExpandableAtom()) return {} as Record<string, never>

      return {
        id: contentId,
        role: 'region',
        'aria-labelledby': triggerId,
        hidden: !isExpandedAtom(),
      }
    },
  }

  const state: CardState = {
    isExpandable: isExpandableAtom,
    isExpanded: isExpandedAtom,
    isDisabled: isDisabledAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
