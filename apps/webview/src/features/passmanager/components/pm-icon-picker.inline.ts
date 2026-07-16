import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {css, type TemplateResult} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {PMAvatarIcon} from './pm-avatar-icon'
import {ICON_ACCEPT, PMIconPickerBase, pmIconPickerBaseStyles} from './pm-icon-picker.base'

const pmIconPickerInlineStyles = css`
  :host {
    display: block;
  }

  .dialog-body {
    gap: var(--cv-space-4);
  }
`

export class PMIconPickerInline extends PMIconPickerBase {
  static elementName = 'pm-icon-picker-inline' as const
  static styles = [pmIconPickerBaseStyles, pmIconPickerInlineStyles]

  static define() {
    CVButton.define()
    CVIcon.define()
    PMAvatarIcon.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  protected override renderDialog(): TemplateResult {
    return html``
  }

  protected override render(): TemplateResult {
    return html`
      ${this.renderDialogBody()}
      <input id="icon-file" type="file" accept=${ICON_ACCEPT} @change=${this.onIconFileChange} hidden />
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-icon-picker-inline': PMIconPickerInline
  }
}
