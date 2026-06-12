import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {css} from 'lit'

import {getAppContext} from 'root/shared/services/app-context'

import {CommandBar} from 'root/features/file-manager/components/command-bar'
import {DesktopShellToolbar} from './desktop-shell-toolbar'
import {FileAppShellDesktopLayout} from './file-app-shell-desktop-layout'
import {
  FileAppShellMobileLayout,
  type MobileShellContentScrollMode,
} from './file-app-shell-mobile-layout'
import {MobileTabBar} from './mobile-tab-bar'
import {MobileTopToolbar} from './mobile-top-toolbar'
import {NavigationRail} from 'root/features/file-manager/components/navigation-rail'

export class FileAppShell extends ReatomLitElement {
  static elementName = 'file-app-shell'
  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
    NavigationRail.define()
    MobileTabBar.define()
    MobileTopToolbar.define()
    CommandBar.define()
    DesktopShellToolbar.define()
    FileAppShellMobileLayout.define()
    FileAppShellDesktopLayout.define()
  }

  static get properties() {
    return {
      sidebarOpen: {type: Boolean, reflect: true, attribute: 'data-sidebar-open'},
      detailsOpen: {type: Boolean, reflect: true, attribute: 'data-details-open'},
      detailsHidden: {type: Boolean, reflect: true, attribute: 'data-details-hidden'},
      dualPane: {type: Boolean, reflect: true, attribute: 'data-dual-pane'},
      edgeBackDisabled: {type: Boolean, reflect: true, attribute: 'data-edge-back-disabled'},
      contentScrollMode: {type: String, attribute: 'content-scroll-mode'},
    }
  }

  declare sidebarOpen: boolean
  declare detailsOpen: boolean
  declare detailsHidden: boolean
  declare dualPane: boolean
  declare edgeBackDisabled: boolean
  declare contentScrollMode: MobileShellContentScrollMode

  static styles = [
    css`
      :host {
        display: block;
        height: 100%;
      }

      slot:not([name]) {
        display: block;
        min-block-size: 0;
        block-size: 100%;
      }
    `,
  ]

  constructor() {
    super()
    this.sidebarOpen = false
    this.detailsOpen = false
    this.detailsHidden = false
    this.dualPane = false
    this.edgeBackDisabled = false
    this.contentScrollMode = 'shell'
  }

  protected render() {
    const {store} = getAppContext()
    const isMobile = store.layoutMode() === 'mobile'

    if (isMobile) {
      return html`
        <file-app-shell-mobile-layout
          .sidebarOpen=${this.sidebarOpen}
          .detailsOpen=${this.detailsOpen}
          .detailsHidden=${this.detailsHidden}
          .dualPane=${this.dualPane}
          .edgeBackDisabled=${this.edgeBackDisabled}
          .contentScrollMode=${this.contentScrollMode}
        >
          <slot name="mobile-topbar" slot="mobile-topbar"></slot>
          <slot></slot>
          <slot name="details" slot="details"></slot>
        </file-app-shell-mobile-layout>
      `
    }

    return html`
      <file-app-shell-desktop-layout
        .detailsOpen=${this.detailsOpen}
        .detailsHidden=${this.detailsHidden}
        .dualPane=${this.dualPane}
      >
        <slot name="desktop-topbar" slot="desktop-topbar"></slot>
        <slot></slot>
        <slot name="details" slot="details"></slot>
        <slot name="statusbar" slot="statusbar"></slot>
      </file-app-shell-desktop-layout>
    `
  }
}
