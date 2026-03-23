import {atom} from '@reatom/core'
import {css} from 'lit'
import {ReatomLitElement, html} from '@chromvoid/uikit'

import type {Entry} from '@project/passmanager'

import {i18n} from './i18n'
import {store} from './store'

export class AppRoot extends ReatomLitElement {
  static define() {
    if (!customElements.get('app-root')) {
      customElements.define('app-root', AppRoot)
    }
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      min-height: 360px;
      box-sizing: border-box;
      padding: 10px;
      color: rgb(226 232 240 / 96%);
      background:
        radial-gradient(120% 95% at 100% -5%, rgb(249 116 22 / 22%), transparent 52%),
        radial-gradient(90% 70% at -20% 0%, rgb(59 130 246 / 15%), transparent 58%),
        linear-gradient(165deg, #080f19 0%, #0f1828 55%, #101728 100%);
      font-size: 14px;
      line-height: 1.35;
    }

    .shell {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 340px;
      padding: 14px;
      border: 1px solid rgb(148 163 184 / 18%);
      border-radius: 20px;
      background:
        linear-gradient(176deg, rgb(15 23 42 / 82%) 0%, rgb(2 6 23 / 86%) 100%),
        linear-gradient(128deg, rgb(59 130 246 / 7%) 0%, rgb(244 114 182 / 7%) 100%);
      box-shadow:
        0 18px 48px rgb(2 6 23 / 52%),
        inset 0 1px 0 rgb(255 255 255 / 8%);
      backdrop-filter: blur(8px);
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }

    .count-badge {
      inline-size: min(120px, 100%);
      flex: 0 1 120px;
      max-width: 120px;
      min-width: 0;
      --cv-badge-font-size: 11px;
    }

    .count-badge::part(base) {
      width: 100%;
      min-width: 0;
      overflow: hidden;
    }

    .count-badge::part(label) {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 700;
    }

    .headline {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .headline-title {
      margin: 0;
      color: #f8fafc;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0.01em;
    }

    .headline-host {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: rgb(148 163 184 / 92%);
      font-size: 12px;
      font-weight: 500;
    }

    .headline-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: rgb(56 189 248 / 88%);
      box-shadow: 0 0 0 5px rgb(56 189 248 / 12%);
    }

    .copy-toast {
      display: inline-flex;
      align-items: center;
      align-self: flex-start;
      padding: 4px 10px;
      border: 1px solid rgb(56 189 248 / 36%);
      border-radius: 999px;
      background: rgb(15 23 42 / 82%);
      color: rgb(186 230 253);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    .content {
      flex: 1;
      min-height: 220px;
      max-height: 300px;
      overflow: auto;
      padding-right: 2px;
    }

    .content::-webkit-scrollbar {
      width: 8px;
    }

    .content::-webkit-scrollbar-thumb {
      border-radius: 999px;
      background: rgb(148 163 184 / 24%);
    }

    .state-panel {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 10px;
      min-height: 212px;
      padding: 16px;
      border: 1px dashed rgb(148 163 184 / 24%);
      border-radius: 14px;
      text-align: center;
      color: rgb(226 232 240 / 94%);
    }

    .loading-label {
      color: rgb(148 163 184);
      font-size: 13px;
      font-weight: 500;
    }

    .records {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    cv-progress-ring {
      --cv-progress-ring-track-width: 2px;
      --cv-progress-ring-indicator-width: 2px;
      --cv-progress-ring-indicator-color: rgb(125 211 252);
      --cv-progress-ring-track-color: rgb(148 163 184 / 24%);
    }

    @media (max-width: 470px) {
      :host {
        padding: 8px;
      }
    }
  `

  private readonly copyFeedback = atom<string | undefined>(undefined, 'app.copyFeedback')
  private copyFeedbackTimeout: ReturnType<typeof setTimeout> | undefined

  private showCopyFeedback(message: string) {
    this.copyFeedback.set(message)
    if (this.copyFeedbackTimeout) {
      clearTimeout(this.copyFeedbackTimeout)
    }
    this.copyFeedbackTimeout = setTimeout(() => {
      this.copyFeedback.set(undefined)
      this.copyFeedbackTimeout = undefined
    }, 1400)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    if (this.copyFeedbackTimeout) {
      clearTimeout(this.copyFeedbackTimeout)
      this.copyFeedbackTimeout = undefined
    }
  }

  private handleFill(event: CustomEvent<{entry: Entry}>) {
    void store.fillData(event.detail.entry)
  }

  private handleFillOtp(event: CustomEvent<{entry: Entry}>) {
    const item = event.detail.entry
    const otpId = store.selectedOtpId(item)
    void store.fillOTP(item, otpId)
  }

  private handleCopyFeedback(event: CustomEvent<{message: string}>) {
    this.showCopyFeedback(event.detail.message)
  }

  private handleOtpChange(event: CustomEvent<{entryId: string; otpId: string}>) {
    const item = store.list().find((e) => e.id === event.detail.entryId)
    if (item) {
      store.setSelectedOtp(item, event.detail.otpId)
    }
  }

  private handlePair(event: CustomEvent<{pin: string}>) {
    void store.pairWithPin(event.detail.pin)
  }

  render() {
    const list = store.list()
    const error = store.error()
    const host = store.tabHost() || i18n('app.currentPage')
    const entryLabel =
      list.length === 1 ? i18n('app.entry.one') : i18n('app.entry.many', {count: list.length})
    const copyFeedback = this.copyFeedback()
    let content

    if (store.isLoading()) {
      content = html`<div class="state-panel">
        <cv-progress-ring indeterminate></cv-progress-ring>
        <div class="loading-label">${i18n('app.loading')}</div>
      </div>`
    } else if (error) {
      content =
        !store.gatewayConnected() && store.gatewayReachable()
          ? html`<ext-pairing-form @ext-pair=${this.handlePair}></ext-pairing-form>`
          : html`<div class="state-panel">${error}</div>`
    } else if (!list.length) {
      content = html`<div class="state-panel">${i18n('app.noRecords', {host})}</div>`
    } else {
      content = html`<div class="records">
        ${list.map(
          (item) =>
            html`<ext-record-card
              .entry=${item}
              @ext-fill=${this.handleFill}
              @ext-fill-otp=${this.handleFillOtp}
              @ext-copy-feedback=${this.handleCopyFeedback}
              @ext-otp-change=${this.handleOtpChange}
            ></ext-record-card>`,
        )}
      </div>`
    }

    return html`
      <section class="shell">
        <header class="topbar">
          <div class="headline">
            <h1 class="headline-title">${i18n('app.title')}</h1>
            <div class="headline-host">
              <span class="headline-dot" aria-hidden="true"></span>
              <span>${host}</span>
            </div>
          </div>
          <cv-badge class="count-badge" pill variant="primary">${entryLabel}</cv-badge>
        </header>
        <ext-status-panel></ext-status-panel>
        ${copyFeedback ? html`<div class="copy-toast">${copyFeedback}</div>` : null}
        <div class="content">${content}</div>
      </section>
    `
  }
}
