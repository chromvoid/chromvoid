import {CVButton} from '@chromvoid/uikit/components/cv-button'
import {CVIcon} from '@chromvoid/uikit/components/cv-icon'
import {CVInput} from '@chromvoid/uikit/components/cv-input'

import {PMEntryMoveMobile} from '../card/pm-entry-move/pm-entry-move-mobile'
import {PMGroupTargetPickerModel} from '../card/pm-entry-move/pm-entry-move.model'

export class PMGroupTargetPickerMobile extends PMEntryMoveMobile {
  static elementName = 'pm-group-target-picker-mobile' as const

  constructor() {
    super(new PMGroupTargetPickerModel())
  }

  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
    CVButton.define()
    CVIcon.define()
    CVInput.define()
  }

  protected override getSelectionEventName(): string {
    return 'pm-group-target-selected'
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-group-target-picker-mobile': PMGroupTargetPickerMobile
  }
}
