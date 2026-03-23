import {action, atom, type Atom} from '@reatom/core'

export interface CreateButtonOptions {
  idBase?: string
  isDisabled?: boolean
  isLoading?: boolean
  isPressed?: boolean
  onPress?: () => void
}

export interface ButtonState {
  isDisabled: Atom<boolean>
  isLoading: Atom<boolean>
  isPressed: Atom<boolean>
}

export interface ButtonActions {
  setDisabled(next: boolean): void
  setLoading(next: boolean): void
  setPressed(next: boolean): void
  press(): void
  handleClick(): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}): void
  handleKeyUp(event: Pick<KeyboardEvent, 'key'>): void
}

export interface ButtonProps {
  id: string
  role: 'button'
  tabindex: '0' | '-1'
  'aria-disabled'?: 'true'
  'aria-busy'?: 'true'
  'aria-pressed'?: 'true' | 'false'
  onClick: () => void
  onKeyDown: (event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}) => void
  onKeyUp: (event: Pick<KeyboardEvent, 'key'>) => void
}

export interface ButtonContracts {
  getButtonProps(): ButtonProps
}

export interface ButtonModel {
  readonly state: ButtonState
  readonly actions: ButtonActions
  readonly contracts: ButtonContracts
}

const isSpaceKey = (key: string) => key === ' ' || key === 'Spacebar'

export function createButton(options: CreateButtonOptions = {}): ButtonModel {
  const idBase = options.idBase ?? 'button'
  const isToggleButton = options.isPressed != null

  const isDisabledAtom = atom(options.isDisabled ?? false, `${idBase}.isDisabled`)
  const isLoadingAtom = atom(options.isLoading ?? false, `${idBase}.isLoading`)
  const isPressedAtom = atom(options.isPressed ?? false, `${idBase}.isPressed`)

  const setDisabled = action((next: boolean) => {
    isDisabledAtom.set(next)
  }, `${idBase}.setDisabled`)

  const setLoading = action((next: boolean) => {
    isLoadingAtom.set(next)
  }, `${idBase}.setLoading`)

  const setPressed = action((next: boolean) => {
    isPressedAtom.set(next)
  }, `${idBase}.setPressed`)

  const isInteractionBlocked = () => isDisabledAtom() || isLoadingAtom()

  const press = action(() => {
    if (isInteractionBlocked()) return

    if (isToggleButton) {
      isPressedAtom.set(!isPressedAtom())
    }

    options.onPress?.()
  }, `${idBase}.press`)

  const handleClick = action(() => {
    press()
  }, `${idBase}.handleClick`)

  const handleKeyDown = action((event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}) => {
    if (isInteractionBlocked()) return

    if (event.key === 'Enter') {
      press()
      return
    }

    if (isSpaceKey(event.key)) {
      event.preventDefault?.()
    }
  }, `${idBase}.handleKeyDown`)

  const handleKeyUp = action((event: Pick<KeyboardEvent, 'key'>) => {
    if (isInteractionBlocked()) return

    if (isSpaceKey(event.key)) {
      press()
    }
  }, `${idBase}.handleKeyUp`)

  const actions: ButtonActions = {
    setDisabled,
    setLoading,
    setPressed,
    press,
    handleClick,
    handleKeyDown,
    handleKeyUp,
  }

  const contracts: ButtonContracts = {
    getButtonProps() {
      const isDisabled = isDisabledAtom()
      const isLoading = isLoadingAtom()
      const isUnavailable = isDisabled || isLoading
      const isPressed = isPressedAtom()

      return {
        id: `${idBase}-root`,
        role: 'button',
        tabindex: isUnavailable ? '-1' : '0',
        'aria-disabled': isUnavailable ? 'true' : undefined,
        'aria-busy': isLoading ? 'true' : undefined,
        'aria-pressed': isToggleButton ? (isPressed ? 'true' : 'false') : undefined,
        onClick: handleClick,
        onKeyDown: handleKeyDown,
        onKeyUp: handleKeyUp,
      }
    },
  }

  const state: ButtonState = {
    isDisabled: isDisabledAtom,
    isLoading: isLoadingAtom,
    isPressed: isPressedAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
