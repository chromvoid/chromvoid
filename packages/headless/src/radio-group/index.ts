import {action, atom, type Atom} from '@reatom/core'
import {
  createCompositeNavigation,
  type CompositeNavigationOrientation,
} from '../interactions/composite-navigation'

export interface RadioGroupItem {
  id: string
  disabled?: boolean
  describedBy?: string
}

export interface CreateRadioGroupOptions {
  items: readonly RadioGroupItem[]
  idBase?: string
  orientation?: CompositeNavigationOrientation
  isDisabled?: boolean
  ariaLabel?: string
  ariaLabelledBy?: string
  initialValue?: string | null
  initialActiveId?: string | null
}

export interface RadioGroupState {
  value: Atom<string | null>
  activeId: Atom<string | null>
  isDisabled: Atom<boolean>
  orientation: CompositeNavigationOrientation
}

export interface RadioGroupActions {
  setDisabled(value: boolean): void
  select(id: string): void
  moveNext(): void
  movePrev(): void
  moveFirst(): void
  moveLast(): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key'>): void
}

export interface RadioGroupRootProps {
  role: 'radiogroup'
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-disabled'?: 'true'
  'aria-orientation': CompositeNavigationOrientation
  onKeyDown: (event: Pick<KeyboardEvent, 'key'>) => void
}

export interface RadioProps {
  id: string
  role: 'radio'
  tabindex: '0' | '-1'
  'aria-checked': 'true' | 'false'
  'aria-disabled'?: 'true'
  'aria-describedby'?: string
  'data-active': 'true' | 'false'
  onClick: () => void
  onKeyDown: (event: Pick<KeyboardEvent, 'key'>) => void
}

export interface RadioGroupContracts {
  getRootProps(): RadioGroupRootProps
  getRadioProps(id: string): RadioProps
}

export interface RadioGroupModel {
  readonly state: RadioGroupState
  readonly actions: RadioGroupActions
  readonly contracts: RadioGroupContracts
}

const isSpaceKey = (key: string) => key === ' ' || key === 'Spacebar'

export function createRadioGroup(options: CreateRadioGroupOptions): RadioGroupModel {
  const idBase = options.idBase ?? 'radio-group'
  const orientation = options.orientation ?? 'horizontal'
  const itemById = new Map(options.items.map((item) => [item.id, item]))
  const enabledIds = options.items.filter((item) => !item.disabled).map((item) => item.id)

  const resolveInitialValue = () => {
    if (options.initialValue != null && enabledIds.includes(options.initialValue)) {
      return options.initialValue
    }

    return null
  }

  const initialValue = resolveInitialValue()
  const initialActiveId =
    initialValue ??
    (options.initialActiveId != null && enabledIds.includes(options.initialActiveId)
      ? options.initialActiveId
      : (enabledIds[0] ?? null))

  const navigation = createCompositeNavigation({
    idBase: `${idBase}.nav`,
    items: options.items,
    orientation,
    focusStrategy: 'roving-tabindex',
    wrapMode: 'wrap',
    initialActiveId,
  })

  const valueAtom = atom<string | null>(initialValue, `${idBase}.value`)
  const isDisabledAtom = atom(options.isDisabled ?? false, `${idBase}.isDisabled`)

  const syncSelectionWithActive = () => {
    const activeId = navigation.state.activeId()
    if (activeId != null) {
      valueAtom.set(activeId)
    }
  }

  const setDisabled = action((value: boolean) => {
    isDisabledAtom.set(value)
  }, `${idBase}.setDisabled`)

  const select = action((id: string) => {
    if (isDisabledAtom()) return
    if (!navigation.state.enabledIds().includes(id)) return

    navigation.actions.setActive(id)
    valueAtom.set(id)
  }, `${idBase}.select`)

  const moveNext = action(() => {
    if (isDisabledAtom()) return

    navigation.actions.moveNext()
    syncSelectionWithActive()
  }, `${idBase}.moveNext`)

  const movePrev = action(() => {
    if (isDisabledAtom()) return

    navigation.actions.movePrev()
    syncSelectionWithActive()
  }, `${idBase}.movePrev`)

  const moveFirst = action(() => {
    if (isDisabledAtom()) return

    navigation.actions.moveFirst()
    syncSelectionWithActive()
  }, `${idBase}.moveFirst`)

  const moveLast = action(() => {
    if (isDisabledAtom()) return

    navigation.actions.moveLast()
    syncSelectionWithActive()
  }, `${idBase}.moveLast`)

  const handleKeyDown = action((event: Pick<KeyboardEvent, 'key'>) => {
    if (isDisabledAtom()) return

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        moveNext()
        return
      case 'ArrowLeft':
      case 'ArrowUp':
        movePrev()
        return
      case 'Home':
        moveFirst()
        return
      case 'End':
        moveLast()
        return
      default:
        if (isSpaceKey(event.key)) {
          const activeId = navigation.state.activeId()
          if (activeId != null) {
            select(activeId)
          }
        }
    }
  }, `${idBase}.handleKeyDown`)

  const actions: RadioGroupActions = {
    setDisabled,
    select,
    moveNext,
    movePrev,
    moveFirst,
    moveLast,
    handleKeyDown,
  }

  const contracts: RadioGroupContracts = {
    getRootProps() {
      return {
        role: 'radiogroup',
        'aria-label': options.ariaLabel,
        'aria-labelledby': options.ariaLabelledBy,
        'aria-disabled': isDisabledAtom() ? 'true' : undefined,
        'aria-orientation': orientation,
        onKeyDown: handleKeyDown,
      }
    },
    getRadioProps(id: string) {
      const item = itemById.get(id)
      if (!item) {
        throw new Error(`Unknown radio id: ${id}`)
      }

      const activeId = navigation.state.activeId()
      const checked = valueAtom() === id
      const disabled = isDisabledAtom() || item.disabled === true

      return {
        id: `${idBase}-radio-${id}`,
        role: 'radio',
        tabindex: activeId === id && !disabled ? '0' : '-1',
        'aria-checked': checked ? 'true' : 'false',
        'aria-disabled': disabled ? 'true' : undefined,
        'aria-describedby': item.describedBy ? `${idBase}-radio-${id}-desc` : undefined,
        'data-active': activeId === id ? 'true' : 'false',
        onClick: () => select(id),
        onKeyDown: handleKeyDown,
      }
    },
  }

  const state: RadioGroupState = {
    value: valueAtom,
    activeId: navigation.state.activeId,
    isDisabled: isDisabledAtom,
    orientation,
  }

  return {
    state,
    actions,
    contracts,
  }
}
