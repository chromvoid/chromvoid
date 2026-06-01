import {css, nothing} from 'lit'
import {keyed} from 'lit/directives/keyed.js'
import {html} from '@chromvoid/uikit/reatom-lit'

import {Entry} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {MobileActionBar} from 'root/shared/ui/mobile-action-bar'
import {mobileActionBarButtonStyles} from 'root/shared/ui/mobile-action-bar.styles'
import {hostContainStyles, pageFadeInStyles, pageTransitionStyles} from 'root/shared/ui/shared-styles'
import {pmComponentLoaderModel} from '../../models/pm-component-loader.model'
import {pmMobileChromeModel} from '../../models/pm-mobile-chrome.model'
import {pmSharedStyles} from '../../styles/shared'
import {PMMobileSortGroupSheet} from '../list/mobile-sort-group-sheet'
import {PMOtpQuickViewMobile} from '../otp-quick-view'
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
    PMOtpQuickViewMobile.define()
    PMMobileSortGroupSheet.define()
  }

  static styles = [
    ...pmSharedStyles,
    pageTransitionStyles,
    pageFadeInStyles,
    hostContainStyles,
    passwordManagerLayoutStyles,
    mobileActionBarButtonStyles,
    css`
      .wrapper {
        display: flex;
        flex-direction: column;
        block-size: 100%;
        min-block-size: 0;
      }

      .content {
        flex: 1;
        min-block-size: 0;
        overflow: auto;
      }

      .content .card {
        padding: var(--app-surface-gutter-mobile);
      }

      /* Lets pm-entry-mobile own its internal content scroller and footer. */
      .content pm-entry-mobile.card {
        contain: none;
        overflow: hidden;
      }

      .content pm-entry-create-mobile.card {
        padding: 0;
      }

      .content pm-group-mobile.card {
        overflow: hidden;
      }

      .content pm-otp-quick-view-mobile.card {
        overflow: hidden;
      }

      slot[name='buttons'] {
        display: none;
      }

    `,
  ]

  private unregisterBackHandler?: () => void

  protected getSearchElement(): SearchElement | null {
    const group = this.shadowRoot?.querySelector('pm-group-mobile') as HTMLElement | null
    return group?.shadowRoot?.querySelector('pm-search-mobile') as SearchElement | null
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

  private renderMain() {
    const showElement = this.model.getCurrentShowElement()

    if (this.model.isLoading()) {
      return this.renderLoading()
    }

    const extendedReady = pmComponentLoaderModel.extendedReady()
    if (pmComponentLoaderModel.requiresExtendedComponents(showElement) && !extendedReady) {
      void pmComponentLoaderModel.ensureExtendedComponents()
      return this.renderLoading()
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

    return this.renderGroup()
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.unregisterBackHandler = navigationModel.registerSurfaceBackHandler('passwords', () => pmMobileChromeModel.handleBack())
  }

  override disconnectedCallback(): void {
    this.unregisterBackHandler?.()
    this.unregisterBackHandler = undefined
    passwordManagerMobileLayoutModel.cancelLongPress()
    super.disconnectedCallback()
  }

  override render() {
    const selectionStateKey = `${passwordManagerMobileLayoutModel.selection.active() ? '1' : '0'}:${passwordManagerMobileLayoutModel.selection.selectedCount()}`
    const motion = this.model.getMotionRenderState()

    return html`
      <div class="wrapper" data-selection-state=${selectionStateKey}>
        <div class="content scrollable">
          <div
            class="pm-content"
            data-motion-kind=${motion.kind}
            data-motion-direction=${motion.direction}
            data-motion-target=${motion.target ?? ''}
            data-reduced-motion=${String(motion.reducedMotion)}
          >
            ${this.renderMain()}
          </div>
        </div>
        <pm-mobile-sort-group-sheet></pm-mobile-sort-group-sheet>
        <slot name="buttons"></slot>
      </div>
    `
  }
}
