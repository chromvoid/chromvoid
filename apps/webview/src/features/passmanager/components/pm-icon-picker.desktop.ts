import {CVDialog} from '@chromvoid/uikit/components/cv-dialog'
import {html} from '@chromvoid/uikit/reatom-lit'

import {PMIconPickerBase, pmIconPickerBaseStyles} from './pm-icon-picker.base'

export class PMIconPicker extends PMIconPickerBase {
  static define() {
    CVDialog.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  static styles = [pmIconPickerBaseStyles]

  protected override renderDialog() {
    return html`
      <cv-dialog
        .open=${this.iconPickerModel.dialogOpen()}
        .closeOnOutsidePointer=${true}
        @cv-change=${this.onDialogChange}
      >
        ${this.renderDialogContent()}
      </cv-dialog>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-icon-picker': PMIconPicker
  }
}
