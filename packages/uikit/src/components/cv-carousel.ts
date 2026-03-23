import {createCarousel, type CarouselModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import {CVCarouselSlide} from './cv-carousel-slide'

export interface CVCarouselEventDetail {
  activeIndex: number
  activeValue: string | null
  paused: boolean
}

interface CarouselSlideRecord {
  id: string
  label: string
  element: CVCarouselSlide
}

interface CarouselSnapshot {
  activeIndex: number
  paused: boolean
}

const carouselKeysToPrevent = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End'])

let cvCarouselNonce = 0

export class CVCarousel extends ReatomLitElement {
  static elementName = 'cv-carousel'

  static get properties() {
    return {
      value: {type: String, reflect: true},
      activeIndex: {type: Number, attribute: 'active-index', reflect: true},
      autoplay: {type: Boolean, reflect: true},
      autoplayInterval: {type: Number, attribute: 'autoplay-interval', reflect: true},
      visibleSlides: {type: Number, attribute: 'visible-slides', reflect: true},
      paused: {type: Boolean, reflect: true},
      ariaLabel: {type: String, attribute: 'aria-label'},
      ariaLabelledBy: {type: String, attribute: 'aria-labelledby'},
    }
  }

  declare value: string
  declare activeIndex: number
  declare autoplay: boolean
  declare autoplayInterval: number
  declare visibleSlides: number
  declare paused: boolean
  declare ariaLabel: string
  declare ariaLabelledBy: string

  private readonly idBase = `cv-carousel-${++cvCarouselNonce}`
  private slideRecords: CarouselSlideRecord[] = []
  private model: CarouselModel
  private swipeStartX = 0
  private swipeStartY = 0
  private isSwiping = false

  constructor() {
    super()
    this.value = ''
    this.activeIndex = 0
    this.autoplay = false
    this.autoplayInterval = 5000
    this.visibleSlides = 1
    this.paused = false
    this.ariaLabel = ''
    this.ariaLabelledBy = ''
    this.model = createCarousel({
      idBase: this.idBase,
      slides: [],
    })
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      [part='base'] {
        display: grid;
        gap: var(--cv-space-2, 8px);
      }

      [part='controls'] {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cv-space-1, 4px);
      }

      [part='slides'] {
        display: grid;
        gap: var(--cv-space-2, 8px);
      }

      [part='indicators'] {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cv-space-1, 4px);
      }

      button[part~='control'],
      button[part~='indicator'] {
        min-block-size: 32px;
        min-inline-size: 32px;
        border-radius: var(--cv-radius-sm, 6px);
        border: 1px solid var(--cv-color-border, #2a3245);
        background: var(--cv-color-surface, #141923);
        color: var(--cv-color-text, #e8ecf6);
      }

      button[part~='indicator'][data-active='true'] {
        border-color: var(--cv-color-primary, #65d7ff);
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
    this.rebuildModelFromSlot(false, false)
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (
      changedProperties.has('autoplay') ||
      changedProperties.has('autoplayInterval') ||
      changedProperties.has('visibleSlides') ||
      changedProperties.has('ariaLabel') ||
      changedProperties.has('ariaLabelledBy')
    ) {
      this.rebuildModelFromSlot(true, false)
      return
    }

    if (changedProperties.has('activeIndex') && this.activeIndex !== this.model.state.activeSlideIndex()) {
      const previous = this.captureSnapshot()
      this.model.actions.moveTo(this.activeIndex)
      this.applyInteractionResult(previous)
    }

    if (changedProperties.has('value')) {
      const normalized = this.value.trim()
      if (this.value !== normalized) {
        this.value = normalized
      }

      const index = this.slideRecords.findIndex((record) => record.id === normalized)
      if (index >= 0 && index !== this.model.state.activeSlideIndex()) {
        const previous = this.captureSnapshot()
        this.model.actions.moveTo(index)
        this.applyInteractionResult(previous)
      }
    }

    if (changedProperties.has('paused') && this.paused !== this.model.state.isPaused()) {
      const previous = this.captureSnapshot()
      if (this.paused) {
        this.model.actions.pause()
      } else {
        this.model.actions.play()
      }

      this.applyInteractionResult(previous)
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)

    const shouldSyncFromModel =
      !changedProperties.has('activeIndex') && !changedProperties.has('value') && !changedProperties.has('paused')

    if (shouldSyncFromModel) {
      const previous: CarouselSnapshot = {
        activeIndex: this.activeIndex,
        paused: this.paused,
      }

      this.syncControlledValuesFromModel()
      this.dispatchStateEvents(previous, this.captureSnapshot())
    }

    this.syncSlideElements()
  }

  next(): void {
    const previous = this.captureSnapshot()
    this.model.actions.moveNext()
    this.applyInteractionResult(previous)
  }

  prev(): void {
    const previous = this.captureSnapshot()
    this.model.actions.movePrev()
    this.applyInteractionResult(previous)
  }

  play(): void {
    const previous = this.captureSnapshot()
    this.model.actions.play()
    this.applyInteractionResult(previous)
  }

  pause(): void {
    const previous = this.captureSnapshot()
    this.model.actions.pause()
    this.applyInteractionResult(previous)
  }

  private getSlideElements(): CVCarouselSlide[] {
    return Array.from(this.children).filter(
      (element): element is CVCarouselSlide => element.tagName.toLowerCase() === CVCarouselSlide.elementName,
    )
  }

  private ensureSlideValue(slide: CVCarouselSlide, index: number): string {
    const normalized = slide.value?.trim()
    if (normalized) return normalized

    const fallback = `slide-${index + 1}`
    slide.value = fallback
    return fallback
  }

  private rebuildModelFromSlot(preserveState: boolean, requestRender = true): void {
    const previous = preserveState ? this.captureSnapshot() : {activeIndex: this.activeIndex, paused: this.paused}
    const previousActiveSlideId = preserveState ? this.slideRecords[previous.activeIndex]?.id ?? null : null

    this.slideRecords = this.getSlideElements().map((element, index) => ({
      id: this.ensureSlideValue(element, index),
      label: element.label || element.textContent?.trim() || `Slide ${index + 1}`,
      element,
    }))

    const activeIndexById =
      previousActiveSlideId == null
        ? -1
        : this.slideRecords.findIndex((record) => record.id === previousActiveSlideId)

    // When value is set, it takes precedence over activeIndex
    const valueNormalized = this.value?.trim()
    const activeIndexByValue =
      !preserveState && valueNormalized
        ? this.slideRecords.findIndex((record) => record.id === valueNormalized)
        : -1

    const initialActiveSlideIndex =
      activeIndexByValue >= 0 ? activeIndexByValue : activeIndexById >= 0 ? activeIndexById : previous.activeIndex

    this.model = createCarousel({
      idBase: this.idBase,
      slides: this.slideRecords.map((slide) => ({
        id: slide.id,
        label: slide.label,
      })),
      ariaLabel: this.ariaLabel || undefined,
      ariaLabelledBy: this.ariaLabelledBy || undefined,
      autoplay: this.autoplay,
      autoplayIntervalMs: this.autoplayInterval,
      visibleSlides: this.visibleSlides,
      initialActiveSlideIndex,
      initialPaused: previous.paused,
    })

    this.syncSlideElements()
    this.syncControlledValuesFromModel()

    if (requestRender) {
      this.requestUpdate()
    }
  }

  private syncSlideElements(): void {
    for (const [index, record] of this.slideRecords.entries()) {
      const props = this.model.contracts.getSlideProps(index)

      record.element.id = props.id
      record.element.setAttribute('role', props.role)
      record.element.setAttribute('aria-roledescription', props['aria-roledescription'])
      record.element.setAttribute('aria-label', props['aria-label'])
      record.element.setAttribute('aria-hidden', props['aria-hidden'])
      record.element.setAttribute('data-active', props['data-active'])
      record.element.active = props['data-active'] === 'true'
      record.element.hidden = props['aria-hidden'] === 'true'
    }
  }

  private syncControlledValuesFromModel(): void {
    const index = this.model.state.activeSlideIndex()
    this.activeIndex = index
    this.value = this.slideRecords[index]?.id ?? ''
    this.paused = this.model.state.isPaused()
  }

  private captureSnapshot(): CarouselSnapshot {
    return {
      activeIndex: this.model.state.activeSlideIndex(),
      paused: this.model.state.isPaused(),
    }
  }

  private dispatchInput(detail: CVCarouselEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private dispatchChange(detail: CVCarouselEventDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private applyInteractionResult(previous: CarouselSnapshot): void {
    this.syncSlideElements()

    const next = this.captureSnapshot()
    this.syncControlledValuesFromModel()
    this.dispatchStateEvents(previous, next)
  }

  private dispatchStateEvents(previous: CarouselSnapshot, next: CarouselSnapshot): void {
    const indexChanged = previous.activeIndex !== next.activeIndex
    const pausedChanged = previous.paused !== next.paused
    if (!indexChanged && !pausedChanged) return

    const detail: CVCarouselEventDetail = {
      activeIndex: next.activeIndex,
      activeValue: this.value || null,
      paused: next.paused,
    }

    this.dispatchInput(detail)
    if (indexChanged) {
      this.dispatchChange(detail)
    }
  }

  private handleRootFocusIn() {
    const previous = this.captureSnapshot()
    this.model.contracts.getRootProps().onFocusIn()
    this.applyInteractionResult(previous)
  }

  private handleRootFocusOut() {
    const previous = this.captureSnapshot()
    this.model.contracts.getRootProps().onFocusOut()
    this.applyInteractionResult(previous)
  }

  private handleRootPointerEnter() {
    const previous = this.captureSnapshot()
    this.model.contracts.getRootProps().onPointerEnter()
    this.applyInteractionResult(previous)
  }

  private handleRootPointerLeave() {
    const previous = this.captureSnapshot()
    this.model.contracts.getRootProps().onPointerLeave()
    this.applyInteractionResult(previous)
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (carouselKeysToPrevent.has(event.key)) {
      event.preventDefault()
    }

    const previous = this.captureSnapshot()
    this.model.actions.handleKeyDown({key: event.key})
    this.applyInteractionResult(previous)
  }

  private handlePrevClick() {
    const previous = this.captureSnapshot()
    this.model.contracts.getPrevButtonProps().onClick()
    this.applyInteractionResult(previous)
  }

  private handleNextClick() {
    const previous = this.captureSnapshot()
    this.model.contracts.getNextButtonProps().onClick()
    this.applyInteractionResult(previous)
  }

  private handlePlayPauseClick() {
    const previous = this.captureSnapshot()
    this.model.contracts.getPlayPauseButtonProps().onClick()
    this.applyInteractionResult(previous)
  }

  private handleIndicatorClick = (index: number) => {
    const previous = this.captureSnapshot()
    this.model.contracts.getIndicatorProps(index).onClick()
    this.applyInteractionResult(previous)
  }

  private handleSlotChange() {
    this.rebuildModelFromSlot(true, true)
  }

  private static readonly SWIPE_THRESHOLD = 30

  private handleSlidesPointerDown(event: PointerEvent) {
    this.swipeStartX = event.clientX
    this.swipeStartY = event.clientY
    this.isSwiping = true
  }

  private handleSlidesPointerMove(event: PointerEvent) {
    if (!this.isSwiping) return
    // Track end position via the last pointermove; pointerup will use its own clientX
    void event
  }

  private handleSlidesPointerUp(event: PointerEvent) {
    if (!this.isSwiping) return
    this.isSwiping = false

    const deltaX = event.clientX - this.swipeStartX
    const deltaY = event.clientY - this.swipeStartY
    const absDeltaX = Math.abs(deltaX)
    const absDeltaY = Math.abs(deltaY)

    // Ignore vertical drags and short drags below threshold
    if (absDeltaX < CVCarousel.SWIPE_THRESHOLD || absDeltaY > absDeltaX) return

    if (deltaX > 0) {
      this.prev()
    } else {
      this.next()
    }
  }

  protected override render() {
    const rootProps = this.model.contracts.getRootProps()
    const slideGroupProps = this.model.contracts.getSlideGroupProps()
    const prevProps = this.model.contracts.getPrevButtonProps()
    const nextProps = this.model.contracts.getNextButtonProps()
    const playPauseProps = this.model.contracts.getPlayPauseButtonProps()

    return html`
      <section
        id=${rootProps.id}
        role=${rootProps.role}
        aria-roledescription=${rootProps['aria-roledescription']}
        aria-label=${rootProps['aria-label'] ?? nothing}
        aria-labelledby=${rootProps['aria-labelledby'] ?? nothing}
        aria-live=${rootProps['aria-live']}
        tabindex="0"
        part="base"
        @keydown=${this.handleKeyDown}
        @focusin=${this.handleRootFocusIn}
        @focusout=${this.handleRootFocusOut}
        @pointerenter=${this.handleRootPointerEnter}
        @pointerleave=${this.handleRootPointerLeave}
      >
        <div part="controls">
          <button
            id=${prevProps.id}
            role=${prevProps.role}
            tabindex=${prevProps.tabindex}
            aria-controls=${prevProps['aria-controls']}
            aria-label=${prevProps['aria-label']}
            part="control prev"
            @click=${this.handlePrevClick}
          >
            Prev
          </button>

          <button
            id=${nextProps.id}
            role=${nextProps.role}
            tabindex=${nextProps.tabindex}
            aria-controls=${nextProps['aria-controls']}
            aria-label=${nextProps['aria-label']}
            part="control next"
            @click=${this.handleNextClick}
          >
            Next
          </button>

          <button
            id=${playPauseProps.id}
            role=${playPauseProps.role}
            tabindex=${playPauseProps.tabindex}
            aria-controls=${playPauseProps['aria-controls']}
            aria-label=${playPauseProps['aria-label']}
            part="control play-pause"
            @click=${this.handlePlayPauseClick}
          >
            ${this.model.state.isPaused() ? 'Play' : 'Pause'}
          </button>
        </div>

        <div
          id=${slideGroupProps.id}
          role=${slideGroupProps.role}
          aria-label=${slideGroupProps['aria-label'] ?? nothing}
          part="slides"
          @pointerdown=${this.handleSlidesPointerDown}
          @pointermove=${this.handleSlidesPointerMove}
          @pointerup=${this.handleSlidesPointerUp}
        >
          <slot @slotchange=${this.handleSlotChange}></slot>
        </div>

        <div part="indicators">
          ${this.slideRecords.map((_, index) => {
            const indicatorProps = this.model.contracts.getIndicatorProps(index)
            return html`
              <button
                id=${indicatorProps.id}
                role=${indicatorProps.role}
                tabindex=${indicatorProps.tabindex}
                aria-controls=${indicatorProps['aria-controls']}
                aria-label=${indicatorProps['aria-label']}
                aria-current=${indicatorProps['aria-current'] ?? nothing}
                data-active=${indicatorProps['data-active']}
                part="indicator"
                @click=${() => this.handleIndicatorClick(index)}
              >
                ${index + 1}
              </button>
            `
          })}
        </div>
      </section>
    `
  }
}
