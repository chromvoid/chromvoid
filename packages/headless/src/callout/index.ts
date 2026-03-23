import {action, atom, type Atom} from '@reatom/core'

export type CalloutVariant = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

const VALID_VARIANTS: ReadonlySet<CalloutVariant> = new Set(['info', 'success', 'warning', 'danger', 'neutral'])

export interface CreateCalloutOptions {
  idBase?: string
  variant?: CalloutVariant
  closable?: boolean
  open?: boolean
}

export interface CalloutState {
  variant: Atom<CalloutVariant>
  closable: Atom<boolean>
  open: Atom<boolean>
}

export interface CalloutActions {
  setVariant(value: CalloutVariant): void
  setClosable(value: boolean): void
  close(): void
  show(): void
}

export interface CalloutProps {
  id: string
  role: 'note'
  'data-variant': CalloutVariant
}

export interface CalloutCloseButtonProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-label': 'Dismiss'
  onClick: () => void
}

export interface CalloutContracts {
  getCalloutProps(): CalloutProps
  getCloseButtonProps(): CalloutCloseButtonProps
}

export interface CalloutModel {
  readonly state: CalloutState
  readonly actions: CalloutActions
  readonly contracts: CalloutContracts
}

export function createCallout(options: CreateCalloutOptions = {}): CalloutModel {
  const idBase = options.idBase ?? 'callout'
  const initialVariant = VALID_VARIANTS.has(options.variant as CalloutVariant) ? options.variant! : 'info'

  const variantAtom = atom<CalloutVariant>(initialVariant, `${idBase}.variant`)
  const closableAtom = atom<boolean>(options.closable ?? false, `${idBase}.closable`)
  const openAtom = atom<boolean>(options.open ?? true, `${idBase}.open`)

  const close = action(() => {
    if (closableAtom()) {
      openAtom.set(false)
    }
  }, `${idBase}.close`)

  const show = action(() => {
    openAtom.set(true)
  }, `${idBase}.show`)

  const actions: CalloutActions = {
    setVariant: action((value: CalloutVariant) => {
      if (VALID_VARIANTS.has(value)) {
        variantAtom.set(value)
      }
    }, `${idBase}.setVariant`),

    setClosable: action((value: boolean) => {
      closableAtom.set(value)
    }, `${idBase}.setClosable`),

    close,
    show,
  }

  const contracts: CalloutContracts = {
    getCalloutProps(): CalloutProps {
      return {
        id: `${idBase}-root`,
        role: 'note',
        'data-variant': variantAtom(),
      }
    },

    getCloseButtonProps(): CalloutCloseButtonProps {
      return {
        id: `${idBase}-close-btn`,
        role: 'button',
        tabindex: '0',
        'aria-label': 'Dismiss',
        onClick: () => close(),
      }
    },
  }

  const state: CalloutState = {
    variant: variantAtom,
    closable: closableAtom,
    open: openAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
