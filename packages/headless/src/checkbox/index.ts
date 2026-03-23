import {action, atom, type Atom} from '@reatom/core'

export type CheckboxValue = boolean | 'mixed'

export interface CreateCheckboxOptions {
  idBase?: string
  checked?: CheckboxValue
  isDisabled?: boolean
  isReadOnly?: boolean
  allowMixed?: boolean
  ariaLabelledBy?: string
  ariaDescribedBy?: string
  onCheckedChange?: (value: CheckboxValue) => void
}

export interface CheckboxState {
  checked: Atom<CheckboxValue>
  isDisabled: Atom<boolean>
  isReadOnly: Atom<boolean>
}

export interface CheckboxActions {
  setChecked(value: CheckboxValue): void
  setDisabled(value: boolean): void
  setReadOnly(value: boolean): void
  toggle(): void
  handleClick(): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}): void
}

export interface CheckboxProps {
  id: string
  role: 'checkbox'
  tabindex: '0' | '-1'
  'aria-checked': 'true' | 'false' | 'mixed'
  'aria-disabled'?: 'true'
  'aria-readonly'?: 'true'
  'aria-labelledby'?: string
  'aria-describedby'?: string
  onClick: () => void
  onKeyDown: (event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}) => void
}

export interface CheckboxContracts {
  getCheckboxProps(): CheckboxProps
}

export interface CheckboxModel {
  readonly state: CheckboxState
  readonly actions: CheckboxActions
  readonly contracts: CheckboxContracts
}

const normalizeCheckboxValue = (value: CheckboxValue, allowMixed: boolean): CheckboxValue => {
  if (value === 'mixed' && !allowMixed) {
    return false
  }

  return value
}

const nextCheckboxValue = (value: CheckboxValue): CheckboxValue => {
  if (value === 'mixed') return true
  return !value
}

const toAriaChecked = (value: CheckboxValue): 'true' | 'false' | 'mixed' => {
  if (value === 'mixed') return 'mixed'
  return value ? 'true' : 'false'
}

const isSpaceKey = (key: string) => key === ' ' || key === 'Spacebar'

export function createCheckbox(options: CreateCheckboxOptions = {}): CheckboxModel {
  const idBase = options.idBase ?? 'checkbox'
  const allowMixed = options.allowMixed ?? options.checked === 'mixed'

  const checkedAtom = atom<CheckboxValue>(
    normalizeCheckboxValue(options.checked ?? false, allowMixed),
    `${idBase}.checked`,
  )
  const isDisabledAtom = atom(options.isDisabled ?? false, `${idBase}.isDisabled`)
  const isReadOnlyAtom = atom(options.isReadOnly ?? false, `${idBase}.isReadOnly`)

  const canMutate = () => !isDisabledAtom() && !isReadOnlyAtom()

  const setChecked = action((value: CheckboxValue) => {
    const normalized = normalizeCheckboxValue(value, allowMixed)
    checkedAtom.set(normalized)
    options.onCheckedChange?.(normalized)
  }, `${idBase}.setChecked`)

  const setDisabled = action((value: boolean) => {
    isDisabledAtom.set(value)
  }, `${idBase}.setDisabled`)

  const setReadOnly = action((value: boolean) => {
    isReadOnlyAtom.set(value)
  }, `${idBase}.setReadOnly`)

  const toggle = action(() => {
    if (!canMutate()) return
    setChecked(nextCheckboxValue(checkedAtom()))
  }, `${idBase}.toggle`)

  const handleClick = action(() => {
    toggle()
  }, `${idBase}.handleClick`)

  const handleKeyDown = action((event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}) => {
    if (isSpaceKey(event.key)) {
      if (!canMutate()) return
      event.preventDefault?.()
      toggle()
    }
  }, `${idBase}.handleKeyDown`)

  const actions: CheckboxActions = {
    setChecked,
    setDisabled,
    setReadOnly,
    toggle,
    handleClick,
    handleKeyDown,
  }

  const contracts: CheckboxContracts = {
    getCheckboxProps() {
      return {
        id: `${idBase}-root`,
        role: 'checkbox',
        tabindex: isDisabledAtom() ? '-1' : '0',
        'aria-checked': toAriaChecked(checkedAtom()),
        'aria-disabled': isDisabledAtom() ? 'true' : undefined,
        'aria-readonly': isReadOnlyAtom() ? 'true' : undefined,
        'aria-labelledby': options.ariaLabelledBy,
        'aria-describedby': options.ariaDescribedBy,
        onClick: handleClick,
        onKeyDown: handleKeyDown,
      }
    },
  }

  const state: CheckboxState = {
    checked: checkedAtom,
    isDisabled: isDisabledAtom,
    isReadOnly: isReadOnlyAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
