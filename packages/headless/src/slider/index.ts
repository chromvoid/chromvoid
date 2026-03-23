import {action, atom, type Atom} from '@reatom/core'
import {createValueRange, type ValueRangeActions, type ValueRangeState} from '../core/value-range'

export type SliderOrientation = 'horizontal' | 'vertical'

export interface CreateSliderOptions {
  idBase?: string
  value?: number
  min?: number
  max?: number
  step?: number
  largeStep?: number
  orientation?: SliderOrientation
  isDisabled?: boolean
  ariaLabel?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
  formatValueText?: (value: number) => string
  onValueChange?: (value: number) => void
}

export interface SliderState extends ValueRangeState {
  isDisabled: Atom<boolean>
  orientation: SliderOrientation
}

export interface SliderActions extends ValueRangeActions {
  setDisabled(value: boolean): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key'>): void
}

export interface SliderRootProps {
  id: string
  'data-orientation': SliderOrientation
  'aria-disabled'?: 'true'
}

export interface SliderTrackProps {
  id: string
  'data-orientation': SliderOrientation
}

export interface SliderThumbProps {
  id: string
  role: 'slider'
  tabindex: '0' | '-1'
  'aria-valuenow': string
  'aria-valuemin': string
  'aria-valuemax': string
  'aria-valuetext'?: string
  'aria-orientation': SliderOrientation
  'aria-disabled'?: 'true'
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  onKeyDown: (event: Pick<KeyboardEvent, 'key'>) => void
}

export interface SliderContracts {
  getRootProps(): SliderRootProps
  getTrackProps(): SliderTrackProps
  getThumbProps(): SliderThumbProps
}

export interface SliderModel {
  readonly state: SliderState
  readonly actions: SliderActions
  readonly contracts: SliderContracts
}

const updateValue = (
  isDisabled: () => boolean,
  valueAtom: () => number,
  update: () => void,
  onValueChange?: (value: number) => void,
) => {
  if (isDisabled()) return

  const previous = valueAtom()
  update()
  const next = valueAtom()

  if (previous !== next) {
    onValueChange?.(next)
  }
}

export function createSlider(options: CreateSliderOptions = {}): SliderModel {
  const idBase = options.idBase ?? 'slider'
  const orientation = options.orientation ?? 'horizontal'
  const isDisabledAtom = atom(options.isDisabled ?? false, `${idBase}.isDisabled`)

  const range = createValueRange({
    idBase: `${idBase}.range`,
    min: options.min ?? 0,
    max: options.max ?? 100,
    step: options.step,
    largeStep: options.largeStep,
    initialValue: options.value,
  })

  const setValue = action((value: number) => {
    updateValue(
      isDisabledAtom,
      range.state.value,
      () => {
        range.actions.setValue(value)
      },
      options.onValueChange,
    )
  }, `${idBase}.setValue`)

  const increment = action(() => {
    updateValue(
      isDisabledAtom,
      range.state.value,
      () => {
        range.actions.increment()
      },
      options.onValueChange,
    )
  }, `${idBase}.increment`)

  const decrement = action(() => {
    updateValue(
      isDisabledAtom,
      range.state.value,
      () => {
        range.actions.decrement()
      },
      options.onValueChange,
    )
  }, `${idBase}.decrement`)

  const incrementLarge = action(() => {
    updateValue(
      isDisabledAtom,
      range.state.value,
      () => {
        range.actions.incrementLarge()
      },
      options.onValueChange,
    )
  }, `${idBase}.incrementLarge`)

  const decrementLarge = action(() => {
    updateValue(
      isDisabledAtom,
      range.state.value,
      () => {
        range.actions.decrementLarge()
      },
      options.onValueChange,
    )
  }, `${idBase}.decrementLarge`)

  const setFirst = action(() => {
    updateValue(
      isDisabledAtom,
      range.state.value,
      () => {
        range.actions.setFirst()
      },
      options.onValueChange,
    )
  }, `${idBase}.setFirst`)

  const setLast = action(() => {
    updateValue(
      isDisabledAtom,
      range.state.value,
      () => {
        range.actions.setLast()
      },
      options.onValueChange,
    )
  }, `${idBase}.setLast`)

  const setDisabled = action((value: boolean) => {
    isDisabledAtom.set(value)
  }, `${idBase}.setDisabled`)

  const handleKeyDown = action((event: Pick<KeyboardEvent, 'key'>) => {
    if (isDisabledAtom()) return

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        increment()
        return
      case 'ArrowLeft':
      case 'ArrowDown':
        decrement()
        return
      case 'PageUp':
        incrementLarge()
        return
      case 'PageDown':
        decrementLarge()
        return
      case 'Home':
        setFirst()
        return
      case 'End':
        setLast()
        return
      default:
        return
    }
  }, `${idBase}.handleKeyDown`)

  const actions: SliderActions = {
    setValue,
    increment,
    decrement,
    incrementLarge,
    decrementLarge,
    setFirst,
    setLast,
    setDisabled,
    handleKeyDown,
  }

  const contracts: SliderContracts = {
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
    getThumbProps() {
      const value = range.state.value()
      return {
        id: `${idBase}-thumb`,
        role: 'slider',
        tabindex: isDisabledAtom() ? '-1' : '0',
        'aria-valuenow': String(value),
        'aria-valuemin': String(range.state.min()),
        'aria-valuemax': String(range.state.max()),
        'aria-valuetext': options.formatValueText?.(value),
        'aria-orientation': orientation,
        'aria-disabled': isDisabledAtom() ? 'true' : undefined,
        'aria-label': options.ariaLabel,
        'aria-labelledby': options.ariaLabelledBy,
        'aria-describedby': options.ariaDescribedBy,
        onKeyDown: handleKeyDown,
      }
    },
  }

  const state: SliderState = {
    value: range.state.value,
    min: range.state.min,
    max: range.state.max,
    step: range.state.step,
    largeStep: range.state.largeStep,
    percentage: range.state.percentage,
    isDisabled: isDisabledAtom,
    orientation,
  }

  return {
    state,
    actions,
    contracts,
  }
}
