import {LitElement, css, html} from 'lit'
import type {PropertyValues} from 'lit'

import {applyTheme, getTheme} from './theme-engine'

export type CVThemeMode = 'light' | 'dark' | 'system'

export class CVThemeProvider extends LitElement {
  static elementName = 'cv-theme-provider'

  static get properties() {
    return {
      theme: {type: String, reflect: true},
      mode: {type: String, reflect: true},
    }
  }

  declare theme: string
  declare mode: CVThemeMode

  private _mediaQuery: MediaQueryList | null = null
  private _mediaChangeHandler: ((e: MediaQueryListEvent | {matches: boolean}) => void) | null = null
  private _appliedTokens: Set<string> = new Set()

  constructor() {
    super()
    this.theme = ''
    this.mode = 'system'
  }

  static styles = [
    css`
      :host {
        display: contents;
      }
    `,
  ]

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.style.display = 'contents'
    this._applyMode()
    this._applyCurrentTheme()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this._removeMediaListener()
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    if (changedProperties.has('mode')) {
      this._applyMode()
    }
    if (changedProperties.has('theme')) {
      this._applyCurrentTheme()
    }
  }

  private _applyMode(): void {
    if (this.mode === 'system') {
      this._setupMediaListener()
    } else {
      this._removeMediaListener()
      this.style.colorScheme = this.mode
    }
  }

  private _setupMediaListener(): void {
    this._removeMediaListener()

    if (typeof window.matchMedia !== 'function') {
      this.style.colorScheme = 'light'
      return
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    if (!mq) {
      this.style.colorScheme = 'light'
      return
    }
    this._mediaQuery = mq
    this.style.colorScheme = mq.matches ? 'dark' : 'light'

    this._mediaChangeHandler = (e: {matches: boolean}) => {
      this.style.colorScheme = e.matches ? 'dark' : 'light'
    }
    mq.addEventListener('change', this._mediaChangeHandler as EventListener)
  }

  private _removeMediaListener(): void {
    if (this._mediaQuery && this._mediaChangeHandler) {
      this._mediaQuery.removeEventListener('change', this._mediaChangeHandler as EventListener)
      this._mediaQuery = null
      this._mediaChangeHandler = null
    }
  }

  private _applyCurrentTheme(): void {
    // Clear previously applied tokens
    for (const key of this._appliedTokens) {
      this.style.removeProperty(key)
    }
    this._appliedTokens.clear()

    if (!this.theme) {
      this.removeAttribute('data-cv-theme')
      return
    }

    const definition = getTheme(this.theme)
    if (!definition) {
      console.warn(`[cv-theme-provider] Theme "${this.theme}" is not registered.`)
      return
    }

    for (const [key, value] of Object.entries(definition.tokens)) {
      this.style.setProperty(key, value)
      this._appliedTokens.add(key)
    }
    this.setAttribute('data-cv-theme', this.theme)
  }

  protected override render() {
    return html`<slot></slot>`
  }
}
