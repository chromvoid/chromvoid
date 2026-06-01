import {css} from 'lit'
import {ReatomLitElement, html} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import {FileViewerModel} from './viewer.model'

export class FileViewer extends ReatomLitElement {
  static properties = {
    file: {attribute: false},
  }

  private readonly model = new FileViewerModel()

  static define() {
    if (!customElements.get('file-viewer')) {
      customElements.define('file-viewer', this)
    }
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

  get file() {
    return this.model.state.file()
  }

  set file(file: File | undefined) {
    this.model.actions.setFile(file)
  }

  override disconnectedCallback(): void {
    this.model.disconnect()
    super.disconnectedCallback()
  }

  protected render() {
    const file = this.model.state.file()
    if (!file) {
      return i18n('file:no_file')
    }

    if (file.type.startsWith('image')) {
      return html`<img src=${this.model.state.imageUrl()} />`
    }
    if (file.type.startsWith('text')) {
      if (this.model.state.textLoading()) {
        return i18n('loading')
      }

      return html`<cv-textarea .value=${this.model.state.textValue()}></cv-textarea>`
    }
    return i18n('file:unknown_type')
  }
}
