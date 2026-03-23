import {LitElement, css, html} from 'lit'
import {until} from 'lit/directives/until.js'

import {i18n} from '@project/passmanager'

export class FileViewer extends LitElement {
  static define() {
    customElements.define('file-viewer', this)
  }
  static styles = css`
    :host {
      display: block;
      max-width: 100%;
    }
    img {
      max-width: min(600px, 90%);
    }
  `
  private _file: File | undefined
  _url = undefined

  set file(file: File) {
    this._file = file
    this.requestUpdate()
  }

  render() {
    const file = this._file
    if (!file) {
      return i18n('file:no_file')
    }

    if (file.type.startsWith('image')) {
      return html`<img src=${URL.createObjectURL(file)} />`
    }
    if (file.type.startsWith('text')) {
      return html`${until(
        file.text().then((v) => html`<cv-textarea .value=${v}></cv-textarea>`),
        i18n('loading'),
      )}`
    }
    return i18n('file:unknown_type')
  }
}
