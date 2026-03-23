import {PMIconPickerBase, pmIconPickerBaseStyles} from './pm-icon-picker.base'

export class PMIconPicker extends PMIconPickerBase {
  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  static styles = [pmIconPickerBaseStyles]
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-icon-picker': PMIconPicker
  }
}
