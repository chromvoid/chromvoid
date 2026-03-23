import {action, atom, computed, type Atom, type Computed} from '@reatom/core'
import {
  createOverlayFocus,
  type OverlayDismissIntent,
  type OverlayOpenSource,
} from '../interactions/overlay-focus'

export interface CreateDialogOptions {
  idBase?: string
  type?: 'dialog' | 'alertdialog'
  initialOpen?: boolean
  isModal?: boolean
  closeOnEscape?: boolean
  closeOnOutsidePointer?: boolean
  closeOnOutsideFocus?: boolean
  initialFocusId?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
}

export interface DialogState {
  isOpen: Atom<boolean>
  isModal: Atom<boolean>
  type: Atom<'dialog' | 'alertdialog'>
  restoreTargetId: Atom<string | null>
  isFocusTrapped: Computed<boolean>
  shouldLockScroll: Computed<boolean>
  initialFocusTargetId: Atom<string | null>
}

export interface DialogActions {
  setTriggerId(id: string | null): void
  open(source?: OverlayOpenSource): void
  close(intent?: OverlayDismissIntent): void
  toggle(source?: OverlayOpenSource): void
  handleTriggerClick(): void
  handleTriggerKeyDown(event: Pick<KeyboardEvent, 'key'>): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key'>): void
  handleOutsidePointer(): void
  handleOutsideFocus(): void
}

export interface DialogTriggerProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-haspopup': 'dialog'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string
  onClick: () => void
  onKeyDown: (event: Pick<KeyboardEvent, 'key'>) => void
}

export interface DialogOverlayProps {
  id: string
  hidden: boolean
  'data-open': 'true' | 'false'
  onPointerDownOutside: () => void
  onFocusOutside: () => void
}

export interface DialogContentProps {
  id: string
  role: 'dialog' | 'alertdialog'
  tabindex: '-1'
  'aria-modal': 'true' | 'false'
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'data-initial-focus'?: string
  onKeyDown: (event: Pick<KeyboardEvent, 'key'>) => void
}

export interface DialogTitleProps {
  id: string
}

export interface DialogDescriptionProps {
  id: string
}

export interface DialogCloseButtonProps {
  id: string
  role: 'button'
  tabindex: '0'
  onClick: () => void
}

export interface DialogHeaderCloseButtonProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-label': 'Close'
  onClick: () => void
}

export interface DialogContracts {
  getTriggerProps(): DialogTriggerProps
  getOverlayProps(): DialogOverlayProps
  getContentProps(): DialogContentProps
  getTitleProps(): DialogTitleProps
  getDescriptionProps(): DialogDescriptionProps
  getCloseButtonProps(): DialogCloseButtonProps
  getHeaderCloseButtonProps(): DialogHeaderCloseButtonProps
}

export interface DialogModel {
  readonly state: DialogState
  readonly actions: DialogActions
  readonly contracts: DialogContracts
}

const isSpaceKey = (key: string) => key === ' ' || key === 'Spacebar'

export function createDialog(options: CreateDialogOptions = {}): DialogModel {
  const idBase = options.idBase ?? 'dialog'
  const closeOnEscape = options.closeOnEscape ?? true
  const closeOnOutsidePointer = options.closeOnOutsidePointer ?? true
  const closeOnOutsideFocus = options.closeOnOutsideFocus ?? true
  const typeAtom = atom<'dialog' | 'alertdialog'>(options.type ?? 'dialog', `${idBase}.type`)
  const isModalAtom = atom(options.isModal ?? true, `${idBase}.isModal`)
  const initialFocusTargetIdAtom = atom<string | null>(
    options.initialFocusId ?? null,
    `${idBase}.initialFocusId`,
  )

  const defaultTriggerId = `${idBase}-trigger`
  const contentId = `${idBase}-content`
  const titleId = options.ariaLabelledBy ?? `${idBase}-title`
  const descriptionId = options.ariaDescribedBy ?? `${idBase}-description`

  const overlay = createOverlayFocus({
    idBase: `${idBase}.overlay`,
    initialOpen: options.initialOpen,
    initialTriggerId: defaultTriggerId,
    trapFocus: isModalAtom(),
    restoreFocus: true,
  })

  const shouldLockScrollAtom = computed(
    () => overlay.state.isOpen() && isModalAtom(),
    `${idBase}.shouldLockScroll`,
  )

  const open = action((source: OverlayOpenSource = 'programmatic') => {
    overlay.actions.open(source, overlay.state.triggerId() ?? defaultTriggerId)
  }, `${idBase}.open`)

  const close = action((intent: OverlayDismissIntent = 'programmatic') => {
    overlay.actions.close(intent)
  }, `${idBase}.close`)

  const toggle = action((source: OverlayOpenSource = 'programmatic') => {
    if (overlay.state.isOpen()) {
      close('programmatic')
      return
    }

    open(source)
  }, `${idBase}.toggle`)

  const setTriggerId = action((id: string | null) => {
    overlay.actions.setTrigger(id)
  }, `${idBase}.setTriggerId`)

  const handleTriggerClick = action(() => {
    toggle('pointer')
  }, `${idBase}.handleTriggerClick`)

  const handleTriggerKeyDown = action((event: Pick<KeyboardEvent, 'key'>) => {
    if (event.key === 'Enter' || isSpaceKey(event.key)) {
      toggle('keyboard')
    }
  }, `${idBase}.handleTriggerKeyDown`)

  const handleKeyDown = action((event: Pick<KeyboardEvent, 'key'>) => {
    if (!closeOnEscape && event.key === 'Escape') {
      return
    }

    overlay.actions.handleKeyDown(event)
  }, `${idBase}.handleContentKeyDown`)

  const handleOutsidePointer = action(() => {
    if (!closeOnOutsidePointer) {
      return
    }

    overlay.actions.handleOutsidePointer()
  }, `${idBase}.handleOutsidePointer`)

  const handleOutsideFocus = action(() => {
    if (!closeOnOutsideFocus) {
      return
    }

    overlay.actions.handleOutsideFocus()
  }, `${idBase}.handleOutsideFocus`)

  const actions: DialogActions = {
    setTriggerId,
    open,
    close,
    toggle,
    handleTriggerClick,
    handleTriggerKeyDown,
    handleKeyDown,
    handleOutsidePointer,
    handleOutsideFocus,
  }

  const contracts: DialogContracts = {
    getTriggerProps() {
      return {
        id: overlay.state.triggerId() ?? defaultTriggerId,
        role: 'button',
        tabindex: '0',
        'aria-haspopup': 'dialog',
        'aria-expanded': overlay.state.isOpen() ? 'true' : 'false',
        'aria-controls': contentId,
        onClick: handleTriggerClick,
        onKeyDown: handleTriggerKeyDown,
      }
    },
    getOverlayProps() {
      return {
        id: `${idBase}-overlay`,
        hidden: !overlay.state.isOpen(),
        'data-open': overlay.state.isOpen() ? 'true' : 'false',
        onPointerDownOutside: handleOutsidePointer,
        onFocusOutside: handleOutsideFocus,
      }
    },
    getContentProps() {
      return {
        id: contentId,
        role: typeAtom(),
        tabindex: '-1',
        'aria-modal': isModalAtom() ? 'true' : 'false',
        'aria-labelledby': titleId,
        'aria-describedby': descriptionId,
        'data-initial-focus': initialFocusTargetIdAtom() ?? undefined,
        onKeyDown: handleKeyDown,
      }
    },
    getTitleProps() {
      return {
        id: titleId,
      }
    },
    getDescriptionProps() {
      return {
        id: descriptionId,
      }
    },
    getCloseButtonProps() {
      return {
        id: `${idBase}-close`,
        role: 'button',
        tabindex: '0',
        onClick: () => close('programmatic'),
      }
    },
    getHeaderCloseButtonProps() {
      return {
        id: `${idBase}-header-close`,
        role: 'button',
        tabindex: '0',
        'aria-label': 'Close',
        onClick: () => close('programmatic'),
      } as const
    },
  }

  const state: DialogState = {
    isOpen: overlay.state.isOpen,
    isModal: isModalAtom,
    type: typeAtom,
    restoreTargetId: overlay.state.restoreTargetId,
    isFocusTrapped: overlay.state.isFocusTrapped,
    shouldLockScroll: shouldLockScrollAtom,
    initialFocusTargetId: initialFocusTargetIdAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
