import type {AbstractRender, Frame, Unsubscribe} from '@reatom/core'
import {reatomAbstractRender, top} from '@reatom/core'
import {css, LitElement} from 'lit'
import type {CSSResultGroup, CSSResultOrNative, PropertyValues, TemplateResult} from 'lit'

const __inner_update = Symbol('Inner update')
const __aliased_event_dispatch = Symbol('Aliased event dispatch')
const CV_EVENT_PREFIX = 'cv-'

/**
 * Vendored from kaifaty/reatom branch LIT_UPDATE.
 */
const boxSizingStyle = css`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
`

let _unoUtilities: CSSResultOrNative | undefined

/**
 * Lazily set the shared UnoCSS utility stylesheet.
 * Call once at app bootstrap (after `virtual:uno.css` is available):
 *   import {unoUtilities} from './styles/uno-utilities'
 *   setUnoUtilities(unoUtilities)
 */
export function setUnoUtilities(sheet: CSSResultOrNative) {
  _unoUtilities = sheet
}

export class ReatomLitElement extends LitElement {
  protected static override finalizeStyles(styles?: CSSResultGroup): CSSResultOrNative[] {
    const base = [boxSizingStyle, ...super.finalizeStyles(styles)]
    if (_unoUtilities) base.push(_unoUtilities)
    return base
  }

  private __frame: Frame
  private __abstractRender?: AbstractRender<PropertyValues | undefined, unknown>
  private __unmount?: Unsubscribe
  private [__aliased_event_dispatch] = false

  constructor() {
    super()
    this.__frame = top()
  }

  private __initAbstractRender() {
    if (this.__abstractRender) return

    this.__abstractRender = reatomAbstractRender({
      frame: this.__frame,
      render: () => {
        return this.render()
      },
      rerender: () => {
        return this.requestUpdate(__inner_update as any, 1)
      },
      name: 'ReatomElement',
    })
  }

  protected override render(): TemplateResult | unknown {
    return undefined
  }

  protected override update(changedProperties: PropertyValues): void {
    this.__initAbstractRender()

    const {result: value} = this.__abstractRender!.render(changedProperties)
    const hadOwnRender = Object.prototype.hasOwnProperty.call(this, 'render')
    const ownRenderDescriptor = hadOwnRender
      ? Object.getOwnPropertyDescriptor(this, 'render')
      : undefined

    // Keep Lit's native update path intact so SSR hydration support can
    // reuse declarative shadow DOM instead of appending a second render.
    Object.defineProperty(this, 'render', {
      configurable: true,
      value: () => value,
    })

    try {
      super.update(changedProperties)
    } finally {
      if (hadOwnRender && ownRenderDescriptor) {
        Object.defineProperty(this, 'render', ownRenderDescriptor)
      } else {
        delete (this as unknown as {render?: unknown}).render
      }
    }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.__initAbstractRender()
    this.__unmount = this.__abstractRender!.mount()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    if (this.__unmount) {
      try {
        this.__unmount()
      } catch {
        // ignore unmount errors
      }
      this.__unmount = undefined
    }
  }

  override dispatchEvent(event: Event): boolean {
    if (
      this.localName.startsWith(CV_EVENT_PREFIX) &&
      !this[__aliased_event_dispatch] &&
      event instanceof CustomEvent &&
      !event.type.startsWith(CV_EVENT_PREFIX)
    ) {
      this[__aliased_event_dispatch] = true
      try {
        const aliasedEvent = new CustomEvent(`${CV_EVENT_PREFIX}${event.type}`, {
          detail: event.detail,
          bubbles: event.bubbles,
          cancelable: event.cancelable,
          composed: event.composed,
        })

        super.dispatchEvent(aliasedEvent)

        if (aliasedEvent.defaultPrevented && event.cancelable) {
          event.preventDefault()
        }
      } finally {
        this[__aliased_event_dispatch] = false
      }
    }

    return super.dispatchEvent(event)
  }
}
