import {
  createFeed,
  type FeedArticle,
  type FeedKeyboardResult,
  type FeedModel,
} from '@chromvoid/headless-ui'
import {css, html, nothing} from 'lit'
import type {PropertyValues} from 'lit'

import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'
import type {CVFeedArticle} from './cv-feed-article'

let cvFeedNonce = 0

export type CVFeedLoadMoreEvent = CustomEvent<Record<string, never>>
export type CVFeedLoadNewerEvent = CustomEvent<Record<string, never>>
export type CVFeedExitAfterEvent = CustomEvent<Record<string, never>>
export type CVFeedExitBeforeEvent = CustomEvent<Record<string, never>>

export interface CVFeedEventMap {
  'cv-load-more': CVFeedLoadMoreEvent
  'cv-load-newer': CVFeedLoadNewerEvent
  'cv-exit-after': CVFeedExitAfterEvent
  'cv-exit-before': CVFeedExitBeforeEvent
}

export class CVFeed extends ReatomLitElement {
  static elementName = 'cv-feed'

  static get properties() {
    return {
      label: {type: String, reflect: true},
      busy: {type: Boolean, reflect: true},
      loading: {type: Boolean, reflect: true},
      empty: {type: Boolean, reflect: true},
      error: {type: Boolean, reflect: true},
    }
  }

  declare label: string
  declare busy: boolean
  declare loading: boolean
  declare empty: boolean
  declare error: boolean

  private readonly idBase = `cv-feed-${++cvFeedNonce}`
  private model: FeedModel
  private observer: IntersectionObserver | null = null

  constructor() {
    super()
    this.label = ''
    this.busy = false
    this.loading = false
    this.empty = true
    this.error = false
    this.model = this.createModel([])
  }

  static styles = [
    css`
      :host {
        display: block;
      }

      [part='base'] {
        display: flex;
        flex-direction: column;
        gap: var(--cv-feed-gap, var(--cv-space-3, 12px));
        padding-block: var(--cv-feed-padding-block, var(--cv-space-3, 12px));
        padding-inline: var(--cv-feed-padding-inline, 0);
      }

      [part='sentinel-top'],
      [part='sentinel-bottom'] {
        height: var(--cv-feed-sentinel-height, 1px);
        overflow: hidden;
      }

      [part='loading-indicator'] {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: var(--cv-feed-loading-min-height, 48px);
      }

      :host([busy]) [part='base'] {
        opacity: 0.8;
      }

      :host([empty]) [part='base'] {
        min-height: 0;
      }

      :host([error]) [part='base'] {
        min-height: 0;
      }

      :host([loading]) [part='base'] {
        /* loading state: host reflects attribute for consumer styling */
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
    this.rebuildModel()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.destroyObserver()
  }

  override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties)

    if (changedProperties.has('label')) {
      this.rebuildModel()
    }

    if (changedProperties.has('busy')) {
      this.model.actions.setBusy(this.busy)
    }

    if (changedProperties.has('loading')) {
      this.model.state.isLoading.set(this.loading)
    }

    if (changedProperties.has('error')) {
      if (this.error) {
        this.model.actions.setError('error')
      } else {
        this.model.actions.clearError()
      }
    }
  }

  override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    this.setupObserver()
  }

  private createModel(articles: FeedArticle[]): FeedModel {
    return createFeed({
      idBase: this.idBase,
      articles,
      ariaLabel: this.label || undefined,
    })
  }

  private getArticleElements(): CVFeedArticle[] {
    return Array.from(this.querySelectorAll('cv-feed-article')) as CVFeedArticle[]
  }

  private rebuildModel(): void {
    const articleElements = this.getArticleElements()
    const previousActiveId = this.model.state.activeArticleId()
    const wasBusy = this.busy
    const wasLoading = this.loading
    const hadError = this.error

    const articles: FeedArticle[] = articleElements.map((el) => ({
      id: el.articleId,
      disabled: el.disabled,
    }))

    this.model = createFeed({
      idBase: this.idBase,
      articles,
      ariaLabel: this.label || undefined,
      initialActiveArticleId: previousActiveId,
    })

    // Restore state
    if (wasBusy) this.model.actions.setBusy(true)
    if (wasLoading) this.model.state.isLoading.set(true)
    if (hadError) this.model.actions.setError('error')

    this.syncArticleElements()
    this.syncHostAttributes()
  }

  private syncArticleElements(): void {
    const articleElements = this.getArticleElements()

    for (const el of articleElements) {
      if (!el.articleId) continue

      try {
        const props = this.model.contracts.getArticleProps(el.articleId)

        el.id = props.id
        el.setAttribute('role', props.role)
        el.setAttribute('tabindex', props.tabindex)
        el.setAttribute('aria-posinset', String(props['aria-posinset']))
        el.setAttribute('aria-setsize', String(props['aria-setsize']))
        el.setAttribute('data-active', props['data-active'])

        if (props['aria-disabled']) {
          el.setAttribute('aria-disabled', props['aria-disabled'])
        } else {
          el.removeAttribute('aria-disabled')
        }

        el.active = props['data-active'] === 'true'
      } catch {
        // Article may not be registered yet
      }
    }
  }

  private syncHostAttributes(): void {
    this.empty = this.model.state.isEmpty()
  }

  private setupObserver(): void {
    this.destroyObserver()

    if (typeof IntersectionObserver === 'undefined') return

    const topSentinel = this.shadowRoot?.querySelector('[part="sentinel-top"]')
    const bottomSentinel = this.shadowRoot?.querySelector('[part="sentinel-bottom"]')

    if (!topSentinel && !bottomSentinel) return

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue

          if (entry.target === bottomSentinel && this.model.state.canLoadMore()) {
            this.model.actions.loadMore()
            this.dispatchEvent(
              new CustomEvent<CVFeedLoadMoreEvent['detail']>('cv-load-more', {
                detail: {},
                bubbles: true,
                composed: true,
              }),
            )
          }

          if (entry.target === topSentinel && this.model.state.canLoadNewer()) {
            this.model.actions.loadNewer()
            this.dispatchEvent(
              new CustomEvent<CVFeedLoadNewerEvent['detail']>('cv-load-newer', {
                detail: {},
                bubbles: true,
                composed: true,
              }),
            )
          }
        }
      },
      {threshold: 0},
    )

    if (topSentinel) this.observer.observe(topSentinel)
    if (bottomSentinel) this.observer.observe(bottomSentinel)
  }

  private destroyObserver(): void {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
  }

  private handleKeyDown(event: KeyboardEvent) {
    const result: FeedKeyboardResult = this.model.actions.handleKeyDown({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    })

    if (result === null) return

    event.preventDefault()

    if (result === 'next' || result === 'prev') {
      this.syncArticleElements()
      this.requestUpdate()
    } else if (result === 'exit-after') {
      this.dispatchEvent(
        new CustomEvent<CVFeedExitAfterEvent['detail']>('cv-exit-after', {
          detail: {},
          bubbles: true,
          composed: true,
        }),
      )
    } else if (result === 'exit-before') {
      this.dispatchEvent(
        new CustomEvent<CVFeedExitBeforeEvent['detail']>('cv-exit-before', {
          detail: {},
          bubbles: true,
          composed: true,
        }),
      )
    }
  }

  private handleSlotChange() {
    const articleElements = this.getArticleElements()
    const articles: FeedArticle[] = articleElements.map((el) => ({
      id: el.articleId,
      disabled: el.disabled,
    }))

    // Check if articles changed
    const currentIds = this.model.state.articleIds()
    const newIds = articles.map((a) => a.id)
    const changed =
      currentIds.length !== newIds.length || currentIds.some((id, i) => id !== newIds[i])

    if (changed) {
      const previousActiveId = this.model.state.activeArticleId()
      const wasBusy = this.busy
      const wasLoading = this.loading
      const hadError = this.error

      this.model = createFeed({
        idBase: this.idBase,
        articles,
        ariaLabel: this.label || undefined,
        initialActiveArticleId: previousActiveId,
      })

      if (wasBusy) this.model.actions.setBusy(true)
      if (wasLoading) this.model.state.isLoading.set(true)
      if (hadError) this.model.actions.setError('error')

      this.syncArticleElements()
      this.syncHostAttributes()
      this.requestUpdate()
    }
  }

  protected override render() {
    const feedProps = this.model.contracts.getFeedProps()

    return html`
      <div
        id=${feedProps.id}
        role=${feedProps.role}
        aria-label=${feedProps['aria-label'] ?? nothing}
        aria-labelledby=${feedProps['aria-labelledby'] ?? nothing}
        aria-busy=${feedProps['aria-busy']}
        part="base"
        @keydown=${this.handleKeyDown}
      >
        <div part="sentinel-top"></div>
        ${this.loading
          ? html`<div part="loading-indicator" aria-hidden="true">
              <slot name="loading"></slot>
            </div>`
          : nothing}
        ${this.empty ? html`<slot name="empty" part="empty"></slot>` : nothing}
        ${this.error ? html`<slot name="error" part="error"></slot>` : nothing}
        <slot @slotchange=${this.handleSlotChange}></slot>
        <div part="sentinel-bottom"></div>
      </div>
    `
  }
}
