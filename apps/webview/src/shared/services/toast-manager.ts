import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css} from 'lit'

import {registerDialogTopLayerAccessory} from '@chromvoid/uikit/components/cv-dialog'
import {CVToastRegion, type ToastRegionPosition} from '@chromvoid/uikit/components/cv-toast-region'
import {
  setNotifyAdapter,
  type NotifyPayload,
  type ToastPosition,
} from '@project/passmanager/notify'
import {i18n} from '../../i18n'
import {
  TOAST_POSITIONS,
  toastManagerModel,
  type ToastHandle,
  type ToastOptions,
} from './toast-manager.model'

const POSITION_TO_REGION: Record<ToastPosition, ToastRegionPosition> = {
  'top-left': 'top-start',
  'top-center': 'top-center',
  'top-right': 'top-end',
  'bottom-left': 'bottom-start',
  'bottom-center': 'bottom-center',
  'bottom-right': 'bottom-end',
}

let toastContainer: ToastContainer | null = null
let unregisterToastContainer: (() => void) | null = null

export class ToastContainer extends ReatomLitElement {
  static define() {
    CVToastRegion.define()
    if (!customElements.get('toast-container')) customElements.define('toast-container', this)
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

        cv-toast-region[position='bottom-center'] {
          bottom: calc(
            56px + var(--app-runtime-safe-area-block-end-active, var(--app-runtime-safe-area-block-end, 0px)) +
              var(--cv-toast-region-inset, 8px)
          );
        }
      }
    `,
  ]

  private handleRegionClose(event: Event) {
    event.stopPropagation()
    toastManagerModel.handleRegionClose((event as CustomEvent<{id: string}>).detail.id)
  }

  protected render() {
    return html`
      ${TOAST_POSITIONS.map(
        (position) => html`
          <cv-toast-region
            position=${POSITION_TO_REGION[position]}
            .controller=${toastManagerModel.controllers.get(position)!}
            .dismissLabel=${i18n('button:close')}
            .topLayer=${true}
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

  if (toastContainer?.isConnected) return toastContainer

  unregisterToastContainer?.()
  unregisterToastContainer = null

  const existing = document.body.querySelector('toast-container')
  toastContainer =
    existing instanceof ToastContainer
      ? existing
      : (document.createElement('toast-container') as unknown as ToastContainer)

  if (!toastContainer.isConnected) document.body.append(toastContainer)
  unregisterToastContainer = registerDialogTopLayerAccessory(toastContainer)
  return toastContainer
}

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
