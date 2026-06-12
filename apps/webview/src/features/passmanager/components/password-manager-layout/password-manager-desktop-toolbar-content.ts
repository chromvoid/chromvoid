import {html} from '@chromvoid/uikit/reatom-lit'
import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVGuidanceAnchor} from '@chromvoid/uikit/components/cv-guidance-anchor'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVMenuButton, type CVMenuButtonInputEvent} from '@chromvoid/uikit/components/cv-menu-button'
import {CVMenuItem} from '@chromvoid/uikit/components/cv-menu-item'
import {nothing} from 'lit'
import {keyed} from 'lit/directives/keyed.js'

import {i18n} from '@project/passmanager/i18n'
import {defaultLogger} from 'root/core/logger'
import {DesktopShellToolbar} from 'root/features/shell/components/desktop-shell-toolbar'
import {PMQuickFilters} from '../list/quick-filters'
import {PMSearch} from '../list/search'
import {SortControls} from '../list/sort-controls'
import {PMOtpQuickViewSearch} from '../otp-quick-view/otp-quick-view-search'
import type {PasswordManagerLayoutModel, PMDesktopToolbarSection} from './password-manager-layout.model'

type PMDesktopToolbarRenderOptions = {
  model: PasswordManagerLayoutModel | undefined
  onToolbarButtonClick: (event: Event) => void
  onActionsMenuInput: (event: CVMenuButtonInputEvent) => void
}

const toolbarLogger = defaultLogger

export function definePasswordManagerDesktopToolbarContent(): void {
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
}

export function executePasswordManagerDesktopToolbarButtonEvent(
  model: PasswordManagerLayoutModel,
  event: Event,
): void {
  const button = event.currentTarget
  if (!(button instanceof HTMLElement)) {
    toolbarLogger.debug('[PassManager][DesktopToolbar] click ignored: no button target')
    return
  }

  const action = button.dataset['action']
  if (!model.isDesktopToolbarAction(action)) {
    toolbarLogger.debug('[PassManager][DesktopToolbar] click ignored: missing action id')
    return
  }

  if (button.hasAttribute('disabled')) {
    toolbarLogger.debug('[PassManager][DesktopToolbar] click blocked: disabled', {
      action,
      context: model.getDesktopToolbarContext(),
    })
    return
  }

  model.executeDesktopToolbarAction(action)
}

export function executePasswordManagerDesktopToolbarMenuInput(
  model: PasswordManagerLayoutModel,
  event: CVMenuButtonInputEvent,
): void {
  const menu = event.currentTarget as HTMLElementTagNameMap['cv-menu-button']
  if (event.detail.open) {
    resetActionsMenu(menu)
    return
  }

  const action = event.detail.value ?? undefined
  menu.open = false
  resetActionsMenu(menu)

  if (!model.isDesktopToolbarAction(action)) {
    toolbarLogger.debug('[PassManager][DesktopToolbar] menu input ignored: missing action id')
    return
  }

  model.executeDesktopToolbarAction(action)
}

function resetActionsMenu(menu: HTMLElementTagNameMap['cv-menu-button']): void {
  menu.value = ''
  for (const item of menu.querySelectorAll<HTMLElementTagNameMap['cv-menu-item']>('cv-menu-item')) {
    item.selected = false
    item.active = false
  }
}

function renderToolbarButton(
  action: PMDesktopToolbarSection['actions'][number],
  onToolbarButtonClick: (event: Event) => void,
) {
  return html`
    <cv-button
      type="button"
      size="small"
      variant=${action.id === 'pm-create-entry' ? 'primary' : 'default'}
      class="toolbar-button"
      data-action=${action.id}
      ?disabled=${action.disabled ?? false}
      title=${action.label}
      aria-label=${action.label}
      @click=${onToolbarButtonClick}
    >
      <cv-icon slot="prefix" name=${action.icon} size="s"></cv-icon>
      ${action.label}
    </cv-button>
  `
}

function renderCreateActions(section: PMDesktopToolbarSection, onToolbarButtonClick: (event: Event) => void) {
  const actions = [
    section.actions.find((action) => action.id === 'pm-create-entry'),
    section.actions.find((action) => action.id === 'pm-create-group'),
  ].filter((action): action is PMDesktopToolbarSection['actions'][number] => Boolean(action))

  return html`
    <div class="toolbar-create-actions">
      ${actions.map((action) => renderToolbarButton(action, onToolbarButtonClick))}
    </div>
  `
}

function renderStartActions(
  createSection: PMDesktopToolbarSection,
  onToolbarButtonClick: (event: Event) => void,
) {
  return html`
    <cv-guidance-anchor anchor-id="passwords.create-entry" surface="passwords" owner="passmanager">
      ${renderCreateActions(createSection, onToolbarButtonClick)}
    </cv-guidance-anchor>
  `
}

function renderToolbarPrimaryRow(
  createSection: PMDesktopToolbarSection,
  model: PasswordManagerLayoutModel,
  onToolbarButtonClick: (event: Event) => void,
) {
  return html`
    <div slot="leading" class="toolbar-primary-row">
      ${renderStartActions(createSection, onToolbarButtonClick)}
      <pm-search class="toolbar-search toolbar-password-search" .desktopToolbarModel=${model}></pm-search>
    </div>
  `
}

function renderToolbarControlsRow() {
  return html`
    <div slot="center" class="toolbar-controls-row">
      <pm-quick-filters class="toolbar-quick-filters"></pm-quick-filters>
      <pm-sort-controls class="toolbar-sort-controls"></pm-sort-controls>
    </div>
  `
}

function renderOtpToolbarSearch(model: PasswordManagerLayoutModel) {
  return html`
    <pm-otp-quick-view-search
      slot="center"
      class="toolbar-search toolbar-otp-search"
      .desktopToolbarModel=${model}
    ></pm-otp-quick-view-search>
  `
}

function renderActionsMenuItem(
  section: PMDesktopToolbarSection,
  action: PMDesktopToolbarSection['actions'][number],
) {
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

function renderActionsMenu(
  sections: readonly PMDesktopToolbarSection[],
  onActionsMenuInput: (event: CVMenuButtonInputEvent) => void,
) {
  const menuLabel = i18n('button:more_actions')
  const menuItems = sections.flatMap((section) =>
    section.actions.filter((action) => action.id !== 'pm-otp-view').map((action) => ({section, action})),
  )
  const menuKey = menuItems
    .map(({action}) => `${action.id}:${action.disabled ? 'disabled' : 'enabled'}`)
    .join('|')

  return keyed(
    menuKey,
    html`
      <cv-menu-button
        class="toolbar-actions-menu"
        preset="icon-overflow"
        aria-label=${menuLabel}
        close-on-select
        @cv-input=${onActionsMenuInput}
      >
        <span slot="prefix" class="toolbar-actions-trigger">
          <cv-icon name="settings"></cv-icon>
        </span>
        <span>${menuLabel}</span>
        ${menuItems.map(({section, action}) => renderActionsMenuItem(section, action))}
      </cv-menu-button>
    `,
  )
}

export function renderPasswordManagerDesktopToolbarContent({
  model,
  onToolbarButtonClick,
  onActionsMenuInput,
}: PMDesktopToolbarRenderOptions) {
  if (!model) {
    return nothing
  }

  const sections = model.getDesktopToolbarSections()
  const [vaultSection, createSection] = sections
  if (!vaultSection || !createSection) {
    return nothing
  }
  const otpView = model.getCurrentShowElement() === 'otpView'

  return html`
    ${otpView
      ? html`
          <span slot="title">${i18n('otp:quick_view:title' as never)}</span>
          <span slot="subtitle">${i18n('otp:quick_view:subtitle' as never)}</span>
        `
      : renderToolbarPrimaryRow(createSection, model, onToolbarButtonClick)}
    ${otpView ? renderOtpToolbarSearch(model) : renderToolbarControlsRow()}
    <div slot="actions" class="toolbar-side toolbar-side-end">
      ${renderActionsMenu([vaultSection], onActionsMenuInput)}
    </div>
  `
}
