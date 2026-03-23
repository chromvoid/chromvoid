export type NotifyVariant = 'info' | 'success' | 'warning' | 'error' | 'loading'
export type ToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
type AnnouncePriority = 'polite' | 'assertive'

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
}

export interface NotifyToastPresentOptions {
  announce?: boolean
  announceMessage?: string
  announcePriority?: AnnouncePriority
}

export interface ShowNotifyToastOptions extends NotifyToastOptions, NotifyToastPresentOptions {}

export interface NotifyPayload extends NotifyToastOptions {
  duration: number
  persistent: boolean
  closable: boolean
  variant: NotifyVariant
  position: ToastPosition
}

export interface NotifyHandle {
  dismiss(): void
}

export interface NotifyAdapter {
  present(payload: NotifyPayload, options?: NotifyToastPresentOptions): NotifyHandle | void
}

const DEFAULT_TOAST_DURATION = 5000
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

  return {
    message: options.message,
    title: options.title,
    variant,
    duration: options.duration ?? DEFAULT_TOAST_DURATION,
    persistent: resolvePersistent(variant, options.persistent),
    closable: options.closable ?? true,
    icon: options.icon,
    progress: options.progress ?? variant !== 'loading',
    position: resolvePosition(options.position),
  }
}

export function setNotifyAdapter(adapter: NotifyAdapter | null): void {
  notifyAdapter = adapter
}

export function getNotifyAdapter(): NotifyAdapter | null {
  return notifyAdapter
}

export function showNotifyToast(options: ShowNotifyToastOptions): NotifyHandle {
  const {announce, announceMessage, announcePriority, ...toastOptions} = options
  const payload = resolvePayload(toastOptions)
  const handle = notifyAdapter?.present(payload, {
    announce,
    announceMessage,
    announcePriority,
  })

  return {
    dismiss() {
      handle?.dismiss?.()
    },
  }
}

export const notify = {
  info(message: string, title?: string) {
    showNotifyToast({message, title, variant: 'info'})
  },
  success(message: string, title?: string) {
    showNotifyToast({message, title, variant: 'success'})
  },
  warning(message: string, title?: string) {
    showNotifyToast({message, title, variant: 'warning'})
  },
  error(message: string, title?: string) {
    showNotifyToast({message, title, variant: 'error', duration: ERROR_TOAST_DURATION})
  },
  loading(message: string, title?: string) {
    const handle = showNotifyToast({
      message,
      title,
      variant: 'loading',
      persistent: true,
      progress: false,
      closable: false,
      announce: false,
    })

    return () => {
      handle.dismiss()
    }
  },
}

export default notify
