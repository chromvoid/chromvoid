import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {i18n, setLang} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {sharedStyles} from 'root/shared/ui/shared-styles'

export class StatusBar extends XLitElement {
  static define() {
    if (!customElements.get('chromvoid-footer')) {
      customElements.define('chromvoid-footer', this)
    }
  }
  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        background: var(--bars-background);
        color: var(--bars-color);
        container-type: inline-size;
      }

      footer {
        display: grid;
        grid-template-columns: 1fr 1fr;
        justify-content: space-between;
        gap: 20px;
        align-items: center;
        padding-block: 12px;
        padding-inline: 20px;
        font-size: 14px;
        white-space: nowrap;

        .copyright::part(base) {
          justify-content: end;
        }

        @container (max-width: 600px) {
          text-align: center;
          grid-template-columns: 1fr;
          gap: 10px;

          .copyright::part(base) {
            justify-content: center;
          }
        }

        @container (max-width: 400px) {
          gap: 0;
        }
      }

      .info {
        padding: 5px;

        @container (max-width: 600px) {
          white-space: break-spaces;
        }
      }

      br {
        @container (max-width: 600px) {
          display: none;
        }
      }
    `,
  ]
  changeLang(e: CustomEvent) {
    const value = (e.target as HTMLInputElement).value as any
    setLang(value)
  }
  render() {
    const stateData = getAppContext().state.data()
    if (!stateData) {
      return null
    }

    return html`<footer class="wrapper">
      <small class="info"
        >${i18n('device-version')}: ${stateData.ChromVoidVersion}<br />
        ${i18n('serial')}: ${stateData.SerialNum}</small
      >
      <cv-button
        target="_blank"
        href="https://chromvoid.io/?utm_source=ChromVoidUNOdevice"
        variant="ghost"
        class="copyright"
        >${i18n('copyright')}${new Date().getFullYear()}</cv-button
      >
    </footer>`
  }
}
