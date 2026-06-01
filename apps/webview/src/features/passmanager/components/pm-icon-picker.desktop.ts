import {PMIconPickerBase, pmIconPickerBaseStyles} from './pm-icon-picker.base'
import {AdaptiveModalSurface} from 'root/shared/ui/adaptive-modal-surface'

export class PMIconPicker extends PMIconPickerBase {
  static define() {
    AdaptiveModalSurface.define()
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
