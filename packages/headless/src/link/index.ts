import {action} from '@reatom/core'

export interface CreateLinkOptions {
  idBase?: string
  href?: string
  isSemanticHost?: boolean
  onPress?: () => void
}

export interface LinkState {}

export interface LinkActions {
  press(): void
  handleClick(event?: Pick<Event, 'preventDefault'>): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}): void
}

export interface LinkProps {
  id: string
  role?: 'link'
  href?: string
  tabindex?: '0'
  onClick: (event?: Pick<Event, 'preventDefault'>) => void
  onKeyDown: (event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}) => void
}

export interface LinkContracts {
  getLinkProps(): LinkProps
}

export interface LinkModel {
  readonly state: LinkState
  readonly actions: LinkActions
  readonly contracts: LinkContracts
}

export function createLink(options: CreateLinkOptions = {}): LinkModel {
  const idBase = options.idBase ?? 'link'
  const isSemanticHost = options.isSemanticHost ?? false

  const press = action(() => {
    options.onPress?.()
  }, `${idBase}.press`)

  const handleClick = action((_event?: Pick<Event, 'preventDefault'>) => {
    press()
  }, `${idBase}.handleClick`)

  const handleKeyDown = action(
    (event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}) => {
      if (event.key === 'Enter') {
        press()
      }
    },
    `${idBase}.handleKeyDown`,
  )

  const actions: LinkActions = {
    press,
    handleClick,
    handleKeyDown,
  }

  const contracts: LinkContracts = {
    getLinkProps() {
      return {
        id: `${idBase}-root`,
        role: isSemanticHost ? undefined : 'link',
        href: options.href,
        tabindex: isSemanticHost ? undefined : '0',
        onClick: handleClick,
        onKeyDown: handleKeyDown,
      }
    },
  }

  const state: LinkState = {}

  return {
    state,
    actions,
    contracts,
  }
}
