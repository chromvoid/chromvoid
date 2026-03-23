import {action, atom, computed, type Atom, type Computed} from '@reatom/core'

export interface ValueRangeInput {
  min: number
  max: number
  step?: number
  largeStep?: number
}

export interface ValueRangeConfig {
  min: number
  max: number
  step: number
  largeStep: number
}

export interface CreateValueRangeOptions extends ValueRangeInput {
  idBase?: string
  initialValue?: number
}

export interface ValueRangeState {
  value: Atom<number>
  min: Atom<number>
  max: Atom<number>
  step: Atom<number>
  largeStep: Atom<number>
  percentage: Computed<number>
}

export interface ValueRangeActions {
  setValue(value: number): void
  increment(): void
  decrement(): void
  incrementLarge(): void
  decrementLarge(): void
  setFirst(): void
  setLast(): void
}

export interface ValueRangeModel {
  readonly state: ValueRangeState
  readonly actions: ValueRangeActions
}

const EPSILON = 1e-9

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

const sanitizeStep = (value: number | undefined, fallback: number) => {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return fallback
  }

  return value
}

export const normalizeValueRange = ({min, max, step, largeStep}: ValueRangeInput): ValueRangeConfig => {
  const normalizedMin = Math.min(min, max)
  const normalizedMax = Math.max(min, max)
  const normalizedStep = sanitizeStep(step, 1)
  const range = normalizedMax - normalizedMin
  const defaultLargeStep = Math.max(normalizedStep, range / 10)

  return {
    min: normalizedMin,
    max: normalizedMax,
    step: normalizedStep,
    largeStep: sanitizeStep(largeStep, defaultLargeStep),
  }
}

export const clampValue = (value: number, min: number, max: number) => {
  const normalizedMin = Math.min(min, max)
  const normalizedMax = Math.max(min, max)

  if (value < normalizedMin) return normalizedMin
  if (value > normalizedMax) return normalizedMax
  return value
}

export const snapValueToStep = (value: number, range: ValueRangeConfig) => {
  const clamped = clampValue(value, range.min, range.max)
  const offset = (clamped - range.min) / range.step
  const snapped = range.min + Math.round(offset) * range.step
  const precision = Math.max(decimalPlaces(range.min), decimalPlaces(range.step))

  return clampValue(normalizePrecision(snapped, precision + 2), range.min, range.max)
}

export const constrainValueToRange = (value: number, range: ValueRangeConfig) => snapValueToStep(value, range)

export const calculateValueRangePercentage = (value: number, min: number, max: number) => {
  const normalizedMin = Math.min(min, max)
  const normalizedMax = Math.max(min, max)
  const span = normalizedMax - normalizedMin

  if (span <= EPSILON) {
    return 0
  }

  const clamped = clampValue(value, normalizedMin, normalizedMax)
  return normalizePrecision(((clamped - normalizedMin) / span) * 100, 4)
}

export const incrementValue = (value: number, range: ValueRangeConfig) => {
  const next = snapValueToStep(value, range) + range.step
  return snapValueToStep(next, range)
}

export const decrementValue = (value: number, range: ValueRangeConfig) => {
  const next = snapValueToStep(value, range) - range.step
  return snapValueToStep(next, range)
}

export const incrementValueLarge = (value: number, range: ValueRangeConfig) => {
  const next = snapValueToStep(value, range) + range.largeStep
  return snapValueToStep(next, range)
}

export const decrementValueLarge = (value: number, range: ValueRangeConfig) => {
  const next = snapValueToStep(value, range) - range.largeStep
  return snapValueToStep(next, range)
}

export const valuesEqualWithinStep = (left: number, right: number) => Math.abs(left - right) <= EPSILON

export function createValueRange(options: CreateValueRangeOptions): ValueRangeModel {
  const idBase = options.idBase ?? 'value-range'
  const initialRange = normalizeValueRange(options)

  const minAtom = atom(initialRange.min, `${idBase}.min`)
  const maxAtom = atom(initialRange.max, `${idBase}.max`)
  const stepAtom = atom(initialRange.step, `${idBase}.step`)
  const largeStepAtom = atom(initialRange.largeStep, `${idBase}.largeStep`)

  const getRange = (): ValueRangeConfig => ({
    min: minAtom(),
    max: maxAtom(),
    step: stepAtom(),
    largeStep: largeStepAtom(),
  })

  const valueAtom = atom(
    constrainValueToRange(options.initialValue ?? initialRange.min, getRange()),
    `${idBase}.value`,
  )

  const percentageAtom = computed(
    () => calculateValueRangePercentage(valueAtom(), minAtom(), maxAtom()),
    `${idBase}.percentage`,
  )

  const setValue = action((value: number) => {
    valueAtom.set(constrainValueToRange(value, getRange()))
  }, `${idBase}.setValue`)

  const increment = action(() => {
    valueAtom.set(incrementValue(valueAtom(), getRange()))
  }, `${idBase}.increment`)

  const decrement = action(() => {
    valueAtom.set(decrementValue(valueAtom(), getRange()))
  }, `${idBase}.decrement`)

  const incrementLarge = action(() => {
    valueAtom.set(incrementValueLarge(valueAtom(), getRange()))
  }, `${idBase}.incrementLarge`)

  const decrementLarge = action(() => {
    valueAtom.set(decrementValueLarge(valueAtom(), getRange()))
  }, `${idBase}.decrementLarge`)

  const setFirst = action(() => {
    valueAtom.set(minAtom())
  }, `${idBase}.setFirst`)

  const setLast = action(() => {
    valueAtom.set(maxAtom())
  }, `${idBase}.setLast`)

  const actions: ValueRangeActions = {
    setValue,
    increment,
    decrement,
    incrementLarge,
    decrementLarge,
    setFirst,
    setLast,
  }

  return {
    state: {
      value: valueAtom,
      min: minAtom,
      max: maxAtom,
      step: stepAtom,
      largeStep: largeStepAtom,
      percentage: percentageAtom,
    },
    actions,
  }
}
