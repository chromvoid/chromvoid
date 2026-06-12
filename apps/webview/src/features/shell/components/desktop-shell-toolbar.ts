import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, type PropertyValues} from 'lit'

import {sharedStyles} from 'root/shared/ui/shared-styles'

function hasAssignedContent(slot: HTMLSlotElement | null): boolean {
  if (!slot) return false

  return slot
    .assignedNodes({flatten: true})
    .some((node) => node.nodeType === Node.ELEMENT_NODE || node.textContent?.trim())
}

export class DesktopShellToolbar extends ReatomLitElement {
  static elementName = 'desktop-shell-toolbar'

  private hasLeadingSlot = false
  private hasTitleSlot = false
  private hasSubtitleSlot = false
  private hasStartSlot = false
  private hasCenterSlot = false
  private hasActionsSlot = false
  private hasEndSlot = false

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        min-inline-size: 0;
        color: var(--cv-color-text);
        background: var(--cv-color-surface);
        border-block-end: 1px solid
          var(--desktop-shell-toolbar-border-color, var(--app-toolbar-border-color, var(--cv-color-border-muted)));
        contain: style;
        container-type: inline-size;
        --desktop-shell-toolbar-min-block-size: var(--app-toolbar-min-block-size, 64px);
        --desktop-shell-toolbar-padding-block: var(--app-toolbar-padding-block, var(--app-spacing-4));
        --desktop-shell-toolbar-padding-inline: var(--app-toolbar-padding-inline, var(--app-spacing-4));
        --desktop-shell-toolbar-padding-inline-wide: var(
          --app-toolbar-padding-inline-wide,
          var(--app-spacing-6)
        );
        --desktop-shell-toolbar-row-gap: var(--app-toolbar-row-gap, var(--app-spacing-3));
        --desktop-shell-toolbar-column-gap: var(--app-toolbar-column-gap, var(--app-spacing-4));
      }

      .toolbar {
        display: flex;
        align-items: center;
        gap: var(--desktop-shell-toolbar-row-gap) var(--desktop-shell-toolbar-column-gap);
        min-inline-size: 0;
        min-block-size: var(--desktop-shell-toolbar-min-block-size);
        padding: var(--desktop-shell-toolbar-padding-block) var(--desktop-shell-toolbar-padding-inline);
        box-sizing: border-box;
      }

      .toolbar-primary,
      .toolbar-secondary {
        display: grid;
        align-items: center;
        gap: var(--app-spacing-1);
        min-inline-size: 0;
      }

      .toolbar-primary {
        flex: 1 1 0;
      }

      .toolbar-secondary {
        flex: 0 0 auto;
        justify-items: end;
        margin-inline-start: auto;
      }

      .toolbar-primary[hidden],
      .toolbar-secondary[hidden],
      .leading[hidden],
      .heading[hidden],
      .title[hidden],
      .subtitle[hidden],
      .start[hidden],
      .center[hidden],
      .actions[hidden],
      .end[hidden] {
        display: none;
      }

      .leading,
      .title,
      .subtitle,
      .start,
      .center,
      .actions,
      .end {
        min-inline-size: 0;
      }

      .leading {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
      }

      .heading {
        display: grid;
        gap: 2px;
        min-inline-size: 0;
      }

      .title {
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-base);
        font-weight: var(--cv-font-weight-semibold);
        line-height: 1.2;
      }

      .subtitle {
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-xs);
        line-height: 1.35;
      }

      .start {
        display: flex;
        align-items: center;
        gap: var(--app-spacing-2);
      }

      .center {
        flex: 1 1 0;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: var(--app-spacing-2);
        min-inline-size: 0;
      }

      .actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: var(--app-spacing-2);
      }

      .end {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: var(--app-spacing-2);
      }

      ::slotted(*) {
        min-inline-size: 0;
      }

      ::slotted([slot='center']) {
        display: block;
        inline-size: 100%;
      }

      @container (width >= 1200px) {
        .toolbar {
          padding-inline: var(--desktop-shell-toolbar-padding-inline-wide);
        }
      }

      @container (width < 900px) {
        .toolbar {
          flex-wrap: wrap;
        }

        .toolbar-primary {
          order: 1;
        }

        .toolbar-secondary {
          order: 2;
        }

        .center {
          order: 3;
          flex-basis: 100%;
          justify-content: stretch;
        }
      }

      :host([two-row]) .toolbar {
        display: grid;
        grid-template-columns: auto minmax(0, max-content) auto;
        grid-template-areas:
          'leading leading actions'
          'start center end';
        align-items: center;
        gap: var(--desktop-shell-toolbar-two-row-row-gap, var(--app-toolbar-two-row-row-gap, var(--app-spacing-4)))
          var(
            --desktop-shell-toolbar-two-row-column-gap,
            var(--app-toolbar-two-row-column-gap, var(--desktop-shell-toolbar-column-gap))
          );
      }

      :host([two-row]) .toolbar-primary:not([hidden]),
      :host([two-row]) .toolbar-secondary:not([hidden]) {
        display: contents;
      }

      :host([two-row]) .leading {
        grid-area: leading;
      }

      :host([two-row]) .heading {
        grid-area: leading;
      }

      :host([two-row]) .start {
        grid-area: start;
        align-self: center;
      }

      :host([two-row]) .center {
        grid-area: center;
        justify-content: stretch;
      }

      :host([two-row]) .actions {
        grid-area: actions;
        align-self: center;
      }

      :host([two-row]) .end {
        grid-area: end;
        align-self: center;
      }

      @container (width < 900px) {
        :host([two-row]) .toolbar {
          grid-template-columns: minmax(0, 1fr) auto;
          grid-template-areas:
            'leading actions'
            'start end'
            'center center';
        }

        :host([two-row]) .center {
          justify-content: stretch;
        }
      }
    `,
  ]

  protected override firstUpdated(changedProperties: PropertyValues): void {
    super.firstUpdated(changedProperties)
    this.syncSlotState()
  }

  private syncSlotState() {
    const nextLeading = hasAssignedContent(this.renderRoot.querySelector('slot[name="leading"]'))
    const nextTitle = hasAssignedContent(this.renderRoot.querySelector('slot[name="title"]'))
    const nextSubtitle = hasAssignedContent(this.renderRoot.querySelector('slot[name="subtitle"]'))
    const nextStart = hasAssignedContent(this.renderRoot.querySelector('slot[name="start"]'))
    const nextCenter = hasAssignedContent(this.renderRoot.querySelector('slot[name="center"]'))
    const nextActions = hasAssignedContent(this.renderRoot.querySelector('slot[name="actions"]'))
    const nextEnd = hasAssignedContent(this.renderRoot.querySelector('slot[name="end"]'))

    if (
      this.hasLeadingSlot === nextLeading &&
      this.hasTitleSlot === nextTitle &&
      this.hasSubtitleSlot === nextSubtitle &&
      this.hasStartSlot === nextStart &&
      this.hasCenterSlot === nextCenter &&
      this.hasActionsSlot === nextActions &&
      this.hasEndSlot === nextEnd
    ) {
      return
    }

    this.hasLeadingSlot = nextLeading
    this.hasTitleSlot = nextTitle
    this.hasSubtitleSlot = nextSubtitle
    this.hasStartSlot = nextStart
    this.hasCenterSlot = nextCenter
    this.hasActionsSlot = nextActions
    this.hasEndSlot = nextEnd
    this.requestUpdate()
  }

  private handleSlotChange() {
    this.syncSlotState()
  }

  protected render() {
    const hasHeading = this.hasTitleSlot || this.hasSubtitleSlot
    const hasPrimary = this.hasLeadingSlot || hasHeading || this.hasStartSlot
    const hasSecondary = this.hasActionsSlot || this.hasEndSlot

    return html`
      <div class="toolbar">
        <div class="toolbar-primary" ?hidden=${!hasPrimary}>
          <div class="leading" ?hidden=${!this.hasLeadingSlot}>
            <slot name="leading" @slotchange=${this.handleSlotChange}></slot>
          </div>
          <div class="heading" ?hidden=${!hasHeading}>
            <div class="title" ?hidden=${!this.hasTitleSlot}>
              <slot name="title" @slotchange=${this.handleSlotChange}></slot>
            </div>
            <div class="subtitle" ?hidden=${!this.hasSubtitleSlot}>
              <slot name="subtitle" @slotchange=${this.handleSlotChange}></slot>
            </div>
          </div>
          <div class="start" ?hidden=${!this.hasStartSlot}>
            <slot name="start" @slotchange=${this.handleSlotChange}></slot>
          </div>
        </div>
        <div class="center" ?hidden=${!this.hasCenterSlot}>
          <slot name="center" @slotchange=${this.handleSlotChange}></slot>
        </div>
        <div class="toolbar-secondary" ?hidden=${!hasSecondary}>
          <div class="actions" ?hidden=${!this.hasActionsSlot}>
            <slot name="actions" @slotchange=${this.handleSlotChange}></slot>
          </div>
          <div class="end" ?hidden=${!this.hasEndSlot}>
            <slot name="end" @slotchange=${this.handleSlotChange}></slot>
          </div>
        </div>
      </div>
    `
  }
}
