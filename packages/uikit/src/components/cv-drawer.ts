import {createDrawer, type DrawerModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

export interface CVDrawerEventDetail {
  open: boolean
}

let cvDrawerNonce = 0

export class CVDrawer extends ReatomLitElement {
  static elementName = 'cv-drawer'

  static get properties() {
    return {
      open: {type: Boolean, reflect: true},
      modal: {type: Boolean, reflect: true},
      placement: {type: String, reflect: true},
      type: {type: String, reflect: true},
      closeOnEscape: {type: Boolean, attribute: 'close-on-escape', reflect: true},
      closeOnOutsidePointer: {type: Boolean, attribute: 'close-on-outside-pointer', reflect: true},
      closeOnOutsideFocus: {type: Boolean, attribute: 'close-on-outside-focus', reflect: true},
      initialFocusId: {type: String, attribute: 'initial-focus-id'},
      noHeader: {type: Boolean, attribute: 'no-header', reflect: true},
    }
  }

  declare open: boolean
  declare modal: boolean
  declare placement: 'start' | 'end' | 'top' | 'bottom'
  declare type: 'dialog' | 'alertdialog'
  declare closeOnEscape: boolean
  declare closeOnOutsidePointer: boolean
  declare closeOnOutsideFocus: boolean
  declare initialFocusId: string
  declare noHeader: boolean

  private readonly idBase = `cv-drawer-${++cvDrawerNonce}`
  private model: DrawerModel
  private lockScrollApplied = false
  private previousBodyOverflow = ''
  private suppressLifecycleFromUpdate = false
  private lifecycleToken = 0
  private overlayVisible = false
  private renderState: 'open' | 'closed' = 'closed'
  private openAnimationFrame = 0
  private closeAnimationTimeout = 0
  private shouldAnimatePresence = false

  constructor() {
    super()
    this.open = false
    this.modal = true
    this.placement = 'end'
    this.type = 'dialog'
    this.closeOnEscape = true
    this.closeOnOutsidePointer = true
    this.closeOnOutsideFocus = true
    this.initialFocusId = ''
    this.noHeader = false
    this.model = this.createModel()
    this.overlayVisible = this.open
    this.renderState = this.open ? 'open' : 'closed'
  }

  static styles = [
    css`
      :host {
        display: inline-block;
      }

      [part='trigger'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 36px;
        padding: 0 var(--cv-space-3, 12px);
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
        cursor: pointer;
      }

      [part='trigger']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='overlay'] {
        position: fixed;
        inset: 0;
        z-index: var(--cv-drawer-z-index, 40);
        display: flex;
        overflow: clip;
        contain: paint;
        background: var(--cv-drawer-overlay-color, color-mix(in oklab, black 56%, transparent));
        opacity: var(--cv-drawer-overlay-closed-opacity, 1);
        transition: opacity var(--cv-drawer-overlay-transition-duration, 0ms) ease;
      }

      [part='overlay'][hidden] {
        display: none;
      }

      [part='overlay'][data-state='open'] {
        opacity: 1;
      }

      [part='panel'] {
        position: fixed;
        overflow: auto;
        display: grid;
        grid-template-rows: auto 1fr auto;
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface-elevated, #1d2432);
        color: var(--cv-color-text, #e8ecf6);
        opacity: 0;
        will-change: transform, opacity;
        transition:
          transform var(--cv-drawer-transition-duration, 250ms) ease,
          opacity var(--cv-drawer-transition-duration, 250ms) ease;
      }

      [part='panel']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      /* Placement: start (inline-start edge) */
      [part='panel'][data-placement='start'] {
        inset-block: 0;
        inset-inline-start: 0;
        inline-size: var(--cv-drawer-size, 360px);
        max-inline-size: var(--cv-drawer-max-size, calc(100dvh - 32px));
        border-radius: 0 var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px))
          var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px)) 0;
        transform: translate3d(-100%, 0, 0);
      }

      /* Placement: end (inline-end edge) */
      [part='panel'][data-placement='end'] {
        inset-block: 0;
        inset-inline-end: 0;
        inline-size: var(--cv-drawer-size, 360px);
        max-inline-size: var(--cv-drawer-max-size, calc(100dvh - 32px));
        border-radius: var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px)) 0 0
          var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px));
        transform: translate3d(100%, 0, 0);
      }

      /* Placement: top */
      [part='panel'][data-placement='top'] {
        inset-inline: 0;
        inset-block-start: 0;
        block-size: var(--cv-drawer-size, 360px);
        max-block-size: var(--cv-drawer-max-size, calc(100dvh - 32px));
        border-radius: 0 0 var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px))
          var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px));
        transform: translate3d(0, -100%, 0);
      }

      /* Placement: bottom */
      [part='panel'][data-placement='bottom'] {
        inset-inline: 0;
        inset-block-end: 0;
        block-size: var(--cv-drawer-size, 360px);
        max-block-size: var(--cv-drawer-max-size, calc(100dvh - 32px));
        border-radius: var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px))
          var(--cv-drawer-border-radius, var(--cv-radius-lg, 14px)) 0 0;
        transform: translate3d(0, 100%, 0);
      }

      [part='panel'][data-state='open'] {
        opacity: 1;
        transform: translate3d(0, 0, 0);
      }

      @media (prefers-reduced-motion: reduce) {
        [part='overlay'],
        [part='panel'] {
          transition-duration: 0ms;
        }
      }

      [part='header'] {
        display: grid;
        gap: var(--cv-space-1, 4px);
        padding: var(--cv-drawer-header-spacing, var(--cv-space-4, 16px));
      }

      [part='title'] {
        margin: 0;
        font-size: 1.05rem;
      }

      [part='description'] {
        margin: 0;
        color: var(--cv-color-text-muted, #9aa6bf);
      }

      [part='header-close'] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-block-size: 28px;
        min-inline-size: 28px;
        padding: 0;
        border-radius: var(--cv-radius-sm, 6px);
        border: none;
        background: transparent;
        color: var(--cv-color-text-muted, #9aa6bf);
        cursor: pointer;
      }

      [part='header-close']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='body'] {
        padding: var(--cv-drawer-body-spacing, var(--cv-space-4, 16px));
        overflow: auto;
      }

      [part='footer'] {
        display: flex;
        gap: var(--cv-space-2, 8px);
        justify-content: flex-end;
        padding: var(--cv-drawer-footer-spacing, var(--cv-space-4, 16px));
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
    this.syncOutsideFocusListener()
    this.syncScrollLock()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.syncOutsideFocusListener(true)
    this.releaseScrollLock()
    this.clearAnimationQueue()
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)
    this.shouldAnimatePresence = false

    if (
      changedProperties.has('modal') ||
      changedProperties.has('type') ||
      changedProperties.has('closeOnEscape') ||
      changedProperties.has('closeOnOutsidePointer') ||
      changedProperties.has('closeOnOutsideFocus') ||
      changedProperties.has('initialFocusId') ||
      changedProperties.has('placement')
    ) {
      const wasOpen = this.model.state.isOpen()
      this.model = this.createModel(wasOpen)
    }

    if (changedProperties.has('open') && this.model.state.isOpen() !== this.open) {
      if (this.open) {
        this.model.actions.open()
      } else {
        this.model.actions.close()
      }
    }

    if (changedProperties.has('open')) {
      this.clearAnimationQueue()

      if (this.open) {
        this.overlayVisible = true
        this.renderState = this.hasUpdated ? 'closed' : 'open'
      } else {
        this.renderState = 'closed'
        if (!this.hasUpdated) {
          this.overlayVisible = false
        }
      }

      this.shouldAnimatePresence = this.hasUpdated
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)

    this.syncOutsideFocusListener()
    this.syncScrollLock()

    if (changedProperties.has('open')) {
      this.syncRenderedState()

      if (this.suppressLifecycleFromUpdate) {
        this.suppressLifecycleFromUpdate = false
      } else if (changedProperties.get('open') !== this.open) {
        this.dispatchLifecycleTransition(this.open)
      }

      if (this.shouldAnimatePresence) {
        if (this.open) {
          this.startOpenAnimation()
        } else {
          this.startCloseAnimation()
        }
      }
      this.shouldAnimatePresence = false

      if (this.open) {
        this.focusInitialTarget()
      }
    }
  }

  private clearAnimationQueue(): void {
    if (this.openAnimationFrame) {
      cancelAnimationFrame(this.openAnimationFrame)
      this.openAnimationFrame = 0
    }

    if (this.closeAnimationTimeout) {
      window.clearTimeout(this.closeAnimationTimeout)
      this.closeAnimationTimeout = 0
    }
  }

  private startOpenAnimation(): void {
    this.openAnimationFrame = requestAnimationFrame(() => {
      this.openAnimationFrame = 0

      if (!this.open) return

      this.renderState = 'open'
      this.syncRenderedState()
    })
  }

  private startCloseAnimation(): void {
    const duration = this.getTransitionDuration()

    if (duration === 0) {
      this.overlayVisible = false
      this.syncRenderedState()
      return
    }

    this.closeAnimationTimeout = window.setTimeout(() => {
      this.closeAnimationTimeout = 0

      if (this.open) return

      this.overlayVisible = false
      this.syncRenderedState()
    }, duration)
  }

  private syncRenderedState(): void {
    const overlay = this.shadowRoot?.querySelector('[part="overlay"]') as HTMLElement | null
    const panel = this.shadowRoot?.querySelector('[part="panel"]') as HTMLElement | null

    if (overlay) {
      overlay.hidden = !this.overlayVisible
      overlay.dataset['state'] = this.renderState
    }

    if (panel) {
      panel.dataset['state'] = this.renderState
    }
  }

  private getTransitionDuration(): number {
    const overlay = this.shadowRoot?.querySelector('[part="overlay"]') as HTMLElement | null
    const panel = this.shadowRoot?.querySelector('[part="panel"]') as HTMLElement | null

    return Math.max(this.readTransitionDuration(overlay), this.readTransitionDuration(panel))
  }

  private readTransitionDuration(element: HTMLElement | null): number {
    if (!element) return 0

    const styles = getComputedStyle(element)
    const durations = this.parseTimeValues(styles.transitionDuration)
    const delays = this.parseTimeValues(styles.transitionDelay)
    const transitionCount = Math.max(durations.length, delays.length)
    let maxDuration = 0

    for (let index = 0; index < transitionCount; index += 1) {
      const duration = durations[index] ?? durations[durations.length - 1] ?? 0
      const delay = delays[index] ?? delays[delays.length - 1] ?? 0
      maxDuration = Math.max(maxDuration, duration + delay)
    }

    return maxDuration
  }

  private parseTimeValues(value: string): number[] {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        if (entry.endsWith('ms')) return Number.parseFloat(entry)
        if (entry.endsWith('s')) return Number.parseFloat(entry) * 1000
        return Number.parseFloat(entry) || 0
      })
  }

  private createModel(initialOpen = this.open): DrawerModel {
    return createDrawer({
      idBase: this.idBase,
      initialOpen,
      isModal: this.modal,
      type: this.type,
      placement: this.placement,
      closeOnEscape: this.closeOnEscape,
      closeOnOutsidePointer: this.closeOnOutsidePointer,
      closeOnOutsideFocus: this.closeOnOutsideFocus,
      initialFocusId: this.initialFocusId || undefined,
    })
  }

  private captureState() {
    return {
      open: this.model.state.isOpen(),
      restoreTargetId: this.model.state.restoreTargetId(),
    }
  }

  private dispatchInput(detail: CVDrawerEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVDrawerEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchLifecycleEvent(name: string): void {
    this.dispatchEvent(
      new CustomEvent(name, {
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchLifecycleTransition(open: boolean): void {
    const token = ++this.lifecycleToken

    this.dispatchLifecycleEvent(open ? 'cv-show' : 'cv-hide')

    this.updateComplete.then(() => {
      if (this.lifecycleToken !== token) return
      this.dispatchLifecycleEvent(open ? 'cv-after-show' : 'cv-after-hide')
    })
  }

  private applyInteractionResult(previous: {open: boolean; restoreTargetId: string | null}): void {
    const nextOpen = this.model.state.isOpen()

    if (previous.open !== nextOpen) {
      const detail = {open: nextOpen}
      this.suppressLifecycleFromUpdate = true
      this.open = nextOpen

      this.dispatchLifecycleTransition(nextOpen)
      this.dispatchInput(detail)
      this.dispatchChange(detail)
    } else {
      this.open = nextOpen
    }

    const restoreTargetId = this.model.state.restoreTargetId()
    if (restoreTargetId && previous.restoreTargetId !== restoreTargetId) {
      const trigger = this.shadowRoot?.querySelector(`[id="${restoreTargetId}"]`) as HTMLElement | null
      trigger?.focus()
    }
  }

  private syncOutsideFocusListener(forceOff = false): void {
    const shouldListen = !forceOff && this.open
    if (shouldListen) {
      document.addEventListener('focusin', this.handleDocumentFocusIn)
    } else {
      document.removeEventListener('focusin', this.handleDocumentFocusIn)
    }
  }

  private syncScrollLock(): void {
    if (!this.model.state.shouldLockScroll()) {
      this.releaseScrollLock()
      return
    }

    if (this.lockScrollApplied) return

    this.previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    this.lockScrollApplied = true
  }

  private releaseScrollLock(): void {
    if (!this.lockScrollApplied) return

    document.body.style.overflow = this.previousBodyOverflow
    this.lockScrollApplied = false
  }

  private focusInitialTarget(): void {
    const panelProps = this.model.contracts.getPanelProps()
    const requestedId = panelProps['data-initial-focus']

    if (requestedId) {
      const explicit = (this.querySelector(`#${requestedId}`) as HTMLElement | null) ??
        (this.shadowRoot?.querySelector(`#${requestedId}`) as HTMLElement | null)
      if (explicit) {
        explicit.focus()
        return
      }
    }

    const panel = this.shadowRoot?.querySelector('[part="panel"]') as HTMLElement | null
    panel?.focus()
  }

  private handleDocumentFocusIn = (event: FocusEvent) => {
    if (!this.open) return

    const path = event.composedPath()
    if (path.includes(this)) return

    const previous = this.captureState()
    this.model.actions.handleOutsideFocus()
    this.applyInteractionResult(previous)
  }

  private handleTriggerClick() {
    const previous = this.captureState()
    this.model.contracts.getTriggerProps().onClick()
    this.applyInteractionResult(previous)
  }

  private handleTriggerKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
    }

    const previous = this.captureState()
    this.model.contracts.getTriggerProps().onKeyDown({key: event.key})
    this.applyInteractionResult(previous)
  }

  private handleOverlayPointerDown(event: MouseEvent) {
    if (event.target !== event.currentTarget) return

    const previous = this.captureState()
    this.model.contracts.getOverlayProps().onPointerDownOutside()
    this.applyInteractionResult(previous)
  }

  private handlePanelKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
    }

    const previous = this.captureState()
    this.model.contracts.getPanelProps().onKeyDown({key: event.key})
    this.applyInteractionResult(previous)
  }

  private handleHeaderCloseClick() {
    const previous = this.captureState()
    this.model.contracts.getHeaderCloseButtonProps().onClick()
    this.applyInteractionResult(previous)
  }

  protected override render() {
    const triggerProps = this.model.contracts.getTriggerProps()
    const overlayProps = this.model.contracts.getOverlayProps()
    const panelProps = this.model.contracts.getPanelProps()
    const titleProps = this.model.contracts.getTitleProps()
    const descriptionProps = this.model.contracts.getDescriptionProps()
    const headerCloseProps = this.model.contracts.getHeaderCloseButtonProps()

    return html`
      <button
        id=${triggerProps.id}
        role=${triggerProps.role}
        tabindex=${triggerProps.tabindex}
        aria-haspopup=${triggerProps['aria-haspopup']}
        aria-expanded=${triggerProps['aria-expanded']}
        aria-controls=${triggerProps['aria-controls']}
        part="trigger"
        type="button"
        @click=${this.handleTriggerClick}
        @keydown=${this.handleTriggerKeyDown}
      >
        <slot name="trigger">Open drawer</slot>
      </button>

      <div
        id=${overlayProps.id}
        data-open=${overlayProps['data-open']}
        data-state=${this.renderState}
        ?hidden=${!this.overlayVisible}
        part="overlay"
        @mousedown=${this.handleOverlayPointerDown}
      >
        <section
          id=${panelProps.id}
          role=${panelProps.role}
          tabindex=${panelProps.tabindex}
          aria-modal=${panelProps['aria-modal']}
          aria-labelledby=${panelProps['aria-labelledby'] ?? nothing}
          aria-describedby=${panelProps['aria-describedby'] ?? nothing}
          data-placement=${panelProps['data-placement']}
          data-state=${this.renderState}
          data-initial-focus=${panelProps['data-initial-focus'] ?? nothing}
          part="panel"
          @keydown=${this.handlePanelKeyDown}
        >
          <header part="header" ?hidden=${this.noHeader}>
            <h2 id=${titleProps.id} part="title">
              <slot name="title">Drawer</slot>
            </h2>
            <p id=${descriptionProps.id} part="description">
              <slot name="description"></slot>
            </p>
            <button
              id=${headerCloseProps.id}
              role=${headerCloseProps.role}
              tabindex=${headerCloseProps.tabindex}
              aria-label=${headerCloseProps['aria-label']}
              type="button"
              part="header-close"
              @click=${this.handleHeaderCloseClick}
            >
              <slot name="header-close">&#10005;</slot>
            </button>
          </header>

          <div part="body">
            <slot></slot>
          </div>

          <footer part="footer">
            <slot name="footer"></slot>
          </footer>
        </section>
      </div>
    `
  }
}
