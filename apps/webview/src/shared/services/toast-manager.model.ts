import type {CVToastController} from '@chromvoid/uikit/toast/create-toast-controller'
import {createToastController} from '@chromvoid/uikit/toast/create-toast-controller'
import type {
  NotifyPayload,
  NotifyToastAction,
  NotifyVariant,
  ToastPosition,
} from '@project/passmanager/notify'

export type ToastAction = NotifyToastAction
export type ToastOptions = Omit<
  NotifyPayload,
  'duration' | 'persistent' | 'closable' | 'variant' | 'position'
> & {
  variant?: NotifyVariant
  duration?: number
  persistent?: boolean
  closable?: boolean
  position?: ToastPosition
}

export interface ToastHandle {
  readonly id: string
  update(options: ToastOptions): boolean
  dismiss(): void
}

type ToastPriority = 'transient' | 'loading' | 'critical'

interface ToastInstance {
  id: string
  position: ToastPosition
  key?: string
  priority: ToastPriority
}

type ControllerToastItem = Omit<Parameters<CVToastController['push']>[0], 'id'>

export const TOAST_POSITIONS: readonly ToastPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]

const DESKTOP_DEFAULT_POSITION: ToastPosition = 'bottom-right'
const MOBILE_POSITION: ToastPosition = 'bottom-center'
const MOBILE_QUERY = '(max-width: 767px)'
const TRANSIENT_DURATION = 5000
const WARNING_DURATION = 8000
const ACTION_DURATION = 10_000

function defaultIsMobile(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(MOBILE_QUERY).matches)
}

function getPriority(variant: NotifyVariant): ToastPriority {
  if (variant === 'error' || variant === 'warning') return 'critical'
  if (variant === 'loading') return 'loading'
  return 'transient'
}

function shouldPresentMobile(current: ToastPriority, incoming: ToastPriority): boolean {
  if (incoming === 'critical') return true
  if (incoming === 'loading') return current !== 'critical'
  return current === 'transient'
}

export class ToastManagerModel {
  readonly controllers = new Map<ToastPosition, CVToastController>(
    TOAST_POSITIONS.map((position) => [position, createToastController({maxVisible: 4})]),
  )

  private counter = 0
  private mobileMode: boolean | null = null
  private mobileToastId: string | null = null
  private mediaQueryList: MediaQueryList | null = null
  private readonly instances = new Map<string, ToastInstance>()
  private readonly idsByKey = new Map<string, string>()

  constructor(private readonly isMobile: () => boolean = defaultIsMobile) {}

  connectViewport(): void {
    if (
      this.isMobile !== defaultIsMobile ||
      this.mediaQueryList ||
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      this.syncViewportMode()
      return
    }

    this.mediaQueryList = window.matchMedia(MOBILE_QUERY)
    this.mediaQueryList.addEventListener('change', this.handleViewportChange)
    this.syncViewportMode()
  }

  show(options: ToastOptions): ToastHandle {
    const mobile = this.syncViewportMode()
    const existingId = options.key ? this.idsByKey.get(options.key) : undefined
    if (existingId && this.instances.has(existingId)) {
      if (this.update(existingId, options)) {
        return this.createHandle(existingId)
      }
    }

    const priority = getPriority(options.variant ?? 'info')
    if (mobile && this.mobileToastId) {
      const current = this.instances.get(this.mobileToastId)
      if (current && !shouldPresentMobile(current.priority, priority)) {
        return this.createHandle('')
      }
      if (current) {
        this.dismiss(current.id)
      }
    }

    const id = this.generateId()
    const position = mobile ? MOBILE_POSITION : (options.position ?? DESKTOP_DEFAULT_POSITION)
    const instance: ToastInstance = {id, position, key: options.key, priority}
    const controller = this.controllers.get(position)
    if (!controller) throw new Error(`Unsupported toast position: ${position}`)

    controller.push({...this.toToastItem(id, options), id})
    this.instances.set(id, instance)
    if (instance.key) this.idsByKey.set(instance.key, id)
    if (mobile) this.mobileToastId = id
    return this.createHandle(id)
  }

  update(id: string, options: ToastOptions): boolean {
    const instance = this.instances.get(id)
    if (!instance) return false

    const controller = this.controllers.get(instance.position)
    if (!controller) return false

    const previousKey = instance.key
    const nextKey = options.key ?? previousKey
    const updated = controller.update(id, this.toToastItem(id, options))
    if (!updated) {
      this.forget(id)
      return false
    }

    if (previousKey && previousKey !== nextKey) this.idsByKey.delete(previousKey)
    if (nextKey) this.idsByKey.set(nextKey, id)
    instance.key = nextKey
    instance.priority = getPriority(options.variant ?? 'info')
    return true
  }

  dismiss(id: string): boolean {
    const instance = this.instances.get(id)
    if (!instance) return false
    this.controllers.get(instance.position)?.dismiss(id)
    this.forget(id)
    return true
  }

  dismissAll(position?: ToastPosition): void {
    if (position) {
      this.controllers.get(position)?.clear()
      for (const instance of [...this.instances.values()]) {
        if (instance.position === position) this.forget(instance.id)
      }
      return
    }

    for (const controller of this.controllers.values()) controller.clear()
    this.instances.clear()
    this.idsByKey.clear()
    this.mobileToastId = null
  }

  handleRegionClose(id: string): void {
    this.forget(id)
  }

  private syncViewportMode(): boolean {
    const mobile = this.isMobile()
    if (this.mobileMode === mobile) return mobile

    if (this.mobileMode !== null) this.dismissAll()
    this.mobileMode = mobile
    for (const controller of this.controllers.values()) {
      controller.setMaxVisible(mobile ? 1 : 4)
    }
    return mobile
  }

  private readonly handleViewportChange = () => {
    this.syncViewportMode()
  }

  private toToastItem(id: string, options: ToastOptions): ControllerToastItem {
    const variant = options.variant ?? 'info'
    const durationMs = this.resolveDuration(options, variant)
    const actions = options.actions?.map((action) => ({
      label: action.label,
      dismissOnClick: action.dismissOnClick,
      onClick: () => {
        try {
          action.onClick()
        } finally {
          if (action.dismissOnClick !== false) this.dismiss(id)
        }
      },
    }))

    return {
      title: options.title,
      message: options.message ?? '',
      level: variant,
      durationMs,
      closable: options.closable ?? variant !== 'loading',
      icon: options.icon,
      progress: options.progress ?? (durationMs > 0 && variant !== 'loading'),
      actions: this.isMobile() ? actions?.slice(0, 1) : actions,
    }
  }

  private resolveDuration(options: ToastOptions, variant: NotifyVariant): number {
    if (options.persistent || variant === 'loading' || variant === 'error') return 0
    if (options.duration !== undefined) return Math.max(options.duration, 0)
    if (options.actions?.length) return ACTION_DURATION
    if (variant === 'warning') return WARNING_DURATION
    return TRANSIENT_DURATION
  }

  private createHandle(id: string): ToastHandle {
    return {
      id,
      update: (options) => Boolean(id) && this.update(id, options),
      dismiss: () => {
        if (id) this.dismiss(id)
      },
    }
  }

  private forget(id: string): void {
    const instance = this.instances.get(id)
    if (!instance) return
    if (instance.key && this.idsByKey.get(instance.key) === id) {
      this.idsByKey.delete(instance.key)
    }
    if (this.mobileToastId === id) this.mobileToastId = null
    this.instances.delete(id)
  }

  private generateId(): string {
    this.counter += 1
    return `toast-${this.counter}`
  }
}

export const toastManagerModel = new ToastManagerModel()
