import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css} from 'lit'

import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVSpinner} from '@chromvoid/uikit/components/cv-spinner'
import {CvEmptyState} from 'root/shared/ui/empty-state'

import type {ManagerSaver} from '@project/passmanager/types'
import {getAppContext} from 'root/shared/services/app-context'
import {pmModel} from '../password-manager.model'
import {PMCardHeader} from './card/pm-card-header/pm-card-header'
import {PMWorkspaceHeader} from './card/pm-workspace-header'
import {PMGroup, PMGroupListItemMobile, PMGroupMobile} from './group/group'
import {PMEntryListItem, PMEntryListItemMobile} from './card/entry-list-item'
import {ButtonBack} from './list/back-button'
import {GroupTreeView} from './list/group-tree-view'
import {PMQuickFilters} from './list/quick-filters'
import {PMSearch} from './list/search'
import {PMSearchMobile} from './list/search-mobile'
import {SortControls} from './list/sort-controls'
import {PasswordManagerDesktopLayout, PasswordManagerMobileLayout} from './password-manager-layout'
import {PMAvatarIcon} from './pm-avatar-icon'
import {PMOtpQuickView, PMOtpQuickViewMobile} from './otp-quick-view'
import {PMSshKeysView, PMSshKeysViewMobile} from './ssh-keys-view'

export class PasswordManagerElement extends ReatomLitElement {
  static define(managerSaver: ManagerSaver) {
    pmModel.configure(managerSaver)
    if (!customElements.get('password-manager')) {
      customElements.define('password-manager', this)
    }
    CVIcon.define()
    CVSpinner.define()
    CvEmptyState.define()
    PMGroup.define()
    PMGroupMobile.define()
    PMGroupListItemMobile.define()
    GroupTreeView.define()
    PMSearch.define()
    PMQuickFilters.define()
    PMSearchMobile.define()
    PMEntryListItem.define()
    PMEntryListItemMobile.define()
    ButtonBack.define()
    SortControls.define()
    PMCardHeader.define()
    PMWorkspaceHeader.define()
    PMAvatarIcon.define()
    PMOtpQuickView.define()
    PMOtpQuickViewMobile.define()
    PMSshKeysView.define()
    PMSshKeysViewMobile.define()
    PasswordManagerMobileLayout.define()
    PasswordManagerDesktopLayout.define()
  }

  static styles = [
    css`
      :host {
        display: block;
        block-size: 100%;
        --pm-avatar-contrast-base: 90%;
      }

      password-manager-mobile-layout,
      password-manager-desktop-layout {
        block-size: 100%;
      }
    `,
  ]

  disconnectedCallback(): void {
    super.disconnectedCallback()
    pmModel.deactivateSurface()
  }

  protected render() {
    const {store} = getAppContext()
    const isMobile = store.layoutMode() === 'mobile'

    if (isMobile) {
      return html`
        <password-manager-mobile-layout>
          <slot name="buttons" slot="buttons"></slot>
        </password-manager-mobile-layout>
      `
    }

    return html`
      <password-manager-desktop-layout>
        <slot name="buttons" slot="buttons"></slot>
      </password-manager-desktop-layout>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'password-manager': PasswordManagerElement
    'password-manager-mobile-layout': PasswordManagerMobileLayout
    'password-manager-desktop-layout': PasswordManagerDesktopLayout
    'pm-entry-list-item-mobile': PMEntryListItemMobile
    'pm-search': PMSearch
    'pm-quick-filters': PMQuickFilters
    'pm-sort-controls': SortControls
    'pm-group': PMGroup
    'pm-group-mobile': PMGroupMobile
    'pm-group-list-item-mobile': PMGroupListItemMobile
    'pm-import-dialog': any
    'pm-avatar-icon': PMAvatarIcon
    'pm-search-mobile': PMSearchMobile
    'pm-otp-quick-view': PMOtpQuickView
    'pm-otp-quick-view-mobile': PMOtpQuickViewMobile
    'pm-ssh-keys-view': PMSshKeysView
    'pm-ssh-keys-view-mobile': PMSshKeysViewMobile
  }
}
