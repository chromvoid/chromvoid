import {XLitElement} from '@statx/lit'

import {html, nothing} from 'lit'
import type {CVSelect} from '@chromvoid/uikit'

import {i18n} from '@project/passmanager'
import {PMGroupCreateModel} from './group-create.model'
import {pmEntryCardStyles, pmEntryCreateStyles, pmGroupCreateStyles} from './styles'

export class PMGroupCreate extends XLitElement {
  static define() {
    customElements.define('pm-group-create', this)
  }

  static properties = {
    hideBack: {type: Boolean, attribute: 'hide-back'},
  }

  static styles = [pmEntryCardStyles, pmEntryCreateStyles, pmGroupCreateStyles]

  declare hideBack: boolean

  private readonly model = new PMGroupCreateModel()

  constructor() {
    super()
    this.hideBack = false
  }

  connectedCallback(): void {
    super.connectedCallback()
    setTimeout(() => {
      //@ts-ignore
      this.shadowRoot?.querySelector('[name="title"]')?.focus()
    })
  }

  private async onSubmit(e: Event) {
    e.preventDefault()

    const form = e.target as HTMLFormElement
    const selectedEntries = this.shadowRoot?.querySelector<CVSelect>('#select')?.selectedValues

    await this.model.submit(form, selectedEntries)
  }

  private onIconChange(e: CustomEvent<{iconRef: string | undefined}>) {
    this.model.setIconRef(e.detail.iconRef)
  }

  private renderList() {
    const entries = this.model.entries()
    if (!entries.length) {
      return html` <h3>${i18n('group:entries')}</h3>
        <p>[${i18n('group:no_entries')}]</p>`
    }

    return html`
      <h3>${i18n('group:entries')}</h3>
      <cv-select
        id="select"
        .selectionMode=${'multiple'}
        .closeOnSelect=${false}
        name="entries"
        size="small"
        placeholder=${i18n('group:entries:placeholder')}
        aria-label=${i18n('group:entries')}
      >
        ${entries.map((item) => html`<cv-select-option value=${item.id}>${item.title}</cv-select-option>`)}
      </cv-select>
    `
  }

  protected render() {
    if (!window.passmanager) {
      return nothing
    }

    return html`<form @submit=${this.onSubmit}>
      <h1 class="title">
        ${this.hideBack ? nothing : html`<back-button></back-button>`} ${i18n('group:create:title')}
      </h1>
      <cv-input
        type="text"
        size="small"
        name="name"
        autocomplete="card-title"
        autofocus
        placeholder=${i18n('group:name:placeholder')}
      >
        <span slot="label">${i18n('group:name')}</span>
      </cv-input>
      <label>${i18n('icon:title')}</label>
      <pm-icon-picker
        .iconRef=${this.model.iconRef}
        icon="folder"
        @pm-icon-change=${this.onIconChange}
      ></pm-icon-picker>
      ${this.renderList()}
      <cv-button class="submit" type="submit" variant="primary" size="small"
        >${i18n('group:create:button')}</cv-button
      >
    </form> `
  }
}
