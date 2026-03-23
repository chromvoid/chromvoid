import {state} from '@statx/core'
import {XLitElement} from '@statx/lit'

import {css, html, nothing} from 'lit'

import {i18n} from '@project/passmanager'

export class PMEntryFilesLoad extends XLitElement {
  static define() {
    customElements.define('pm-entry-files-load', this)
  }
  static styles = css`
    input {
      display: none;
    }
    ul {
      font-size: 14px;
    }
  `
  files = state<File[]>([], {name: 'files'})

  private getFiles() {
    return this.shadowRoot?.querySelector('#file') as HTMLInputElement
  }

  private handleClick() {
    this.getFiles().click()
  }

  private async handleChangeFile() {
    const files = this.getFiles().files
    const data = [...(files ?? [])]
    this.files.set(data)
  }

  renderList() {
    const files = this.files()
    if (!files.length) {
      return nothing
    }
    return html`<ul>
      ${files.map((item) => {
        return html`<li>${item.name}</li>`
      })}
    </ul>`
  }

  render() {
    return html`<slot name="title"><h3>${i18n('file:add:title')}</h3></slot>
      <input type="file" id="file" multiple @change=${this.handleChangeFile} />
      <cv-button size="small" @click=${this.handleClick} type="submit">${i18n('button:browse')}...</cv-button>
      ${this.renderList()} `
  }
}
