import {action, atom, computed, type Atom, type Computed} from '@reatom/core'

export type SpinbuttonKeyboardEventLike = Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}

export interface CreateSpinbuttonOptions {
  idBase?: string
  value?: number
  min?: number
  max?: number
  step?: number
  largeStep?: number
  isDisabled?: boolean
  isReadOnly?: boolean
  ariaLabel?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
  formatValueText?: (value: number) => string
  onValueChange?: (value: number) => void
}

export interface SpinbuttonState {
  value: Atom<number>
  min: Atom<number | undefined>
  max: Atom<number | undefined>
  step: Atom<number>
  largeStep: Atom<number>
  isDisabled: Atom<boolean>
  isReadOnly: Atom<boolean>
  hasMin: Computed<boolean>
  hasMax: Computed<boolean>
}

export interface SpinbuttonActions {
  setValue(value: number): void
  increment(): void
  decrement(): void
  incrementLarge(): void
  decrementLarge(): void
  setFirst(): void
  setLast(): void
  setDisabled(value: boolean): void
  setReadOnly(value: boolean): void
  handleKeyDown(event: SpinbuttonKeyboardEventLike): void
}

export interface SpinbuttonProps {
  id: string
  role: 'spinbutton'
  tabindex: '0' | '-1'
  'aria-valuenow': string
  'aria-valuemin'?: string
  'aria-valuemax'?: string
  'aria-valuetext'?: string
  'aria-disabled'?: 'true'
  'aria-readonly'?: 'true'
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  onKeyDown: (event: SpinbuttonKeyboardEventLike) => void
}

export interface SpinbuttonButtonProps {
  id: string
  tabindex: '-1'
  'aria-label': string
  'aria-disabled'?: 'true'
  onClick: () => void
}

export interface SpinbuttonContracts {
  getSpinbuttonProps(): SpinbuttonProps
  getIncrementButtonProps(): SpinbuttonButtonProps
  getDecrementButtonProps(): SpinbuttonButtonProps
}

export interface SpinbuttonModel {
  readonly state: SpinbuttonState
  readonly actions: SpinbuttonActions
  readonly contracts: SpinbuttonContracts
}

const EPSILON = 1e-9

const toNumericString = (value: number | undefined) => (value == null ? undefined : String(value))

const sanitizePositive = (value: number | undefined, fallback: number) => {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return fallback
  }

  return value
}

const decimalPlaces = (value: number) => {
  const text = value.toString().toLowerCase()
  const scientific = text.match(/e-(\d+)$/)
  if (scientific?.[1]) {
    return Number.parseInt(scientific[1], 10)
  }

  const decimalIndex = text.indexOf('.')
  if (decimalIndex < 0) return 0
  return text.length - decimalIndex - 1
}

const normalizePrecision = (value: number, precision: number) =>
  Number(value.toFixed(Math.min(Math.max(precision, 0), 12)))

const normalizeBounds = (min: number | undefined, max: number | undefined) => {
  if (min != null && max != null && min > max) {
    return {min: max, max: min}
  }

  return {min, max}
}

const clampOptional = (value: number, min: number | undefined, max: number | undefined) => {
  if (min != null && value < min) return min
  if (max != null && value > max) return max
  return value
}

const snapToStep = (value: number, step: number, anchor: number) => {
  const offset = (value - anchor) / step
  const snapped = anchor + Math.round(offset) * step
  const precision = Math.max(decimalPlaces(anchor), decimalPlaces(step))
  return normalizePrecision(snapped, precision + 2)
}

const isAtOrPastMax = (value: number, max: number | undefined) => max != null && value >= max - EPSILON
const isAtOrPastMin = (value: number, min: number | undefined) => min != null && value <= min + EPSILON

export function createSpinbutton(options: CreateSpinbuttonOptions = {}): SpinbuttonModel {
  const idBase = options.idBase ?? 'spinbutton'
  const initialStep = sanitizePositive(options.step, 1)
  const initialLargeStep = sanitizePositive(options.largeStep, initialStep * 10)
  const normalizedBounds = normalizeBounds(options.min, options.max)

  const minAtom = atom<number | undefined>(normalizedBounds.min, `${idBase}.min`)
  const maxAtom = atom<number | undefined>(normalizedBounds.max, `${idBase}.max`)
  const stepAtom = atom(initialStep, `${idBase}.step`)
  const largeStepAtom = atom(initialLargeStep, `${idBase}.largeStep`)

  const normalizeValue = (value: number) => {
    const snapped = snapToStep(value, stepAtom(), minAtom() ?? 0)
    return clampOptional(snapped, minAtom(), maxAtom())
  }

  const initialValueSeed = Number.isFinite(options.value) ? (options.value as number) : (minAtom() ?? 0)
  const initialValue = normalizeValue(initialValueSeed)

  const valueAtom = atom(initialValue, `${idBase}.value`)
  const isDisabledAtom = atom(options.isDisabled ?? false, `${idBase}.isDisabled`)
  const isReadOnlyAtom = atom(options.isReadOnly ?? false, `${idBase}.isReadOnly`)

  const hasMinComputed = computed(() => minAtom() != null, `${idBase}.hasMinComputed`)
  const hasMaxComputed = computed(() => maxAtom() != null, `${idBase}.hasMaxComputed`)

  const canMutate = () => !isDisabledAtom() && !isReadOnlyAtom()

  const commitValue = (next: number) => {
    if (!Number.isFinite(next)) return

    const previous = valueAtom()
    const normalizedValue = normalizeValue(next)
    valueAtom.set(normalizedValue)

    if (previous !== normalizedValue) {
      options.onValueChange?.(normalizedValue)
    }
  }

  const setValue = action((value: number) => {
    if (!canMutate()) return
    commitValue(value)
  }, `${idBase}.setValue`)

  const increment = action(() => {
    if (!canMutate()) return
    commitValue(valueAtom() + stepAtom())
  }, `${idBase}.increment`)

  const decrement = action(() => {
    if (!canMutate()) return
    commitValue(valueAtom() - stepAtom())
  }, `${idBase}.decrement`)

  const incrementLarge = action(() => {
    if (!canMutate()) return
    commitValue(valueAtom() + largeStepAtom())
  }, `${idBase}.incrementLarge`)

  const decrementLarge = action(() => {
    if (!canMutate()) return
    commitValue(valueAtom() - largeStepAtom())
  }, `${idBase}.decrementLarge`)

  const setFirst = action(() => {
    if (!canMutate() || minAtom() == null) return
    commitValue(minAtom() as number)
  }, `${idBase}.setFirst`)

  const setLast = action(() => {
    if (!canMutate() || maxAtom() == null) return
    commitValue(maxAtom() as number)
  }, `${idBase}.setLast`)

  const setDisabled = action((value: boolean) => {
    isDisabledAtom.set(value)
  }, `${idBase}.setDisabled`)

  const setReadOnly = action((value: boolean) => {
    isReadOnlyAtom.set(value)
  }, `${idBase}.setReadOnly`)

  const handleKeyDown = action((event: SpinbuttonKeyboardEventLike) => {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault?.()
        increment()
        return
      case 'ArrowDown':
        event.preventDefault?.()
        decrement()
        return
      case 'PageUp':
        event.preventDefault?.()
        incrementLarge()
        return
      case 'PageDown':
        event.preventDefault?.()
        decrementLarge()
        return
      case 'Home':
        event.preventDefault?.()
        setFirst()
        return
      case 'End':
        event.preventDefault?.()
        setLast()
        return
      default:
        return
    }
  }, `${idBase}.handleKeyDown`)

  const actions: SpinbuttonActions = {
    setValue,
    increment,
    decrement,
    incrementLarge,
    decrementLarge,
    setFirst,
    setLast,
    setDisabled,
    setReadOnly,
    handleKeyDown,
  }

  const isControlDisabled = () => isDisabledAtom() || isReadOnlyAtom()
  const isIncrementDisabled = () => isControlDisabled() || isAtOrPastMax(valueAtom(), maxAtom())
  const isDecrementDisabled = () => isControlDisabled() || isAtOrPastMin(valueAtom(), minAtom())

  const contracts: SpinbuttonContracts = {
    getSpinbuttonProps() {
      const value = valueAtom()
      return {
        id: `${idBase}-root`,
        role: 'spinbutton',
        tabindex: isDisabledAtom() ? '-1' : '0',
        'aria-valuenow': String(value),
        'aria-valuemin': toNumericString(minAtom()),
        'aria-valuemax': toNumericString(maxAtom()),
        'aria-valuetext': options.formatValueText?.(value),
        'aria-disabled': isDisabledAtom() ? 'true' : undefined,
        'aria-readonly': isReadOnlyAtom() ? 'true' : undefined,
        'aria-label': options.ariaLabel,
        'aria-labelledby': options.ariaLabelledBy,
        'aria-describedby': options.ariaDescribedBy,
        onKeyDown: handleKeyDown,
      }
    },
    getIncrementButtonProps() {
      return {
        id: `${idBase}-increment`,
        tabindex: '-1',
        'aria-label': 'Increment value',
        'aria-disabled': isIncrementDisabled() ? 'true' : undefined,
        onClick: increment,
      }
    },
    getDecrementButtonProps() {
      return {
        id: `${idBase}-decrement`,
        tabindex: '-1',
        'aria-label': 'Decrement value',
        'aria-disabled': isDecrementDisabled() ? 'true' : undefined,
        onClick: decrement,
      }
    },
  }

  const state: SpinbuttonState = {
    value: valueAtom,
    min: minAtom,
    max: maxAtom,
    step: stepAtom,
    largeStep: largeStepAtom,
    isDisabled: isDisabledAtom,
    isReadOnly: isReadOnlyAtom,
    hasMin: hasMinComputed,
    hasMax: hasMaxComputed,
  }

  return {
    state,
    actions,
    contracts,
  }
}
