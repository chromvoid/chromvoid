import {action, atom, computed, type Atom, type Computed} from '@reatom/core'

export type OverlayOpenSource = 'keyboard' | 'pointer' | 'programmatic'
export type OverlayDismissIntent = 'escape' | 'outside-pointer' | 'outside-focus' | 'programmatic'

export interface OverlayKeyboardEventLike {
  key: string
}

export interface CreateOverlayFocusOptions {
  idBase?: string
  initialOpen?: boolean
  initialTriggerId?: string | null
  trapFocus?: boolean
  restoreFocus?: boolean
}

export interface OverlayFocusState {
  isOpen: Atom<boolean>
  openedBy: Atom<OverlayOpenSource | null>
  triggerId: Atom<string | null>
  restoreTargetId: Atom<string | null>
  lastDismissIntent: Atom<OverlayDismissIntent | null>
  isFocusTrapped: Computed<boolean>
  shouldRestoreFocus: boolean
}

export interface OverlayFocusActions {
  setTrigger(id: string | null): void
  open(source?: OverlayOpenSource, triggerId?: string | null): void
  close(intent?: OverlayDismissIntent): void
  dismiss(intent: OverlayDismissIntent): void
  trap(): void
  restore(): void
  handleKeyDown(event: OverlayKeyboardEventLike): void
  handleOutsidePointer(): void
  handleOutsideFocus(): void
}

export interface OverlayFocusModel {
  readonly state: OverlayFocusState
  readonly actions: OverlayFocusActions
}

export const mapOverlayDismissIntent = (event: OverlayKeyboardEventLike): OverlayDismissIntent | null => {
  if (event.key === 'Escape') return 'escape'
  return null
}

export const shouldTrapOverlayFocus = (isOpen: boolean, trapFocus: boolean) => isOpen && trapFocus

export function createOverlayFocus(options: CreateOverlayFocusOptions = {}): OverlayFocusModel {
  const idBase = options.idBase ?? 'overlay-focus'
  const trapFocus = options.trapFocus ?? true
  const restoreFocus = options.restoreFocus ?? true

  const isOpenAtom = atom(options.initialOpen ?? false, `${idBase}.isOpen`)
  const openedByAtom = atom<OverlayOpenSource | null>(null, `${idBase}.openedBy`)
  const triggerIdAtom = atom<string | null>(options.initialTriggerId ?? null, `${idBase}.triggerId`)
  const restoreTargetIdAtom = atom<string | null>(null, `${idBase}.restoreTargetId`)
  const lastDismissIntentAtom = atom<OverlayDismissIntent | null>(null, `${idBase}.lastDismissIntent`)
  const forceTrapAtom = atom(false, `${idBase}.forceTrap`)

  const isFocusTrappedAtom = computed(
    () => shouldTrapOverlayFocus(isOpenAtom(), trapFocus || forceTrapAtom()),
    `${idBase}.isFocusTrapped`,
  )

  const setTrigger = action((id: string | null) => {
    triggerIdAtom.set(id)
  }, `${idBase}.setTrigger`)

  const open = action(
    (source: OverlayOpenSource = 'programmatic', triggerId: string | null = triggerIdAtom()) => {
      if (triggerId != null) {
        triggerIdAtom.set(triggerId)
      }

      lastDismissIntentAtom.set(null)
      restoreTargetIdAtom.set(null)
      openedByAtom.set(source)
      isOpenAtom.set(true)
    },
    `${idBase}.open`,
  )

  const close = action((intent: OverlayDismissIntent = 'programmatic') => {
    if (!isOpenAtom()) {
      lastDismissIntentAtom.set(intent)
      return
    }

    isOpenAtom.set(false)
    openedByAtom.set(null)
    lastDismissIntentAtom.set(intent)

    if (restoreFocus) {
      restoreTargetIdAtom.set(triggerIdAtom())
    }
  }, `${idBase}.close`)

  const dismiss = action((intent: OverlayDismissIntent) => {
    close(intent)
  }, `${idBase}.dismiss`)

  const trap = action(() => {
    forceTrapAtom.set(true)
  }, `${idBase}.trap`)

  const restore = action(() => {
    forceTrapAtom.set(false)
    restoreTargetIdAtom.set(null)
  }, `${idBase}.restore`)

  const handleKeyDown = action((event: OverlayKeyboardEventLike) => {
    const intent = mapOverlayDismissIntent(event)
    if (intent != null) {
      dismiss(intent)
    }
  }, `${idBase}.handleKeyDown`)

  const handleOutsidePointer = action(() => {
    if (!isOpenAtom()) return
    dismiss('outside-pointer')
  }, `${idBase}.handleOutsidePointer`)

  const handleOutsideFocus = action(() => {
    if (!isOpenAtom()) return
    dismiss('outside-focus')
  }, `${idBase}.handleOutsideFocus`)

  const actions: OverlayFocusActions = {
    setTrigger,
    open,
    close,
    dismiss,
    trap,
    restore,
    handleKeyDown,
    handleOutsidePointer,
    handleOutsideFocus,
  }

  const state: OverlayFocusState = {
    isOpen: isOpenAtom,
    openedBy: openedByAtom,
    triggerId: triggerIdAtom,
    restoreTargetId: restoreTargetIdAtom,
    lastDismissIntent: lastDismissIntentAtom,
    isFocusTrapped: isFocusTrappedAtom,
    shouldRestoreFocus: restoreFocus,
  }

  return {
    state,
    actions,
  }
}
