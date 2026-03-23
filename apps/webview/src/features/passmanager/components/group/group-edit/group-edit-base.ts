import {XLitElement} from '@statx/lit'

import {html, nothing} from 'lit'

import {i18n} from '@project/passmanager'
import {PMGroupEditModel} from './group-edit.model'

export abstract class PMGroupEditBase extends XLitElement {
  protected readonly model = new PMGroupEditModel()

  public override connectedCallback(): void {
    super.connectedCallback()
    this.model.syncFromCurrentGroup()
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault()
    const group = this.model.getCurrentGroup()
    if (!group) {
      return
    }

    const form = event.currentTarget as HTMLFormElement
    await this.model.submit(form, group)
    this.editEnd()
  }

  protected onIconChange(event: CustomEvent<{iconRef: string | undefined}>): void {
    this.model.setIconRef(event.detail.iconRef)
  }

  protected editEnd(): void {
    this.dispatchEvent(new CustomEvent('editEnd'))
  }

  protected override render() {
    const group = this.model.getCurrentGroup()
    if (!group) {
      return nothing
    }

    return html`
      <form @submit=${this.onSubmit}>
        <label>${i18n('icon:title')}</label>
        <pm-icon-picker
          .iconRef=${this.model.editedIconRef}
          icon="folder"
          @pm-icon-change=${this.onIconChange}
        ></pm-icon-picker>

        <label>${i18n('group:name')} </label>
        <cv-input
          name="name"
          .value=${group.name || ''}
          placeholder=${i18n('group:name:placeholder')}
        ></cv-input>

        <div class="edit-actions">
          <cv-button variant="default" @click=${this.editEnd}>${i18n('button:cancel')}</cv-button>
          <cv-button variant="primary" type="submit">${i18n('button:save')}</cv-button>
        </div>
      </form>
    `
  }
}
