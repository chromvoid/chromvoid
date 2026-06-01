import {nothing} from 'lit'
import {repeat} from 'lit/directives/repeat.js'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {getImageGalleryDebugTime, logImageGalleryDebug} from '../image-gallery-debug'
import {imageGalleryMobileTrackStyles} from './image-gallery-mobile.styles'
import type {MobileGalleryTrackSlot} from './image-gallery-mobile.model'
import type {MobileGalleryImageMeta} from './image-gallery-mobile.types'

export type MobileGalleryTrackImageMeta = MobileGalleryImageMeta

type MobileGalleryTrackModel = {
  computed?: {
    trackSlots?: () => readonly Partial<MobileGalleryTrackSlot>[]
  }
  state?: {
    trackSlots?: () => readonly Partial<MobileGalleryTrackSlot>[]
  }
}

type VisibleLoaderState = {
  stateKey: string
  shownAt: number
}

export class ImageGalleryMobileTrack extends ReatomLitElement {
  static elementName = 'image-gallery-mobile-track'

  static get properties() {
    return {
      images: {attribute: false},
      mobileModel: {attribute: false},
    }
  }

  static styles = imageGalleryMobileTrackStyles

  declare images: MobileGalleryTrackImageMeta[]
  declare mobileModel: MobileGalleryTrackModel | null
  private readonly visibleLoaderStates = new Map<string, VisibleLoaderState>()

  constructor() {
    super()
    this.images = []
    this.mobileModel = null
  }

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  getTrackElement() {
    return this.renderRoot.querySelector<HTMLElement>('.track')
  }

  protected override render() {
    if (!this.mobileModel) {
      return nothing
    }

    const slots = this.getTrackSlots()
    this.logLoaderTransitions(slots)
    return html`
      <div class="track">
        ${repeat(slots, (slot) => String(slot.slotId), (slot) => this.renderPanel(slot))}
      </div>
    `
  }

  private getTrackSlots() {
    return this.mobileModel?.computed?.trackSlots?.() ?? this.mobileModel?.state?.trackSlots?.() ?? []
  }

  private logLoaderTransitions(slots: readonly Partial<MobileGalleryTrackSlot>[]) {
    const now = getImageGalleryDebugTime()
    const seenSlotIds = new Set<string>()

    for (const slot of slots) {
      const slotId = String(slot.slotId ?? '')
      if (!slotId) {
        continue
      }

      seenSlotIds.add(slotId)
      const stateKey = [
        slot.role ?? 'current',
        slot.imageIndex ?? 'none',
        slot.imageId ?? 'none',
      ].join(':')
      const loadingVisible = Boolean(slot.loaderVisible)
      const existing = this.visibleLoaderStates.get(slotId)

      if (loadingVisible) {
        if (!existing || existing.stateKey !== stateKey) {
          if (existing) {
            this.logLoaderHidden(slotId, slot, existing, now, 'slot-changed')
          }

          const nextState = {
            stateKey,
            shownAt: now,
          }
          this.visibleLoaderStates.set(slotId, nextState)
          logImageGalleryDebug('mobile-track', 'loader.visible', {
            slotId,
            role: slot.role ?? null,
            imageIndex: slot.imageIndex ?? null,
            imageId: slot.imageId ?? null,
          })
        }
        continue
      }

      if (existing) {
        this.visibleLoaderStates.delete(slotId)
        this.logLoaderHidden(
          slotId,
          slot,
          existing,
          now,
          slot.error ? 'error' : slot.src ? 'src' : 'not-loading',
        )
      }
    }

    for (const [slotId, state] of [...this.visibleLoaderStates]) {
      if (seenSlotIds.has(slotId)) {
        continue
      }

      this.visibleLoaderStates.delete(slotId)
      logImageGalleryDebug('mobile-track', 'loader.hidden', {
        slotId,
        role: null,
        imageIndex: null,
        imageId: null,
        reason: 'slot-removed',
        loadingAgeMs: Math.round(now - state.shownAt),
      })
    }
  }

  private logLoaderHidden(
    slotId: string,
    slot: Partial<MobileGalleryTrackSlot>,
    state: VisibleLoaderState,
    now: number,
    reason: string,
  ) {
    logImageGalleryDebug('mobile-track', 'loader.hidden', {
      slotId,
      role: slot.role ?? null,
      imageIndex: slot.imageIndex ?? null,
      imageId: slot.imageId ?? null,
      reason,
      loadingAgeMs: Math.round(now - state.shownAt),
    })
  }

  private handleImageError(e: Event) {
    const image = e.currentTarget as HTMLImageElement
    const imageId = Number(image.dataset['imageId'])
    this.dispatchEvent(
      new CustomEvent('image-render-error', {
        detail: {
          imageId: Number.isFinite(imageId) ? imageId : null,
          sourceUrl: image.currentSrc || image.src,
        },
        bubbles: true,
        composed: true,
      }),
    )
  }

  private renderPanel(slot: Partial<MobileGalleryTrackSlot>) {
    const role = slot.role ?? 'current'
    const imageIndex = typeof slot.imageIndex === 'number' ? slot.imageIndex : null
    const imageMeta = imageIndex !== null ? this.images[imageIndex] : undefined
    const src = slot.src ?? null
    const hasSrc = Boolean(src)
    const error = slot.error ?? null
    const loading = Boolean(slot.loaderVisible)

    return html`
      <div
        class="panel ${role} ${slot.locked ? 'locked' : ''}"
        data-slot-id=${String(slot.slotId)}
        data-role=${role}
        data-image-index=${imageIndex === null ? '' : String(imageIndex)}
        data-image-id=${slot.imageId === null || slot.imageId === undefined ? '' : String(slot.imageId)}
      >
        <div class="image-shell ${role === 'current' ? 'active' : ''}" ?hidden=${!hasSrc}>
          ${src
            ? html`<img
                class="gallery-image"
                src=${src}
                alt=${imageMeta?.name ?? ''}
                data-image-id=${slot.imageId ?? ''}
                decoding="async"
                @error=${this.handleImageError}
              />`
            : nothing}
        </div>
        ${error && !hasSrc
          ? html`<div class="panel-error" role="status">${error}</div>`
          : html`<div class="loading-spinner" ?hidden=${!loading}></div>`}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'image-gallery-mobile-track': ImageGalleryMobileTrack
  }
}
