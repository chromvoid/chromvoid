import {css, type PropertyValues} from 'lit'
import {keyed} from 'lit/directives/keyed.js'
import {html} from '@chromvoid/uikit/reatom-lit'

import {Entry} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {MobileActionBar} from 'root/shared/ui/mobile-action-bar'
import {mobileActionBarButtonStyles} from 'root/shared/ui/mobile-action-bar.styles'
import {MobileSurfaceLayout} from 'root/shared/ui/mobile-surface-layout'
import {mobileSurfaceLayoutFlexFillStyles} from 'root/shared/ui/mobile-surface-layout.styles'
import {viewTransitionTargets} from 'root/utils/view-transition-targets'
import {
  hostContainStyles,
} from 'root/shared/ui/shared-styles'
import {pmMobileChromeModel} from '../../models/pm-mobile-chrome.model'
import {pmSharedStyles} from '../../styles/shared'
import {PMMobileSortGroupSheet} from '../list/mobile-sort-group-sheet'
import {PMMobileTagFilterSheet} from '../list/mobile-tag-filter-sheet'
import {PMOtpQuickViewMobile} from '../otp-quick-view'
import {PMSshKeysViewMobile} from '../ssh-keys-view'
import {PMLayoutBase, type SearchElement} from './password-manager-layout-base'
import {passwordManagerMobileLayoutModel} from './password-manager-mobile-layout.model'
import {passwordManagerLayoutStyles} from './password-manager-layout.styles'

export class PasswordManagerMobileLayout extends PMLayoutBase {
  static elementName = 'password-manager-mobile-layout'

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
    MobileActionBar.define()
    MobileSurfaceLayout.define()
    PMOtpQuickViewMobile.define()
    PMSshKeysViewMobile.define()
    PMMobileSortGroupSheet.define()
    PMMobileTagFilterSheet.define()
  }

  static styles = [
    ...pmSharedStyles,
    hostContainStyles,
    passwordManagerLayoutStyles,
    mobileActionBarButtonStyles,
    mobileSurfaceLayoutFlexFillStyles,
    css`
      .wrapper {
        display: flex;
        flex-direction: column;
        block-size: 100%;
        min-block-size: 0;
        overflow: hidden;
      }

      .pm-content .card {
        padding: var(--app-mobile-surface-gutter-block-start)
          var(--app-mobile-surface-gutter-inline)
          var(--app-mobile-surface-gutter-block-end);
      }

      /* Lets pm-entry-mobile own its internal content scroller and footer. */
      .pm-content pm-entry-mobile.card {
        contain: none;
        overflow: hidden;
      }

      .pm-content pm-entry-create-mobile.card {
        padding: 0;
        overflow: hidden;
      }

      .pm-content pm-group-create-mobile.card {
        padding: 0;
        overflow: hidden;
      }

      .pm-content pm-group-mobile.card {
        padding: var(--app-mobile-surface-gutter-block-start) 0
          var(--app-mobile-surface-gutter-block-end);
        overflow: hidden;
      }

      .pm-content pm-otp-quick-view-mobile.card {
        overflow: hidden;
      }

      .pm-content pm-ssh-keys-view-mobile.card {
        overflow: hidden;
      }

      slot[name='buttons'] {
        display: none;
      }

    `,
  ]
  private unregisterPageTransitionTarget?: () => void

  private unregisterBackHandler?: () => void

  protected override get extendedComponentLayout() {
    return 'mobile' as const
  }

  protected getSearchElement(): SearchElement | null {
    const group = this.shadowRoot?.querySelector('pm-group-mobile') as HTMLElement | null
    return group?.shadowRoot?.querySelector(
      'workspace-dashboard-header, pm-search-mobile',
    ) as SearchElement | null
  }

  private renderEntry(entry: Entry, editing: boolean) {
    return html`<pm-entry-mobile class="card" .entry=${entry} .editing=${editing}></pm-entry-mobile>`
  }

  private renderGroup() {
    return keyed(this.model.getGroupViewKey(), html`<pm-group-mobile class="card"></pm-group-mobile>`)
  }

  private renderCreateEntry() {
    return html`<pm-entry-create-mobile class="card"></pm-entry-create-mobile>`
  }

  private renderCreateGroup() {
    return html`<pm-group-create-mobile class="card"></pm-group-create-mobile>`
  }

  private renderLoading() {
    return html`<div class="spinner-wrapper">
      <cv-spinner class="spinner" label=${i18n('loading')}></cv-spinner>
    </div>`
  }

  private renderOtpQuickView() {
    return html`<pm-otp-quick-view-mobile class="card"></pm-otp-quick-view-mobile>`
  }

  private renderSshKeysView() {
    return html`<pm-ssh-keys-view-mobile class="card"></pm-ssh-keys-view-mobile>`
  }

  private renderMain() {
    const showElement = this.model.getCurrentShowElement()
    const sessionStatus = this.model.getSessionStatus()

    if (sessionStatus === 'loading') return this.renderSessionUnavailable(true)
    if (sessionStatus === 'inactive' || sessionStatus === 'error') return this.renderSessionUnavailable()

    if (this.model.requiresExtendedComponents(this.extendedComponentLayout)) {
      return this.model.getExtendedComponentsLoadError()
        ? this.renderExtendedComponentsUnavailable()
        : this.renderLoading()
    }

    if (showElement === 'createEntry') {
      return this.renderCreateEntry()
    }

    if (showElement === 'createGroup') {
      return this.renderCreateGroup()
    }

    if (showElement instanceof Entry) {
      return this.renderEntry(showElement, this.model.isEditingEntry())
    }

    if (showElement === 'importDialog') {
      return this.renderImportDialog()
    }

    if (showElement === 'otpView') {
      return this.renderOtpQuickView()
    }

    if (showElement === 'sshView') {
      return this.renderSshKeysView()
    }

    return this.renderGroup()
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.unregisterBackHandler = navigationModel.registerSurfaceBackHandler('passwords', () => pmMobileChromeModel.handleBack())
  }

  protected override firstUpdated(changedProperties: PropertyValues): void {
    super.firstUpdated(changedProperties)
    this.unregisterPageTransitionTarget = viewTransitionTargets.register('pm-page', {
      getElement: () => this.renderRoot.querySelector<HTMLElement>('.pm-content'),
      settle: async () => {
        await this.updateComplete
      },
    })
  }

  override disconnectedCallback(): void {
    this.unregisterPageTransitionTarget?.()
    this.unregisterPageTransitionTarget = undefined
    this.unregisterBackHandler?.()
    this.unregisterBackHandler = undefined
    passwordManagerMobileLayoutModel.cancelLongPress()
    super.disconnectedCallback()
  }

  override render() {
    const selectionStateKey = `${passwordManagerMobileLayoutModel.selection.active() ? '1' : '0'}:${passwordManagerMobileLayoutModel.selection.selectedCount()}`

    return html`
      <div class="wrapper" data-selection-state=${selectionStateKey}>
        <mobile-surface-layout variant="flush" scroll="external">
          <div class="pm-content">${this.renderMain()}</div>
        </mobile-surface-layout>
        <pm-mobile-sort-group-sheet></pm-mobile-sort-group-sheet>
        <pm-mobile-tag-filter-sheet></pm-mobile-tag-filter-sheet>
        <slot name="buttons"></slot>
      </div>
    `
  }
}
