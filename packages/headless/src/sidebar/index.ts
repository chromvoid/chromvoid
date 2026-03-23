import {atom, computed, type Atom, type Computed} from '@reatom/core'
import {createDialog} from '../dialog'

export interface CreateSidebarOptions {
  id?: string
  defaultExpanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  closeOnEscape?: boolean
  closeOnOutsidePointer?: boolean
  initialFocusId?: string
  ariaLabel?: string
}

export interface SidebarState {
  expanded: Atom<boolean>
  overlayOpen: Atom<boolean>
  mobile: Atom<boolean>
  isFocusTrapped: Computed<boolean>
  shouldLockScroll: Computed<boolean>
  restoreTargetId: Atom<string | null>
  initialFocusTargetId: Atom<string | null>
}

export interface SidebarActions {
  toggle(): void
  expand(): void
  collapse(): void
  openOverlay(): void
  closeOverlay(intent?: string): void
  setMobile(value: boolean): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key'>): void
  handleOutsidePointer(): void
  handleOutsideFocus(): void
}

export interface SidebarProps {
  id: string
  role: 'navigation' | 'dialog'
  'aria-label': string
  'data-collapsed': 'true' | 'false'
  'data-mobile': 'true' | 'false'
  'aria-modal'?: 'true'
  'data-initial-focus'?: string
  onKeyDown?: (event: Pick<KeyboardEvent, 'key'>) => void
}

export interface SidebarToggleProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string
  'aria-label': string
  onClick: () => void
}

export interface SidebarOverlayProps {
  id: string
  hidden: boolean
  'data-open': 'true' | 'false'
  onPointerDownOutside: () => void
  onFocusOutside: () => void
}

export interface SidebarRailProps {
  id: string
  role: 'navigation'
  'aria-label': string
  'data-visible': 'true' | 'false'
}

export interface SidebarContracts {
  getSidebarProps(): SidebarProps
  getToggleProps(): SidebarToggleProps
  getOverlayProps(): SidebarOverlayProps
  getRailProps(): SidebarRailProps
}

export interface SidebarModel {
  readonly state: SidebarState
  readonly actions: SidebarActions
  readonly contracts: SidebarContracts
}

export function createSidebar(options: CreateSidebarOptions = {}): SidebarModel {
  const id = options.id ?? 'sidebar'
  const defaultExpanded = options.defaultExpanded ?? true
  const closeOnEscape = options.closeOnEscape ?? true
  const closeOnOutsidePointer = options.closeOnOutsidePointer ?? true
  const ariaLabel = options.ariaLabel ?? 'Sidebar navigation'
  const onExpandedChange = options.onExpandedChange

  const expandedAtom = atom<boolean>(defaultExpanded, `${id}.expanded`)
  const mobileAtom = atom<boolean>(false, `${id}.mobile`)

  // Dialog for mobile overlay mode
  const dialog = createDialog({
    idBase: `${id}-dialog`,
    initialOpen: false,
    isModal: true,
    closeOnEscape,
    closeOnOutsidePointer,
    closeOnOutsideFocus: true,
    initialFocusId: options.initialFocusId,
  })

  // Set trigger id to match our toggle id
  dialog.actions.setTriggerId(`${id}-toggle`)

  const isFocusTrappedAtom = computed(
    () => mobileAtom() && dialog.state.isOpen(),
    `${id}.isFocusTrapped`,
  )

  const shouldLockScrollAtom = computed(
    () => mobileAtom() && dialog.state.isOpen(),
    `${id}.shouldLockScroll`,
  )

  const setExpanded = (value: boolean) => {
    const current = expandedAtom()
    if (current === value) return
    expandedAtom.set(value)
    onExpandedChange?.(value)
  }

  const actions: SidebarActions = {
    toggle() {
      if (mobileAtom()) {
        dialog.actions.toggle()
      } else {
        setExpanded(!expandedAtom())
      }
    },

    expand() {
      if (mobileAtom()) return
      setExpanded(true)
    },

    collapse() {
      if (mobileAtom()) return
      setExpanded(false)
    },

    openOverlay() {
      if (!mobileAtom()) return
      if (dialog.state.isOpen()) return
      dialog.actions.open()
    },

    closeOverlay(intent?: string) {
      if (!mobileAtom()) return
      if (!dialog.state.isOpen()) return
      dialog.actions.close(intent as any)
    },

    setMobile(value: boolean) {
      if (mobileAtom() === value) return
      mobileAtom.set(value)
      if (value) {
        // Switching to mobile: close overlay
        if (dialog.state.isOpen()) {
          dialog.actions.close()
        }
      } else {
        // Switching to desktop: close overlay, restore expanded
        if (dialog.state.isOpen()) {
          dialog.actions.close()
        }
        expandedAtom.set(defaultExpanded)
      }
    },

    handleKeyDown(event: Pick<KeyboardEvent, 'key'>) {
      if (!mobileAtom()) return
      if (!dialog.state.isOpen()) return
      dialog.actions.handleKeyDown(event)
    },

    handleOutsidePointer() {
      if (!mobileAtom()) return
      if (!dialog.state.isOpen()) return
      dialog.actions.handleOutsidePointer()
    },

    handleOutsideFocus() {
      if (!mobileAtom()) return
      if (!dialog.state.isOpen()) return
      dialog.actions.handleOutsideFocus()
    },
  }

  const contracts: SidebarContracts = {
    getSidebarProps() {
      const isMobile = mobileAtom()
      const isOverlayOpen = dialog.state.isOpen()

      if (isMobile && isOverlayOpen) {
        return {
          id: `${id}-panel`,
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': ariaLabel,
          'data-collapsed': 'false',
          'data-mobile': 'true',
          'data-initial-focus': dialog.state.initialFocusTargetId() ?? undefined,
          onKeyDown: actions.handleKeyDown,
        }
      }

      return {
        id: `${id}-panel`,
        role: 'navigation',
        'aria-label': ariaLabel,
        'data-collapsed': expandedAtom() ? 'false' : 'true',
        'data-mobile': isMobile ? 'true' : 'false',
      }
    },

    getToggleProps() {
      const isMobile = mobileAtom()
      const isExpanded = expandedAtom()
      const isOverlayOpen = dialog.state.isOpen()

      let ariaExpanded: 'true' | 'false'
      let toggleLabel: string

      if (isMobile) {
        ariaExpanded = isOverlayOpen ? 'true' : 'false'
        toggleLabel = isOverlayOpen ? 'Close sidebar' : 'Open sidebar'
      } else {
        ariaExpanded = isExpanded ? 'true' : 'false'
        toggleLabel = isExpanded ? 'Collapse sidebar' : 'Expand sidebar'
      }

      return {
        id: `${id}-toggle`,
        role: 'button' as const,
        tabindex: '0' as const,
        'aria-expanded': ariaExpanded,
        'aria-controls': `${id}-panel`,
        'aria-label': toggleLabel,
        onClick: actions.toggle,
      }
    },

    getOverlayProps() {
      const isMobile = mobileAtom()
      const isOverlayOpen = dialog.state.isOpen()
      const isHidden = !isMobile || !isOverlayOpen

      return {
        id: `${id}-overlay`,
        hidden: isHidden,
        'data-open': (!isHidden ? 'true' : 'false') as 'true' | 'false',
        onPointerDownOutside: actions.handleOutsidePointer,
        onFocusOutside: actions.handleOutsideFocus,
      }
    },

    getRailProps() {
      const isVisible = !expandedAtom() && !mobileAtom()

      return {
        id: `${id}-rail`,
        role: 'navigation' as const,
        'aria-label': ariaLabel,
        'data-visible': isVisible ? 'true' : 'false',
      }
    },
  }

  const state: SidebarState = {
    expanded: expandedAtom,
    overlayOpen: dialog.state.isOpen,
    mobile: mobileAtom,
    isFocusTrapped: isFocusTrappedAtom,
    shouldLockScroll: shouldLockScrollAtom,
    restoreTargetId: dialog.state.restoreTargetId,
    initialFocusTargetId: dialog.state.initialFocusTargetId,
  }

  return {
    state,
    actions,
    contracts,
  }
}
