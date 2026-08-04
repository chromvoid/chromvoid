export type NotifyVariant = 'info' | 'success' | 'warning' | 'error' | 'loading'
export type ToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export interface NotifyToastAction {
  label: string
  onClick: () => void
  dismissOnClick?: boolean
}

export interface NotifyToastOptions {
  message: string
  title?: string
  variant?: NotifyVariant
  duration?: number
  persistent?: boolean
  closable?: boolean
  icon?: string
  progress?: boolean
  position?: ToastPosition
  key?: string
  actions?: readonly NotifyToastAction[]
}

export interface ShowNotifyToastOptions extends NotifyToastOptions {}

export interface NotifyPayload extends NotifyToastOptions {
  duration: number
  persistent: boolean
  closable: boolean
  variant: NotifyVariant
  position: ToastPosition
}

export interface NotifyHandle {
  readonly id: string
  update(options: ShowNotifyToastOptions): boolean
  dismiss(): void
}

export interface NotifyAdapter {
  present(payload: NotifyPayload): NotifyHandle | void
}

const DEFAULT_TOAST_DURATION = 5000
const WARNING_TOAST_DURATION = 8000
const ACTION_TOAST_DURATION = 10_000
const ERROR_TOAST_DURATION = 0
const TOAST_MOBILE_QUERY = '(max-width: 767px)'

export const DEFAULT_NOTIFY_DESKTOP_POSITION: ToastPosition = 'bottom-right'
export const DEFAULT_NOTIFY_MOBILE_POSITION: ToastPosition = 'bottom-center'

let notifyAdapter: NotifyAdapter | null = null

function resolvePersistent(variant: NotifyVariant, persistent?: boolean): boolean {
  if (persistent !== undefined) return persistent
  return variant === 'error' || variant === 'loading'
}

function isMobileViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia(TOAST_MOBILE_QUERY).matches
}

function resolvePosition(position?: ToastPosition): ToastPosition {
  if (position) return position
  return isMobileViewport() ? DEFAULT_NOTIFY_MOBILE_POSITION : DEFAULT_NOTIFY_DESKTOP_POSITION
}

function resolvePayload(options: NotifyToastOptions): NotifyPayload {
  const variant = options.variant ?? 'info'
  const defaultDuration =
    variant === 'error' || variant === 'loading'
      ? ERROR_TOAST_DURATION
      : options.actions?.length
        ? ACTION_TOAST_DURATION
        : variant === 'warning'
          ? WARNING_TOAST_DURATION
          : DEFAULT_TOAST_DURATION

  return {
    message: options.message,
    title: options.title,
    variant,
    duration: options.duration ?? defaultDuration,
    persistent: resolvePersistent(variant, options.persistent),
    closable: options.closable ?? true,
    icon: options.icon,
    progress: options.progress ?? variant !== 'loading',
    position: resolvePosition(options.position),
    key: options.key,
    actions: options.actions,
  }
}

export function setNotifyAdapter(adapter: NotifyAdapter | null): void {
  notifyAdapter = adapter
}

export function getNotifyAdapter(): NotifyAdapter | null {
  return notifyAdapter
}

export function showNotifyToast(options: ShowNotifyToastOptions): NotifyHandle {
  const payload = resolvePayload(options)
  const handle = notifyAdapter?.present(payload)

  return {
    id: handle?.id ?? '',
    update(nextOptions) {
      return handle?.update?.(resolvePayload(nextOptions)) ?? false
    },
    dismiss() {
      handle?.dismiss?.()
    },
  }
}

export const notify = {
  info(message: string, title?: string, options?: Partial<NotifyToastOptions>) {
    return showNotifyToast({message, title, variant: 'info', ...options})
  },
  success(message: string, title?: string, options?: Partial<NotifyToastOptions>) {
    return showNotifyToast({message, title, variant: 'success', ...options})
  },
  warning(message: string, title?: string, options?: Partial<NotifyToastOptions>) {
    return showNotifyToast({message, title, variant: 'warning', ...options})
  },
  error(message: string, title?: string, options?: Partial<NotifyToastOptions>) {
    return showNotifyToast({
      message,
      title,
      variant: 'error',
      duration: ERROR_TOAST_DURATION,
      ...options,
    })
  },
  loading(message: string, title?: string, options?: Partial<NotifyToastOptions>) {
    return showNotifyToast({
      message,
      title,
      variant: 'loading',
      persistent: true,
      progress: false,
      closable: false,
      ...options,
    })
  },
}

export default notify
