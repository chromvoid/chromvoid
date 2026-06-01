import {css} from 'lit'

import {AdaptiveModalSurface} from 'root/shared/ui/adaptive-modal-surface'
import {PMIconPickerBase, pmIconPickerBaseStyles} from './pm-icon-picker.base'

const pmIconPickerMobileStyles = css`
  .icon-trigger {
    inline-size: var(--pm-icon-picker-trigger-inline-size, 48px);
    block-size: var(--pm-icon-picker-trigger-block-size, 48px);
    border-radius: var(--cv-radius-2);
  }

  .icon-preview {
    width: 24px;
    height: 24px;
    --pm-avatar-image-padding: 3px;
    --pm-avatar-icon-size: 20px;
  }

  adaptive-modal-surface::part(content) {
    max-width: 100vw;
  }

  .dialog-actions cv-button {
    width: 100%;
    --cv-button-min-height: 44px;
    --cv-button-padding-inline: var(--cv-space-2);
    --cv-button-font-size: var(--cv-font-size-xs);
  }
`

export class PMIconPickerMobile extends PMIconPickerBase {
  static elementName = 'pm-icon-picker-mobile' as const

  static properties = {
    ...PMIconPickerBase.properties,
    dialogOnly: {type: Boolean, attribute: 'dialog-only'},
  }

  static define() {
    AdaptiveModalSurface.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  static styles = [pmIconPickerBaseStyles, pmIconPickerMobileStyles]

  declare dialogOnly: boolean

  constructor() {
    super()
    this.dialogOnly = false
  }

  protected override shouldRenderTrigger(): boolean {
    return !this.dialogOnly
  }
}
