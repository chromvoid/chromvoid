import {action, atom, type Atom} from '@reatom/core'

export interface CreateSwitchOptions {
  idBase?: string
  isOn?: boolean
  isDisabled?: boolean
  ariaLabelledBy?: string
  ariaDescribedBy?: string
  onCheckedChange?: (value: boolean) => void
}

export interface SwitchState {
  isOn: Atom<boolean>
  isDisabled: Atom<boolean>
}

export interface SwitchActions {
  setOn(value: boolean): void
  setDisabled(value: boolean): void
  toggle(): void
  handleClick(): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key' | 'preventDefault'>): void
}

export interface SwitchProps {
  id: string
  role: 'switch'
  tabindex: '0' | '-1'
  'aria-checked': 'true' | 'false'
  'aria-disabled': 'true' | 'false'
  'aria-labelledby'?: string
  'aria-describedby'?: string
  onClick: () => void
  onKeyDown: (event: Pick<KeyboardEvent, 'key' | 'preventDefault'>) => void
}

export interface SwitchContracts {
  getSwitchProps(): SwitchProps
}

export interface SwitchModel {
  readonly state: SwitchState
  readonly actions: SwitchActions
  readonly contracts: SwitchContracts
}

const isSpaceKey = (key: string) => key === ' ' || key === 'Spacebar'

export function createSwitch(options: CreateSwitchOptions = {}): SwitchModel {
  const idBase = options.idBase ?? 'switch'
  const isOnAtom = atom(options.isOn ?? false, `${idBase}.isOn`)
  const isDisabledAtom = atom(options.isDisabled ?? false, `${idBase}.isDisabled`)

  const setOn = action((value: boolean) => {
    isOnAtom.set(value)
    options.onCheckedChange?.(value)
  }, `${idBase}.setOn`)

  const setDisabled = action((value: boolean) => {
    isDisabledAtom.set(value)
  }, `${idBase}.setDisabled`)

  const toggle = action(() => {
    if (isDisabledAtom()) return
    setOn(!isOnAtom())
  }, `${idBase}.toggle`)

  const handleClick = action(() => {
    toggle()
  }, `${idBase}.handleClick`)

  const handleKeyDown = action((event: Pick<KeyboardEvent, 'key' | 'preventDefault'>) => {
    if (isDisabledAtom()) return
    if (event.key === 'Enter' || isSpaceKey(event.key)) {
      event.preventDefault()
      toggle()
    }
  }, `${idBase}.handleKeyDown`)

  const actions: SwitchActions = {
    setOn,
    setDisabled,
    toggle,
    handleClick,
    handleKeyDown,
  }

  const contracts: SwitchContracts = {
    getSwitchProps() {
      return {
        id: `${idBase}-root`,
        role: 'switch',
        tabindex: isDisabledAtom() ? '-1' : '0',
        'aria-checked': isOnAtom() ? 'true' : 'false',
        'aria-disabled': isDisabledAtom() ? 'true' : 'false',
        'aria-labelledby': options.ariaLabelledBy,
        'aria-describedby': options.ariaDescribedBy,
        onClick: handleClick,
        onKeyDown: handleKeyDown,
      }
    },
  }

  const state: SwitchState = {
    isOn: isOnAtom,
    isDisabled: isDisabledAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
