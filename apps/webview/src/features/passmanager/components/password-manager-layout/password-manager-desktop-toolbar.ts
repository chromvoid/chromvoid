import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVGuidanceAnchor} from '@chromvoid/uikit/components/cv-guidance-anchor'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVMenuButton, type CVMenuButtonInputEvent} from '@chromvoid/uikit/components/cv-menu-button'
import {CVMenuItem} from '@chromvoid/uikit/components/cv-menu-item'
import {css, nothing} from 'lit'
import {keyed} from 'lit/directives/keyed.js'

import {i18n as passmanagerI18n} from '@project/passmanager/i18n'
import {defaultLogger} from 'root/core/logger'
import {i18n as appI18n} from 'root/i18n'
import {sharedStyles} from 'root/shared/ui/shared-styles'
import {DesktopShellToolbar} from 'root/features/shell/components/desktop-shell-toolbar'
import {envRuntimeI18n} from '../env-runtime/env-runtime.i18n'
import {PMQuickFilters} from '../list/quick-filters'
import {PMSearch} from '../list/search'
import {SortControls} from '../list/sort-controls'
import {PMOtpQuickViewSearch} from '../otp-quick-view/otp-quick-view-search'
import type {PasswordManagerLayoutModel, PMDesktopToolbarSection} from './password-manager-layout.model'

type PMDesktopToolbarAction = PMDesktopToolbarSection['actions'][number]

export class PasswordManagerDesktopToolbar extends ReatomLitElement {
  static elementName = 'password-manager-desktop-toolbar'

  static properties = {
    model: {attribute: false},
  }

  declare model: PasswordManagerLayoutModel | undefined

  constructor() {
    super()
    this.model = undefined
  }

  static define(): void {
    CVButton.define()
    CVGuidanceAnchor.define()
    CVIcon.define()
    CVMenuButton.define()
    CVMenuItem.define()
    DesktopShellToolbar.define()
    PMSearch.define()
    PMQuickFilters.define()
    SortControls.define()
    PMOtpQuickViewSearch.define()
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
        contain: style;
        container-type: inline-size;
        --app-dashboard-header-control-block-size: calc(
          var(--app-toolbar-control-block-size) - var(--cv-space-2)
        );
        --pm-toolbar-control-block-size: var(--app-dashboard-header-control-block-size);
        --pm-toolbar-control-radius: var(--app-dashboard-header-control-radius);
        --pm-toolbar-control-padding-inline: var(--app-dashboard-header-control-padding-inline);
        --pm-toolbar-control-font-size: var(--app-dashboard-header-control-font-size);
        --pm-toolbar-control-font-weight: var(--app-dashboard-header-control-font-weight);
        --pm-toolbar-control-gap: var(--app-dashboard-header-control-gap);
      }

      desktop-shell-toolbar {
        min-inline-size: 0;
        --app-toolbar-min-block-size: calc(
          var(--app-dashboard-header-control-block-size) + var(--cv-space-6)
        );
        --app-toolbar-padding-block: 0;
        --app-toolbar-padding-inline: var(--cv-space-3);
        --app-toolbar-padding-inline-wide: var(--cv-space-3);
      }

      cv-button {
        --cv-button-min-height: var(--app-dashboard-header-control-block-size);
        --cv-button-border-radius: var(--app-dashboard-header-control-radius);
        --cv-button-padding-block: 0;
        --cv-button-padding-inline: var(--app-dashboard-header-control-padding-inline);
        --cv-button-font-size: var(--app-dashboard-header-control-font-size);
        --cv-button-font-weight: var(--app-dashboard-header-control-font-weight);
        --cv-button-gap: var(--app-dashboard-header-control-gap);
      }

      cv-menu-button {
        --cv-menu-button-min-height: var(--app-dashboard-header-control-block-size);
        --cv-menu-button-border-radius: var(--app-dashboard-header-control-radius);
        --cv-menu-button-menu-align: end;
        --cv-menu-button-menu-min-inline-size: 240px;
        --cv-menu-button-menu-offset: var(--app-spacing-2);
        --cv-menu-button-menu-z-index: var(--cv-z-overlay, 300);
      }

      .toolbar-search {
        flex: 0 1 auto;
        inline-size: clamp(190px, 24cqi, 340px);
        min-inline-size: 190px;
        max-block-size: min(52vh, 320px);
      }

      .toolbar-controls {
        display: grid;
        grid-template-columns: minmax(0, 1fr) max-content;
        align-items: center;
        gap: var(--app-spacing-2);
        inline-size: 100%;
        min-inline-size: 0;
      }

      .toolbar-quick-filters {
        min-inline-size: 0;
      }

      .toolbar-sort-controls {
        inline-size: 312px;
        max-inline-size: 312px;
      }

      .toolbar-actions {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: var(--app-spacing-2);
        min-inline-size: 0;
      }

      .toolbar-primary-action,
      .toolbar-actions-menu {
        flex: 0 0 auto;
      }

      .toolbar-actions-menu::part(trigger) {
        align-items: center;
        min-inline-size: var(--pm-toolbar-control-block-size);
        min-block-size: var(--pm-toolbar-control-block-size);
      }

      .toolbar-actions-menu::part(label),
      .toolbar-actions-menu::part(dropdown-icon) {
        display: none;
      }

      .toolbar-menu-item[data-danger='true']::part(base) {
        color: var(--cv-color-danger);
      }

      @container (width < 1040px) {
        .toolbar-list-title,
        .toolbar-subtitle {
          position: absolute;
          inline-size: 1px;
          block-size: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      }

      @container (width < 980px) {
        .toolbar-primary-action {
          --cv-button-padding-inline: 0;
          --cv-button-gap: 0;
          inline-size: var(--pm-toolbar-control-block-size);
        }

        .toolbar-primary-action-label {
          display: none;
        }
      }
    `,
  ]

  private handleToolbarButtonClick(event: Event): void {
    const button = event.currentTarget
    if (!(button instanceof HTMLElement)) {
      defaultLogger.debug('[PassManager][DesktopToolbar] click ignored: no button target')
      return
    }

    const action = button.dataset['action']
    const model = this.model
    if (!model?.isDesktopToolbarAction(action)) {
      defaultLogger.debug('[PassManager][DesktopToolbar] click ignored: missing action id')
      return
    }

    if (button.hasAttribute('disabled')) {
      defaultLogger.debug('[PassManager][DesktopToolbar] click blocked: disabled', {
        action,
        context: model.getDesktopToolbarContext(),
      })
      return
    }

    model.executeDesktopToolbarAction(action)
  }

  private handleActionsMenuInput(event: CVMenuButtonInputEvent): void {
    const menu = event.currentTarget as HTMLElementTagNameMap['cv-menu-button']
    if (event.detail.open) {
      this.resetActionsMenu(menu)
      return
    }

    const action = event.detail.value ?? undefined
    menu.open = false
    this.resetActionsMenu(menu)

    const model = this.model
    if (!model?.isDesktopToolbarAction(action)) {
      defaultLogger.debug('[PassManager][DesktopToolbar] menu input ignored: missing action id')
      return
    }

    model.executeDesktopToolbarAction(action)
  }

  private resetActionsMenu(menu: HTMLElementTagNameMap['cv-menu-button']): void {
    menu.value = ''
    for (const item of menu.querySelectorAll<HTMLElementTagNameMap['cv-menu-item']>('cv-menu-item')) {
      item.selected = false
      item.active = false
    }
  }

  private renderToolbarButton(action: PMDesktopToolbarAction) {
    const primary = action.id === 'pm-create-entry' || action.id === 'pm-create-ssh-key'

    return html`
      <cv-button
        type="button"
        size="small"
        variant=${primary ? 'primary' : 'default'}
        class=${primary ? 'toolbar-button toolbar-primary-action' : 'toolbar-button'}
        data-action=${action.id}
        ?disabled=${action.disabled ?? false}
        title=${action.label}
        aria-label=${action.label}
        @click=${this.handleToolbarButtonClick}
      >
        <cv-icon slot="prefix" name=${action.icon} size="s"></cv-icon>
        ${primary ? html`<span class="toolbar-primary-action-label">${action.label}</span>` : action.label}
      </cv-button>
    `
  }

  private renderActionsMenuItem(section: PMDesktopToolbarSection, action: PMDesktopToolbarAction) {
    return html`
      <cv-menu-item
        slot="menu"
        value=${action.id}
        class="toolbar-menu-item"
        data-action=${action.id}
        data-section=${section.label}
        data-danger=${action.danger ? 'true' : 'false'}
        ?disabled=${action.disabled ?? false}
      >
        <cv-icon slot="prefix" name=${action.icon}></cv-icon>
        ${action.label}
        <span slot="suffix">${section.label}</span>
      </cv-menu-item>
    `
  }

  private renderActionsMenu(
    sections: readonly PMDesktopToolbarSection[],
    options: {includeOtpView?: boolean} = {},
  ) {
    const menuLabel = passmanagerI18n('button:more_actions')
    const menuItems = sections.flatMap((section) =>
      section.actions
        .filter((action) => options.includeOtpView || action.id !== 'pm-otp-view')
        .map((action) => ({section, action})),
    )
    const menuKey = menuItems
      .map(({action}) => `${action.id}:${action.disabled ? 'disabled' : 'enabled'}`)
      .join('|')

    return keyed(
      menuKey,
      html`
        <cv-menu-button
          class="toolbar-actions-menu"
          variant="ghost"
          preset="icon-overflow"
          aria-label=${menuLabel}
          close-on-select
          @cv-input=${this.handleActionsMenuInput}
        >
          <cv-icon slot="prefix" name="three-dots"></cv-icon>
          <span class="sr-only">${menuLabel}</span>
          ${menuItems.map(({section, action}) => this.renderActionsMenuItem(section, action))}
        </cv-menu-button>
      `,
    )
  }

  private renderListToolbar(
    model: PasswordManagerLayoutModel,
    vaultSection: PMDesktopToolbarSection,
    createSection: PMDesktopToolbarSection,
  ) {
    const createEntryAction = createSection.actions.find((action) => action.id === 'pm-create-entry')

    return html`
      <span slot="title" class="toolbar-title toolbar-list-title">
        ${appI18n('navigation:passwords' as never)}
      </span>
      <pm-search
        slot="start"
        class="toolbar-search toolbar-password-search"
        .desktopToolbarModel=${model}
      ></pm-search>
      <div slot="center" class="toolbar-controls">
        <pm-quick-filters class="toolbar-quick-filters" single-row></pm-quick-filters>
        <pm-sort-controls class="toolbar-sort-controls" single-row></pm-sort-controls>
      </div>
      <div slot="actions" class="toolbar-actions">
        ${createEntryAction
          ? html`
              <cv-guidance-anchor anchor-id="passwords.create-entry" surface="passwords" owner="passmanager">
                ${this.renderToolbarButton(createEntryAction)}
              </cv-guidance-anchor>
            `
          : nothing}
        ${this.renderActionsMenu([vaultSection], {includeOtpView: true})}
      </div>
    `
  }

  private renderDedicatedToolbar(
    model: PasswordManagerLayoutModel,
    vaultSection: PMDesktopToolbarSection,
    createSection: PMDesktopToolbarSection,
    showElement: 'otpView' | 'sshView' | 'envRuntimeView',
  ) {
    const sshView = showElement === 'sshView'
    const envRuntimeView = showElement === 'envRuntimeView'
    const title = envRuntimeView
      ? envRuntimeI18n('title')
      : passmanagerI18n((sshView ? 'ssh:keys_view:title' : 'otp:quick_view:title') as never)
    const subtitle = envRuntimeView
      ? envRuntimeI18n('subtitle')
      : passmanagerI18n((sshView ? 'ssh:keys_view:subtitle' : 'otp:quick_view:subtitle') as never)
    const createSshKeyAction = createSection.actions.find((action) => action.id === 'pm-create-ssh-key')

    return html`
      <span slot="title" class="toolbar-title">${title}</span>
      <span slot="subtitle" class="toolbar-subtitle">${subtitle}</span>
      ${showElement === 'otpView'
        ? html`
            <pm-otp-quick-view-search
              slot="start"
              class="toolbar-search toolbar-otp-search"
              .desktopToolbarModel=${model}
            ></pm-otp-quick-view-search>
          `
        : nothing}
      <div slot="actions" class="toolbar-actions">
        ${sshView && createSshKeyAction ? this.renderToolbarButton(createSshKeyAction) : nothing}
        ${this.renderActionsMenu([vaultSection])}
      </div>
    `
  }

  protected render() {
    const model = this.model
    if (!model) {
      return nothing
    }

    const [vaultSection, createSection] = model.getDesktopToolbarSections()
    if (!vaultSection || !createSection) {
      return nothing
    }

    const showElement = model.getCurrentShowElement()
    const dedicatedView =
      showElement === 'otpView' || showElement === 'sshView' || showElement === 'envRuntimeView'

    return html`
      <desktop-shell-toolbar single-row>
        ${dedicatedView
          ? this.renderDedicatedToolbar(model, vaultSection, createSection, showElement)
          : this.renderListToolbar(model, vaultSection, createSection)}
      </desktop-shell-toolbar>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'password-manager-desktop-toolbar': PasswordManagerDesktopToolbar
  }
}
