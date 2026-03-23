import {action, atom, type Atom} from '@reatom/core'
import {
  clampValue,
  decrementValue,
  decrementValueLarge,
  incrementValue,
  incrementValueLarge,
  normalizeValueRange,
  snapValueToStep,
  type ValueRangeConfig,
} from '../core/value-range'

export type SliderMultiThumbOrientation = 'horizontal' | 'vertical'

export interface CreateSliderMultiThumbOptions {
  idBase?: string
  values: readonly number[]
  min?: number
  max?: number
  step?: number
  largeStep?: number
  orientation?: SliderMultiThumbOrientation
  isDisabled?: boolean
  initialActiveThumbIndex?: number | null
  getThumbAriaLabel?: (index: number) => string | undefined
  formatValueText?: (value: number, index: number) => string
  onValuesChange?: (values: readonly number[]) => void
}

export interface SliderMultiThumbState {
  values: Atom<number[]>
  min: Atom<number>
  max: Atom<number>
  step: Atom<number>
  largeStep: Atom<number>
  activeThumbIndex: Atom<number | null>
  isDisabled: Atom<boolean>
  orientation: SliderMultiThumbOrientation
}

export interface SliderMultiThumbActions {
  setValue(index: number, value: number): void
  increment(index: number): void
  decrement(index: number): void
  incrementLarge(index: number): void
  decrementLarge(index: number): void
  setActiveThumb(index: number): void
  handleKeyDown(index: number, event: Pick<KeyboardEvent, 'key'>): void
  setDisabled(value: boolean): void
}

export interface SliderMultiThumbRootProps {
  id: string
  'data-orientation': SliderMultiThumbOrientation
  'aria-disabled'?: 'true'
}

export interface SliderMultiThumbTrackProps {
  id: string
  'data-orientation': SliderMultiThumbOrientation
}

export interface SliderMultiThumbThumbProps {
  id: string
  role: 'slider'
  tabindex: '0' | '-1'
  'aria-valuenow': string
  'aria-valuemin': string
  'aria-valuemax': string
  'aria-valuetext'?: string
  'aria-orientation': SliderMultiThumbOrientation
  'aria-disabled'?: 'true'
  'aria-label'?: string
  'data-active': 'true' | 'false'
  onKeyDown: (event: Pick<KeyboardEvent, 'key'>) => void
}

export interface SliderMultiThumbContracts {
  getRootProps(): SliderMultiThumbRootProps
  getTrackProps(): SliderMultiThumbTrackProps
  getThumbProps(index: number): SliderMultiThumbThumbProps
}

export interface SliderMultiThumbModel {
  readonly state: SliderMultiThumbState
  readonly actions: SliderMultiThumbActions
  readonly contracts: SliderMultiThumbContracts
}

const normalizeInitialValues = (values: readonly number[], range: ValueRangeConfig): number[] => {
  const snapped = values.map((value) => snapValueToStep(value, range))
  const ordered = [...snapped].sort((left, right) => left - right)

  return ordered.map((value, index, list) => {
    const min = index === 0 ? range.min : (list[index - 1] ?? range.min)
    const max = index === list.length - 1 ? range.max : (list[index + 1] ?? range.max)
    return clampValue(value, min, max)
  })
}

const isThumbIndex = (index: number, values: readonly number[]) =>
  Number.isInteger(index) && index >= 0 && index < values.length

export function createSliderMultiThumb(options: CreateSliderMultiThumbOptions): SliderMultiThumbModel {
  const idBase = options.idBase ?? 'slider-multi-thumb'
  const orientation = options.orientation ?? 'horizontal'

  const range = normalizeValueRange({
    min: options.min ?? 0,
    max: options.max ?? 100,
    step: options.step,
    largeStep: options.largeStep,
  })

  const minAtom = atom(range.min, `${idBase}.min`)
  const maxAtom = atom(range.max, `${idBase}.max`)
  const stepAtom = atom(range.step, `${idBase}.step`)
  const largeStepAtom = atom(range.largeStep, `${idBase}.largeStep`)

  const getRange = (): ValueRangeConfig => ({
    min: minAtom(),
    max: maxAtom(),
    step: stepAtom(),
    largeStep: largeStepAtom(),
  })

  const valuesAtom = atom(normalizeInitialValues(options.values, getRange()), `${idBase}.values`)
  const isDisabledAtom = atom(options.isDisabled ?? false, `${idBase}.isDisabled`)
  const activeThumbIndexAtom = atom<number | null>(
    options.initialActiveThumbIndex ?? (valuesAtom().length > 0 ? 0 : null),
    `${idBase}.activeThumbIndex`,
  )

  const getThumbBounds = (index: number, values = valuesAtom()) => {
    const min = index === 0 ? minAtom() : (values[index - 1] ?? minAtom())
    const max = index === values.length - 1 ? maxAtom() : (values[index + 1] ?? maxAtom())
    return {min, max}
  }

  const applyValueAtIndex = (index: number, next: number) => {
    const values = [...valuesAtom()]
    if (!isThumbIndex(index, values)) return

    const bounds = getThumbBounds(index, values)
    const localRange = {
      ...getRange(),
      min: bounds.min,
      max: bounds.max,
    }
    values[index] = snapValueToStep(clampValue(next, bounds.min, bounds.max), localRange)
    valuesAtom.set(values)
    options.onValuesChange?.(values)
  }

  const setValue = action((index: number, value: number) => {
    if (isDisabledAtom()) return
    applyValueAtIndex(index, value)
    activeThumbIndexAtom.set(index)
  }, `${idBase}.setValue`)

  const increment = action((index: number) => {
    if (isDisabledAtom()) return
    const values = valuesAtom()
    if (!isThumbIndex(index, values)) return

    const bounds = getThumbBounds(index, values)
    const localRange = {
      ...getRange(),
      min: bounds.min,
      max: bounds.max,
    }
    applyValueAtIndex(index, incrementValue(values[index] ?? bounds.min, localRange))
    activeThumbIndexAtom.set(index)
  }, `${idBase}.increment`)

  const decrement = action((index: number) => {
    if (isDisabledAtom()) return
    const values = valuesAtom()
    if (!isThumbIndex(index, values)) return

    const bounds = getThumbBounds(index, values)
    const localRange = {
      ...getRange(),
      min: bounds.min,
      max: bounds.max,
    }
    applyValueAtIndex(index, decrementValue(values[index] ?? bounds.max, localRange))
    activeThumbIndexAtom.set(index)
  }, `${idBase}.decrement`)

  const incrementLarge = action((index: number) => {
    if (isDisabledAtom()) return
    const values = valuesAtom()
    if (!isThumbIndex(index, values)) return

    const bounds = getThumbBounds(index, values)
    const localRange = {
      ...getRange(),
      min: bounds.min,
      max: bounds.max,
    }
    applyValueAtIndex(index, incrementValueLarge(values[index] ?? bounds.min, localRange))
    activeThumbIndexAtom.set(index)
  }, `${idBase}.incrementLarge`)

  const decrementLarge = action((index: number) => {
    if (isDisabledAtom()) return
    const values = valuesAtom()
    if (!isThumbIndex(index, values)) return

    const bounds = getThumbBounds(index, values)
    const localRange = {
      ...getRange(),
      min: bounds.min,
      max: bounds.max,
    }
    applyValueAtIndex(index, decrementValueLarge(values[index] ?? bounds.max, localRange))
    activeThumbIndexAtom.set(index)
  }, `${idBase}.decrementLarge`)

  const setActiveThumb = action((index: number) => {
    if (!isThumbIndex(index, valuesAtom())) return
    activeThumbIndexAtom.set(index)
  }, `${idBase}.setActiveThumb`)

  const setDisabled = action((value: boolean) => {
    isDisabledAtom.set(value)
  }, `${idBase}.setDisabled`)

  const handleKeyDown = action((index: number, event: Pick<KeyboardEvent, 'key'>) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        increment(index)
        return
      case 'ArrowLeft':
      case 'ArrowDown':
        decrement(index)
        return
      case 'PageUp':
        incrementLarge(index)
        return
      case 'PageDown':
        decrementLarge(index)
        return
      case 'Home': {
        const {min} = getThumbBounds(index)
        setValue(index, min)
        return
      }
      case 'End': {
        const {max} = getThumbBounds(index)
        setValue(index, max)
        return
      }
      default:
        return
    }
  }, `${idBase}.handleKeyDown`)

  const actions: SliderMultiThumbActions = {
    setValue,
    increment,
    decrement,
    incrementLarge,
    decrementLarge,
    setActiveThumb,
    handleKeyDown,
    setDisabled,
  }

  const contracts: SliderMultiThumbContracts = {
    getRootProps() {
      return {
        id: `${idBase}-root`,
        'data-orientation': orientation,
        'aria-disabled': isDisabledAtom() ? 'true' : undefined,
      }
    },
    getTrackProps() {
      return {
        id: `${idBase}-track`,
        'data-orientation': orientation,
      }
    },
    getThumbProps(index: number) {
      const values = valuesAtom()
      if (!isThumbIndex(index, values)) {
        throw new Error(`Unknown slider thumb index: ${index}`)
      }

      const {min, max} = getThumbBounds(index, values)
      const value = values[index] ?? min
      const activeIndex = activeThumbIndexAtom()
      const isActive = activeIndex == null ? index === 0 : activeIndex === index

      return {
        id: `${idBase}-thumb-${index}`,
        role: 'slider',
        tabindex: isDisabledAtom() ? '-1' : '0',
        'aria-valuenow': String(value),
        'aria-valuemin': String(min),
        'aria-valuemax': String(max),
        'aria-valuetext': options.formatValueText?.(value, index),
        'aria-orientation': orientation,
        'aria-disabled': isDisabledAtom() ? 'true' : undefined,
        'aria-label': options.getThumbAriaLabel?.(index),
        'data-active': isActive ? 'true' : 'false',
        onKeyDown: (event: Pick<KeyboardEvent, 'key'>) => handleKeyDown(index, event),
      }
    },
  }

  const state: SliderMultiThumbState = {
    values: valuesAtom,
    min: minAtom,
    max: maxAtom,
    step: stepAtom,
    largeStep: largeStepAtom,
    activeThumbIndex: activeThumbIndexAtom,
    isDisabled: isDisabledAtom,
    orientation,
  }

  return {
    state,
    actions,
    contracts,
  }
}
