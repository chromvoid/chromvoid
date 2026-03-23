import {XLitElement} from '@statx/lit'

import {css, html, nothing} from 'lit'

import {UploadProgressModel} from './upload-progress.model'

import './upload-progress.desktop'
import './upload-progress.mobile'

export class UploadProgress extends XLitElement {
  static define() {
    customElements.define('upload-progress', this)
  }

  private model = new UploadProgressModel()

  static styles = css`
    :host {
      display: block;
      position: fixed;
      inset-block-end: 20px;
      inset-inline-end: 20px;
      z-index: 1000;
    }

    :host([data-mobile]) {
      position: static;
    }
  `

  disconnectedCallback() {
    super.disconnectedCallback()
    this.model.cancelAutoHideClear()
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties)
    if (!this.model.hasTasks()) {
      this.model.cancelAutoHideClear()
      return
    }
    this.model.reconcileAutoHideClear()
  }

  render() {
    if (!this.model.hasTasks()) return nothing

    const mobile = this.model.isMobile()

    if (mobile) {
      this.setAttribute('data-mobile', '')
    } else {
      this.removeAttribute('data-mobile')
    }

    if (mobile) {
      return html`<upload-progress-mobile .model=${this.model}></upload-progress-mobile>`
    }

    return html`<upload-progress-desktop .model=${this.model}></upload-progress-desktop>`
  }
}
