import {action, atom, type Atom} from '@reatom/core'

export interface CreateTooltipOptions {
  idBase?: string
  initialOpen?: boolean
  isDisabled?: boolean
  showDelay?: number
  hideDelay?: number
  /** Space-separated list of trigger modes. Supported tokens: hover, focus, click, manual. Default: 'hover focus' */
  trigger?: string
}

export interface TooltipState {
  isOpen: Atom<boolean>
  isDisabled: Atom<boolean>
}

export interface TooltipActions {
  open(): void
  close(): void
  /** Programmatic open respecting showDelay. No-op when disabled. */
  show(): void
  /** Programmatic close respecting hideDelay. */
  hide(): void
  setDisabled(value: boolean): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key'>): void
  handlePointerEnter(): void
  handlePointerLeave(): void
  handleFocus(): void
  handleBlur(): void
  /** Toggles isOpen when click is in trigger modes; otherwise no-op. Clears pending timers on toggle. */
  handleClick(): void
}

export interface TooltipTriggerProps {
  id: string
  'aria-describedby'?: string
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  onFocus?: () => void
  onBlur?: () => void
  onClick?: () => void
  onKeyDown: (event: Pick<KeyboardEvent, 'key'>) => void
}

export interface TooltipContentProps {
  id: string
  role: 'tooltip'
  tabindex: '-1'
  hidden: boolean
}

export interface TooltipContracts {
  getTriggerProps(): TooltipTriggerProps
  getTooltipProps(): TooltipContentProps
}

export interface TooltipModel {
  readonly state: TooltipState
  readonly actions: TooltipActions
  readonly contracts: TooltipContracts
}

function parseTriggerModes(trigger: string): Set<string> {
  return new Set(trigger.trim().split(/\s+/).filter(Boolean))
}

export function createTooltip(options: CreateTooltipOptions = {}): TooltipModel {
  const idBase = options.idBase ?? 'tooltip'
  const showDelay = Math.max(options.showDelay ?? 0, 0)
  const hideDelay = Math.max(options.hideDelay ?? 0, 0)
  const triggerModes = parseTriggerModes(options.trigger ?? 'hover focus')

  const hasHover = triggerModes.has('hover')
  const hasFocus = triggerModes.has('focus')
  const hasClick = triggerModes.has('click')
  const hasManual = triggerModes.has('manual')
  // When manual is the ONLY mode, all interactive handlers are suppressed
  const manualOnly = hasManual && !hasHover && !hasFocus && !hasClick

  const isOpenAtom = atom(options.initialOpen ?? false, `${idBase}.isOpen`)
  const isDisabledAtom = atom(options.isDisabled ?? false, `${idBase}.isDisabled`)

  let showTimer: ReturnType<typeof setTimeout> | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  const clearShowTimer = () => {
    if (showTimer == null) return
    clearTimeout(showTimer)
    showTimer = null
  }

  const clearHideTimer = () => {
    if (hideTimer == null) return
    clearTimeout(hideTimer)
    hideTimer = null
  }

  const clearTimers = () => {
    clearShowTimer()
    clearHideTimer()
  }

  const open = action(() => {
    if (isDisabledAtom()) return
    clearTimers()
    isOpenAtom.set(true)
  }, `${idBase}.open`)

  const close = action(() => {
    clearTimers()
    isOpenAtom.set(false)
  }, `${idBase}.close`)

  const setDisabled = action((value: boolean) => {
    isDisabledAtom.set(value)
    if (value) {
      close()
    }
  }, `${idBase}.setDisabled`)

  const scheduleOpen = () => {
    if (isDisabledAtom()) return
    clearHideTimer()

    if (showDelay === 0) {
      open()
      return
    }

    clearShowTimer()
    showTimer = setTimeout(() => {
      showTimer = null
      open()
    }, showDelay)
  }

  const scheduleClose = () => {
    clearShowTimer()

    if (hideDelay === 0) {
      close()
      return
    }

    clearHideTimer()
    hideTimer = setTimeout(() => {
      hideTimer = null
      close()
    }, hideDelay)
  }

  /** Programmatic open respecting showDelay. No-op when disabled. */
  const show = action(() => {
    scheduleOpen()
  }, `${idBase}.show`)

  /** Programmatic close respecting hideDelay. */
  const hide = action(() => {
    scheduleClose()
  }, `${idBase}.hide`)

  const handlePointerEnter = action(() => {
    if (!hasHover || manualOnly) return
    scheduleOpen()
  }, `${idBase}.handlePointerEnter`)

  const handlePointerLeave = action(() => {
    if (!hasHover || manualOnly) return
    scheduleClose()
  }, `${idBase}.handlePointerLeave`)

  const handleFocus = action(() => {
    if (!hasFocus || manualOnly) return
    scheduleOpen()
  }, `${idBase}.handleFocus`)

  const handleBlur = action(() => {
    if (!hasFocus || manualOnly) return
    scheduleClose()
  }, `${idBase}.handleBlur`)

  const handleClick = action(() => {
    if (!hasClick || manualOnly) return
    if (isDisabledAtom()) return
    clearTimers()
    isOpenAtom.set(!isOpenAtom())
  }, `${idBase}.handleClick`)

  const handleKeyDown = action((event: Pick<KeyboardEvent, 'key'>) => {
    if (event.key === 'Escape') {
      close()
    }
  }, `${idBase}.handleKeyDown`)

  const triggerId = `${idBase}-trigger`
  const tooltipId = `${idBase}-content`

  const actions: TooltipActions = {
    open,
    close,
    show,
    hide,
    setDisabled,
    handleKeyDown,
    handlePointerEnter,
    handlePointerLeave,
    handleFocus,
    handleBlur,
    handleClick,
  }

  const contracts: TooltipContracts = {
    getTriggerProps() {
      const props: TooltipTriggerProps = {
        id: triggerId,
        'aria-describedby': isDisabledAtom() ? undefined : tooltipId,
        onKeyDown: handleKeyDown,
      }

      if (hasHover && !manualOnly) {
        props.onPointerEnter = handlePointerEnter
        props.onPointerLeave = handlePointerLeave
      }

      if (hasFocus && !manualOnly) {
        props.onFocus = handleFocus
        props.onBlur = handleBlur
      }

      if (hasClick && !manualOnly) {
        props.onClick = handleClick
      }

      return props
    },
    getTooltipProps() {
      return {
        id: tooltipId,
        role: 'tooltip',
        tabindex: '-1',
        hidden: !isOpenAtom(),
      }
    },
  }

  const state: TooltipState = {
    isOpen: isOpenAtom,
    isDisabled: isDisabledAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
