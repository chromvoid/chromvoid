import {action, atom, type Atom} from '@reatom/core'
import {createSpinbutton, type SpinbuttonKeyboardEventLike, type SpinbuttonModel} from '../spinbutton'

export type NumberKeyboardEventLike = Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}

export interface CreateNumberOptions {
  idBase?: string
  value?: number
  defaultValue?: number
  min?: number
  max?: number
  step?: number
  largeStep?: number
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  clearable?: boolean
  stepper?: boolean
  placeholder?: string
  ariaLabel?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
  formatValueText?: (value: number) => string
  onValueChange?: (value: number) => void
  onClear?: () => void
}

export interface NumberState {
  value: Atom<number>
  min: Atom<number | undefined>
  max: Atom<number | undefined>
  step: Atom<number>
  largeStep: Atom<number>
  isDisabled: Atom<boolean>
  isReadOnly: Atom<boolean>
  hasMin(): boolean
  hasMax(): boolean
  focused: Atom<boolean>
  filled(): boolean
  clearable: Atom<boolean>
  showClearButton(): boolean
  stepper: Atom<boolean>
  draftText: Atom<string | null>
  placeholder: Atom<string>
  required: Atom<boolean>
  defaultValue: Atom<number>
}

export interface NumberActions {
  setValue(value: number): void
  increment(): void
  decrement(): void
  incrementLarge(): void
  decrementLarge(): void
  setFirst(): void
  setLast(): void
  handleKeyDown(event: NumberKeyboardEventLike): void
  setDisabled(v: boolean): void
  setReadOnly(v: boolean): void
  setRequired(v: boolean): void
  setClearable(v: boolean): void
  setStepper(v: boolean): void
  setFocused(v: boolean): void
  setPlaceholder(v: string): void
  setDraftText(v: string | null): void
  commitDraft(): void
  clear(): void
  handleInput(text: string): void
}

export interface NumberInputProps {
  id: string
  role: 'spinbutton'
  tabindex: '0' | '-1'
  inputmode: 'decimal'
  'aria-valuenow': string
  'aria-valuemin'?: string
  'aria-valuemax'?: string
  'aria-valuetext'?: string
  'aria-disabled'?: 'true'
  'aria-readonly'?: 'true'
  'aria-required'?: 'true'
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  placeholder?: string
  autocomplete: 'off'
}

export interface NumberButtonProps {
  id: string
  tabindex: '-1'
  'aria-label': string
  'aria-disabled'?: 'true'
  hidden?: true
  'aria-hidden'?: 'true'
  onClick: () => void
}

export interface NumberClearButtonProps {
  role: 'button'
  'aria-label': string
  tabindex: '-1'
  hidden?: true
  'aria-hidden'?: 'true'
  onClick: () => void
}

export interface NumberContracts {
  getInputProps(): NumberInputProps
  getIncrementButtonProps(): NumberButtonProps
  getDecrementButtonProps(): NumberButtonProps
  getClearButtonProps(): NumberClearButtonProps
}

export interface NumberModel {
  readonly state: NumberState
  readonly actions: NumberActions
  readonly contracts: NumberContracts
}

export function createNumber(options: CreateNumberOptions = {}): NumberModel {
  const idBase = options.idBase ?? 'number'

  // Create the underlying spinbutton, delegating shared options
  const spinbutton: SpinbuttonModel = createSpinbutton({
    idBase,
    value: options.value,
    min: options.min,
    max: options.max,
    step: options.step,
    largeStep: options.largeStep,
    isDisabled: options.disabled,
    isReadOnly: options.readonly,
    ariaLabel: options.ariaLabel,
    ariaLabelledBy: options.ariaLabelledBy,
    ariaDescribedBy: options.ariaDescribedBy,
    formatValueText: options.formatValueText,
    onValueChange: options.onValueChange,
  })

  // Number-specific atoms
  const focusedAtom = atom(false, `${idBase}.focused`)
  const clearableAtom = atom(options.clearable ?? false, `${idBase}.clearable`)
  const stepperAtom = atom(options.stepper ?? false, `${idBase}.stepper`)
  const draftTextAtom = atom<string | null>(null, `${idBase}.draftText`)
  const placeholderAtom = atom(options.placeholder ?? '', `${idBase}.placeholder`)
  const requiredAtom = atom(options.required ?? false, `${idBase}.required`)

  // Compute defaultValue: explicit option > min > 0
  // Must normalize through spinbutton's clamping/snapping
  const rawDefault = options.defaultValue ?? options.min ?? 0
  const defaultValueAtom = atom(rawDefault, `${idBase}.defaultValue`)

  // Derived state
  const filled = () => spinbutton.state.value() !== defaultValueAtom()
  const showClearButton = () =>
    clearableAtom() && filled() && !spinbutton.state.isDisabled() && !spinbutton.state.isReadOnly()

  // Helper: force-set value on spinbutton bypassing disabled/readonly guard
  const forceSetValue = (value: number) => {
    const wasDisabled = spinbutton.state.isDisabled()
    const wasReadOnly = spinbutton.state.isReadOnly()
    if (wasDisabled) spinbutton.actions.setDisabled(false)
    if (wasReadOnly) spinbutton.actions.setReadOnly(false)
    spinbutton.actions.setValue(value)
    if (wasDisabled) spinbutton.actions.setDisabled(true)
    if (wasReadOnly) spinbutton.actions.setReadOnly(true)
  }

  // Actions

  const setValue = action((value: number) => {
    forceSetValue(value)
    draftTextAtom.set(null)
  }, `${idBase}.setValue`)

  // Wrapper for spinbutton actions that also clears draft
  const increment = action(() => {
    spinbutton.actions.increment()
    draftTextAtom.set(null)
  }, `${idBase}.increment`)

  const decrement = action(() => {
    spinbutton.actions.decrement()
    draftTextAtom.set(null)
  }, `${idBase}.decrement`)

  const incrementLarge = action(() => {
    spinbutton.actions.incrementLarge()
    draftTextAtom.set(null)
  }, `${idBase}.incrementLarge`)

  const decrementLarge = action(() => {
    spinbutton.actions.decrementLarge()
    draftTextAtom.set(null)
  }, `${idBase}.decrementLarge`)

  const setFirst = action(() => {
    spinbutton.actions.setFirst()
    draftTextAtom.set(null)
  }, `${idBase}.setFirst`)

  const setLast = action(() => {
    spinbutton.actions.setLast()
    draftTextAtom.set(null)
  }, `${idBase}.setLast`)

  const setDisabled = action((v: boolean) => {
    spinbutton.actions.setDisabled(v)
  }, `${idBase}.setDisabled`)

  const setReadOnly = action((v: boolean) => {
    spinbutton.actions.setReadOnly(v)
  }, `${idBase}.setReadOnly`)

  const setRequired = action((v: boolean) => {
    requiredAtom.set(v)
  }, `${idBase}.setRequired`)

  const setClearable = action((v: boolean) => {
    clearableAtom.set(v)
  }, `${idBase}.setClearable`)

  const setStepper = action((v: boolean) => {
    stepperAtom.set(v)
  }, `${idBase}.setStepper`)

  const setPlaceholder = action((v: string) => {
    placeholderAtom.set(v)
  }, `${idBase}.setPlaceholder`)

  const setDraftText = action((v: string | null) => {
    draftTextAtom.set(v)
  }, `${idBase}.setDraftText`)

  const clear = action(() => {
    if (spinbutton.state.isDisabled() || spinbutton.state.isReadOnly()) return
    forceSetValue(defaultValueAtom())
    draftTextAtom.set(null)
    options.onClear?.()
  }, `${idBase}.clear`)

  const commitDraft = action(() => {
    const draft = draftTextAtom()
    if (draft === null) return

    if (draft.trim() === '') {
      // Empty draft -> clear
      clear()
      return
    }

    const parsed = parseFloat(draft)
    if (Number.isFinite(parsed)) {
      // Valid number -> set value
      forceSetValue(parsed)
    }
    // Invalid text or valid: always clear draft
    draftTextAtom.set(null)
  }, `${idBase}.commitDraft`)

  const handleInput = action((text: string) => {
    if (spinbutton.state.isDisabled() || spinbutton.state.isReadOnly()) return
    draftTextAtom.set(text)
  }, `${idBase}.handleInput`)

  const setFocused = action((v: boolean) => {
    focusedAtom.set(v)
    if (!v) {
      commitDraft()
    }
  }, `${idBase}.setFocused`)

  const handleKeyDown = action((event: NumberKeyboardEventLike) => {
    // Handle Escape first
    if (event.key === 'Escape') {
      if (clearableAtom() && filled() && !spinbutton.state.isDisabled() && !spinbutton.state.isReadOnly()) {
        clear()
        event.preventDefault?.()
      }
      return
    }

    // Handle Enter
    if (event.key === 'Enter') {
      commitDraft()
      event.preventDefault?.()
      return
    }

    // Delegate remaining keys to spinbutton, then clear draft
    spinbutton.actions.handleKeyDown(event as SpinbuttonKeyboardEventLike)
    draftTextAtom.set(null)
  }, `${idBase}.handleKeyDown`)

  // Contracts
  const contracts: NumberContracts = {
    getInputProps() {
      const value = spinbutton.state.value()
      const isDisabled = spinbutton.state.isDisabled()
      const isReadOnly = spinbutton.state.isReadOnly()
      const isRequired = requiredAtom()
      const currentPlaceholder = placeholderAtom()
      const min = spinbutton.state.min()
      const max = spinbutton.state.max()

      return {
        id: `${idBase}-input`,
        role: 'spinbutton',
        tabindex: isDisabled ? '-1' : '0',
        inputmode: 'decimal',
        'aria-valuenow': String(value),
        'aria-valuemin': min != null ? String(min) : undefined,
        'aria-valuemax': max != null ? String(max) : undefined,
        'aria-valuetext': options.formatValueText?.(value),
        'aria-disabled': isDisabled ? 'true' : undefined,
        'aria-readonly': isReadOnly ? 'true' : undefined,
        'aria-required': isRequired ? 'true' : undefined,
        'aria-label': options.ariaLabel,
        'aria-labelledby': options.ariaLabelledBy,
        'aria-describedby': options.ariaDescribedBy,
        placeholder: currentPlaceholder || undefined,
        autocomplete: 'off',
      }
    },

    getIncrementButtonProps() {
      const sbProps = spinbutton.contracts.getIncrementButtonProps()
      const isHidden = !stepperAtom()

      return {
        id: sbProps.id,
        tabindex: sbProps.tabindex,
        'aria-label': sbProps['aria-label'],
        'aria-disabled': sbProps['aria-disabled'],
        hidden: isHidden ? true : undefined,
        'aria-hidden': isHidden ? 'true' : undefined,
        onClick: increment,
      }
    },

    getDecrementButtonProps() {
      const sbProps = spinbutton.contracts.getDecrementButtonProps()
      const isHidden = !stepperAtom()

      return {
        id: sbProps.id,
        tabindex: sbProps.tabindex,
        'aria-label': sbProps['aria-label'],
        'aria-disabled': sbProps['aria-disabled'],
        hidden: isHidden ? true : undefined,
        'aria-hidden': isHidden ? 'true' : undefined,
        onClick: decrement,
      }
    },

    getClearButtonProps() {
      const isVisible = showClearButton()

      return {
        role: 'button',
        'aria-label': 'Clear value',
        tabindex: '-1',
        hidden: isVisible ? undefined : true,
        'aria-hidden': isVisible ? undefined : 'true',
        onClick: clear,
      }
    },
  }

  // State
  const state: NumberState = {
    value: spinbutton.state.value,
    min: spinbutton.state.min,
    max: spinbutton.state.max,
    step: spinbutton.state.step,
    largeStep: spinbutton.state.largeStep,
    isDisabled: spinbutton.state.isDisabled,
    isReadOnly: spinbutton.state.isReadOnly,
    hasMin: () => spinbutton.state.hasMin(),
    hasMax: () => spinbutton.state.hasMax(),
    focused: focusedAtom,
    filled,
    clearable: clearableAtom,
    showClearButton,
    stepper: stepperAtom,
    draftText: draftTextAtom,
    placeholder: placeholderAtom,
    required: requiredAtom,
    defaultValue: defaultValueAtom,
  }

  const actions: NumberActions = {
    setValue,
    increment,
    decrement,
    incrementLarge,
    decrementLarge,
    setFirst,
    setLast,
    handleKeyDown,
    setDisabled,
    setReadOnly,
    setRequired,
    setClearable,
    setStepper,
    setFocused,
    setPlaceholder,
    setDraftText,
    commitDraft,
    clear,
    handleInput,
  }

  return {
    state,
    actions,
    contracts,
  }
}
