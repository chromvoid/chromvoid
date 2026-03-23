import {action, atom, type Atom} from '@reatom/core'

export type InputType = 'text' | 'password' | 'email' | 'url' | 'tel' | 'search'

export interface CreateInputOptions {
  idBase?: string
  value?: string
  type?: InputType
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  placeholder?: string
  clearable?: boolean
  passwordToggle?: boolean
  onInput?: (value: string) => void
  onClear?: () => void
}

export interface InputState {
  value: Atom<string>
  type: Atom<InputType>
  disabled: Atom<boolean>
  readonly: Atom<boolean>
  required: Atom<boolean>
  placeholder: Atom<string>
  clearable: Atom<boolean>
  passwordToggle: Atom<boolean>
  passwordVisible: Atom<boolean>
  focused: Atom<boolean>
  filled(): boolean
  resolvedType(): string
  showClearButton(): boolean
  showPasswordToggle(): boolean
}

export interface InputActions {
  setValue(value: string): void
  setType(type: InputType): void
  setDisabled(disabled: boolean): void
  setReadonly(readonly: boolean): void
  setRequired(required: boolean): void
  setPlaceholder(placeholder: string): void
  setClearable(clearable: boolean): void
  setPasswordToggle(toggle: boolean): void
  togglePasswordVisibility(): void
  setFocused(focused: boolean): void
  clear(): void
  handleInput(value: string): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}): void
}

export interface InputProps {
  id: string
  type: string
  'aria-disabled'?: 'true'
  'aria-readonly'?: 'true'
  'aria-required'?: 'true'
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  tabindex: '0' | '-1'
  autocomplete?: 'off'
}

export interface ClearButtonProps {
  role: 'button'
  'aria-label': string
  tabindex: '-1'
  hidden?: true
  'aria-hidden'?: 'true'
}

export interface PasswordToggleProps {
  role: 'button'
  'aria-label': string
  'aria-pressed': 'true' | 'false'
  tabindex: '0' | '-1'
  hidden?: true
  'aria-hidden'?: 'true'
}

export interface InputContracts {
  getInputProps(): InputProps
  getClearButtonProps(): ClearButtonProps
  getPasswordToggleProps(): PasswordToggleProps
}

export interface InputModel {
  readonly state: InputState
  readonly actions: InputActions
  readonly contracts: InputContracts
}

export function createInput(options: CreateInputOptions = {}): InputModel {
  const idBase = options.idBase ?? 'input'

  // --- Primary atoms ---

  const valueAtom = atom(options.value ?? '', `${idBase}.value`)
  const typeAtom = atom<InputType>(options.type ?? 'text', `${idBase}.type`)
  const disabledAtom = atom(options.disabled ?? false, `${idBase}.disabled`)
  const readonlyAtom = atom(options.readonly ?? false, `${idBase}.readonly`)
  const requiredAtom = atom(options.required ?? false, `${idBase}.required`)
  const placeholderAtom = atom(options.placeholder ?? '', `${idBase}.placeholder`)
  const clearableAtom = atom(options.clearable ?? false, `${idBase}.clearable`)
  const passwordToggleAtom = atom(options.passwordToggle ?? false, `${idBase}.passwordToggle`)
  const passwordVisibleAtom = atom(false, `${idBase}.passwordVisible`)
  const focusedAtom = atom(false, `${idBase}.focused`)

  // --- Derived helpers (plain functions, no computed atoms) ---

  const filled = () => valueAtom().length > 0

  const resolvedType = () => {
    const t = typeAtom()
    const visible = passwordVisibleAtom()
    return t === 'password' && visible ? 'text' : t
  }

  const showClearButton = () =>
    clearableAtom() && filled() && !disabledAtom() && !readonlyAtom()

  const showPasswordToggle = () =>
    typeAtom() === 'password' && passwordToggleAtom()

  // --- Actions ---

  const setValue = action((value: string) => {
    valueAtom.set(value)
    options.onInput?.(value)
  }, `${idBase}.setValue`)

  const setType = action((type: InputType) => {
    typeAtom.set(type)
    passwordVisibleAtom.set(false)
  }, `${idBase}.setType`)

  const setDisabled = action((disabled: boolean) => {
    disabledAtom.set(disabled)
  }, `${idBase}.setDisabled`)

  const setReadonly = action((readonly: boolean) => {
    readonlyAtom.set(readonly)
  }, `${idBase}.setReadonly`)

  const setRequired = action((required: boolean) => {
    requiredAtom.set(required)
  }, `${idBase}.setRequired`)

  const setPlaceholder = action((placeholder: string) => {
    placeholderAtom.set(placeholder)
  }, `${idBase}.setPlaceholder`)

  const setClearable = action((clearable: boolean) => {
    clearableAtom.set(clearable)
  }, `${idBase}.setClearable`)

  const setPasswordToggle = action((toggle: boolean) => {
    passwordToggleAtom.set(toggle)
    if (!toggle) {
      passwordVisibleAtom.set(false)
    }
  }, `${idBase}.setPasswordToggle`)

  const togglePasswordVisibility = action(() => {
    if (typeAtom() !== 'password' || !passwordToggleAtom()) return
    passwordVisibleAtom.set(!passwordVisibleAtom())
  }, `${idBase}.togglePasswordVisibility`)

  const setFocused = action((focused: boolean) => {
    focusedAtom.set(focused)
  }, `${idBase}.setFocused`)

  const clear = action(() => {
    if (disabledAtom() || readonlyAtom()) return
    valueAtom.set('')
    options.onClear?.()
  }, `${idBase}.clear`)

  const handleInput = action((value: string) => {
    if (disabledAtom() || readonlyAtom()) return
    setValue(value)
  }, `${idBase}.handleInput`)

  const handleKeyDown = action((event: Pick<KeyboardEvent, 'key'> & {preventDefault?: () => void}) => {
    if (event.key === 'Escape') {
      if (clearableAtom() && filled() && !disabledAtom() && !readonlyAtom()) {
        clear()
      }
    }
  }, `${idBase}.handleKeyDown`)

  // --- Contracts ---

  const contracts: InputContracts = {
    getInputProps() {
      const isDisabled = disabledAtom()
      const isReadonly = readonlyAtom()
      const isRequired = requiredAtom()
      const currentPlaceholder = placeholderAtom()
      const currentType = typeAtom()

      return {
        id: `${idBase}-input`,
        type: resolvedType(),
        'aria-disabled': isDisabled ? 'true' : undefined,
        'aria-readonly': isReadonly ? 'true' : undefined,
        'aria-required': isRequired ? 'true' : undefined,
        placeholder: currentPlaceholder || undefined,
        disabled: isDisabled || undefined,
        readonly: isReadonly || undefined,
        tabindex: isDisabled ? '-1' : '0',
        autocomplete: currentType === 'password' ? 'off' : undefined,
      }
    },

    getClearButtonProps() {
      const isVisible = showClearButton()

      return {
        role: 'button',
        'aria-label': 'Clear input',
        tabindex: '-1',
        hidden: isVisible ? undefined : true,
        'aria-hidden': isVisible ? undefined : 'true',
      }
    },

    getPasswordToggleProps() {
      const isVisible = showPasswordToggle()
      const isPwdVisible = passwordVisibleAtom()

      return {
        role: 'button',
        'aria-label': isPwdVisible ? 'Hide password' : 'Show password',
        'aria-pressed': isPwdVisible ? 'true' : 'false',
        tabindex: isVisible ? '0' : '-1',
        hidden: isVisible ? undefined : true,
        'aria-hidden': isVisible ? undefined : 'true',
      }
    },
  }

  // --- State ---

  const state: InputState = {
    value: valueAtom,
    type: typeAtom,
    disabled: disabledAtom,
    readonly: readonlyAtom,
    required: requiredAtom,
    placeholder: placeholderAtom,
    clearable: clearableAtom,
    passwordToggle: passwordToggleAtom,
    passwordVisible: passwordVisibleAtom,
    focused: focusedAtom,
    filled,
    resolvedType,
    showClearButton,
    showPasswordToggle,
  }

  const actions: InputActions = {
    setValue,
    setType,
    setDisabled,
    setReadonly,
    setRequired,
    setPlaceholder,
    setClearable,
    setPasswordToggle,
    togglePasswordVisibility,
    setFocused,
    clear,
    handleInput,
    handleKeyDown,
  }

  return {
    state,
    actions,
    contracts,
  }
}
