import {action, atom, type Atom} from '@reatom/core'
import {createMenu, type MenuItem} from '../menu'

export interface CreateMenuButtonOptions {
  items: readonly MenuItem[]
  idBase?: string
  ariaLabel?: string
  initialOpen?: boolean
  initialActiveId?: string | null
  closeOnSelect?: boolean
}

export interface MenuButtonState {
  isOpen: Atom<boolean>
  activeId: Atom<string | null>
  restoreTargetId: Atom<string | null>
}

export interface MenuButtonKeyboardEventLike {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

export interface MenuButtonActions {
  open(): void
  close(): void
  toggle(): void
  select(id: string): void
  handleOutsidePointer(): void
  handleKeyDown(event: MenuButtonKeyboardEventLike): void
}

export interface MenuButtonTriggerProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-haspopup': 'menu'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string
  'aria-label'?: string
  onClick: () => void
  onKeyDown: (event: MenuButtonKeyboardEventLike) => void
}

export interface MenuButtonMenuProps {
  id: string
  role: 'menu'
  tabindex: '-1'
  'aria-label'?: string
  hidden: boolean
  onKeyDown: (event: MenuButtonKeyboardEventLike) => void
}

export interface MenuButtonItemProps {
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

export interface MenuButtonContracts {
  getTriggerProps(): MenuButtonTriggerProps
  getMenuProps(): MenuButtonMenuProps
  getItemProps(id: string): MenuButtonItemProps
}

export interface MenuButtonModel {
  readonly state: MenuButtonState
  readonly actions: MenuButtonActions
  readonly contracts: MenuButtonContracts
}

type CloseReason = 'programmatic' | 'escape' | 'select' | 'outside-pointer' | 'tab'

const withModifierDefaults = (event: MenuButtonKeyboardEventLike) => ({
  key: event.key,
  shiftKey: event.shiftKey ?? false,
  ctrlKey: event.ctrlKey ?? false,
  metaKey: event.metaKey ?? false,
  altKey: event.altKey ?? false,
})

export function createMenuButton(options: CreateMenuButtonOptions): MenuButtonModel {
  const idBase = options.idBase ?? 'menu-button'

  const menu = createMenu({
    idBase,
    items: options.items,
    ariaLabel: options.ariaLabel,
    initialOpen: options.initialOpen,
    initialActiveId: options.initialActiveId,
    closeOnSelect: options.closeOnSelect,
  })

  const restoreTargetIdAtom = atom<string | null>(null, `${idBase}.restoreTargetId`)

  const closeInternal = (reason: CloseReason) => {
    menu.actions.close()

    if (reason === 'escape' || reason === 'select') {
      restoreTargetIdAtom.set(`${idBase}-trigger`)
      return
    }

    restoreTargetIdAtom.set(null)
  }

  const open = action(() => {
    menu.actions.open('programmatic')
    restoreTargetIdAtom.set(null)
  }, `${idBase}.open`)

  const close = action(() => {
    closeInternal('programmatic')
  }, `${idBase}.close`)

  const toggle = action(() => {
    if (menu.state.isOpen()) {
      closeInternal('programmatic')
      return
    }

    menu.actions.toggle('pointer')
    restoreTargetIdAtom.set(null)
  }, `${idBase}.toggle`)

  const select = action((id: string) => {
    const wasOpen = menu.state.isOpen()
    menu.actions.select(id)

    if (wasOpen && !menu.state.isOpen()) {
      restoreTargetIdAtom.set(`${idBase}-trigger`)
    }
  }, `${idBase}.select`)

  const handleOutsidePointer = action(() => {
    if (!menu.state.isOpen()) return
    closeInternal('outside-pointer')
  }, `${idBase}.handleOutsidePointer`)

  const handleKeyDown = action((event: MenuButtonKeyboardEventLike) => {
    if (!menu.state.isOpen()) {
      // Per APG: Enter/Space open menu and focus first item.
      // Intercept here so activeId is always reset to first,
      // even after a previous open/close cycle left a stale value.
      if (event.key === 'Enter' || event.key === ' ') {
        menu.actions.open('keyboard')
        menu.actions.moveFirst()
        restoreTargetIdAtom.set(null)
        return
      }

      menu.actions.handleTriggerKeyDown({key: event.key})
      return
    }

    if (event.key === 'Escape') {
      closeInternal('escape')
      return
    }

    if (event.key === 'Tab') {
      closeInternal('tab')
      return
    }

    menu.actions.handleMenuKeyDown(withModifierDefaults(event))
  }, `${idBase}.handleKeyDown`)

  const actions: MenuButtonActions = {
    open,
    close,
    toggle,
    select,
    handleOutsidePointer,
    handleKeyDown,
  }

  const contracts: MenuButtonContracts = {
    getTriggerProps() {
      const trigger = menu.contracts.getTriggerProps()

      return {
        ...trigger,
        role: 'button',
        onClick: toggle,
        onKeyDown: handleKeyDown,
      }
    },
    getMenuProps() {
      const menuProps = menu.contracts.getMenuProps()

      return {
        ...menuProps,
        hidden: !menu.state.isOpen(),
        onKeyDown: handleKeyDown,
      }
    },
    getItemProps(id: string) {
      const item = menu.contracts.getItemProps(id)

      return {
        ...item,
        onClick: () => select(id),
      }
    },
  }

  const state: MenuButtonState = {
    isOpen: menu.state.isOpen,
    activeId: menu.state.activeId,
    restoreTargetId: restoreTargetIdAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
