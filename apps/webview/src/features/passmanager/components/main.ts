import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {CVIcon, CVProgress, CVSpinner} from '@chromvoid/uikit'

import type {ManagerSaver} from '@project/passmanager'
import {getAppContext} from 'root/shared/services/app-context'
import {pmModel} from '../password-manager.model'
import {CopyButton} from './button-copy'
import {PMCardHeader, PMEntry, PMEntryMobile, PMEntryOTP} from './card'
import {PMCardHeaderMobile} from './card/pm-card-header'
import {PMGroup, PMGroupMobile} from './group/group'
import {PMEntryCreate, PMEntryCreateMobile} from './card/entry-create'
import {PMEntryEdit, PMEntryEditMobile} from './card/entry-edit'
import {PMEntryListItem, PMEntryListItemMobile} from './card/entry-list-item'
import {PMEntryOTPCreate} from './card/entry-otp-create'
import {PMEntryMoveMobile} from './card/pm-entry-move'
import {PMGroupCreate} from './group/group-create'
import {ButtonBack} from './list/back-button'
import {GroupTreeView} from './list/group-tree-view'
import {PMList} from './list/list'
import {PMSearch} from './list/search'
import {SortControls} from './list/sort-controls'
import {SortControlsMobile} from './list/sort-controls-mobile'
import {ImportDialog} from '@chromvoid/password-import'
import {PasswordManagerDesktopLayout, PasswordManagerMobileLayout} from './password-manager-layout'
import {PMAvatarIcon} from './pm-avatar-icon'
import {PMIconPicker} from './pm-icon-picker'
import {PMIconPickerMobile} from './pm-icon-picker.mobile'
import {PMEntrySshGenerator} from './card/entry-ssh'

export class PasswordManagerElement extends XLitElement {
  static define(managerSaver: ManagerSaver) {
    customElements.define('password-manager', this)
    CVIcon.define()
    CVProgress.define()
    CVSpinner.define()
    CopyButton.define()
    PMEntry.define()
    PMEntryCreate.define()
    PMEntryEdit.define()
    PMEntryEditMobile.define()
    PMEntryCreateMobile.define()
    PMEntryOTPCreate.define()
    PMEntryOTP.define()
    PMGroupCreate.define()
    PMGroup.define()
    PMGroupMobile.define()
    PMList.define()
    GroupTreeView.define()
    PMSearch.define()
    PMEntryListItem.define()
    PMEntryListItemMobile.define()
    ButtonBack.define()
    SortControls.define()
    SortControlsMobile.define()
    PMCardHeader.define()
    PMCardHeaderMobile.define()
    PMEntryMoveMobile.define()
    PMEntryMobile.define()
    PMAvatarIcon.define()
    const isMobileLayout = getAppContext().store.layoutMode() === 'mobile'
    if (isMobileLayout) {
      PMIconPickerMobile.define()
    } else {
      PMIconPicker.define()
    }
    PMEntrySshGenerator.define()
    ImportDialog.define()
    PasswordManagerMobileLayout.define()
    PasswordManagerDesktopLayout.define()
    pmModel.managerSaver = managerSaver
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

  connectedCallback(): void {
    super.connectedCallback()
    pmModel.init()
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    pmModel.cleanup()
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
    'pm-list': PMList
    'pm-entry': PMEntry
    'pm-entry-mobile': PMEntryMobile
    'pm-entry-list-item-mobile': PMEntryListItemMobile
    'pm-entry-move-mobile': PMEntryMoveMobile
    'pm-card-header-mobile': PMCardHeaderMobile
    'pm-sort-controls-mobile': SortControlsMobile
    'pm-entry-otp-create': PMEntryOTPCreate
    'pm-entry-create': PMEntryCreate
    'pm-search': PMSearch
    'pm-sort-controls': SortControls
    'pm-entry-otp': PMEntryOTP
    'pm-group-create': PMGroupCreate
    'pm-group': PMGroup
    'pm-group-mobile': PMGroupMobile
    'pm-import-dialog': any
    'pm-entry-edit-mobile': PMEntryEditMobile
    'pm-entry-create-mobile': PMEntryCreateMobile
    'pm-avatar-icon': PMAvatarIcon
  }
}
