import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing, type PropertyValues} from 'lit'
import {CVBreadcrumb} from '@chromvoid/uikit/components/cv-breadcrumb'
import {CVBreadcrumbItem} from '@chromvoid/uikit/components/cv-breadcrumb-item'
import {CVInput, type CVInputInputEvent} from '@chromvoid/uikit/components/cv-input'
import {i18n} from '@project/passmanager/i18n'

import {PMIconPicker} from '../../pm-icon-picker'
import {PMAvatarIcon} from '../../pm-avatar-icon'

export type PMWorkspaceContextItem = {
  label: string
  value: string
  current?: boolean
}

function hasAssignedContent(slot: HTMLSlotElement | null): boolean {
  if (!slot) return false

  return slot
    .assignedNodes({flatten: true})
    .some((node) => node.nodeType === Node.ELEMENT_NODE || node.textContent?.trim())
}

export class PMWorkspaceHeader extends ReatomLitElement {
  static elementName = 'pm-workspace-header'

  static properties = {
    item: {attribute: false},
    contextLabel: {type: String, attribute: 'context-label'},
    contextItems: {attribute: false},
    title: {type: String},
    supportText: {type: String, attribute: 'support-text'},
    avatarLetter: {type: String, attribute: 'avatar-letter'},
    avatarFallbackBg: {type: String, attribute: 'avatar-fallback-bg'},
    avatarIcon: {type: String, attribute: 'avatar-icon'},
    avatarIconRef: {attribute: false},
    avatarInteractive: {type: Boolean, attribute: 'avatar-interactive'},
    editableTitle: {type: Boolean, attribute: 'editable-title'},
    hasContextBand: {type: Boolean, attribute: 'has-context-band'},
    titlePlaceholder: {type: String, attribute: 'title-placeholder'},
    updatedFormatted: {type: String, attribute: 'updated-formatted'},
    createdFormatted: {type: String, attribute: 'created-formatted'},
  }

  declare item: unknown
  declare contextLabel: string
  declare contextItems: PMWorkspaceContextItem[]
  declare title: string
  declare supportText: string
  declare avatarLetter: string
  declare avatarFallbackBg: string
  declare avatarIcon: string
  declare avatarIconRef: string | undefined
  declare avatarInteractive: boolean
  declare editableTitle: boolean
  declare hasContextBand: boolean
  declare titlePlaceholder: string
  declare updatedFormatted: string
  declare createdFormatted: string

  private hasLeadSlot = false
  private hasContextEndSlot = false
  private hasActionsSlot = false
  private hasMetaSlot = false
  private hasTitleEndSlot = false
  private hasSupportSlot = false

  constructor() {
    super()
    this.item = undefined
    this.contextLabel = ''
    this.contextItems = []
    this.title = ''
    this.supportText = ''
    this.avatarLetter = ''
    this.avatarFallbackBg = ''
    this.avatarIcon = ''
    this.avatarIconRef = undefined
    this.avatarInteractive = false
    this.editableTitle = false
    this.hasContextBand = false
    this.titlePlaceholder = ''
    this.updatedFormatted = ''
    this.createdFormatted = ''
  }

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }

    PMAvatarIcon.define()
    PMIconPicker.define()
    CVBreadcrumb.define()
    CVBreadcrumbItem.define()
    CVInput.define()
  }

  static styles = css`
    :host {
      display: block;
      min-inline-size: 0;
      container-type: inline-size;
    }

    [hidden] {
      display: none !important;
    }

    .workspace-header {
      display: grid;
      gap: 12px;
      padding: 2px var(--pm-workspace-header-padding-inline, 4px) 0;
      align-items: start;
      align-content: start;
    }

    .workspace-header.has-inline-support .workspace-title-block {
      align-items: flex-start;
    }

    .workspace-header.has-inline-support .title-content {
      gap: 12px;
      padding-block-start: 4px;
    }

    .workspace-header.has-inline-support .title-support {
      inline-size: 100%;
    }

    .workspace-context-band {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-inline-size: 0;
      color: var(--cv-color-text-secondary);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .workspace-context-band.no-context-end {
      justify-content: flex-start;
    }

    .workspace-context-kicker {
      color: var(--cv-color-primary);
      min-inline-size: 0;
    }

    .workspace-context-kicker cv-breadcrumb {
      display: block;
      min-inline-size: 0;
      overflow: hidden;
      font-size: inherit;
    }

    .workspace-context-kicker cv-breadcrumb::part(base) {
      display: block;
      min-inline-size: 0;
      overflow: hidden;
    }

    .workspace-context-kicker cv-breadcrumb::part(list) {
      flex-wrap: nowrap;
      min-inline-size: 0;
      overflow: hidden;
      white-space: nowrap;
      gap: 4px;
    }

    .workspace-context-kicker cv-breadcrumb-item {
      min-inline-size: 0;
      gap: 4px;
    }

    .workspace-context-kicker cv-breadcrumb-item::part(link) {
      color: inherit;
      display: inline-block;
      max-inline-size: 18ch;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .workspace-context-kicker cv-breadcrumb-item[current]::part(link) {
      font-weight: inherit;
    }

    .workspace-context-end {
      display: flex;
      justify-content: flex-end;
      min-inline-size: 0;
    }

    .workspace-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 24px;
      align-items: start;
      padding-block-end: 12px;
      border-block-end: 1px solid var(--cv-color-border-muted);
    }

    .workspace-head.no-actions {
      grid-template-columns: minmax(0, 1fr);
    }

    .workspace-title-block {
      display: flex;
      align-items: center;
      gap: 14px;
      min-inline-size: 0;
      padding: 20px 0;
    }

    .workspace-leading {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
    }

    .title-avatar-icon {
      inline-size: 56px;
      block-size: 56px;
      flex: 0 0 56px;
      --pm-avatar-icon-size: 24px;
      --pm-avatar-fallback-bg: var(--pm-workspace-header-avatar-fallback-bg, var(--cv-color-primary-dark));
      --pm-avatar-fallback-color: var(
        --pm-workspace-header-avatar-fallback-color,
        var(--cv-color-on-primary)
      );
      --pm-avatar-fallback-border: transparent;
      --pm-avatar-fallback-shadow: none;
      --pm-avatar-image-shadow: var(--pm-workspace-header-avatar-image-shadow, var(--cv-shadow-sm));
    }

    .title-avatar-picker {
      flex: 0 0 56px;
      --pm-avatar-fallback-bg: var(--pm-workspace-header-avatar-fallback-bg, var(--cv-color-primary-dark));
      --pm-avatar-fallback-color: var(
        --pm-workspace-header-avatar-fallback-color,
        var(--cv-color-on-primary)
      );
      --pm-avatar-image-shadow: var(--pm-workspace-header-avatar-image-shadow, var(--cv-shadow-sm));
    }

    .title-content {
      display: grid;
      flex: 1 1 auto;
      gap: 4px;
      min-inline-size: 0;
    }

    .title-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      min-inline-size: 0;
    }

    .title-text {
      flex: 1 1 auto;
      min-inline-size: 0;
      font-size: clamp(1.7rem, 2.1vw, 2.2rem);
      font-weight: var(--cv-font-weight-bold);
      font-family: var(--cv-font-family-body);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      letter-spacing: -0.04em;
      margin: 0;
      line-height: 0.96;
      color: var(--cv-color-text-strong);
    }

    .title-input {
      display: block;
      flex: 1 1 auto;
      inline-size: 100%;
      --cv-input-height: auto;
      --cv-input-padding-inline: 0;
      --cv-input-border-radius: 0;
      --cv-input-border-color: transparent;
      --cv-input-background: transparent;
      --cv-input-color: var(--cv-color-text-strong);
      --cv-input-placeholder-color: var(--cv-color-text-secondary);
      --cv-input-font-size: clamp(1.7rem, 2.1vw, 2.2rem);
      --cv-input-focus-ring: none;
    }

    .title-input::part(form-control-label),
    .title-input::part(form-control-help-text) {
      display: none;
    }

    .title-input::part(base) {
      min-height: 0;
      padding: 0;
      border: none;
      box-shadow: none;
    }

    .title-input::part(input) {
      font-weight: var(--cv-font-weight-bold);
      font-family: var(--cv-font-family-body);
      letter-spacing: -0.04em;
      line-height: 0.96;
    }

    .title-summary {
      margin: 0;
      max-inline-size: 44ch;
      color: var(--cv-color-text-secondary);
      font-size: 15px;
      line-height: 1.35;
    }

    .title-end {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }

    .title-support {
      min-inline-size: 0;
    }

    .workspace-head-actions {
      display: flex;
      justify-content: flex-end;
      min-inline-size: 0;
      padding-block-start: 20px;
    }

    .workspace-side {
      display: grid;
      gap: 12px;
      align-content: start;
      justify-items: end;
    }

    .workspace-summary {
      display: grid;
      gap: 10px;
      min-inline-size: min(100%, 270px);
      justify-items: end;
      text-align: right;
    }

    .workspace-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
      inline-size: 100%;
      min-inline-size: 0;
    }

    .workspace-meta-item {
      display: grid;
      gap: 6px;
      justify-items: start;
      text-align: left;
      font-family: var(--cv-font-family-code);
    }

    .workspace-meta-item span {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--cv-color-text-subtle);
    }

    .workspace-meta-item strong {
      font-size: 12px;
      font-weight: 500;
      color: var(--cv-color-text-strong);
    }

    @container (width < 560px) {
      .workspace-context-band {
        gap: 8px;
        flex-wrap: wrap;
      }

      .workspace-title-block {
        align-items: flex-start;
      }

      .title-text {
        font-size: 1.4rem;
      }

      .workspace-head {
        gap: 16px;
      }
    }
  `

  protected override firstUpdated(changedProperties: PropertyValues): void {
    super.firstUpdated(changedProperties)
    this.syncSlotState()
  }

  private syncSlotState() {
    const nextLead = hasAssignedContent(this.renderRoot.querySelector('slot[name="lead"]'))
    const nextContextEnd = hasAssignedContent(this.renderRoot.querySelector('slot[name="context-end"]'))
    const nextActions = hasAssignedContent(this.renderRoot.querySelector('slot[name="actions"]'))
    const nextMeta = hasAssignedContent(this.renderRoot.querySelector('slot[name="meta"]'))
    const nextTitleEnd = hasAssignedContent(this.renderRoot.querySelector('slot[name="title-end"]'))
    const nextSupport = hasAssignedContent(this.renderRoot.querySelector('slot[name="support"]'))

    if (
      this.hasLeadSlot === nextLead &&
      this.hasContextEndSlot === nextContextEnd &&
      this.hasActionsSlot === nextActions &&
      this.hasMetaSlot === nextMeta &&
      this.hasTitleEndSlot === nextTitleEnd &&
      this.hasSupportSlot === nextSupport
    ) {
      return
    }

    this.hasLeadSlot = nextLead
    this.hasContextEndSlot = nextContextEnd
    this.hasActionsSlot = nextActions
    this.hasMetaSlot = nextMeta
    this.hasTitleEndSlot = nextTitleEnd
    this.hasSupportSlot = nextSupport
    this.requestUpdate()
  }

  private handleSlotChange() {
    this.syncSlotState()
  }

  private getContextItems(): PMWorkspaceContextItem[] {
    if (this.contextItems.length > 0) {
      return this.contextItems.filter((item) => item.label.trim() !== '')
    }

    return this.contextLabel.trim()
      ? [{label: this.contextLabel.trim(), value: this.contextLabel.trim(), current: true}]
      : []
  }

  private getBreadcrumbItemFromEvent(event: Event): CVBreadcrumbItem | null {
    return (
      event
        .composedPath()
        .find(
          (target): target is CVBreadcrumbItem =>
            target instanceof HTMLElement && target.tagName.toLowerCase() === CVBreadcrumbItem.elementName,
        ) ?? null
    )
  }

  private onBreadcrumbClick(event: Event) {
    const breadcrumbItem = this.getBreadcrumbItemFromEvent(event)
    if (!breadcrumbItem) return

    if (event.cancelable) {
      event.preventDefault()
    }

    if (breadcrumbItem.dataset['navCurrent'] === 'true') return

    this.dispatchEvent(
      new CustomEvent<{value: string}>('pm-workspace-header-navigate', {
        detail: {value: breadcrumbItem.dataset['navValue'] ?? ''},
        bubbles: true,
        composed: true,
      }),
    )
  }

  public focusTitleInput(): void {
    const titleInput = this.renderRoot.querySelector('cv-input.title-input') as
      | (HTMLElement & {shadowRoot?: ShadowRoot})
      | null
    const nativeInput = titleInput?.shadowRoot?.querySelector<HTMLInputElement>('input')

    nativeInput?.focus()
  }

  private onTitleInput(event: CVInputInputEvent) {
    this.dispatchEvent(
      new CustomEvent<{value: string}>('pm-workspace-header-title-input', {
        detail: {value: event.detail.value},
        bubbles: true,
        composed: true,
      }),
    )
  }

  private hasBuiltInMeta(): boolean {
    return this.updatedFormatted.trim() !== '' || this.createdFormatted.trim() !== ''
  }

  private renderBuiltInMeta() {
    const items = [
      this.updatedFormatted.trim()
        ? html`
            <div class="workspace-meta-item">
              <span>${i18n('ts:modified')}</span>
              <strong>${this.updatedFormatted}</strong>
            </div>
          `
        : nothing,
      this.createdFormatted.trim()
        ? html`
            <div class="workspace-meta-item">
              <span>${i18n('ts:created')}</span>
              <strong>${this.createdFormatted}</strong>
            </div>
          `
        : nothing,
    ]

    return html`
      <div class="workspace-summary">
        <div class="workspace-meta">${items}</div>
      </div>
    `
  }

  protected override render() {
    const hasSupportText = this.supportText.trim() !== ''
    const contextItems = this.getContextItems()
    const hasContextBand = this.hasContextBand || contextItems.length > 0 || this.hasContextEndSlot
    const hasBuiltInMeta = this.hasBuiltInMeta()
    const hasMeta = this.hasMetaSlot || hasBuiltInMeta

    return html`
      <section class="workspace-header ${this.hasSupportSlot ? 'has-inline-support' : ''}">
        ${hasContextBand
          ? html`
              <div class="workspace-context-band ${this.hasContextEndSlot ? '' : 'no-context-end'}">
                <div class="workspace-context-kicker">
                  <cv-breadcrumb aria-label="Context" @click=${this.onBreadcrumbClick}>
                    ${contextItems.map(
                      (item, index) => html`
                        <cv-breadcrumb-item
                          value=${item.value || `root-${index + 1}`}
                          href="#"
                          ?current=${item.current ?? false}
                          data-nav-current=${item.current ? 'true' : 'false'}
                          data-nav-value=${item.value}
                        >
                          ${item.label}
                        </cv-breadcrumb-item>
                      `,
                    )}
                  </cv-breadcrumb>
                </div>
                <div class="workspace-context-end" ?hidden=${!this.hasContextEndSlot}>
                  <slot name="context-end" @slotchange=${this.handleSlotChange}></slot>
                </div>
              </div>
            `
          : nothing}
        <div class="workspace-head ${this.hasActionsSlot ? '' : 'no-actions'}">
          <div class="workspace-title-block">
            <div class="workspace-leading" ?hidden=${!this.hasLeadSlot}>
              <slot name="lead" @slotchange=${this.handleSlotChange}></slot>
            </div>
            ${this.avatarInteractive
              ? html`
                  <pm-icon-picker
                    class="title-avatar-picker"
                    .iconRef=${this.avatarIconRef}
                    .icon=${this.avatarIcon}
                  ></pm-icon-picker>
                `
              : html`
                  <pm-avatar-icon
                    class="title-avatar-icon"
                    .item=${this.item}
                    .icon=${this.avatarIcon}
                    .iconRef=${this.avatarIconRef}
                    .letter=${this.avatarLetter}
                    .fallbackBg=${this.avatarFallbackBg}
                  ></pm-avatar-icon>
                `}
            <div class="title-content">
              <div class="title-row">
                ${this.editableTitle
                  ? html`
                      <cv-input
                        class="title-input"
                        type="text"
                        size="large"
                        .value=${this.title}
                        placeholder=${this.titlePlaceholder}
                        @cv-input=${this.onTitleInput}
                      ></cv-input>
                    `
                  : html`<h1 class="title-text">${this.title}</h1>`}
                <div class="title-end" ?hidden=${!this.hasTitleEndSlot}>
                  <slot name="title-end" @slotchange=${this.handleSlotChange}></slot>
                </div>
              </div>
              <div class="title-support" ?hidden=${!this.hasSupportSlot}>
                <slot name="support" @slotchange=${this.handleSlotChange}></slot>
              </div>
              ${!this.hasSupportSlot && hasSupportText ? html`<p class="title-summary">${this.supportText}</p>` : nothing}
            </div>
          </div>
          <div class="workspace-head-actions" ?hidden=${!this.hasActionsSlot}>
            <slot name="actions" @slotchange=${this.handleSlotChange}></slot>
          </div>
        </div>
        <div class="workspace-side" ?hidden=${!hasMeta}>
          ${this.hasMetaSlot
            ? html`<slot name="meta" @slotchange=${this.handleSlotChange}></slot>`
            : hasBuiltInMeta
              ? this.renderBuiltInMeta()
              : nothing}
        </div>
      </section>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-workspace-header': PMWorkspaceHeader
  }

  interface HTMLElementEventMap {
    'pm-workspace-header-navigate': CustomEvent<{value: string}>
    'pm-workspace-header-title-input': CustomEvent<{value: string}>
  }
}
