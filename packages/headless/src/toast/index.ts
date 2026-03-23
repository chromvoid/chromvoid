import {action, atom, computed, type Atom, type Computed} from '@reatom/core'

export type ToastLevel = 'info' | 'success' | 'warning' | 'error' | 'loading'

export interface ToastAction {
  label: string
  onClick?: () => void
}

export interface ToastItem {
  id: string
  message: string
  title?: string
  level?: ToastLevel
  durationMs?: number
  closable?: boolean
  icon?: string
  progress?: boolean
  actions?: readonly ToastAction[]
}

export interface CreateToastOptions {
  idBase?: string
  initialItems?: readonly ToastItem[]
  maxVisible?: number
  defaultDurationMs?: number
  ariaLive?: 'polite' | 'assertive'
}

export interface ToastState {
  items: Atom<ToastItem[]>
  visibleItems: Computed<ToastItem[]>
  isPaused: Atom<boolean>
}

export interface ToastActions {
  push(item: Omit<ToastItem, 'id'> & {id?: string}): string
  dismiss(id: string): void
  clear(): void
  pause(): void
  resume(): void
}

export interface ToastRegionProps {
  id: string
  role: 'region'
  'aria-live': 'polite' | 'assertive'
  'aria-atomic': 'false'
}

export interface ToastItemProps {
  id: string
  role: 'status' | 'alert'
  'data-level': ToastLevel
}

export interface ToastDismissButtonProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-label': string
  onClick: () => void
}

export interface ToastContracts {
  getRegionProps(): ToastRegionProps
  getToastProps(id: string): ToastItemProps
  getDismissButtonProps(id: string): ToastDismissButtonProps
}

export interface ToastModel {
  readonly state: ToastState
  readonly actions: ToastActions
  readonly contracts: ToastContracts
}

export function createToast(options: CreateToastOptions = {}): ToastModel {
  const idBase = options.idBase ?? 'toast'
  const maxVisible = Math.max(options.maxVisible ?? 3, 1)
  const defaultDurationMs = Math.max(options.defaultDurationMs ?? 5000, 0)
  const ariaLive = options.ariaLive ?? 'polite'

  const itemsAtom = atom<ToastItem[]>([...(options.initialItems ?? [])], `${idBase}.items`)
  const isPausedAtom = atom<boolean>(false, `${idBase}.isPaused`)
  const visibleItemsAtom = computed(() => itemsAtom().slice(0, maxVisible), `${idBase}.visibleItems`)

  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const remainingMsById = new Map<string, number>()
  const startedAtById = new Map<string, number>()
  let nonce = 0

  const stopTimer = (id: string) => {
    const timer = timers.get(id)
    if (timer == null) return
    clearTimeout(timer)
    timers.delete(id)
  }

  const clearTracking = (id: string) => {
    stopTimer(id)
    remainingMsById.delete(id)
    startedAtById.delete(id)
  }

  const dismiss = action((id: string) => {
    clearTracking(id)
    itemsAtom.set(itemsAtom().filter((item) => item.id !== id))
  }, `${idBase}.dismiss`)

  const scheduleAutoDismiss = (id: string, durationMs: number) => {
    if (durationMs <= 0) return
    if (isPausedAtom()) {
      remainingMsById.set(id, durationMs)
      startedAtById.delete(id)
      return
    }

    stopTimer(id)
    remainingMsById.set(id, durationMs)
    startedAtById.set(id, Date.now())

    const timer = setTimeout(() => {
      clearTracking(id)
      dismiss(id)
    }, durationMs)

    timers.set(id, timer)
  }

  const push = action((item: Omit<ToastItem, 'id'> & {id?: string}) => {
    const id = item.id ?? `${idBase}-${++nonce}`
    const next: ToastItem = {
      id,
      message: item.message,
      title: item.title,
      level: item.level ?? 'info',
      durationMs: item.durationMs ?? defaultDurationMs,
      closable: item.closable ?? true,
      icon: item.icon,
      progress: item.progress,
      actions: item.actions,
    }

    itemsAtom.set([next, ...itemsAtom()])
    scheduleAutoDismiss(id, next.durationMs ?? defaultDurationMs)
    return id
  }, `${idBase}.push`)

  const clear = action(() => {
    for (const item of itemsAtom()) {
      clearTracking(item.id)
    }
    itemsAtom.set([])
  }, `${idBase}.clear`)

  const pause = action(() => {
    if (isPausedAtom()) return
    isPausedAtom.set(true)
    const now = Date.now()

    for (const id of timers.keys()) {
      const startedAt = startedAtById.get(id) ?? now
      const scheduledMs = remainingMsById.get(id) ?? 0
      const elapsedMs = Math.max(now - startedAt, 0)
      const remainingMs = Math.max(scheduledMs - elapsedMs, 0)
      remainingMsById.set(id, remainingMs)
      startedAtById.delete(id)
      stopTimer(id)
    }
  }, `${idBase}.pause`)

  const resume = action(() => {
    if (!isPausedAtom()) return
    isPausedAtom.set(false)

    for (const item of itemsAtom()) {
      const durationMs = remainingMsById.get(item.id) ?? item.durationMs ?? defaultDurationMs
      scheduleAutoDismiss(item.id, durationMs)
    }
  }, `${idBase}.resume`)

  const actions: ToastActions = {
    push,
    dismiss,
    clear,
    pause,
    resume,
  }

  const contracts: ToastContracts = {
    getRegionProps() {
      return {
        id: `${idBase}-region`,
        role: 'region',
        'aria-live': ariaLive,
        'aria-atomic': 'false',
      }
    },
    getToastProps(id: string) {
      const toast = itemsAtom().find((item) => item.id === id)
      if (!toast) {
        throw new Error(`Unknown toast id: ${id}`)
      }

      const level = toast.level ?? 'info'
      return {
        id: `${idBase}-item-${id}`,
        role: level === 'error' || level === 'warning' ? 'alert' : 'status',
        'data-level': level,
      }
    },
    getDismissButtonProps(id: string) {
      return {
        id: `${idBase}-dismiss-${id}`,
        role: 'button',
        tabindex: '0',
        'aria-label': 'Dismiss notification',
        onClick: () => dismiss(id),
      }
    },
  }

  const state: ToastState = {
    items: itemsAtom,
    visibleItems: visibleItemsAtom,
    isPaused: isPausedAtom,
  }

  for (const item of itemsAtom()) {
    scheduleAutoDismiss(item.id, item.durationMs ?? defaultDurationMs)
  }

  return {
    state,
    actions,
    contracts,
  }
}
