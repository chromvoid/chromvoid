import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, type PropertyValues} from 'lit'
import {unsafeSVG} from 'lit/directives/unsafe-svg.js'
import chromvoidIconSvg from 'root/assets/chromvoid-icon.svg?raw'

export type WelcomeChromvoidIconAnimationState = 'idle' | 'active' | 'finishing' | 'opened'
export type WelcomeChromvoidIconVariant = 'hero' | 'mark'

export type WelcomeChromvoidIconAnimationModel = {
  readonly state: () => WelcomeChromvoidIconAnimationState
  mount(root: ParentNode): void
  unmount(): void
}

export class WelcomeChromvoidIcon extends ReatomLitElement {
  static properties = {
    animated: {type: Boolean, reflect: true},
    model: {attribute: false},
    variant: {type: String, reflect: true},
  }

  static styles = [
    css`
      :host {
        position: relative;
        z-index: 1;
        display: block;
        inline-size: 100%;
        block-size: 100%;
        border-radius: inherit;
        overflow: hidden;
      }

      :host([variant='mark']) {
        inline-size: 28px;
        block-size: 28px;
        flex: 0 0 28px;
        z-index: auto;
        border-radius: 0;
      }

      .welcome-icon {
        display: grid;
        place-items: center;
        inline-size: 100%;
        block-size: 100%;
        border-radius: inherit;
        opacity: 0.9;
        filter: none;
      }

      .welcome-icon svg {
        display: block;
        inline-size: 100%;
        block-size: 100%;
      }

      .welcome-icon svg #spiralFill {
        fill: var(--cv-color-text);
      }

      :host([variant='mark']) .welcome-icon {
        opacity: 1;
        filter: none;
      }
    `,
  ]

  declare animated: boolean
  declare model?: WelcomeChromvoidIconAnimationModel
  declare variant: WelcomeChromvoidIconVariant

  private mountedModel: WelcomeChromvoidIconAnimationModel | null = null

  constructor() {
    super()
    this.animated = false
    this.variant = 'hero'
  }

  static define() {
    if (!customElements.get('welcome-chromvoid-icon')) {
      customElements.define('welcome-chromvoid-icon', this)
    }
  }

  protected override updated(changedProperties: PropertyValues) {
    super.updated(changedProperties)
    this.syncAnimatedModel()
  }

  override disconnectedCallback() {
    this.unmountAnimatedModel()
    super.disconnectedCallback()
  }

  protected render() {
    const state = this.animated && this.model ? this.model.state() : 'idle'

    return html`
      <div class="welcome-icon ${state}" data-icon-state=${state}>${unsafeSVG(chromvoidIconSvg)}</div>
    `
  }

  private syncAnimatedModel() {
    const nextModel = this.animated ? (this.model ?? null) : null

    if (this.mountedModel && this.mountedModel !== nextModel) {
      this.unmountAnimatedModel()
    }

    if (!nextModel) return

    nextModel.mount(this.renderRoot)
    this.mountedModel = nextModel
  }

  private unmountAnimatedModel() {
    this.mountedModel?.unmount()
    this.mountedModel = null
  }
}
