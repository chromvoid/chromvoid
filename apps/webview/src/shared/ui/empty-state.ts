import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing} from 'lit'

type EmptyStateVariant = 'panel' | 'dropzone'

export class CvEmptyState extends ReatomLitElement {
  static elementName = 'cv-empty-state'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static properties = {
    icon: {type: String},
    headline: {type: String},
    description: {type: String},
    iconFill: {type: Boolean, attribute: 'icon-fill'},
    variant: {type: String, reflect: true},
    hasDefaultSlot: {type: Boolean, state: true},
    hasActionsSlot: {type: Boolean, state: true},
  }

  declare icon: string
  declare headline: string
  declare description: string
  declare iconFill: boolean
  declare variant: EmptyStateVariant
  private declare hasDefaultSlot: boolean
  private declare hasActionsSlot: boolean

  constructor() {
    super()
    this.icon = ''
    this.headline = ''
    this.description = ''
    this.iconFill = false
    this.variant = 'panel'
    this.hasDefaultSlot = false
    this.hasActionsSlot = false
  }

  static styles = css`
    @keyframes cv-empty-state-reveal {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    :host {
      display: grid;
      box-sizing: border-box;
      inline-size: 100%;
      min-inline-size: 0;
      align-self: start;
      color: var(--cv-color-text-muted);
    }

    :host([hidden]) {
      display: none;
    }

    .empty-state {
      display: grid;
      justify-items: center;
      gap: var(--cv-empty-state-gap, var(--cv-space-2));
      box-sizing: border-box;
      inline-size: 100%;
      min-inline-size: 0;
      padding: var(--cv-empty-state-padding, var(--cv-space-6));
      border: var(--cv-empty-state-border, 1px dashed var(--cv-color-border));
      border-radius: var(--cv-empty-state-radius, var(--cv-radius-2));
      background: var(--cv-empty-state-background, var(--cv-color-surface-2));
      text-align: center;
      animation: cv-empty-state-reveal 0.32s var(--cv-easing-standard, ease-out);
    }

    @media (prefers-reduced-motion: reduce) {
      .empty-state {
        animation: none;
      }
    }

    :host([variant='dropzone']) .empty-state {
      min-block-size: var(--cv-empty-state-min-block-size, 220px);
      border-color: var(--cv-empty-state-dropzone-border, var(--cv-color-border-strong));
      background: var(--cv-empty-state-dropzone-background, var(--cv-gradient-surface));
    }

    :host(.drop-active) .empty-state {
      border-color: var(--cv-empty-state-drop-active-border, var(--cv-color-primary));
      background: var(--cv-empty-state-drop-active-background, var(--cv-color-primary-subtle));
    }

    cv-icon {
      color: var(--cv-empty-state-icon-color, var(--cv-color-accent));
      font-size: var(--cv-empty-state-icon-size, 32px);
      opacity: var(--cv-empty-state-icon-opacity, 0.82);
    }

    :host([variant='dropzone']) cv-icon {
      color: var(--cv-empty-state-dropzone-icon-color, var(--cv-color-border-strong));
      opacity: var(--cv-empty-state-dropzone-icon-opacity, 0.42);
    }

    .title,
    .description {
      margin: 0;
      min-inline-size: 0;
      overflow-wrap: anywhere;
    }

    .title {
      max-inline-size: var(--cv-empty-state-title-max-inline-size, 34ch);
      color: var(--cv-empty-state-title-color, var(--cv-color-text));
      font-size: var(--cv-empty-state-title-font-size, var(--cv-font-size-sm));
      font-weight: var(--cv-empty-state-title-font-weight, 680);
      line-height: 1.24;
    }

    .description {
      max-inline-size: var(--cv-empty-state-description-max-inline-size, 42ch);
      color: var(--cv-color-text-muted);
      font-size: var(--cv-empty-state-description-font-size, var(--cv-font-size-xs));
      line-height: 1.45;
    }

    .body,
    .actions {
      display: grid;
      justify-items: center;
      min-inline-size: 0;
    }

    .body[hidden],
    .actions[hidden] {
      display: none;
    }

    .body {
      margin-block-start: var(--cv-empty-state-body-margin-block-start, var(--cv-space-2));
    }

    .actions {
      margin-block-start: var(--cv-empty-state-actions-margin-block-start, var(--cv-space-2));
    }

    slot[name='actions']::slotted(*) {
      max-inline-size: 100%;
    }
  `

  protected render() {
    return html`
      <section class="empty-state" role="status">
        ${this.icon
          ? html`<cv-icon name=${this.icon} ?fill=${this.iconFill} aria-hidden="true"></cv-icon>`
          : nothing}
        <p class="title">${this.headline}</p>
        ${this.description ? html`<p class="description">${this.description}</p>` : nothing}
        <div class="body" ?hidden=${!this.hasDefaultSlot}>
          <slot @slotchange=${this.handleDefaultSlotChange}></slot>
        </div>
        <div class="actions" ?hidden=${!this.hasActionsSlot}>
          <slot name="actions" @slotchange=${this.handleActionsSlotChange}></slot>
        </div>
      </section>
    `
  }

  private handleDefaultSlotChange(event: Event) {
    this.hasDefaultSlot = this.hasAssignedElements(event)
  }

  private handleActionsSlotChange(event: Event) {
    this.hasActionsSlot = this.hasAssignedElements(event)
  }

  private hasAssignedElements(event: Event): boolean {
    const slot = event.currentTarget as HTMLSlotElement | null
    return slot?.assignedElements({flatten: true}).length ? true : false
  }
}
