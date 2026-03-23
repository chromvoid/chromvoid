import {XLitElement} from '@statx/lit'

import {css, html, render} from 'lit'

import Swal from 'sweetalert2'

import type {EntryFile} from '@project/passmanager'

export class PMEntryFileItem extends XLitElement {
  static define() {
    customElements.define('pm-entry-file-item', this)
  }
  static styles = css`
    :host {
      display: grid;
      grid-template-columns: auto min-content min-content min-content;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }
    :host([edit]) {
      grid-template-columns: auto min-content min-content;
    }
    :host([edit]) .not-editable {
      display: none;
    }
    :host(:not([edit])) .editable {
      display: none;
    }
    .file-size {
      white-space: nowrap;
      color: var(--cv-color-text-muted);
    }
  `
  _file: EntryFile | undefined

  set file(entry: EntryFile) {
    this._file = entry
    this.requestUpdate()
  }

  handlePreview() {
    const tag = html`<file-viewer .file=${this._file?.file}></file-viewer>`
    const el = document.createElement('div')
    render(tag, el)

    Swal.fire({
      title: this._file?.name,
      html: el,
    })
  }

  render() {
    const file = this._file
    if (!file) {
      return '-'
    }
    return html`
      <span>${file.name}</span>

      <span class="file-size"
        >${(window as any).formatFileSize
          ? (window as any).formatFileSize(file.size)
          : file.size + ' B'}</span
      >

      <cv-button class="not-editable" size="small" @click=${this.handlePreview}>
        <cv-icon name="eyeglasses"></cv-icon>
      </cv-button>
      <cv-button class="not-editable" size="small" .href=${file.urlObject()} download=${file.name}>
        <cv-icon name="cloud-download"></cv-icon>
      </cv-button>
      <cv-button class="editable" @click=${() => file.remove()} size="small" variant="danger">
        <cv-icon name="x-lg"></cv-icon>
      </cv-button>
    `
  }
}
