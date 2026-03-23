import {XLitElement} from '@statx/lit'
import {CVBreadcrumb, CVBreadcrumbItem} from '@chromvoid/uikit'

import {css, html} from 'lit'
import {sharedStyles} from 'root/shared/ui/shared-styles'

export class BreadcrumbsNav extends XLitElement {
  static define() {
    CVBreadcrumb.define()
    CVBreadcrumbItem.define()

    if (!customElements.get('breadcrumbs-nav')) {
      customElements.define('breadcrumbs-nav', this)
    }
  }

  static get properties() {
    return {
      currentPath: {type: String, attribute: 'current-path'},
    }
  }

  declare currentPath: string

  constructor() {
    super()
    this.currentPath = '/'
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        min-inline-size: 0;
        overflow: hidden;
        padding: 3px;
      }

      cv-breadcrumb {
        display: block;
        min-inline-size: 0;
        overflow: hidden;
        font-size: var(--cv-font-size-sm);
      }

      cv-breadcrumb::part(base) {
        display: block;
        min-inline-size: 0;
        overflow: hidden;
      }

      cv-breadcrumb::part(list) {
        flex-wrap: nowrap;
        min-inline-size: 0;
        overflow: hidden;
        white-space: nowrap;
      }

      cv-breadcrumb-item {
        min-inline-size: 0;
        gap: 4px;
      }

      cv-breadcrumb-item::part(link) {
        color: var(--cv-color-text-muted);
        transition: color var(--cv-duration-fast) var(--cv-easing-standard);
        display: inline-block;
        max-inline-size: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        border-radius: var(--cv-radius-1);
      }

      /* Default focus outline gets clipped by overflow in the breadcrumb container.
         Draw an inset focus ring instead (works well in Tauri webview). */
      cv-breadcrumb-item:focus-within::part(link) {
        box-shadow: inset 0 0 0 2px var(--cv-color-primary);
        color: var(--cv-color-text);
      }

      cv-breadcrumb-item:hover::part(link) {
        color: var(--cv-color-text);
      }

      cv-breadcrumb-item[current]::part(link) {
        color: var(--cv-color-text);
        font-weight: var(--cv-font-weight-medium);
      }

      cv-breadcrumb-item.root::part(link) {
        color: var(--cv-color-text);
      }

      cv-breadcrumb-item.root:hover::part(link) {
        color: var(--cv-color-primary);
      }

      /* Mobile: truncate breadcrumbs more aggressively */
      @media (max-width: 480px) {
        cv-breadcrumb-item::part(link) {
          max-inline-size: 80px;
        }
      }
    `,
  ]

  private handleNavigateToPath(path: string) {
    this.dispatchEvent(
      new CustomEvent('navigate', {
        detail: {path},
        bubbles: true,
      }),
    )
  }

  private getBreadcrumbItemFromEvent(event: Event): CVBreadcrumbItem | null {
    return (
      event.composedPath().find(
        (target): target is CVBreadcrumbItem =>
          target instanceof HTMLElement && target.tagName.toLowerCase() === CVBreadcrumbItem.elementName,
      ) ?? null
    )
  }

  private onBreadcrumbClick(e: Event) {
    const breadcrumbItem = this.getBreadcrumbItemFromEvent(e)
    if (!breadcrumbItem) return

    if (e.cancelable) {
      e.preventDefault()
    }

    if (breadcrumbItem.current) return

    this.handleNavigateToPath(breadcrumbItem.value || breadcrumbItem.href || '/')
  }

  private renderBreadcrumbItems() {
    const parts = this.currentPath.split('/').filter(Boolean)
    const items = []

    items.push(html`
      <cv-breadcrumb-item class="root" value="/" href="/">
        <cv-icon slot="prefix" name="house"></cv-icon>
        Home
      </cv-breadcrumb-item>
    `)

    const pathParts: string[] = []

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (!part) continue

      pathParts.push(part)
      const fullPath = '/' + pathParts.join('/')

      items.push(html`
        <cv-breadcrumb-item value=${fullPath} href=${fullPath}>${part}</cv-breadcrumb-item>
      `)
    }

    return items
  }

  protected render() {
    return html`<cv-breadcrumb @click=${this.onBreadcrumbClick}>${this.renderBreadcrumbItems()}</cv-breadcrumb>`
  }
}
