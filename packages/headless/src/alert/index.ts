import {action, atom, type Atom} from '@reatom/core'

export type AlertAriaLive = 'assertive' | 'polite'

export interface CreateAlertOptions {
  idBase?: string
  ariaLive?: AlertAriaLive
  ariaAtomic?: boolean
  durationMs?: number
  initialMessage?: string
  initialVisible?: boolean
}

export interface AlertState {
  isVisible: Atom<boolean>
  message: Atom<string>
}

export interface AlertActions {
  show(message: string): void
  hide(): void
}

export interface AlertProps {
  id: string
  role: 'alert'
  'aria-live': AlertAriaLive
  'aria-atomic': 'true' | 'false'
}

export interface AlertContracts {
  getAlertProps(): AlertProps
}

export interface AlertModel {
  readonly state: AlertState
  readonly actions: AlertActions
  readonly contracts: AlertContracts
}

export function createAlert(options: CreateAlertOptions = {}): AlertModel {
  const idBase = options.idBase ?? 'alert'
  const durationMs = options.durationMs
  const ariaLive = options.ariaLive ?? 'assertive'
  const ariaAtomic = options.ariaAtomic ?? true

  const isVisibleAtom = atom(options.initialVisible ?? false, `${idBase}.isVisible`)
  const messageAtom = atom(options.initialMessage ?? '', `${idBase}.message`)

  const alertId = `${idBase}-region`
  let dismissTimer: ReturnType<typeof setTimeout> | null = null

  const clearDismissTimer = () => {
    if (dismissTimer == null) return
    clearTimeout(dismissTimer)
    dismissTimer = null
  }

  const hide = action(() => {
    clearDismissTimer()
    isVisibleAtom.set(false)
  }, `${idBase}.hide`)

  const show = action((message: string) => {
    clearDismissTimer()
    messageAtom.set(message)
    isVisibleAtom.set(true)

    if (durationMs != null && Number.isFinite(durationMs) && durationMs > 0) {
      dismissTimer = setTimeout(() => {
        hide()
      }, durationMs)
    }
  }, `${idBase}.show`)

  const actions: AlertActions = {
    show,
    hide,
  }

  const contracts: AlertContracts = {
    getAlertProps() {
      return {
        id: alertId,
        role: 'alert',
        'aria-live': ariaLive,
        'aria-atomic': ariaAtomic ? 'true' : 'false',
      }
    },
  }

  const state: AlertState = {
    isVisible: isVisibleAtom,
    message: messageAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
