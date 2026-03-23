import {computed, state} from '@statx/core'
import type {State} from '@statx/core'
import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {Entry, Group} from '@project/passmanager'
import {CVIcon} from '@chromvoid/uikit'

import {pmIconStore} from '../models/pm-icon-store'

type PMAvatarErrorDetail = {
  src: string
  errorKey: string
}

type PMAvatarItem = Entry | Group
type PMAvatarIconRefSource = string | State<string | undefined>
type PMAvatarRenderState = {
  item: PMAvatarItem | undefined
  src: string
}

export class PMAvatarIcon extends XLitElement {
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

  private _src = ''
  private _alt = ''
  private _icon = 'folder'
  private _letter = ''
  private _item: PMAvatarItem | undefined = undefined
  private _iconRef: PMAvatarIconRefSource = ''
  private _errorKey = ''
  private _fallbackBg = ''
  private _fallbackColor = ''

  private readonly src$ = state('')
  private readonly icon$ = state('folder')
  private readonly letter$ = state('')
  private readonly item$ = state<PMAvatarItem | undefined>(undefined)
  private readonly iconRefVersion$ = state(0)
  private readonly errorKey$ = state('')
  private readonly fallbackBg$ = state('')
  private readonly fallbackColor$ = state('')

  private readonly failedSrc$ = state('')
  private readonly pendingIconRef$ = state('')
  private readonly iconStoreVersion$ = state(0)

  private readonly iconRefSourceValue$ = computed(() => {
    this.iconRefVersion$()
    const source = this._iconRef
    if (typeof source === 'function') {
      const value = source()
      if (typeof value !== 'string') return ''
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : ''
    }

    if (typeof source !== 'string') return ''
    const trimmed = source.trim()
    return trimmed.length > 0 ? trimmed : ''
  })

  private readonly iconRefValue$ = computed(() => {
    const direct = this.iconRefSourceValue$()
    if (direct.length > 0) return direct
    return this.item$()?.iconRef ?? ''
  })

  private readonly iconSrcValue$ = computed(() => {
    this.iconStoreVersion$()
    const iconRef = this.iconRefValue$()
    if (!iconRef) return ''
    return pmIconStore.getCachedUrl(iconRef) ?? ''
  })

  private readonly renderState$ = computed((): PMAvatarRenderState => {
    const item = this.item$()
    const manualSrc = this.src$()
    if (manualSrc.length > 0) {
      return {item, src: manualSrc}
    }

    const iconSrc = this.iconSrcValue$()
    if (iconSrc.length > 0) {
      return {item, src: iconSrc}
    }

    return {item, src: ''}
  })

  private readonly letterValue$ = computed(() => {
    const explicit = this.letter$()
    if (explicit.length > 0) return explicit.charAt(0)

    const item = this.item$()
    if (item instanceof Entry) {
      const title = (item.title || '?').trim()
      return (title.charAt(0) || '?').toUpperCase()
    }

    if (item instanceof Group) {
      const name = (item.name || '?').trim()
      return (name.charAt(0) || '?').toUpperCase()
    }

    return ''
  })

  private readonly fallbackIconValue$ = computed(() => {
    const explicit = this.icon$()
    if (explicit.length > 0) return explicit
    return this.item$() instanceof Entry ? 'person-circle' : 'folder'
  })

  private readonly fallbackBgValue$ = computed(() => {
    const explicit = this.fallbackBg$()
    if (explicit.length > 0) return explicit

    const item = this.item$()
    if (item instanceof Entry) {
      return this.getAvatarBg(this.resolveFallbackSeed(item))
    }

    return ''
  })

  private appliedFallbackBg = ''
  private appliedFallbackColor = ''
  private iconStoreUnsubscribe: (() => void) | undefined = undefined
  private readonly onIconStoreChange = this.handleIconStoreChange.bind(this)

  get src() {
    return this._src
  }

  set src(value: string) {
    const next = typeof value === 'string' ? value : ''
    if (next === this._src) return
    const prev = this._src
    this._src = next
    this.src$.set(next.trim())
    this.resetImageState()
    this.requestUpdate('src', prev)
  }

  get alt() {
    return this._alt
  }

  set alt(value: string) {
    const next = typeof value === 'string' ? value : ''
    if (next === this._alt) return
    const prev = this._alt
    this._alt = next
    this.requestUpdate('alt', prev)
  }

  get icon() {
    return this._icon
  }

  set icon(value: string) {
    const next = typeof value === 'string' ? value : ''
    if (next === this._icon) return
    const prev = this._icon
    this._icon = next
    this.icon$.set(next.trim())
    this.requestUpdate('icon', prev)
  }

  get letter() {
    return this._letter
  }

  set letter(value: string) {
    const next = typeof value === 'string' ? value : ''
    if (next === this._letter) return
    const prev = this._letter
    this._letter = next
    this.letter$.set(next.trim())
    this.requestUpdate('letter', prev)
  }

  get item() {
    return this._item
  }

  set item(value: PMAvatarItem | undefined) {
    const next = value instanceof Entry || value instanceof Group ? value : undefined
    if (next === this._item) return
    const prev = this._item
    this._item = next
    this.item$.set(next)
    this.resetImageState()
    this.syncFallbackBgVar()
    this.requestUpdate('item', prev)
  }

  get iconRef() {
    return this._iconRef
  }

  set iconRef(value: PMAvatarIconRefSource) {
    const next = typeof value === 'function' || typeof value === 'string' ? value : ''
    if (next === this._iconRef) return
    const prev = this._iconRef
    this._iconRef = next
    this.iconRefVersion$.set(this.iconRefVersion$() + 1)
    this.resetImageState()
    this.requestUpdate('iconRef', prev)
  }

  get errorKey() {
    return this._errorKey
  }

  set errorKey(value: string) {
    const next = typeof value === 'string' ? value : ''
    if (next === this._errorKey) return
    const prev = this._errorKey
    this._errorKey = next
    this.errorKey$.set(next.trim())
    this.requestUpdate('errorKey', prev)
  }

  get fallbackBg() {
    return this._fallbackBg
  }

  set fallbackBg(value: string) {
    const next = typeof value === 'string' ? value : ''
    if (next === this._fallbackBg) return
    const prev = this._fallbackBg
    this._fallbackBg = next
    this.fallbackBg$.set(next.trim())
    this.syncFallbackBgVar()
    this.requestUpdate('fallbackBg', prev)
  }

  get fallbackColor() {
    return this._fallbackColor
  }

  set fallbackColor(value: string) {
    const next = typeof value === 'string' ? value : ''
    if (next === this._fallbackColor) return
    const prev = this._fallbackColor
    this._fallbackColor = next
    this.fallbackColor$.set(next.trim())
    this.syncFallbackColorVar()
    this.requestUpdate('fallbackColor', prev)
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
      --pm-avatar-contrast-base: 90%;
      --pm-avatar-contrast: var(--pm-avatar-contrast-base);
      --pm-avatar-contrast-border: clamp(0%, calc(var(--pm-avatar-contrast) - 2%), 100%);
      --pm-avatar-border-source: var(--cv-color-border);
      --pm-avatar-shadow-opacity: 30%;

      --pm-avatar-image-bg: color-mix(
        in oklch,
        var(--cv-color-surface-2),
        white var(--pm-avatar-contrast)
      );
      --pm-avatar-image-border: color-mix(
        in oklch,
        var(--pm-avatar-border-source),
        white var(--pm-avatar-contrast-border)
      );
      --pm-avatar-image-outline: color-mix(
        in oklch,
        var(--pm-avatar-border-source),
        white var(--pm-avatar-contrast)
      );
      --pm-avatar-image-shadow: 0 1px 2px
        color-mix(in oklch, black var(--pm-avatar-shadow-opacity), transparent);

      --pm-avatar-fallback-bg: linear-gradient(
        135deg,
        var(--cv-color-primary),
        color-mix(in oklch, var(--cv-color-primary) 80%, black)
      );
      --pm-avatar-fallback-color: white;
      --pm-avatar-fallback-border: transparent;
      --pm-avatar-fallback-shadow: none;
      --pm-avatar-fallback-padding: 0;

      --pm-avatar-icon-color: var(--cv-color-text-muted);
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

  override connectedCallback() {
    super.connectedCallback()
    if (!this.iconStoreUnsubscribe) {
      this.iconStoreUnsubscribe = pmIconStore.subscribe(this.onIconStoreChange)
    }
    this.syncFallbackBgVar()
    this.syncFallbackColorVar()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.iconStoreUnsubscribe?.()
    this.iconStoreUnsubscribe = undefined
  }

  private handleIconStoreChange() {
    this.iconStoreVersion$.set(this.iconStoreVersion$() + 1)
  }

  private resetImageState() {
    this.failedSrc$.set('')
    this.pendingIconRef$.set('')
  }

  private syncFallbackBgVar() {
    const value = this.fallbackBgValue$()
    if (value === this.appliedFallbackBg) return
    this.appliedFallbackBg = value
    if (value.length > 0) {
      this.style.setProperty('--pm-avatar-fallback-bg', value)
      return
    }
    this.style.removeProperty('--pm-avatar-fallback-bg')
  }

  private syncFallbackColorVar() {
    const value = this.fallbackColor$()
    if (value === this.appliedFallbackColor) return
    this.appliedFallbackColor = value
    if (value.length > 0) {
      this.style.setProperty('--pm-avatar-fallback-color', value)
      return
    }
    this.style.removeProperty('--pm-avatar-fallback-color')
  }

  private resolveIconRefSource(): string | undefined {
    const source = this._iconRef
    if (typeof source === 'function') {
      const value = source()
      if (typeof value !== 'string') return undefined
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : undefined
    }

    if (typeof source !== 'string') return undefined
    const trimmed = source.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  private resolveIconRef(item: PMAvatarItem | undefined = this.item$()): string | undefined {
    const direct = this.resolveIconRefSource()
    if (direct) return direct
    return item?.iconRef
  }

  private ensureIconRequested() {
    if (this.src$().length > 0) return

    const iconRef = this.resolveIconRef() ?? ''
    if (!iconRef) return

    if (this.iconSrcValue$().length > 0) {
      if (this.pendingIconRef$() === iconRef) {
        this.pendingIconRef$.set('')
      }
      return
    }

    if (this.pendingIconRef$() === iconRef) return

    this.pendingIconRef$.set(iconRef)
    void pmIconStore.loadIconUrl(iconRef).then((url) => {
      // Only clear pending when icon was actually loaded.
      // When the icon is missing, keep pendingIconRef$ set so the guard
      // at the top of ensureIconRequested() prevents a re-render loop.
      // When the icon appears later, iconStoreVersion$ bump will re-evaluate
      // iconSrcValue$ which clears pending via the iconSrcValue check above.
      if (url && this.pendingIconRef$() === iconRef) {
        this.pendingIconRef$.set('')
      }
    })
  }

  private handleImageError(event: Event) {
    const image = event.currentTarget
    if (!(image instanceof HTMLImageElement)) return

    const src = (image.getAttribute('src') ?? image.currentSrc ?? '').trim()
    if (!src || this.failedSrc$() === src) return

    this.failedSrc$.set(src)
    const errorKey = this.errorKey$()
    if (errorKey.length === 0) return

    const detail: PMAvatarErrorDetail = {
      src,
      errorKey,
    }

    this.dispatchEvent(
      new CustomEvent<PMAvatarErrorDetail>('pm-avatar-error', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private resolveFallbackSeed(item: PMAvatarItem | undefined): string {
    if (item instanceof Entry) return item.title || '?'
    if (item instanceof Group) return item.name || '?'
    return '?'
  }

  private getAvatarBg(text: string): string {
    const seed = (text || '?').trim().toLowerCase()
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i)
      hash |= 0
    }
    const hue = Math.abs(hash) % 360
    return `oklch(0.65 0.15 ${hue})`
  }

  private renderFallback() {
    const letter = this.letterValue$()
    if (letter.length > 0) {
      return html`
        <span class="surface fallback letter" aria-hidden="true">
          <span class="letter">${letter.charAt(0)}</span>
        </span>
      `
    }

    const iconName = this.fallbackIconValue$()
    return html`
      <span class="surface fallback icon" aria-hidden="true">
        <cv-icon name=${iconName}></cv-icon>
      </span>
    `
  }

  protected render() {
    this.ensureIconRequested()
    const {src} = this.renderState$()

    if (!src || this.failedSrc$() === src) {
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
