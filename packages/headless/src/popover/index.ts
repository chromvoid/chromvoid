import {action, atom, computed, type Atom, type Computed} from '@reatom/core'
import {
  createOverlayFocus,
  type OverlayDismissIntent,
  type OverlayOpenSource,
} from '../interactions/overlay-focus'

export type PopoverOpenSource = OverlayOpenSource
export type PopoverDismissIntent = OverlayDismissIntent

export interface CreatePopoverOptions {
  idBase?: string
  initialOpen?: boolean
  initialTriggerId?: string | null
  ariaLabel?: string
  ariaLabelledBy?: string
  closeOnEscape?: boolean
  closeOnOutsidePointer?: boolean
  closeOnOutsideFocus?: boolean
  useNativePopover?: boolean
}

export interface PopoverState {
  isOpen: Atom<boolean>
  triggerId: Atom<string | null>
  openedBy: Atom<PopoverOpenSource | null>
  restoreTargetId: Atom<string | null>
  lastDismissIntent: Atom<PopoverDismissIntent | null>
  isInteractive: Computed<boolean>
  useNativePopover: Atom<boolean>
}

export interface PopoverActions {
  setTriggerId(id: string | null): void
  open(source?: PopoverOpenSource): void
  close(intent?: PopoverDismissIntent): void
  toggle(source?: PopoverOpenSource): void
  handleTriggerKeyDown(event: Pick<KeyboardEvent, 'key'>): void
  handleContentKeyDown(event: Pick<KeyboardEvent, 'key'>): void
  handleOutsidePointer(): void
  handleOutsideFocus(): void
  handleNativeToggle(newState: 'open' | 'closed'): void
}

export interface PopoverTriggerProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-haspopup': 'dialog'
  'aria-expanded': 'true' | 'false'
  'aria-controls': string
  popovertarget?: string
  popovertargetaction?: 'toggle'
  onClick: () => void
  onKeyDown: (event: Pick<KeyboardEvent, 'key'>) => void
}

export interface PopoverContentProps {
  id: string
  role: 'dialog'
  tabindex: '-1'
  hidden?: boolean
  popover?: 'manual'
  'aria-modal': 'false'
  'aria-label'?: string
  'aria-labelledby'?: string
  onKeyDown: (event: Pick<KeyboardEvent, 'key'>) => void
  onPointerDownOutside: () => void
  onFocusOutside: () => void
}

export interface PopoverContracts {
  getTriggerProps(): PopoverTriggerProps
  getContentProps(): PopoverContentProps
}

export interface PopoverModel {
  readonly state: PopoverState
  readonly actions: PopoverActions
  readonly contracts: PopoverContracts
}

const isSpaceKey = (key: string) => key === ' ' || key === 'Spacebar'

export function createPopover(options: CreatePopoverOptions = {}): PopoverModel {
  const idBase = options.idBase ?? 'popover'

  const overlay = createOverlayFocus({
    idBase: `${idBase}.overlay`,
    initialOpen: options.initialOpen,
    initialTriggerId: options.initialTriggerId ?? `${idBase}-trigger`,
    trapFocus: false,
    restoreFocus: true,
  })

  const useNativePopoverAtom = atom(options.useNativePopover ?? false, `${idBase}.useNativePopover`)
  const isInteractiveAtom = computed(() => overlay.state.isOpen(), `${idBase}.isInteractive`)

  const open = action((source: PopoverOpenSource = 'programmatic') => {
    overlay.actions.open(source, overlay.state.triggerId() ?? `${idBase}-trigger`)
  }, `${idBase}.open`)

  const close = action((intent: PopoverDismissIntent = 'programmatic') => {
    overlay.actions.close(intent)
  }, `${idBase}.close`)

  const toggle = action((source: PopoverOpenSource = 'programmatic') => {
    if (overlay.state.isOpen()) {
      close()
      return
    }
    open(source)
  }, `${idBase}.toggle`)

  const setTriggerId = action((id: string | null) => {
    overlay.actions.setTrigger(id)
  }, `${idBase}.setTriggerId`)

  const handleTriggerKeyDown = action((event: Pick<KeyboardEvent, 'key'>) => {
    if (event.key === 'Enter' || isSpaceKey(event.key) || event.key === 'ArrowDown') {
      toggle('keyboard')
    }
  }, `${idBase}.handleTriggerKeyDown`)

  const handleContentKeyDown = action((event: Pick<KeyboardEvent, 'key'>) => {
    if (options.closeOnEscape === false) return
    overlay.actions.handleKeyDown(event)
  }, `${idBase}.handleContentKeyDown`)

  const handleOutsidePointer = action(() => {
    if (options.closeOnOutsidePointer === false) return
    overlay.actions.handleOutsidePointer()
  }, `${idBase}.handleOutsidePointer`)

  const handleOutsideFocus = action(() => {
    if (options.closeOnOutsideFocus === false) return
    overlay.actions.handleOutsideFocus()
  }, `${idBase}.handleOutsideFocus`)

  const handleNativeToggle = action((newState: 'open' | 'closed') => {
    const isCurrentlyOpen = overlay.state.isOpen()
    if (newState === 'closed' && isCurrentlyOpen) {
      close()
    } else if (newState === 'open' && !isCurrentlyOpen) {
      open('programmatic')
    }
  }, `${idBase}.handleNativeToggle`)

  const actions: PopoverActions = {
    setTriggerId,
    open,
    close,
    toggle,
    handleTriggerKeyDown,
    handleContentKeyDown,
    handleOutsidePointer,
    handleOutsideFocus,
    handleNativeToggle,
  }

  const contracts: PopoverContracts = {
    getTriggerProps() {
      const isNative = useNativePopoverAtom()
      const props: PopoverTriggerProps = {
        id: overlay.state.triggerId() ?? `${idBase}-trigger`,
        role: 'button',
        tabindex: '0',
        'aria-haspopup': 'dialog',
        'aria-expanded': overlay.state.isOpen() ? 'true' : 'false',
        'aria-controls': `${idBase}-content`,
        onClick: () => toggle('pointer'),
        onKeyDown: handleTriggerKeyDown,
      }
      if (isNative) {
        props.popovertarget = `${idBase}-content`
        props.popovertargetaction = 'toggle'
      }
      return props
    },
    getContentProps() {
      const isNative = useNativePopoverAtom()
      const props: PopoverContentProps = {
        id: `${idBase}-content`,
        role: 'dialog',
        tabindex: '-1',
        'aria-modal': 'false',
        'aria-label': options.ariaLabel,
        'aria-labelledby': options.ariaLabelledBy,
        onKeyDown: handleContentKeyDown,
        onPointerDownOutside: handleOutsidePointer,
        onFocusOutside: handleOutsideFocus,
      }
      if (isNative) {
        props.popover = 'manual'
      } else {
        props.hidden = !overlay.state.isOpen()
      }
      return props
    },
  }

  const state: PopoverState = {
    isOpen: overlay.state.isOpen,
    triggerId: overlay.state.triggerId,
    openedBy: overlay.state.openedBy,
    restoreTargetId: overlay.state.restoreTargetId,
    lastDismissIntent: overlay.state.lastDismissIntent,
    isInteractive: isInteractiveAtom,
    useNativePopover: useNativePopoverAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
