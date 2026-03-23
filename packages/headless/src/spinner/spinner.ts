import {action, atom, type Atom} from '@reatom/core'

export interface CreateSpinnerOptions {
  label?: string
}

export interface SpinnerProps {
  role: 'progressbar'
  'aria-label': string
}

export interface SpinnerState {
  label: Atom<string>
}

export interface SpinnerActions {
  setLabel(value: string): void
}

export interface SpinnerContracts {
  getSpinnerProps(): SpinnerProps
}

export interface SpinnerModel {
  readonly state: SpinnerState
  readonly actions: SpinnerActions
  readonly contracts: SpinnerContracts
}

export function createSpinner(options: CreateSpinnerOptions = {}): SpinnerModel {
  const labelAtom = atom<string>(options.label ?? 'Loading', 'spinner.label')

  const actions: SpinnerActions = {
    setLabel: action((value: string) => {
      labelAtom.set(value)
    }, 'spinner.setLabel'),
  }

  const contracts: SpinnerContracts = {
    getSpinnerProps(): SpinnerProps {
      return {
        role: 'progressbar',
        'aria-label': labelAtom(),
      }
    },
  }

  const state: SpinnerState = {
    label: labelAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
