import {css, type PropertyValues} from 'lit'

import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {ReatomLitElement, html} from '@chromvoid/uikit/reatom-lit'

import {pmMobileDebug} from '../models/pm-mobile-debug'
import {
  PMAvatarIconModel,
  type PMAvatarErrorDetail,
  type PMAvatarIconRefSource,
  type PMAvatarItem,
} from './pm-avatar-icon.model'

export class PMAvatarIcon extends ReatomLitElement {
  static elementName = 'pm-avatar-icon'

  static properties = {
    src: {type: String},
    alt: {type: String},
    icon: {type: String},
    letter: {type: String},
    item: {attribute: false},
    iconRef: {type: String},
    errorKey: {type: String},
    fallbackBg: {type: String},
    fallbackColor: {type: String},
  }

  private readonly model = new PMAvatarIconModel()
  private appliedFallbackBg = ''
  private appliedFallbackColor = ''
  private appliedImageBackground = ''

  get src() {
    return this.model.state.src()
  }

  set src(value: string) {
    this.model.actions.setSrc(value)
  }

  get alt() {
    return this.model.state.alt()
  }

  set alt(value: string) {
    this.model.actions.setAlt(value)
  }

  get icon() {
    return this.model.state.icon()
  }

  set icon(value: string) {
    this.model.actions.setIcon(value)
  }

  get letter() {
    return this.model.state.letter()
  }

  set letter(value: string) {
    this.model.actions.setLetter(value)
  }

  get item() {
    return this.model.state.item()
  }

  set item(value: PMAvatarItem | undefined) {
    if (value === undefined) {
      pmMobileDebug('avatar', 'setItem.undefined', {
        connected: this.isConnected,
        icon: this.icon,
        className: this.className,
        tagName: this.tagName,
      })
    }
    this.model.actions.setItem(value)
    this.syncFallbackBgVar()
  }

  get iconRef() {
    return this.model.state.iconRef()
  }

  set iconRef(value: PMAvatarIconRefSource) {
    this.model.actions.setIconRef(value)
  }

  get errorKey() {
    return this.model.state.errorKey()
  }

  set errorKey(value: string) {
    this.model.actions.setErrorKey(value)
  }

  get fallbackBg() {
    return this.model.state.fallbackBg()
  }

  set fallbackBg(value: string) {
    this.model.actions.setFallbackBg(value)
    this.syncFallbackBgVar()
  }

  get fallbackColor() {
    return this.model.state.fallbackColor()
  }

  set fallbackColor(value: string) {
    this.model.actions.setFallbackColor(value)
    this.syncFallbackColorVar()
  }

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
    CVIcon.define()
  }

  static styles = css`
    :host {
      --pm-avatar-radius: inherit;
      --pm-avatar-image-padding: 3px;
      --pm-avatar-image-fit: contain;
      --pm-avatar-image-bg: var(--cv-color-surface-3);
      --pm-avatar-contrast-base: 90%;
      --pm-avatar-contrast: var(--pm-avatar-contrast-base);
      --pm-avatar-contrast-border: clamp(0%, calc(var(--pm-avatar-contrast) - 2%), 100%);
      --pm-avatar-border-source: var(--cv-color-border);
      --pm-avatar-shadow-opacity: 30%;

      --pm-avatar-image-border: var(--pm-avatar-border-source);
      --pm-avatar-image-outline: var(--cv-color-border-glass);
      --pm-avatar-image-shadow: var(--cv-shadow-sm);

      --pm-avatar-fallback-bg: var(--cv-color-primary-dark);
      --pm-avatar-fallback-color: var(--cv-color-on-primary);
      --pm-avatar-fallback-border: transparent;
      --pm-avatar-fallback-shadow: none;
      --pm-avatar-fallback-padding: 0;

      --pm-avatar-icon-color: var(--cv-color-text-strong);
      --pm-avatar-icon-size: 1em;
      --pm-avatar-letter-size: 0.75em;

      display: inline-flex;
      inline-size: 100%;
      block-size: 100%;
      min-inline-size: 0;
      min-block-size: 0;
    }

    .surface {
      inline-size: 100%;
      block-size: 100%;
      min-inline-size: 0;
      min-block-size: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      border-radius: var(--pm-avatar-radius);
      overflow: hidden;
    }

    .surface.image {
      padding: var(--pm-avatar-image-padding);
      background: var(--pm-avatar-image-bg);
      border: 1px solid var(--pm-avatar-image-border);
      box-shadow:
        inset 0 0 0 1px var(--pm-avatar-image-outline),
        var(--pm-avatar-image-shadow);
    }

    .surface.image img {
      inline-size: 100%;
      block-size: 100%;
      display: block;
      object-fit: var(--pm-avatar-image-fit);
    }

    .surface.fallback.letter {
      padding: var(--pm-avatar-fallback-padding);
      background: var(--pm-avatar-fallback-bg);
      color: var(--pm-avatar-fallback-color);
      border: 1px solid var(--pm-avatar-fallback-border);
      box-shadow: var(--pm-avatar-fallback-shadow);
    }

    .surface.fallback.letter .letter {
      font-size: var(--pm-avatar-letter-size);
      font-weight: var(--cv-font-weight-bold);
      line-height: 1;
      text-transform: uppercase;
      user-select: none;
    }

    .surface.fallback.icon {
      background: transparent;
      border: 0;
      box-shadow: none;
      color: var(--pm-avatar-icon-color);
      padding: 0;
    }

    .surface.fallback.icon cv-icon {
      inline-size: var(--pm-avatar-icon-size);
      block-size: var(--pm-avatar-icon-size);
    }
  `

  override connectedCallback(): void {
    super.connectedCallback()
    this.model.connect()
    this.syncFallbackBgVar()
    this.syncFallbackColorVar()
    this.syncImageBackgroundVar()
  }

  override disconnectedCallback(): void {
    this.model.disconnect()
    super.disconnectedCallback()
  }

  protected override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    this.syncImageBackgroundVar()
  }

  private handleImageError(event: Event) {
    const image = event.currentTarget
    if (!(image instanceof HTMLImageElement)) return

    const detail = this.model.actions.handleImageError(image.getAttribute('src') ?? image.currentSrc ?? '')
    if (!detail) return

    this.dispatchEvent(
      new CustomEvent<PMAvatarErrorDetail>('pm-avatar-error', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private syncFallbackBgVar() {
    const value = this.model.state.fallbackBgValue()
    if (value === this.appliedFallbackBg) return
    this.appliedFallbackBg = value
    if (value.length > 0) {
      this.style.setProperty('--pm-avatar-fallback-bg', value)
      return
    }
    this.style.removeProperty('--pm-avatar-fallback-bg')
  }

  private syncFallbackColorVar() {
    const value = this.model.state.fallbackColorValue()
    if (value === this.appliedFallbackColor) return
    this.appliedFallbackColor = value
    if (value.length > 0) {
      this.style.setProperty('--pm-avatar-fallback-color', value)
      return
    }
    this.style.removeProperty('--pm-avatar-fallback-color')
  }

  private syncImageBackgroundVar() {
    const value = this.model.state.renderState().backgroundColor
    if (value === this.appliedImageBackground) return
    this.appliedImageBackground = value
    if (value.length > 0) {
      this.style.setProperty('--pm-avatar-image-bg', value)
      return
    }
    this.style.removeProperty('--pm-avatar-image-bg')
  }

  private renderFallback() {
    const letter = this.model.state.letterValue()
    if (letter.length > 0) {
      return html`
        <span class="surface fallback letter" aria-hidden="true">
          <span class="letter">${letter.charAt(0)}</span>
        </span>
      `
    }

    const iconName = this.model.state.fallbackIconValue()
    return html`
      <span class="surface fallback icon" aria-hidden="true">
        <cv-icon name=${iconName}></cv-icon>
      </span>
    `
  }

  protected override render() {
    const {src} = this.model.state.renderState()
    if (!src || this.model.state.failedSrc() === src) {
      return this.renderFallback()
    }

    return html`
      <span class="surface image">
        <img src=${src} alt=${this.alt} @error=${this.handleImageError} />
      </span>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-avatar-icon': PMAvatarIcon
  }
}
