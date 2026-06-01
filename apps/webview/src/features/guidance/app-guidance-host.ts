import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing, type PropertyValues, type TemplateResult} from 'lit'

import {
  GUIDANCE_ANCHOR_REGISTER_EVENT,
  GUIDANCE_ANCHOR_UNREGISTER_EVENT,
  GUIDANCE_SURFACE_IDS,
} from 'root/core/guidance/guidance.constants'
import {guidanceModel} from 'root/core/guidance/guidance.model'
import type {
  GuidanceActiveState,
  GuidanceAnchorRegistration,
  GuidanceDefinition,
  GuidanceSurfaceId,
} from 'root/core/guidance/guidance.types'
import {i18n} from 'root/i18n'
import {getRouter} from 'root/shared/services/app-context'
import {subscribeAfterInitial} from 'root/shared/services/subscribed-signal'

import {appGuidanceHostStyles} from './app-guidance-host.styles'

const validGuidanceSurfaces = new Set<string>(GUIDANCE_SURFACE_IDS)
const SNOOZE_MS = 24 * 60 * 60 * 1000

type AnchorEventDetail = {
  anchorId?: string
  surface?: string
  owner?: string
  element?: HTMLElement
}

function toAnchorRegistration(detail: AnchorEventDetail): GuidanceAnchorRegistration | null {
  if (!detail.anchorId || !detail.surface || !detail.owner || !detail.element) return null
  if (!validGuidanceSurfaces.has(detail.surface)) return null
  if (!(detail.element instanceof HTMLElement)) return null

  return {
    anchorId: detail.anchorId,
    surface: detail.surface as GuidanceSurfaceId,
    owner: detail.owner,
    element: resolveAnchorSourceElement(detail.element),
  }
}

function resolveAnchorSourceElement(element: HTMLElement): HTMLElement {
  if (element.localName !== 'cv-guidance-anchor') return element

  const child = Array.from(element.children).find(
    (candidate): candidate is HTMLElement => candidate instanceof HTMLElement,
  )

  return child ?? element
}

export class AppGuidanceHost extends ReatomLitElement implements EventListenerObject {
  static elementName = 'app-guidance-host'
  static styles = appGuidanceHostStyles

  private unsubscribeRoute?: () => void
  private lastSeenId: string | null = null

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  connectedCallback(): void {
    super.connectedCallback()
    guidanceModel.connect()
    guidanceModel.setRoute(getRouter().route())
    this.unsubscribeRoute?.()
    this.unsubscribeRoute = subscribeAfterInitial(getRouter().route, () => {
      guidanceModel.setRoute(getRouter().route())
    })
    document.addEventListener(GUIDANCE_ANCHOR_REGISTER_EVENT, this)
    document.addEventListener(GUIDANCE_ANCHOR_UNREGISTER_EVENT, this)
  }

  disconnectedCallback(): void {
    document.removeEventListener(GUIDANCE_ANCHOR_REGISTER_EVENT, this)
    document.removeEventListener(GUIDANCE_ANCHOR_UNREGISTER_EVENT, this)
    this.unsubscribeRoute?.()
    this.unsubscribeRoute = undefined
    this.lastSeenId = null
    guidanceModel.disconnect()
    super.disconnectedCallback()
  }

  handleEvent(event: Event): void {
    if (event.type === GUIDANCE_ANCHOR_REGISTER_EVENT) {
      this.handleAnchorRegister(event as CustomEvent<AnchorEventDetail>)
      return
    }

    if (event.type === GUIDANCE_ANCHOR_UNREGISTER_EVENT) {
      this.handleAnchorUnregister(event as CustomEvent<AnchorEventDetail>)
    }
  }

  protected override updated(props: PropertyValues): void {
    super.updated(props)
    const active = guidanceModel.activeGuidance()
    if (active.kind === 'hidden' || active.kind === 'waiting_for_anchor') return
    if (this.lastSeenId === active.definition.id) return
    this.lastSeenId = active.definition.id
    guidanceModel.markSeen(active.definition.id)
  }

  protected override render() {
    const active = guidanceModel.activeGuidance()
    return html`
      ${this.renderBackdrop(active)}
      ${this.renderActive(active)}
      <span part="fallback-focus" tabindex="-1" aria-hidden="true"></span>
    `
  }

  private handleAnchorRegister(event: CustomEvent<AnchorEventDetail>): void {
    const registration = toAnchorRegistration(event.detail)
    if (!registration) return
    guidanceModel.registerAnchor(registration)
  }

  private handleAnchorUnregister(event: CustomEvent<AnchorEventDetail>): void {
    const registration = toAnchorRegistration(event.detail)
    if (!registration) return
    guidanceModel.unregisterAnchor(registration.anchorId, registration.element)
  }

  private renderActive(active: GuidanceActiveState): TemplateResult | typeof nothing {
    if (active.kind === 'hidden' || active.kind === 'waiting_for_anchor' || active.kind === 'inline') {
      return nothing
    }

    if (active.kind === 'bottom_sheet') {
      return this.renderBottomSheet(active.definition)
    }

    return html`
      <cv-popover
        open
        trigger-mode="external"
        anchor="trigger"
        placement="bottom"
        .sourceEl=${active.anchor.element}
        @toggle=${this.handlePopoverToggle}
      >
        ${this.renderPanel(active.definition, active.kind)}
      </cv-popover>
    `
  }

  private renderBackdrop(active: GuidanceActiveState): TemplateResult | typeof nothing {
    if (active.kind !== 'anchored') return nothing

    return active.definition.dismissible === false
      ? html`<div class="guidance-backdrop" aria-hidden="true"></div>`
      : html`
          <button
            class="guidance-backdrop"
            type="button"
            aria-label=${i18n('guidance:actions:dismiss')}
            @click=${this.handleBackdropClick}
          ></button>
        `
  }

  private renderBottomSheet(definition: GuidanceDefinition): TemplateResult {
    return html`
      <cv-bottom-sheet open no-header @cv-change=${this.handleBottomSheetChange}>
        ${this.renderPanel(definition, 'bottom_sheet')}
      </cv-bottom-sheet>
    `
  }

  private renderPanel(
    definition: GuidanceDefinition,
    stateKind: Exclude<GuidanceActiveState['kind'], 'hidden' | 'waiting_for_anchor' | 'inline'>,
  ): TemplateResult {
    const variant = definition.trigger === 'blocked_action' ? 'blocked' : 'coach-mark'
    const density = definition.presentation === 'tooltip' ? 'compact' : 'comfortable'
    const actionKey =
      definition.primaryActionKey ??
      (definition.completion.kind === 'manual_ack' ? 'guidance:actions:got-it' : undefined)
    const shouldRenderSnooze = definition.dismissible !== false && definition.completion.kind !== 'manual_ack'
    const shouldRenderClose = definition.dismissible !== false

    return html`
      <cv-guidance-panel variant=${variant} density=${density} data-guidance-kind=${stateKind}>
        <span slot="title">${i18n(definition.titleKey)}</span>
        ${shouldRenderClose
          ? html`
              <button
                slot="progress"
                data-guidance-action="close"
                data-guidance-id=${definition.id}
                aria-label=${i18n('guidance:actions:dismiss')}
                @click=${this.handleDismiss}
              >
                <cv-icon name="x" aria-hidden="true"></cv-icon>
              </button>
            `
          : nothing}
        <p>${i18n(guidanceModel.resolveBodyKey(definition))}</p>
        ${actionKey
          ? html`
              <button
                slot="actions"
                data-guidance-action="primary"
                data-guidance-id=${definition.id}
                @click=${this.handleAcknowledge}
              >
                ${i18n(actionKey)}
              </button>
            `
          : nothing}
        ${shouldRenderSnooze
          ? html`
              <button
                slot="actions"
                data-guidance-action="secondary"
                data-guidance-id=${definition.id}
                @click=${this.handleSnooze}
              >
                ${i18n(definition.secondaryActionKey ?? 'guidance:actions:later')}
              </button>
            `
          : nothing}
      </cv-guidance-panel>
    `
  }

  private handlePopoverToggle(event: CustomEvent<{open: boolean}>): void {
    if (event.detail.open) return
    this.dismissActiveGuidance()
  }

  private handleBottomSheetChange(event: CustomEvent<{open: boolean}>): void {
    if (event.detail.open) return
    this.dismissActiveGuidance()
  }

  private handleBackdropClick(): void {
    this.dismissActiveGuidance()
  }

  private handleDismiss(event: Event): void {
    const id = this.getGuidanceId(event)
    if (!id) return
    const anchor = this.currentAnchorElement()
    guidanceModel.dismiss(id)
    this.restoreFocus(anchor)
  }

  private handleSnooze(event: Event): void {
    const id = this.getGuidanceId(event)
    if (!id) return
    const anchor = this.currentAnchorElement()
    guidanceModel.snooze(id, Date.now() + SNOOZE_MS)
    this.restoreFocus(anchor)
  }

  private handleAcknowledge(event: Event): void {
    const id = this.getGuidanceId(event)
    if (!id) return
    const anchor = this.currentAnchorElement()
    guidanceModel.acknowledgeManual(id)
    this.restoreFocus(anchor)
  }

  private dismissActiveGuidance(): void {
    const active = guidanceModel.activeGuidance()
    if (active.kind === 'hidden' || active.kind === 'waiting_for_anchor' || active.kind === 'inline') return
    const anchor = 'anchor' in active ? active.anchor?.element : undefined
    if (active.definition.dismissible === false) return
    guidanceModel.dismiss(active.definition.id)
    this.restoreFocus(anchor)
  }

  private getGuidanceId(event: Event): string | null {
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return null
    return target.dataset['guidanceId'] ?? null
  }

  private currentAnchorElement(): HTMLElement | undefined {
    const active = guidanceModel.activeGuidance()
    if (active.kind !== 'anchored' && active.kind !== 'bottom_sheet') return undefined
    return active.anchor?.element
  }

  private restoreFocus(anchor?: HTMLElement): void {
    if (anchor?.isConnected) {
      anchor.focus()
      return
    }
    this.renderRoot.querySelector<HTMLElement>('[part="fallback-focus"]')?.focus()
  }
}
