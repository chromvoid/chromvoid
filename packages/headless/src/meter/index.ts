import {action, atom, computed, type Atom, type Computed} from '@reatom/core'

export type MeterStatus = 'low' | 'high' | 'optimum' | 'normal'

export interface CreateMeterOptions {
  idBase?: string
  value?: number
  min?: number
  max?: number
  low?: number
  high?: number
  optimum?: number
  ariaLabel?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
  formatValueText?: (value: number) => string
}

export interface MeterState {
  value: Atom<number>
  min: Atom<number>
  max: Atom<number>
  percentage: Computed<number>
  status: Computed<MeterStatus>
}

export interface MeterActions {
  setValue(value: number): void
}

export interface MeterProps {
  id: string
  role: 'meter'
  'aria-valuenow': string
  'aria-valuemin': string
  'aria-valuemax': string
  'aria-valuetext'?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
}

export interface MeterContracts {
  getMeterProps(): MeterProps
}

export interface MeterModel {
  readonly state: MeterState
  readonly actions: MeterActions
  readonly contracts: MeterContracts
}

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min
  if (value > max) return max
  return value
}

// Enforces invariant: min <= low <= high <= max
const normalizeThresholds = (
  min: number,
  max: number,
  low: number | undefined,
  high: number | undefined,
  optimum: number | undefined,
): {low: number | null; high: number | null; optimum: number | null} => {
  let normalizedLow: number | null = null
  let normalizedHigh: number | null = null
  let normalizedOptimum: number | null = null

  if (low != null && Number.isFinite(low)) {
    normalizedLow = clamp(low, min, max)
  }

  if (high != null && Number.isFinite(high)) {
    normalizedHigh = clamp(high, min, max)
  }

  if (normalizedLow != null && normalizedHigh != null && normalizedLow > normalizedHigh) {
    const low = normalizedLow
    normalizedLow = normalizedHigh
    normalizedHigh = low
  }

  if (optimum != null && Number.isFinite(optimum)) {
    normalizedOptimum = clamp(optimum, min, max)
  }

  return {low: normalizedLow, high: normalizedHigh, optimum: normalizedOptimum}
}

const getMeterStatus = (
  value: number,
  low: number | null,
  high: number | null,
  optimum: number | null,
): MeterStatus => {
  if (low == null && high == null) return 'normal'

  const isInLowRegion = low != null && value < low
  const isInHighRegion = high != null && value > high

  if (optimum != null) {
    const optimumInLow = low != null && optimum < low
    const optimumInHigh = high != null && optimum > high
    const optimumInNormal = !optimumInLow && !optimumInHigh

    if (optimumInLow && isInLowRegion) return 'optimum'
    if (optimumInHigh && isInHighRegion) return 'optimum'
    if (optimumInNormal && !isInLowRegion && !isInHighRegion) return 'optimum'
  }

  if (isInLowRegion) return 'low'
  if (isInHighRegion) return 'high'
  return 'normal'
}

export function createMeter(options: CreateMeterOptions = {}): MeterModel {
  const idBase = options.idBase ?? 'meter'
  const rawMin = options.min ?? 0
  const rawMax = options.max ?? 100

  const minVal = Math.min(rawMin, rawMax)
  const maxVal = Math.max(rawMin, rawMax)

  const minAtom = atom(minVal, `${idBase}.min`)
  const maxAtom = atom(maxVal, `${idBase}.max`)
  const valueAtom = atom(clamp(options.value ?? minVal, minVal, maxVal), `${idBase}.value`)

  const thresholds = normalizeThresholds(minVal, maxVal, options.low, options.high, options.optimum)

  const percentageAtom = computed(() => {
    const min = minAtom()
    const max = maxAtom()
    const span = max - min

    if (span <= 0) return 0

    const clamped = clamp(valueAtom(), min, max)
    return Number(((clamped - min) / span * 100).toFixed(4))
  }, `${idBase}.percentage`)

  const statusAtom = computed(() => {
    return getMeterStatus(valueAtom(), thresholds.low, thresholds.high, thresholds.optimum)
  }, `${idBase}.status`)

  const actions: MeterActions = {
    setValue: action((value: number) => {
      valueAtom.set(clamp(value, minAtom(), maxAtom()))
    }, `${idBase}.setValue`),
  }

  const contracts: MeterContracts = {
    getMeterProps() {
      const value = valueAtom()
      return {
        id: `${idBase}-root`,
        role: 'meter',
        'aria-valuenow': String(value),
        'aria-valuemin': String(minAtom()),
        'aria-valuemax': String(maxAtom()),
        'aria-valuetext': options.formatValueText?.(value),
        'aria-label': options.ariaLabel,
        'aria-labelledby': options.ariaLabelledBy,
        'aria-describedby': options.ariaDescribedBy,
      }
    },
  }

  const state: MeterState = {
    value: valueAtom,
    min: minAtom,
    max: maxAtom,
    percentage: percentageAtom,
    status: statusAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
