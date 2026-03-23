import {createSidebar, type SidebarModel} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

interface CVSidebarItemLike extends HTMLElement {
  href: string
  active: boolean
  disabled: boolean
}

type CVSidebarDetail = CVSidebarInputDetail | CVSidebarChangeDetail
type ScrollspyRoot = Document | ShadowRoot | Element | null
type ScrollspySource = CVSidebarItemLike | HTMLAnchorElement
export type CVSidebarScrollspyStrategy = 'top-anchor' | 'viewport-dominant'

interface ScrollspyBinding {
  href: string
  id: string
  source: ScrollspySource
  target: HTMLElement
}

export type CVSidebarInputDetail = {expanded: boolean} | {overlayOpen: boolean}
export type CVSidebarChangeDetail = CVSidebarInputDetail
export interface CVSidebarScrollspyChangeDetail {
  activeId: string | null
}

export type CVSidebarInputEvent = CustomEvent<CVSidebarInputDetail>
export type CVSidebarChangeEvent = CustomEvent<CVSidebarChangeDetail>
export type CVSidebarScrollspyChangeEvent = CustomEvent<CVSidebarScrollspyChangeDetail>

export interface CVSidebarEventMap {
  'cv-input': CVSidebarInputEvent
  'cv-change': CVSidebarChangeEvent
  'cv-scrollspy-change': CVSidebarScrollspyChangeEvent
}

let cvSidebarNonce = 0
const TOP_ANCHOR_THRESHOLDS = [0, 0.25, 0.5, 0.75, 1]
const VIEWPORT_DOMINANT_THRESHOLDS = Array.from({length: 21}, (_, index) => index / 20)
const VIEWPORT_DOMINANT_VISIBLE_WEIGHT = 0.7
const VIEWPORT_DOMINANT_CENTER_WEIGHT = 0.3
const VIEWPORT_DOMINANT_HYSTERESIS = 0.08
const VIEWPORT_DOMINANT_MIN_VISIBLE_PX = 64

function isSidebarItem(source: Element): source is CVSidebarItemLike {
  return source.tagName === 'CV-SIDEBAR-ITEM'
}

function isHashHref(href: string): boolean {
  return href.startsWith('#') && href.length > 1
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function escapeSelectorId(id: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(id)
  }

  return id.replace(/["\\#.:?[\]]/g, '\\$&')
}

export class CVSidebar extends ReatomLitElement {
  static elementName = 'cv-sidebar'

  static get properties() {
    return {
      expanded: {type: Boolean, reflect: true},
      collapsed: {type: Boolean, reflect: true},
      mobile: {type: Boolean, reflect: true},
      overlayOpen: {type: Boolean, attribute: 'overlay-open', reflect: true},
      size: {type: String, reflect: true},
      breakpoint: {type: String, reflect: true},
      closeOnEscape: {type: Boolean, attribute: 'close-on-escape', reflect: true},
      closeOnOutsidePointer: {type: Boolean, attribute: 'close-on-outside-pointer', reflect: true},
      initialFocusId: {type: String, attribute: 'initial-focus-id'},
      ariaLabel: {type: String, attribute: 'aria-label'},
      scrollspy: {type: Boolean, reflect: true},
      scrollspyOffsetTop: {type: Number, attribute: 'scrollspy-offset-top'},
      scrollspyStrategy: {type: String, attribute: 'scrollspy-strategy', reflect: true},
      scrollspySmoothScroll: {type: Boolean, attribute: 'scrollspy-smooth-scroll', reflect: true},
      scrollspyRoot: {attribute: false},
    }
  }

  declare expanded: boolean
  declare collapsed: boolean
  declare mobile: boolean
  declare overlayOpen: boolean
  declare size: 'small' | 'medium' | 'large'
  declare breakpoint: string
  declare closeOnEscape: boolean
  declare closeOnOutsidePointer: boolean
  declare initialFocusId: string
  declare ariaLabel: string
  declare scrollspy: boolean
  declare scrollspyOffsetTop: number
  declare scrollspyStrategy: CVSidebarScrollspyStrategy
  declare scrollspySmoothScroll: boolean
  declare scrollspyRoot: ScrollspyRoot

  private readonly idBase = `cv-sidebar-${++cvSidebarNonce}`
  private model: SidebarModel
  private lockScrollApplied = false
  private previousBodyOverflow = ''
  private lifecycleToken = 0
  private suppressLifecycleFromUpdate = false
  private mediaQuery: MediaQueryList | null = null
  private mediaQueryHandler: ((e: MediaQueryListEvent) => void) | null = null
  private scrollspyObserver: IntersectionObserver | null = null
  private scrollspyBindings: ScrollspyBinding[] = []
  private scrollspyActiveId: string | null = null
  private scrollspyRefreshToken = 0
  private scrollspyRecomputeFrame = 0
  private activeRevealToken = 0

  constructor() {
    super()
    this.expanded = true
    this.collapsed = false
    this.mobile = false
    this.overlayOpen = false
    this.size = 'medium'
    this.breakpoint = '768px'
    this.closeOnEscape = true
    this.closeOnOutsidePointer = true
    this.initialFocusId = ''
    this.ariaLabel = 'Sidebar navigation'
    this.scrollspy = false
    this.scrollspyOffsetTop = 0
    this.scrollspyStrategy = 'top-anchor'
    this.scrollspySmoothScroll = true
    this.scrollspyRoot = null
    this.model = this.createModel()
  }

  get activeId(): string | null {
    return this.scrollspyActiveId
  }

  static styles = [
    css`
      :host {
        display: block;
        position: relative;
      }

      [part='overlay'] {
        position: fixed;
        inset: 0;
        z-index: calc(var(--cv-sidebar-z-index, 30) + 10);
        background: var(--cv-sidebar-overlay-color, color-mix(in oklab, black 56%, transparent));
      }

      [part='overlay'][hidden] {
        display: none;
      }

      [part='panel'] {
        display: grid;
        grid-template-rows: auto 1fr auto;
        position: relative;
        inline-size: var(--cv-sidebar-inline-size, 280px);
        block-size: 100%;
        background: var(--cv-sidebar-background, var(--cv-color-surface, #141923));
        border-inline-end: 1px solid var(--cv-sidebar-border-color, var(--cv-color-border, #2a3245));
        transition:
          inline-size var(--cv-sidebar-transition-duration, var(--cv-duration-normal, 200ms))
            var(--cv-sidebar-transition-easing, var(--cv-easing-standard, ease));
        overflow: hidden;
      }

      :host([collapsed]) [part='panel'] {
        inline-size: var(--cv-sidebar-rail-inline-size, 56px);
      }

      :host([size='small']) {
        --cv-sidebar-inline-size: 220px;
        --cv-sidebar-rail-inline-size: 48px;
      }

      :host([size='large']) {
        --cv-sidebar-inline-size: 340px;
        --cv-sidebar-rail-inline-size: 64px;
      }

      :host([mobile]) [part='panel'] {
        position: fixed;
        inset-block: 0;
        inset-inline-start: 0;
        z-index: calc(var(--cv-sidebar-z-index, 30) + 10);
        inline-size: var(--cv-sidebar-inline-size, 280px);
      }

      :host([mobile]:not([overlay-open])) [part='panel'] {
        display: none;
      }

      [part='header'] {
        display: flex;
        align-items: center;
        gap: var(--cv-space-2, 8px);
        padding-block: var(--cv-sidebar-padding-block, var(--cv-space-3, 12px));
        padding-inline: var(--cv-sidebar-padding-inline, var(--cv-space-3, 12px));
      }

      [part='toggle'] {
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
        margin-inline-start: auto;
      }

      [part='toggle']:focus-visible {
        outline: 2px solid var(--cv-color-primary, #65d7ff);
        outline-offset: 1px;
      }

      [part='body'] {
        padding-block: var(--cv-sidebar-padding-block, var(--cv-space-3, 12px));
        padding-inline: var(--cv-sidebar-padding-inline, var(--cv-space-3, 12px));
        overflow: auto;
      }

      [part='footer'] {
        padding-block: var(--cv-sidebar-padding-block, var(--cv-space-3, 12px));
        padding-inline: var(--cv-sidebar-padding-inline, var(--cv-space-3, 12px));
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
    this.setupMediaQuery()
    this.syncScrollLock()
    this.scheduleScrollspyRefresh()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.teardownMediaQuery()
    this.releaseScrollLock()
    this.destroyScrollspy()
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('collapsed')) {
      if (this.collapsed && this.expanded) {
        this.expanded = false
      } else if (!this.collapsed && !this.expanded) {
        this.expanded = true
      }
    }

    if (changedProperties.has('expanded')) {
      if (this.expanded && this.collapsed) {
        this.collapsed = false
      } else if (!this.expanded && !this.collapsed) {
        this.collapsed = true
      }
    }

    const needsModelRecreate =
      changedProperties.has('closeOnEscape') ||
      changedProperties.has('closeOnOutsidePointer') ||
      changedProperties.has('initialFocusId') ||
      changedProperties.has('ariaLabel')

    if (needsModelRecreate) {
      this.model = this.createModel()
    }

    if (changedProperties.has('expanded') || changedProperties.has('collapsed') || needsModelRecreate) {
      if (this.expanded && !this.model.state.expanded()) {
        this.model.actions.expand()
      } else if (!this.expanded && this.model.state.expanded()) {
        this.model.actions.collapse()
      }
    }

    if (changedProperties.has('mobile')) {
      if (this.model.state.mobile() !== this.mobile) {
        this.model.actions.setMobile(this.mobile)
      }
    }

    if (changedProperties.has('overlayOpen')) {
      if (this.overlayOpen && !this.model.state.overlayOpen()) {
        this.model.actions.openOverlay()
      } else if (!this.overlayOpen && this.model.state.overlayOpen()) {
        this.model.actions.closeOverlay()
      }
    }

    if (changedProperties.has('breakpoint')) {
      this.teardownMediaQuery()
      this.setupMediaQuery()
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    this.syncScrollLock()
    this.syncChildItemContext()

    if (
      changedProperties.has('collapsed') ||
      changedProperties.has('mobile') ||
      changedProperties.has('scrollspy') ||
      changedProperties.has('scrollspyOffsetTop') ||
      changedProperties.has('scrollspyStrategy') ||
      changedProperties.has('scrollspyRoot')
    ) {
      this.scheduleScrollspyRefresh()
    }

    if (changedProperties.has('expanded') && changedProperties.get('expanded') !== undefined) {
      if (this.suppressLifecycleFromUpdate) {
        this.suppressLifecycleFromUpdate = false
      } else if (!this.mobile) {
        this.dispatchDesktopLifecycle(this.expanded)
      }
    }

    if (changedProperties.has('overlayOpen') && changedProperties.get('overlayOpen') !== undefined) {
      this.dispatchOverlayLifecycle(this.overlayOpen)
    }
  }

  private createModel(): SidebarModel {
    return createSidebar({
      id: this.idBase,
      defaultExpanded: this.expanded,
      closeOnEscape: this.closeOnEscape,
      closeOnOutsidePointer: this.closeOnOutsidePointer,
      initialFocusId: this.initialFocusId || undefined,
      ariaLabel: this.ariaLabel || 'Sidebar navigation',
    })
  }

  private captureState() {
    return {
      expanded: this.model.state.expanded(),
      overlayOpen: this.model.state.overlayOpen(),
    }
  }

  private setupMediaQuery(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(`(max-width: ${this.breakpoint})`)
    this.mediaQuery = mq
    this.mediaQueryHandler = (e: MediaQueryListEvent) => {
      this.mobile = e.matches
      this.model.actions.setMobile(e.matches)
    }
    mq.addEventListener('change', this.mediaQueryHandler)
    this.mobile = mq.matches
    this.model.actions.setMobile(mq.matches)
  }

  private teardownMediaQuery(): void {
    if (this.mediaQuery && this.mediaQueryHandler) {
      this.mediaQuery.removeEventListener('change', this.mediaQueryHandler)
    }
    this.mediaQuery = null
    this.mediaQueryHandler = null
  }

  private dispatchInput(detail: CVSidebarDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-input', {detail, bubbles: true, composed: true}),
    )
  }

  private dispatchChange(detail: CVSidebarDetail): void {
    this.dispatchEvent(
      new CustomEvent('cv-change', {detail, bubbles: true, composed: true}),
    )
  }

  private dispatchLifecycleEvent(name: string): void {
    this.dispatchEvent(
      new CustomEvent(name, {bubbles: true, composed: true}),
    )
  }

  private dispatchDesktopLifecycle(expanded: boolean): void {
    const token = ++this.lifecycleToken
    this.dispatchLifecycleEvent(expanded ? 'cv-expand' : 'cv-collapse')
    this.updateComplete.then(() => {
      if (this.lifecycleToken !== token) return
      this.dispatchLifecycleEvent(expanded ? 'cv-after-expand' : 'cv-after-collapse')
    })
  }

  private dispatchOverlayLifecycle(open: boolean): void {
    const token = ++this.lifecycleToken
    this.dispatchLifecycleEvent(open ? 'cv-overlay-open' : 'cv-overlay-close')
    this.updateComplete.then(() => {
      if (this.lifecycleToken !== token) return
      this.dispatchLifecycleEvent(open ? 'cv-after-overlay-open' : 'cv-after-overlay-close')
    })
  }

  private dispatchScrollspyChange(activeId: string | null): void {
    this.dispatchEvent(
      new CustomEvent<CVSidebarScrollspyChangeDetail>('cv-scrollspy-change', {
        detail: {activeId},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private applyInteractionResult(previous: {expanded: boolean; overlayOpen: boolean}): void {
    const nextExpanded = this.model.state.expanded()
    const nextOverlayOpen = this.model.state.overlayOpen()

    if (!this.mobile && previous.expanded !== nextExpanded) {
      this.suppressLifecycleFromUpdate = true
      this.expanded = nextExpanded
      this.collapsed = !nextExpanded

      this.dispatchDesktopLifecycle(nextExpanded)
      const detail = {expanded: nextExpanded}
      this.dispatchInput(detail)
      this.dispatchChange(detail)
    }

    if (this.mobile && previous.overlayOpen !== nextOverlayOpen) {
      this.overlayOpen = nextOverlayOpen

      const detail = {overlayOpen: nextOverlayOpen}
      this.dispatchInput(detail)
      this.dispatchChange(detail)
    }
  }

  private syncScrollLock(): void {
    const shouldLock = this.model.state.shouldLockScroll()
    if (shouldLock && !this.lockScrollApplied) {
      this.previousBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      this.lockScrollApplied = true
    } else if (!shouldLock && this.lockScrollApplied) {
      this.releaseScrollLock()
    }
  }

  private releaseScrollLock(): void {
    if (!this.lockScrollApplied) return
    document.body.style.overflow = this.previousBodyOverflow
    this.lockScrollApplied = false
  }

  private getDefaultSlot(): HTMLSlotElement | null {
    return (this.shadowRoot?.querySelector('slot:not([name])') as HTMLSlotElement | null) ?? null
  }

  private getAssignedElements(): HTMLElement[] {
    const slot = this.getDefaultSlot()
    return (slot?.assignedElements({flatten: true}) as HTMLElement[] | undefined) ?? []
  }

  private getSidebarItems(): CVSidebarItemLike[] {
    return this.getAssignedElements().filter(isSidebarItem)
  }

  private syncChildItemContext(): void {
    for (const item of this.getSidebarItems()) {
      item.toggleAttribute('data-sidebar-collapsed', this.collapsed)
      item.toggleAttribute('data-sidebar-mobile', this.mobile)
    }
  }

  private handleDefaultSlotChange() {
    this.syncChildItemContext()
    this.scheduleScrollspyRefresh()
  }

  private handleToggleClick() {
    const previous = this.captureState()
    this.model.actions.toggle()
    this.applyInteractionResult(previous)
  }

  private handleOverlayPointerDown(event: MouseEvent) {
    if (event.target !== event.currentTarget) return
    const previous = this.captureState()
    this.model.actions.handleOutsidePointer()
    this.applyInteractionResult(previous)
  }

  private handlePanelKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
    }
    const previous = this.captureState()
    this.model.actions.handleKeyDown({key: event.key})
    this.applyInteractionResult(previous)
  }

  private handleBodyClick(event: MouseEvent) {
    if (!this.scrollspy) return
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

    const binding = this.resolveBindingFromEvent(event)
    if (!binding) return
    if (isSidebarItem(binding.source) && binding.source.disabled) return

    const strategy = this.resolveScrollspyStrategy()
    event.preventDefault()
    if (strategy === 'top-anchor') {
      this.updateActiveId(binding.id)
    }
    this.scrollBindingTarget(binding, strategy)
  }

  private resolveBindingFromEvent(event: Event): ScrollspyBinding | null {
    const path = event.composedPath()
    for (const binding of this.scrollspyBindings) {
      if (path.includes(binding.source)) {
        return binding
      }
    }
    return null
  }

  private scheduleScrollspyRefresh(): void {
    const token = ++this.scrollspyRefreshToken
    queueMicrotask(() => {
      if (token !== this.scrollspyRefreshToken || !this.isConnected) return
      this.refreshScrollspy()
    })
  }

  private refreshScrollspy(): void {
    this.destroyScrollspy()
    this.syncChildItemContext()

    if (!this.scrollspy) {
      this.updateActiveId(null)
      return
    }

    this.scrollspyBindings = this.collectScrollspyBindings()
    this.syncScrollspyActiveState()

    if (!this.scrollspyBindings.length) {
      this.updateActiveId(null)
      return
    }

    if (typeof IntersectionObserver === 'undefined') {
      this.updateActiveId(this.computeActiveId())
      return
    }

    this.scrollspyObserver = new IntersectionObserver(
      this.handleScrollspyIntersection.bind(this),
      this.getScrollspyObserverOptions(),
    )

    for (const binding of this.scrollspyBindings) {
      this.scrollspyObserver.observe(binding.target)
    }

    this.scheduleScrollspyRecompute()
  }

  private destroyScrollspy(): void {
    this.cancelScrollspyRecompute()
    this.scrollspyObserver?.disconnect()
    this.scrollspyObserver = null
    this.scrollspyBindings = []
  }

  private collectScrollspyBindings(): ScrollspyBinding[] {
    const bindings: ScrollspyBinding[] = []

    for (const source of this.getAssignedElements()) {
      const href = this.getHashHref(source)
      if (!href) continue

      const id = href.slice(1)
      const target = this.resolveScrollspyTarget(id)
      if (!target) continue

      bindings.push({
        href,
        id,
        source: source as ScrollspySource,
        target,
      })
    }

    return bindings
  }

  private getHashHref(source: HTMLElement): string | null {
    if (isSidebarItem(source)) {
      return isHashHref(source.href) ? source.href : null
    }

    if (source instanceof HTMLAnchorElement) {
      const href = source.getAttribute('href') ?? ''
      return isHashHref(href) ? href : null
    }

    return null
  }

  private resolveScrollspyTarget(id: string): HTMLElement | null {
    if (!id) return null
    const root = this.resolveScrollspyContainer()
    const target = root.querySelector(`#${escapeSelectorId(id)}`)
    return target instanceof HTMLElement ? target : null
  }

  private resolveScrollspyContainer(): ParentNode & NonNullable<Pick<Document, 'querySelector'>> {
    if (this.scrollspyRoot) {
      return this.scrollspyRoot as ParentNode & NonNullable<Pick<Document, 'querySelector'>>
    }

    const root = this.getRootNode()
    if (root instanceof ShadowRoot || root instanceof Document) {
      return root
    }

    return this.ownerDocument
  }

  private handleScrollspyIntersection() {
    this.scheduleScrollspyRecompute()
  }

  private computeActiveId(): string | null {
    return this.resolveScrollspyStrategy() === 'viewport-dominant'
      ? this.computeViewportDominantActiveId()
      : this.computeTopAnchorActiveId()
  }

  private computeTopAnchorActiveId(): string | null {
    if (!this.scrollspyBindings.length) return null

    const offsetTop = Math.max(0, this.scrollspyOffsetTop)
    const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight
    let bestVisible: {id: string; distance: number; crossedAnchor: boolean} | null = null
    let latestCrossed: {id: string; top: number} | null = null
    let firstUpcoming: {id: string; top: number} | null = null

    for (const binding of this.scrollspyBindings) {
      const rect = binding.target.getBoundingClientRect()
      const hasLayout = rect.height > 0 || rect.width > 0
      if (!hasLayout) continue

      const isVisible = rect.top < viewportHeight && rect.bottom > offsetTop
      const crossedAnchor = rect.top <= offsetTop
      const distance = Math.abs(rect.top - offsetTop)

      if (
        isVisible &&
        (!bestVisible ||
          distance < bestVisible.distance ||
          (distance === bestVisible.distance && crossedAnchor && !bestVisible.crossedAnchor))
      ) {
        bestVisible = {id: binding.id, distance, crossedAnchor}
      }

      if (crossedAnchor && (!latestCrossed || rect.top > latestCrossed.top)) {
        latestCrossed = {id: binding.id, top: rect.top}
      }

      if (!crossedAnchor && (!firstUpcoming || rect.top < firstUpcoming.top)) {
        firstUpcoming = {id: binding.id, top: rect.top}
      }
    }

    return bestVisible?.id ?? latestCrossed?.id ?? firstUpcoming?.id ?? null
  }

  private computeViewportDominantActiveId(): string | null {
    if (!this.scrollspyBindings.length) return null
    if (typeof window === 'undefined') return null

    const viewportTop = Math.max(0, this.scrollspyOffsetTop)
    const viewportBottom = window.innerHeight
    const effectiveHeight = Math.max(1, viewportBottom - viewportTop)
    const effectiveCenter = viewportTop + effectiveHeight / 2
    let bestCandidate:
      | {
          id: string
          score: number
          visiblePx: number
        }
      | null = null
    let currentCandidate:
      | {
          score: number
          visiblePx: number
        }
      | null = null

    for (const binding of this.scrollspyBindings) {
      const rect = binding.target.getBoundingClientRect()
      const hasLayout = rect.height > 0 || rect.width > 0
      if (!hasLayout) continue

      const visibleTop = Math.max(rect.top, viewportTop)
      const visibleBottom = Math.min(rect.bottom, viewportBottom)
      const visiblePx = clamp(visibleBottom - visibleTop, 0, effectiveHeight)
      if (visiblePx <= 0) continue

      const visibleRatio = visiblePx / Math.max(1, Math.min(rect.height, effectiveHeight))
      const sectionCenter = rect.top + rect.height / 2
      const centerScore = clamp(
        1 - Math.abs(sectionCenter - effectiveCenter) / Math.max(1, effectiveHeight / 2),
        0,
        1,
      )
      const score =
        visibleRatio * VIEWPORT_DOMINANT_VISIBLE_WEIGHT +
        centerScore * VIEWPORT_DOMINANT_CENTER_WEIGHT

      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = {id: binding.id, score, visiblePx}
      }

      if (binding.id === this.scrollspyActiveId) {
        currentCandidate = {score, visiblePx}
      }
    }

    if (!bestCandidate) return null
    if (bestCandidate.id === this.scrollspyActiveId) return bestCandidate.id
    if (!currentCandidate) return bestCandidate.id
    if (currentCandidate.visiblePx < VIEWPORT_DOMINANT_MIN_VISIBLE_PX) {
      return bestCandidate.id
    }
    if (bestCandidate.score >= currentCandidate.score + VIEWPORT_DOMINANT_HYSTERESIS) {
      return bestCandidate.id
    }

    return this.scrollspyActiveId
  }

  private getScrollspyObserverOptions(): IntersectionObserverInit {
    if (this.resolveScrollspyStrategy() === 'viewport-dominant') {
      return {
        rootMargin: '0px',
        threshold: VIEWPORT_DOMINANT_THRESHOLDS,
      }
    }

    return {
      rootMargin: `-${Math.max(0, this.scrollspyOffsetTop)}px 0px -60% 0px`,
      threshold: TOP_ANCHOR_THRESHOLDS,
    }
  }

  private resolveScrollspyStrategy(): CVSidebarScrollspyStrategy {
    return this.scrollspyStrategy === 'viewport-dominant' ? 'viewport-dominant' : 'top-anchor'
  }

  private scrollBindingTarget(
    binding: ScrollspyBinding,
    strategy: CVSidebarScrollspyStrategy,
  ): void {
    const behavior = this.scrollspySmoothScroll ? 'smooth' : 'auto'
    if (strategy !== 'viewport-dominant' || typeof window === 'undefined') {
      binding.target.scrollIntoView({behavior, block: 'start'})
      return
    }

    const viewportTop = Math.max(0, this.scrollspyOffsetTop)
    const viewportBottom = window.innerHeight
    const effectiveHeight = Math.max(1, viewportBottom - viewportTop)
    const effectiveCenter = viewportTop + effectiveHeight / 2
    const currentScrollTop = window.scrollY || window.pageYOffset || 0
    const rect = binding.target.getBoundingClientRect()
    const targetCenter = currentScrollTop + rect.top + rect.height / 2
    const scrollingElement = document.scrollingElement ?? document.documentElement
    const maxTop = Math.max(0, scrollingElement.scrollHeight - window.innerHeight)
    const top = clamp(targetCenter - effectiveCenter, 0, maxTop)

    window.scrollTo({top, behavior})
  }

  private scheduleScrollspyRecompute(): void {
    if (this.scrollspyRecomputeFrame) return

    this.scrollspyRecomputeFrame = requestAnimationFrame(() => {
      this.scrollspyRecomputeFrame = 0
      if (!this.isConnected || !this.scrollspy) return
      this.updateActiveId(this.computeActiveId())
    })
  }

  private cancelScrollspyRecompute(): void {
    if (!this.scrollspyRecomputeFrame) return
    cancelAnimationFrame(this.scrollspyRecomputeFrame)
    this.scrollspyRecomputeFrame = 0
  }

  private updateActiveId(nextActiveId: string | null): void {
    if (this.scrollspyActiveId === nextActiveId) {
      this.syncScrollspyActiveState()
      this.revealActiveBinding()
      return
    }

    this.scrollspyActiveId = nextActiveId
    this.syncScrollspyActiveState()
    this.revealActiveBinding()
    this.dispatchScrollspyChange(nextActiveId)
  }

  private syncScrollspyActiveState(): void {
    for (const binding of this.scrollspyBindings) {
      const isActive = binding.id === this.scrollspyActiveId

      if (isSidebarItem(binding.source)) {
        binding.source.active = isActive
      } else {
        binding.source.toggleAttribute('data-active', isActive)
        if (isActive) {
          binding.source.ariaCurrent = 'location'
          binding.source.setAttribute('aria-current', 'location')
        } else {
          binding.source.ariaCurrent = ''
          binding.source.removeAttribute('aria-current')
        }
      }
    }
  }

  private revealActiveBinding(): void {
    const binding = this.scrollspyBindings.find((candidate) => candidate.id === this.scrollspyActiveId)
    if (!binding) return

    const source = binding.source
    const body = this.shadowRoot?.querySelector('[part="body"]') as HTMLElement | null
    if (!body) return

    const token = ++this.activeRevealToken
    requestAnimationFrame(() => {
      if (token !== this.activeRevealToken) return

      const sourceRect = source.getBoundingClientRect()
      const bodyRect = body.getBoundingClientRect()
      const gap = 12

      if (sourceRect.top < bodyRect.top + gap) {
        body.scrollTop -= bodyRect.top + gap - sourceRect.top
        return
      }

      if (sourceRect.bottom > bodyRect.bottom - gap) {
        body.scrollTop += sourceRect.bottom - (bodyRect.bottom - gap)
      }
    })
  }

  protected override render() {
    const sidebarProps = this.model.contracts.getSidebarProps()
    const toggleProps = this.model.contracts.getToggleProps()
    const overlayProps = this.model.contracts.getOverlayProps()

    return html`
      <div
        id=${overlayProps.id}
        ?hidden=${overlayProps.hidden}
        data-open=${overlayProps['data-open']}
        part="overlay"
        @mousedown=${this.handleOverlayPointerDown}
      ></div>

      <aside
        id=${sidebarProps.id}
        role=${sidebarProps.role}
        aria-label=${sidebarProps['aria-label']}
        aria-modal=${sidebarProps['aria-modal'] ?? nothing}
        ?data-collapsed=${sidebarProps['data-collapsed'] === 'true'}
        ?data-mobile=${sidebarProps['data-mobile'] === 'true'}
        part="panel"
        @keydown=${this.handlePanelKeyDown}
      >
        <header part="header">
          <slot name="header"></slot>
          <button
            id=${toggleProps.id}
            role=${toggleProps.role}
            tabindex=${toggleProps.tabindex}
            aria-expanded=${toggleProps['aria-expanded']}
            aria-controls=${toggleProps['aria-controls']}
            aria-label=${toggleProps['aria-label']}
            type="button"
            part="toggle"
            @click=${this.handleToggleClick}
          >
            <slot name="toggle">&#9776;</slot>
          </button>
        </header>

        <nav part="body" @click=${this.handleBodyClick}>
          <slot @slotchange=${this.handleDefaultSlotChange}></slot>
        </nav>

        <footer part="footer">
          <slot name="footer"></slot>
        </footer>
      </aside>
    `
  }
}
