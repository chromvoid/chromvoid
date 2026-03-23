import {XLitElement} from '@statx/lit'
import {css, html} from 'lit'

import {
  CVToastRegion,
  createToastController,
  type CVToastController,
  type ToastRegionPosition,
} from '@chromvoid/uikit'
import {
  setNotifyAdapter,
  type NotifyPayload,
  type NotifyToastPresentOptions,
  type ToastPosition,
} from '@project/passmanager'
import {announce} from '@chromvoid/ui'

type ToastVariant = NotifyPayload['variant']
type ToastAction = {
  label: string
  onClick: () => void
}

interface ToastOptions {
  title?: string
  message?: string
  variant?: ToastVariant
  duration?: number
  persistent?: boolean
  closable?: boolean
  icon?: string
  progress?: boolean
  position?: ToastPosition
  announce?: boolean
  announceMessage?: string
  announcePriority?: NotifyToastPresentOptions['announcePriority']
  actions?: readonly ToastAction[]
}

interface ToastInstance {
  id: string
  position: ToastPosition
}

const POSITIONS: ToastPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]

const POSITION_TO_REGION: Record<ToastPosition, ToastRegionPosition> = {
  'top-left': 'top-start',
  'top-center': 'top-center',
  'top-right': 'top-end',
  'bottom-left': 'bottom-start',
  'bottom-center': 'bottom-center',
  'bottom-right': 'bottom-end',
}

const DEFAULT_TOAST_POSITION: ToastPosition = 'bottom-right'

function resolveAnnouncePriority(variant: ToastVariant): 'polite' | 'assertive' {
  return variant === 'error' ? 'assertive' : 'polite'
}

export class ToastContainer extends XLitElement {
  static define() {
    CVToastRegion.define()
    if (!customElements.get('toast-container')) {
      customElements.define('toast-container', this)
    }
  }

  static styles = [
    css`
      :host {
        display: contents;
      }

      cv-toast-region {
        --cv-toast-region-max-width: min(420px, calc(100vw - 24px));
      }

      @media (max-width: 767px) {
        cv-toast-region {
          --cv-toast-region-inset: 8px;
          --cv-toast-region-width: calc(100vw - 16px);
          --cv-toast-region-max-width: calc(100vw - 16px);
        }

        cv-toast-region[position='bottom-start'],
        cv-toast-region[position='bottom-center'],
        cv-toast-region[position='bottom-end'] {
          bottom: calc(56px + var(--cv-toast-region-inset, 8px));
        }
      }
    `,
  ]

  private toastCounter = 0
  private readonly toasts = new Map<string, ToastInstance>()
  private readonly controllers = new Map<ToastPosition, CVToastController>(
    POSITIONS.map((position) => [position, createToastController({maxVisible: 4})]),
  )

  show(options: ToastOptions): string {
    const position = options.position ?? DEFAULT_TOAST_POSITION
    const controller = this.controllers.get(position)
    if (!controller) {
      throw new Error(`Unsupported toast position: ${position}`)
    }

    const id = this.generateId()
    const actions =
      options.actions?.map((action) => ({
        label: action.label,
        onClick: () => {
          action.onClick()
          this.dismiss(id)
        },
      })) ?? []

    controller.push({
      id,
      title: options.title,
      message: options.message ?? '',
      level: options.variant ?? 'info',
      durationMs: options.persistent ? 0 : (options.duration ?? 5000),
      closable: options.closable ?? true,
      icon: options.icon,
      progress: options.progress ?? (options.variant ?? 'info') !== 'loading',
      actions,
    })

    this.toasts.set(id, {id, position})
    this.announceToast(options)
    return id
  }

  dismiss(id: string): boolean {
    const instance = this.toasts.get(id)
    if (!instance) return false

    const controller = this.controllers.get(instance.position)
    controller?.dismiss(id)
    this.toasts.delete(id)
    return true
  }

  dismissAll(position?: ToastPosition): void {
    if (position) {
      this.controllers.get(position)?.clear()
      for (const [id, instance] of this.toasts) {
        if (instance.position === position) {
          this.toasts.delete(id)
        }
      }
      return
    }

    for (const controller of this.controllers.values()) {
      controller.clear()
    }
    this.toasts.clear()
  }

  clear(): void {
    this.dismissAll()
  }

  info(message: string, title?: string, options?: Partial<ToastOptions>): string {
    return this.show({message, title, variant: 'info', ...options})
  }

  success(message: string, title?: string, options?: Partial<ToastOptions>): string {
    return this.show({message, title, variant: 'success', ...options})
  }

  warning(message: string, title?: string, options?: Partial<ToastOptions>): string {
    return this.show({message, title, variant: 'warning', ...options})
  }

  error(message: string, title?: string, options?: Partial<ToastOptions>): string {
    return this.show({message, title, variant: 'error', duration: 0, ...options})
  }

  loading(message: string, title?: string, options?: Partial<ToastOptions>): string {
    return this.show({
      message,
      title,
      variant: 'loading',
      persistent: true,
      progress: false,
      closable: false,
      announce: false,
      ...options,
    })
  }

  private handleRegionClose(event: Event) {
    const closeEvent = event as CustomEvent<{id: string}>
    this.toasts.delete(closeEvent.detail.id)
  }

  private generateId(): string {
    this.toastCounter += 1
    return `toast-${this.toastCounter}`
  }

  private announceToast(options: ToastOptions): void {
    if (options.announce === false) return

    const message = options.announceMessage ?? options.message ?? options.title
    if (!message) return

    try {
      announce(message, options.announcePriority ?? resolveAnnouncePriority(options.variant ?? 'info'))
    } catch {}
  }

  protected render() {
    return html`
      ${POSITIONS.map(
        (position) => html`
          <cv-toast-region
            position=${POSITION_TO_REGION[position]}
            .controller=${this.controllers.get(position)!}
            @cv-close=${this.handleRegionClose}
          ></cv-toast-region>
        `,
      )}
    `
  }
}

function ensureToastContainer(): ToastContainer | null {
  if (typeof document === 'undefined') return null

  ToastContainer.define()

  const existing = document.body.querySelector('toast-container')
  if (existing instanceof ToastContainer) {
    return existing
  }

  const container = document.createElement('toast-container') as unknown as ToastContainer
  document.body.append(container)
  return container
}

export function initToastManager(): void {
  setNotifyAdapter({
    present(payload: NotifyPayload, options?: NotifyToastPresentOptions) {
      const container = ensureToastContainer()
      if (!container) {
        return {dismiss() {}}
      }

      const id = container.show({
        ...payload,
        duration: payload.duration,
        announce: options?.announce,
        announceMessage: options?.announceMessage,
        announcePriority: options?.announcePriority,
      })

      return {
        dismiss() {
          container.dismiss(id)
        },
      }
    },
  })
}

export const toast = {
  show(options: ToastOptions): string {
    const container = ensureToastContainer()
    if (!container) return ''
    return container.show(options)
  },
  dismiss(id: string): boolean {
    return ensureToastContainer()?.dismiss(id) ?? false
  },
  dismissAll(position?: ToastPosition): void {
    ensureToastContainer()?.dismissAll(position)
  },
  clear(): void {
    ensureToastContainer()?.clear()
  },
  info(message: string, title?: string, options?: Partial<ToastOptions>): string {
    return ensureToastContainer()?.info(message, title, options) ?? ''
  },
  success(message: string, title?: string, options?: Partial<ToastOptions>): string {
    return ensureToastContainer()?.success(message, title, options) ?? ''
  },
  warning(message: string, title?: string, options?: Partial<ToastOptions>): string {
    return ensureToastContainer()?.warning(message, title, options) ?? ''
  },
  error(message: string, title?: string, options?: Partial<ToastOptions>): string {
    return ensureToastContainer()?.error(message, title, options) ?? ''
  },
  loading(message: string, title?: string, options?: Partial<ToastOptions>) {
    const id = ensureToastContainer()?.loading(message, title, options) ?? ''
    return () => {
      if (!id) return
      ensureToastContainer()?.dismiss(id)
    }
  },
}
