import {action, atom, type Atom} from '@reatom/core'

export type TextareaResize = 'none' | 'vertical'

export interface CreateTextareaOptions {
  idBase?: string
  value?: string
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  placeholder?: string
  rows?: number
  cols?: number
  minLength?: number
  maxLength?: number
  resize?: TextareaResize
  onInput?: (value: string) => void
}

export interface TextareaState {
  value: Atom<string>
  disabled: Atom<boolean>
  readonly: Atom<boolean>
  required: Atom<boolean>
  placeholder: Atom<string>
  rows: Atom<number>
  cols: Atom<number>
  minLength: Atom<number | undefined>
  maxLength: Atom<number | undefined>
  resize: Atom<TextareaResize>
  focused: Atom<boolean>
  filled(): boolean
}

export interface TextareaActions {
  setValue(value: string): void
  setDisabled(disabled: boolean): void
  setReadonly(readonly: boolean): void
  setRequired(required: boolean): void
  setPlaceholder(placeholder: string): void
  setRows(rows: number | undefined): void
  setCols(cols: number | undefined): void
  setMinLength(minLength: number | undefined): void
  setMaxLength(maxLength: number | undefined): void
  setResize(resize: TextareaResize): void
  setFocused(focused: boolean): void
  handleInput(value: string): void
}

export interface TextareaProps {
  id: string
  'aria-disabled'?: 'true'
  'aria-readonly'?: 'true'
  'aria-required'?: 'true'
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  tabindex: '0' | '-1'
  rows: number
  cols: number
  minlength?: number
  maxlength?: number
}

export interface TextareaContracts {
  getTextareaProps(): TextareaProps
}

export interface TextareaModel {
  readonly state: TextareaState
  readonly actions: TextareaActions
  readonly contracts: TextareaContracts
}

const toPositiveInteger = (value: number | undefined): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined
  }

  return Math.floor(value)
}

const toNonNegativeInteger = (value: number | undefined): number | undefined => {
  if (value === undefined) {
    return undefined
  }

  if (!Number.isFinite(value) || value < 0) {
    return undefined
  }

  return Math.floor(value)
}

const normalizeResize = (value: TextareaResize | undefined): TextareaResize =>
  value === 'none' ? 'none' : 'vertical'

export function createTextarea(options: CreateTextareaOptions = {}): TextareaModel {
  const idBase = options.idBase ?? 'textarea'

  const valueAtom = atom(options.value ?? '', `${idBase}.value`)
  const disabledAtom = atom(options.disabled ?? false, `${idBase}.disabled`)
  const readonlyAtom = atom(options.readonly ?? false, `${idBase}.readonly`)
  const requiredAtom = atom(options.required ?? false, `${idBase}.required`)
  const placeholderAtom = atom(options.placeholder ?? '', `${idBase}.placeholder`)
  const rowsAtom = atom(toPositiveInteger(options.rows) ?? 4, `${idBase}.rows`)
  const colsAtom = atom(toPositiveInteger(options.cols) ?? 20, `${idBase}.cols`)
  const minLengthAtom = atom(toNonNegativeInteger(options.minLength), `${idBase}.minLength`)
  const maxLengthAtom = atom(toNonNegativeInteger(options.maxLength), `${idBase}.maxLength`)
  const resizeAtom = atom<TextareaResize>(normalizeResize(options.resize), `${idBase}.resize`)
  const focusedAtom = atom(false, `${idBase}.focused`)

  const filled = () => valueAtom().length > 0

  const setValue = action((value: string) => {
    valueAtom.set(value)
  }, `${idBase}.setValue`)

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

  const setRows = action((rows: number | undefined) => {
    const normalized = toPositiveInteger(rows)
    if (normalized === undefined) {
      return
    }

    rowsAtom.set(normalized)
  }, `${idBase}.setRows`)

  const setCols = action((cols: number | undefined) => {
    const normalized = toPositiveInteger(cols)
    if (normalized === undefined) {
      return
    }

    colsAtom.set(normalized)
  }, `${idBase}.setCols`)

  const setMinLength = action((minLength: number | undefined) => {
    minLengthAtom.set(toNonNegativeInteger(minLength))
  }, `${idBase}.setMinLength`)

  const setMaxLength = action((maxLength: number | undefined) => {
    maxLengthAtom.set(toNonNegativeInteger(maxLength))
  }, `${idBase}.setMaxLength`)

  const setResize = action((resize: TextareaResize) => {
    resizeAtom.set(normalizeResize(resize))
  }, `${idBase}.setResize`)

  const setFocused = action((focused: boolean) => {
    focusedAtom.set(focused)
  }, `${idBase}.setFocused`)

  const handleInput = action((value: string) => {
    if (disabledAtom() || readonlyAtom()) return

    valueAtom.set(value)
    options.onInput?.(value)
  }, `${idBase}.handleInput`)

  const contracts: TextareaContracts = {
    getTextareaProps() {
      const isDisabled = disabledAtom()
      const isReadonly = readonlyAtom()
      const isRequired = requiredAtom()
      const currentPlaceholder = placeholderAtom()
      const minLength = minLengthAtom()
      const maxLength = maxLengthAtom()

      return {
        id: `${idBase}-textarea`,
        'aria-disabled': isDisabled ? 'true' : undefined,
        'aria-readonly': isReadonly ? 'true' : undefined,
        'aria-required': isRequired ? 'true' : undefined,
        placeholder: currentPlaceholder || undefined,
        disabled: isDisabled || undefined,
        readonly: isReadonly || undefined,
        required: isRequired || undefined,
        tabindex: isDisabled ? '-1' : '0',
        rows: rowsAtom(),
        cols: colsAtom(),
        minlength: minLength,
        maxlength: maxLength,
      }
    },
  }

  const state: TextareaState = {
    value: valueAtom,
    disabled: disabledAtom,
    readonly: readonlyAtom,
    required: requiredAtom,
    placeholder: placeholderAtom,
    rows: rowsAtom,
    cols: colsAtom,
    minLength: minLengthAtom,
    maxLength: maxLengthAtom,
    resize: resizeAtom,
    focused: focusedAtom,
    filled,
  }

  const actions: TextareaActions = {
    setValue,
    setDisabled,
    setReadonly,
    setRequired,
    setPlaceholder,
    setRows,
    setCols,
    setMinLength,
    setMaxLength,
    setResize,
    setFocused,
    handleInput,
  }

  return {
    state,
    actions,
    contracts,
  }
}
