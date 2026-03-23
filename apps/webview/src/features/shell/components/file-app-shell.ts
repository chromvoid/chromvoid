import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {getAppContext} from 'root/shared/services/app-context'

import {CommandBar} from 'root/features/file-manager/components/command-bar'
import {FileAppShellDesktopLayout} from './file-app-shell-desktop-layout'
import {FileAppShellMobileLayout} from './file-app-shell-mobile-layout'
import {MobileTabBar} from './mobile-tab-bar'
import {MobileTopToolbar} from './mobile-top-toolbar'
import {NavigationRail} from 'root/features/file-manager/components/navigation-rail'

const FORWARDED_ATTRS = ['data-sidebar-open', 'data-details-open', 'data-details-hidden', 'data-dual-pane'] as const

export class FileAppShell extends XLitElement {
  static elementName = 'file-app-shell'
  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
    NavigationRail.define()
    MobileTabBar.define()
    MobileTopToolbar.define()
    CommandBar.define()
    FileAppShellMobileLayout.define()
    FileAppShellDesktopLayout.define()
  }

  static styles = [
    css`
      :host {
        display: block;
        height: 100%;
      }
    `,
  ]

  private observer?: MutationObserver

  override connectedCallback() {
    super.connectedCallback()
    this.observer = new MutationObserver(() => this.forwardAttributes())
    this.observer.observe(this, {attributes: true, attributeFilter: [...FORWARDED_ATTRS]})
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.observer?.disconnect()
    this.observer = undefined
  }

  override updated(_changedProps: Map<string, unknown>) {
    super.updated(_changedProps)
    this.forwardAttributes()
  }

  private getLayoutElement(): HTMLElement | null {
    return this.renderRoot.querySelector('file-app-shell-mobile-layout, file-app-shell-desktop-layout')
  }

  private forwardAttributes() {
    const el = this.getLayoutElement()
    if (!el) return

    for (const attr of FORWARDED_ATTRS) {
      if (this.hasAttribute(attr)) {
        el.setAttribute(attr, this.getAttribute(attr) ?? '')
      } else {
        el.removeAttribute(attr)
      }
    }
  }

  protected render() {
    const {store} = getAppContext()
    const isMobile = store.layoutMode() === 'mobile'

    if (isMobile) {
      return html`
        <file-app-shell-mobile-layout>
          <slot name="mobile-topbar" slot="mobile-topbar"></slot>
          <slot></slot>
          <slot name="details" slot="details"></slot>
        </file-app-shell-mobile-layout>
      `
    }

    return html`
      <file-app-shell-desktop-layout>
        <slot></slot>
        <slot name="details" slot="details"></slot>
        <slot name="statusbar" slot="statusbar"></slot>
      </file-app-shell-desktop-layout>
    `
  }
}
