import {css, nothing, type PropertyValues} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {defaultLogger} from 'root/core/logger'
import type {PasswordManagerLayoutModel, PMDesktopToolbarSection} from './password-manager-layout.model'

export class PMDesktopToolbar extends ReatomLitElement {
  static elementName = 'pm-desktop-toolbar'

  static properties = {
    model: {attribute: false},
  }

  static define(): void {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }

  static styles = [
    css`
      :host {
        display: block;
        min-block-size: 0;
      }

      .toolbar-row {
        position: relative;
        padding: 0 4px 12px;
        min-block-size: 0;
      }

      .toolbar-row::after {
        content: '';
        position: absolute;
        inset-inline: 6px;
        inset-block-end: 0;
        block-size: 1px;
        background: var(--cv-gradient-divider-subtle);
      }

      .toolbar-shell {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        padding: 0;
        border: none;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        container-name: passwords-toolbar;
        container-type: inline-size;
      }

      .toolbar-shell-side {
        display: flex;
        align-items: flex-start;
        gap: var(--cv-space-4);
        min-inline-size: 0;
        min-width: 0;
      }

      .toolbar-shell-side-start {
        grid-column: 1;
      }

      .toolbar-shell-side-end {
        grid-column: 3;
        justify-content: flex-end;
      }

      .toolbar-side {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        min-inline-size: 0;
        min-width: 0;
        flex-wrap: nowrap;
      }

      .toolbar-side-end {
        margin-inline-start: auto;
        justify-content: flex-end;
        overflow: hidden;
      }

      .toolbar-cluster {
        display: grid;
        gap: 5px;
        min-inline-size: 0;
        min-width: 0;
      }

      .toolbar-cluster-label {
        padding-inline: 4px;
        font-size: 9px;
        font-family: var(--cv-font-family-code);
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--cv-color-text-subtle);
        white-space: nowrap;
      }

      .toolbar-cluster[data-state='inactive'] {
        opacity: 0.48;
      }

      .toolbar-cluster[data-state='inactive'] .toolbar-cluster-label {
        color: var(--cv-color-text-subtle);
      }

      .toolbar-actions {
        --pm-toolbar-gap: 6px;
        display: inline-flex;
        flex-wrap: nowrap;
        align-items: center;
        justify-content: flex-start;
        gap: var(--pm-toolbar-gap);
        min-inline-size: 0;
      }

      .toolbar-button {
        font-size: var(--cv-font-size-xs);
        letter-spacing: -0.01em;
        flex-shrink: 0;
      }

      .toolbar-button::part(base) {
        min-block-size: 26px;
        padding-inline: 8px;
      }

      .toolbar-button::part(label) {
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .toolbar-button:hover {
        transform: translateY(-1px);
      }

      .toolbar-button cv-icon {
        inline-size: 14px;
        block-size: 14px;
      }

      .toolbar-button[icon-only]::part(base) {
        padding-inline: 6px;
      }

      .toolbar-slotted {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }

      .toolbar-slotted[hidden] {
        display: none;
      }

      .toolbar-slotted slot[name='buttons']::slotted(*) {
        flex-shrink: 0;
      }

      .toolbar-shell-side-start .toolbar-cluster + .toolbar-cluster,
      .toolbar-side-end .toolbar-cluster + .toolbar-cluster {
        position: relative;
        margin-inline-start: 2px;
        padding-inline-start: 14px;
      }

      .toolbar-shell-side-start .toolbar-cluster + .toolbar-cluster::before,
      .toolbar-side-end .toolbar-cluster + .toolbar-cluster::before {
        content: '';
        position: absolute;
        inset-inline-start: 0;
        inset-block-start: 15px;
        inline-size: 1px;
        block-size: calc(100% - 18px);
        background: var(--cv-color-border-glass);
      }

      @container passwords-toolbar (width < 1024px) {
        .toolbar-row {
          padding-inline: 0;
        }

        .toolbar-shell {
          padding: 0;
        }

        .toolbar-side {
          gap: 10px;
        }

        .toolbar-actions {
          --pm-toolbar-gap: 5px;
        }

        .toolbar-button {
          font-size: 11px;
        }

        .toolbar-button::part(base) {
          min-block-size: 24px;
          padding-inline: 7px;
        }

        .toolbar-button cv-icon {
          inline-size: 13px;
          block-size: 13px;
        }

        .toolbar-cluster {
          gap: 3px;
        }

        .toolbar-cluster-label {
          padding-inline: 3px;
          font-size: 8px;
        }
      }

      @container passwords-toolbar (width < 760px) {
        .toolbar-actions {
          --pm-toolbar-gap: 4px;
        }

        .toolbar-button {
          font-size: 10px;
        }

        .toolbar-button::part(base) {
          min-block-size: 23px;
          padding-inline: 6px;
        }

        .toolbar-button::part(label) {
          display: none;
        }

        .toolbar-cluster-label {
          letter-spacing: 0.12em;
        }
      }

      @container passwords-toolbar (width < 660px) {
        .toolbar-row {
          padding-inline: 0;
        }

        .toolbar-shell {
          padding: 0;
        }

        .toolbar-side {
          gap: 6px;
        }

        .toolbar-cluster {
          gap: 2px;
        }

        .toolbar-actions {
          --pm-toolbar-gap: 3px;
        }

        .toolbar-button::part(base) {
          min-block-size: 22px;
          padding-inline: 5px;
        }

        .toolbar-button cv-icon {
          inline-size: 12px;
          block-size: 12px;
        }
      }
    `,
  ]

  declare model: PasswordManagerLayoutModel | undefined

  private readonly logger = defaultLogger
  private hasToolbarButtons = false

  override updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties)
    this.syncToolbarButtonsSlot()
  }

  private syncToolbarButtonsSlot(): void {
    const slot = this.shadowRoot?.querySelector('slot[name="buttons"]') as HTMLSlotElement | null
    const next = (slot?.assignedElements({flatten: true}).length ?? 0) > 0
    if (this.hasToolbarButtons === next) return

    this.hasToolbarButtons = next
    this.requestUpdate()
  }

  private onToolbarButtonsSlotChange(): void {
    this.syncToolbarButtonsSlot()
  }

  private onToolbarButtonClick(event: Event): void {
    const button = event.currentTarget
    if (!(button instanceof HTMLElement)) {
      this.logger.debug('[PassManager][DesktopToolbar] click ignored: no button target')
      return
    }

    const action = button.dataset['action']
    const model = this.model
    if (!model || !model.isDesktopToolbarAction(action)) {
      this.logger.debug('[PassManager][DesktopToolbar] click ignored: missing action id')
      return
    }

    if (button.hasAttribute('disabled')) {
      this.logger.debug('[PassManager][DesktopToolbar] click blocked: disabled', {
        action,
        context: model.getDesktopToolbarContext(),
      })
      return
    }

    model.executeDesktopToolbarAction(action)
  }

  private renderToolbarButton(action: PMDesktopToolbarSection['actions'][number]) {
    const button = html`
      <cv-button
        type="button"
        size="small"
        variant=${action.danger ? 'danger' : 'default'}
        class="toolbar-button"
        data-action=${action.id}
        ?disabled=${action.disabled ?? false}
        ?icon-only=${action.iconOnly ?? false}
        title=${action.label}
        aria-label=${action.label}
        @click=${this.onToolbarButtonClick}
      >
        <cv-icon slot="prefix" name=${action.icon}></cv-icon>
        ${action.iconOnly ? nothing : action.label}
      </cv-button>
    `
    return button
  }

  private renderToolbarCluster(section: PMDesktopToolbarSection) {
    const state = section.state ?? 'active'

    return html`
      <div class="toolbar-cluster" data-state=${state}>
        <div class="toolbar-cluster-label">${section.label}</div>
        <div class="toolbar-actions">
          ${section.actions.map((action) => this.renderToolbarButton(action))}
        </div>
      </div>
    `
  }

  override render() {
    const model = this.model
    if (!model) {
      return nothing
    }

    const sections = model.getDesktopToolbarSections()
    const [navigationSection, vaultSection, createSection, selectionSection] = sections
    if (!navigationSection || !vaultSection || !createSection || !selectionSection) {
      return nothing
    }

    return html`
      <div class="toolbar-row">
        <div class="toolbar-shell">
          <div class="toolbar-shell-side toolbar-shell-side-start">
            <div class="toolbar-side toolbar-side-start">
              ${this.renderToolbarCluster(navigationSection)}
              ${this.renderToolbarCluster(vaultSection)}
            </div>
          </div>
          <div class="toolbar-shell-side toolbar-shell-side-end">
            <div class="toolbar-side toolbar-side-end">
              <cv-guidance-anchor anchor-id="passwords.create-entry" surface="passwords" owner="passmanager">
                ${this.renderToolbarCluster(createSection)}
              </cv-guidance-anchor>
              ${this.renderToolbarCluster(selectionSection)}
              <div class="toolbar-slotted" ?hidden=${!this.hasToolbarButtons}>
                <slot name="buttons" @slotchange=${this.onToolbarButtonsSlotChange}></slot>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  }
}
