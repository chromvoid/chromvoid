import {action, atom, computed, type Atom, type Computed} from '@reatom/core'
import {createValueRange} from '../core/value-range'

export interface CreateProgressOptions {
  idBase?: string
  value?: number
  min?: number
  max?: number
  step?: number
  isIndeterminate?: boolean
  valueText?: string
  ariaLabel?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
  formatValueText?: (value: number) => string
  onValueChange?: (value: number) => void
}

export interface ProgressState {
  value: Atom<number>
  min: Atom<number>
  max: Atom<number>
  percentage: Computed<number>
  isIndeterminate: Atom<boolean>
  isComplete: Computed<boolean>
}

export interface ProgressActions {
  setValue(value: number): void
  increment(): void
  decrement(): void
  setIndeterminate(value: boolean): void
}

export interface ProgressProps {
  id: string
  role: 'progressbar'
  'aria-valuenow'?: string
  'aria-valuemin'?: string
  'aria-valuemax'?: string
  'aria-valuetext'?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
}

export interface ProgressContracts {
  getProgressProps(): ProgressProps
}

export interface ProgressModel {
  readonly state: ProgressState
  readonly actions: ProgressActions
  readonly contracts: ProgressContracts
}

export function createProgress(options: CreateProgressOptions = {}): ProgressModel {
  const idBase = options.idBase ?? 'progress'
  const isIndeterminateAtom = atom<boolean>(options.isIndeterminate ?? false, `${idBase}.isIndeterminate`)

  const range = createValueRange({
    idBase: `${idBase}.range`,
    min: options.min ?? 0,
    max: options.max ?? 100,
    step: options.step,
    initialValue: options.value,
  })

  const commitValue = (update: () => void) => {
    const previous = range.state.value()
    update()
    const next = range.state.value()

    if (previous !== next) {
      options.onValueChange?.(next)
    }
  }

  const setValue = action((value: number) => {
    commitValue(() => {
      range.actions.setValue(value)
    })
  }, `${idBase}.setValue`)

  const increment = action(() => {
    commitValue(() => {
      range.actions.increment()
    })
  }, `${idBase}.increment`)

  const decrement = action(() => {
    commitValue(() => {
      range.actions.decrement()
    })
  }, `${idBase}.decrement`)

  const setIndeterminate = action((value: boolean) => {
    isIndeterminateAtom.set(value)
  }, `${idBase}.setIndeterminate`)

  const isCompleteAtom = computed(
    () => !isIndeterminateAtom() && range.state.value() >= range.state.max(),
    `${idBase}.isComplete`,
  )

  const actions: ProgressActions = {
    setValue,
    increment,
    decrement,
    setIndeterminate,
  }

  const contracts: ProgressContracts = {
    getProgressProps() {
      const value = range.state.value()
      const indeterminate = isIndeterminateAtom()
      const percentageText = `${Math.round(range.state.percentage())}%`

      return {
        id: `${idBase}-root`,
        role: 'progressbar',
        'aria-valuenow': indeterminate ? undefined : String(value),
        'aria-valuemin': indeterminate ? undefined : String(range.state.min()),
        'aria-valuemax': indeterminate ? undefined : String(range.state.max()),
        'aria-valuetext': indeterminate ? undefined : (options.valueText ?? options.formatValueText?.(value) ?? percentageText),
        'aria-label': options.ariaLabel,
        'aria-labelledby': options.ariaLabelledBy,
        'aria-describedby': options.ariaDescribedBy,
      }
    },
  }

  const state: ProgressState = {
    value: range.state.value,
    min: range.state.min,
    max: range.state.max,
    percentage: range.state.percentage,
    isIndeterminate: isIndeterminateAtom,
    isComplete: isCompleteAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
