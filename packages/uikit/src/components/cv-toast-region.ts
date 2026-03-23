import {css, html} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import {createToastController, type CVToastController} from '../toast/create-toast-controller'
import {CVToast} from './cv-toast'

export type ToastRegionPosition =
  | 'top-start'
  | 'top-center'
  | 'top-end'
  | 'bottom-start'
  | 'bottom-center'
  | 'bottom-end'

export interface CVToastRegionCloseDetail {
  id: string
}

export type CVToastRegionCloseEvent = CustomEvent<CVToastRegionCloseDetail>

export class CVToastRegion extends ReatomLitElement {
  static elementName = 'cv-toast-region'

  static get properties() {
    return {
      controller: {attribute: false},
      position: {type: String, reflect: true},
      maxVisible: {type: Number, attribute: 'max-visible', reflect: true},
    }
  }

  declare controller: CVToastController
  declare position: ToastRegionPosition
  declare maxVisible: number

  private previousToastIds = new Set<string>()

  constructor() {
    super()
    this.position = 'top-end'
    this.maxVisible = 3
    this.controller = createToastController({maxVisible: this.maxVisible})
  }

  static styles = [
    css`
      :host {
        display: block;
        position: fixed;
        z-index: var(--cv-toast-region-z-index, 9999);
        inline-size: var(--cv-toast-region-width, auto);
        max-width: var(--cv-toast-region-max-width, 420px);
        pointer-events: none;
      }

      :host([position='top-start']) {
        top: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
        left: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
      }

      :host([position='top-center']) {
        top: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
        left: 50%;
        transform: translateX(-50%);
      }

      :host([position='top-end']) {
        top: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
        right: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
      }

      :host([position='bottom-start']) {
        bottom: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
        left: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
      }

      :host([position='bottom-center']) {
        bottom: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
        left: 50%;
        transform: translateX(-50%);
      }

      :host([position='bottom-end']) {
        bottom: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
        right: var(--cv-toast-region-inset, var(--cv-space-4, 16px));
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-toast-region-gap, var(--cv-space-2, 8px));
        pointer-events: auto;
      }

      [part='item'] {
        display: block;
        inline-size: 100%;
      }
    `,
  ]

  static define() {
    CVToast.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.previousToastIds = new Set(this.controller.model.state.items().map((item) => item.id))
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('maxVisible') && changedProperties.get('maxVisible') !== undefined) {
      this.controller = createToastController({maxVisible: this.maxVisible})
      this.previousToastIds = new Set()
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)

    if (changedProperties.has('controller')) {
      this.previousToastIds = new Set(this.controller.model.state.items().map((item) => item.id))
      return
    }

    const currentIds = new Set(this.controller.model.state.items().map((item) => item.id))
    for (const previousId of this.previousToastIds) {
      if (!currentIds.has(previousId)) {
        this.dispatchEvent(
          new CustomEvent<CVToastRegionCloseEvent['detail']>('cv-close', {
            detail: {id: previousId},
            bubbles: true,
            composed: true,
          }),
        )
      }
    }
    this.previousToastIds = currentIds
  }

  private handlePause() {
    this.controller.pause()
  }

  private handleResume() {
    this.controller.resume()
  }

  private handleToastClose(event: Event) {
    const customEvent = event as CustomEvent<{id: string}>
    this.controller.dismiss(customEvent.detail.id)
  }

  protected override render() {
    const model = this.controller.model
    const regionProps = model.contracts.getRegionProps()
    const items = model.state.visibleItems()
    const paused = model.state.isPaused()

    return html`
      <section
        id=${regionProps.id}
        role=${regionProps.role}
        aria-live=${regionProps['aria-live']}
        aria-atomic=${regionProps['aria-atomic']}
        part="base"
        data-paused=${paused ? 'true' : 'false'}
        @mouseenter=${this.handlePause}
        @mouseleave=${this.handleResume}
      >
        ${items.map((item) => {
          const toastProps = model.contracts.getToastProps(item.id)

          return html`
            <cv-toast
              id=${toastProps.id}
              role=${toastProps.role}
              data-level=${toastProps['data-level']}
              part="item"
              .toastId=${item.id}
              .level=${item.level ?? 'info'}
              .closable=${item.closable ?? true}
              .title=${item.title ?? ''}
              .message=${item.message}
              .iconName=${item.icon ?? ''}
              .progress=${Boolean(item.progress)}
              .durationMs=${item.durationMs ?? 0}
              .paused=${paused}
              .actions=${item.actions ?? []}
              @cv-close=${this.handleToastClose}
            ></cv-toast>
          `
        })}
      </section>
    `
  }
}
