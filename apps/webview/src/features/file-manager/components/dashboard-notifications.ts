import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {sharedStyles} from 'root/shared/ui/shared-styles'

type NotificationItem = {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  timestamp: number
}

export class DashboardNotifications extends XLitElement {
  static define() {
    customElements.define('dashboard-notifications', this)
  }

  static get properties() {
    return {
      notifications: {type: Array},
    }
  }

  declare notifications: NotificationItem[]

  constructor() {
    super()
    this.notifications = []
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        display: contents;
      }

      .notification {
        position: fixed;
        block-size: fit-content;
        inset-block-start: 20px;
        inset-inline-end: 20px;
        padding-block: 12px;
        padding-inline: 16px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;

        &.success {
          background: var(--cv-color-success);
        }

        &.error {
          background: var(--cv-color-danger);
        }

        &.warning {
          background: var(--cv-color-warning);
        }

        &.info {
          background: var(--cv-color-primary);
        }
      }

      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }

        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `,
  ]

  render() {
    const list = this.notifications.map((n) => {
      return html`<div class="notification ${n.type}">${n.message}</div>`
    })
    return html`${list}`
  }
}
