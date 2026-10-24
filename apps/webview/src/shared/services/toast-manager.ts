import {setNotifyAdapter, type NotifyPayload, type ToastPosition} from '@project/passmanager/notify'
import {ensureToastContainer} from './toast-container'
import {toastManagerModel, type ToastHandle, type ToastOptions} from './toast-manager.model'

function show(options: ToastOptions): ToastHandle {
  ensureToastContainer()
  return toastManagerModel.show(options)
}

export function initToastManager(): void {
  toastManagerModel.connectViewport()
  setNotifyAdapter({
    present(payload: NotifyPayload) {
      const handle = show(payload)
      return {
        id: handle.id,
        update: (options) => handle.update(options),
        dismiss: () => handle.dismiss(),
      }
    },
  })
}

export const toast = {
  show,
  dismiss(id: string): boolean {
    return toastManagerModel.dismiss(id)
  },
  dismissAll(position?: ToastPosition): void {
    toastManagerModel.dismissAll(position)
  },
  clear(): void {
    toastManagerModel.dismissAll()
  },
  info(message: string, title?: string, options?: Partial<ToastOptions>): ToastHandle {
    return show({message, title, variant: 'info', ...options})
  },
  success(message: string, title?: string, options?: Partial<ToastOptions>): ToastHandle {
    return show({message, title, variant: 'success', ...options})
  },
  warning(message: string, title?: string, options?: Partial<ToastOptions>): ToastHandle {
    return show({message, title, variant: 'warning', ...options})
  },
  error(message: string, title?: string, options?: Partial<ToastOptions>): ToastHandle {
    return show({message, title, variant: 'error', persistent: true, ...options})
  },
  loading(message: string, title?: string, options?: Partial<ToastOptions>): ToastHandle {
    return show({
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

export type {ToastAction, ToastHandle, ToastOptions} from './toast-manager.model'
