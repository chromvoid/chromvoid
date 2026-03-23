import {action, atom, computed, type Atom, type Computed} from '@reatom/core'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CopyButtonStatus = 'idle' | 'success' | 'error'

export type CopyButtonValue = string | (() => Promise<string>)

export interface ClipboardAdapter {
  writeText(text: string): Promise<void>
}

export interface CreateCopyButtonOptions {
  value?: CopyButtonValue
  feedbackDuration?: number
  isDisabled?: boolean
  ariaLabel?: string
  onCopy?: (value: string) => void
  onError?: (error: unknown) => void
  clipboard?: ClipboardAdapter
}

export interface CopyButtonState {
  status: Atom<CopyButtonStatus>
  isDisabled: Atom<boolean>
  isCopying: Atom<boolean>
  feedbackDuration: Atom<number>
  value: Atom<CopyButtonValue>
  isIdle: Computed<boolean>
  isSuccess: Computed<boolean>
  isError: Computed<boolean>
  isUnavailable: Computed<boolean>
}

export interface CopyButtonActions {
  copy(): Promise<void>
  setDisabled(v: boolean): void
  setFeedbackDuration(v: number): void
  setValue(v: CopyButtonValue): void
  reset(): void
}

export interface CopyButtonProps {
  role: 'button'
  tabindex: '0' | '-1'
  'aria-disabled': 'true' | 'false'
  'aria-label'?: string
  onClick: (e: Event) => void
  onKeyDown: (e: KeyboardEvent) => void
  onKeyUp: (e: KeyboardEvent) => void
}

export interface CopyStatusProps {
  role: 'status'
  'aria-live': 'polite'
  'aria-atomic': 'true'
}

export interface CopyIconProps {
  'aria-hidden': 'true'
  hidden?: boolean
}

export interface CopyButtonContracts {
  getButtonProps(): CopyButtonProps
  getStatusProps(): CopyStatusProps
  getIconContainerProps(which: 'copy' | 'success' | 'error'): CopyIconProps
}

export interface CopyButtonModel {
  readonly state: CopyButtonState
  readonly actions: CopyButtonActions
  readonly contracts: CopyButtonContracts
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clampDuration = (v: number): number => Math.max(0, v)

const isSpaceKey = (key: string) => key === ' ' || key === 'Spacebar'

const STATUS_TO_ICON: Record<CopyButtonStatus, 'copy' | 'success' | 'error'> = {
  idle: 'copy',
  success: 'success',
  error: 'error',
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCopyButton(options: CreateCopyButtonOptions = {}): CopyButtonModel {
  const clipboard: ClipboardAdapter = options.clipboard ?? navigator.clipboard

  // --- atoms ----------------------------------------------------------------
  const statusAtom = atom<CopyButtonStatus>('idle', 'copyButton.status')
  const isDisabledAtom = atom(options.isDisabled ?? false, 'copyButton.isDisabled')
  const isCopyingAtom = atom(false, 'copyButton.isCopying')
  const feedbackDurationAtom = atom(
    clampDuration(options.feedbackDuration ?? 1500),
    'copyButton.feedbackDuration',
  )

  // Value is stored in a boxed atom ({ref: ...}) to prevent reatom from invoking
  // function values as computed derivations when the atom is read.
  const valueBoxAtom = atom<{ref: CopyButtonValue}>({ref: options.value ?? ''}, 'copyButton.value')

  // Expose a callable that reads the unwrapped value, matching the Atom<CopyButtonValue> shape.
  const valueAccessor = (): CopyButtonValue => valueBoxAtom().ref
  valueAccessor.set = (v: CopyButtonValue) => valueBoxAtom.set({ref: v})
  const valueAtom = valueAccessor as unknown as Atom<CopyButtonValue> & {set(v: CopyButtonValue): void}

  // --- derived --------------------------------------------------------------
  const isIdleAtom = computed(() => statusAtom() === 'idle', 'copyButton.isIdle')
  const isSuccessAtom = computed(() => statusAtom() === 'success', 'copyButton.isSuccess')
  const isErrorAtom = computed(() => statusAtom() === 'error', 'copyButton.isError')
  const isUnavailableAtom = computed(
    () => isDisabledAtom() || isCopyingAtom(),
    'copyButton.isUnavailable',
  )

  // --- timer management -----------------------------------------------------
  let revertTimer: ReturnType<typeof setTimeout> | null = null
  // Track the copy operation version to ignore stale results after reset()
  let copyVersion = 0

  const clearRevertTimer = () => {
    if (revertTimer !== null) {
      clearTimeout(revertTimer)
      revertTimer = null
    }
  }

  const scheduleRevert = (version: number) => {
    clearRevertTimer()
    revertTimer = setTimeout(() => {
      revertTimer = null
      // Only revert if no newer operation has started
      if (copyVersion === version) {
        statusAtom.set('idle')
      }
    }, feedbackDurationAtom())
  }

  // --- actions --------------------------------------------------------------
  const copy = async (): Promise<void> => {
    if (isUnavailableAtom()) return

    const version = ++copyVersion
    isCopyingAtom.set(true)
    clearRevertTimer()

    let resolvedValue: string

    try {
      const currentValue = valueAtom()
      if (typeof currentValue === 'function') {
        resolvedValue = await currentValue()
      } else {
        resolvedValue = currentValue
      }
    } catch (err) {
      // Value getter threw
      isCopyingAtom.set(false)
      if (copyVersion !== version) return
      statusAtom.set('error')
      options.onError?.(err)
      scheduleRevert(version)
      return
    }

    try {
      await clipboard.writeText(resolvedValue)
      isCopyingAtom.set(false)
      if (copyVersion !== version) return
      statusAtom.set('success')
      options.onCopy?.(resolvedValue)
    } catch (err) {
      isCopyingAtom.set(false)
      if (copyVersion !== version) return
      statusAtom.set('error')
      options.onError?.(err)
    }

    scheduleRevert(version)
  }

  const setDisabled = action((v: boolean) => {
    isDisabledAtom.set(v)
  }, 'copyButton.setDisabled')

  const setFeedbackDuration = action((v: number) => {
    feedbackDurationAtom.set(clampDuration(v))
  }, 'copyButton.setFeedbackDuration')

  const setValue = action((v: CopyButtonValue) => {
    valueAtom.set(v)
  }, 'copyButton.setValue')

  const reset = action(() => {
    ++copyVersion
    clearRevertTimer()
    isCopyingAtom.set(false)
    statusAtom.set('idle')
  }, 'copyButton.reset')

  // --- contracts ------------------------------------------------------------
  const getButtonProps = (): CopyButtonProps => {
    const unavailable = isUnavailableAtom()
    const status = statusAtom()

    let ariaLabel: string | undefined
    if (options.ariaLabel != null) {
      if (status === 'idle') {
        ariaLabel = options.ariaLabel
      } else if (status === 'success') {
        ariaLabel = 'Copied'
      } else {
        ariaLabel = 'Copy failed'
      }
    }

    const props: CopyButtonProps = {
      role: 'button',
      tabindex: unavailable ? '-1' : '0',
      'aria-disabled': unavailable ? 'true' : 'false',
      onClick: (_e: Event) => {
        copy()
      },
      onKeyDown: (e: KeyboardEvent) => {
        if (isUnavailableAtom()) {
          return
        }
        if (e.key === 'Enter') {
          copy()
          return
        }
        if (isSpaceKey(e.key)) {
          e.preventDefault()
        }
      },
      onKeyUp: (e: KeyboardEvent) => {
        if (isUnavailableAtom()) return
        if (isSpaceKey(e.key)) {
          copy()
        }
      },
    }

    if (ariaLabel !== undefined) {
      props['aria-label'] = ariaLabel
    }

    return props
  }

  const getStatusProps = (): CopyStatusProps => ({
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  })

  const getIconContainerProps = (which: 'copy' | 'success' | 'error'): CopyIconProps => {
    const activeIcon = STATUS_TO_ICON[statusAtom()]
    const props: CopyIconProps = {
      'aria-hidden': 'true',
    }
    if (which !== activeIcon) {
      props.hidden = true
    }
    return props
  }

  // --- model ----------------------------------------------------------------
  const state: CopyButtonState = {
    status: statusAtom,
    isDisabled: isDisabledAtom,
    isCopying: isCopyingAtom,
    feedbackDuration: feedbackDurationAtom,
    value: valueAtom,
    isIdle: isIdleAtom,
    isSuccess: isSuccessAtom,
    isError: isErrorAtom,
    isUnavailable: isUnavailableAtom,
  }

  const actions: CopyButtonActions = {
    copy,
    setDisabled,
    setFeedbackDuration,
    setValue,
    reset,
  }

  const contracts: CopyButtonContracts = {
    getButtonProps,
    getStatusProps,
    getIconContainerProps,
  }

  return {state, actions, contracts}
}
