import {CVProgress} from '@chromvoid/uikit/components/cv-progress'
import {CVCopyButton} from '@chromvoid/uikit/components/cv-copy-button'
import {ImportDialog} from '@chromvoid/password-import/ui/import-dialog'

import {PMCardHeaderMobile} from './card/pm-card-header'
import {PMEntry, PMEntryMobile, PMEntryOTP} from './card'
import {PMEntryCreateDesktop, PMEntryCreateMobile} from './card/entry-create'
import {PMEntryOTPCreate, PMEntryOTPCreateSheet} from './card/entry-otp-create'
import {PMEntrySshGenerator} from './card/entry-ssh'
import {PMEntryMove, PMEntryMoveMobile, PMEntryMoveSheet} from './card/pm-entry-move'
import {PMGroupCreateDesktop, PMGroupCreateMobile} from './group/group-create'
import {PMIconPicker} from './pm-icon-picker'
import {PMIconPickerMobile} from './pm-icon-picker.mobile'

function defineOnce(tagName: string, define: () => void): void {
  if (customElements.get(tagName)) return
  define()
}

export function registerPassmanagerExtendedComponents(): void {
  CVProgress.define()
  defineOnce(CVCopyButton.elementName, () => CVCopyButton.define())
  defineOnce('pm-entry', () => PMEntry.define())
  defineOnce('pm-entry-mobile', () => PMEntryMobile.define())
  defineOnce('pm-entry-create-desktop', () => PMEntryCreateDesktop.define())
  defineOnce('pm-entry-create-mobile', () => PMEntryCreateMobile.define())
  defineOnce('pm-entry-otp-create', () => PMEntryOTPCreate.define())
  defineOnce(PMEntryOTPCreateSheet.elementName, () => PMEntryOTPCreateSheet.define())
  defineOnce('pm-entry-otp', () => PMEntryOTP.define())
  defineOnce('pm-entry-move', () => PMEntryMove.define())
  defineOnce('pm-entry-move-mobile', () => PMEntryMoveMobile.define())
  defineOnce(PMEntryMoveSheet.elementName, () => PMEntryMoveSheet.define())
  defineOnce('pm-group-create-desktop', () => PMGroupCreateDesktop.define())
  defineOnce('pm-group-create-mobile', () => PMGroupCreateMobile.define())
  defineOnce('pm-card-header-mobile', () => PMCardHeaderMobile.define())
  defineOnce('pm-icon-picker', () => PMIconPicker.define())
  defineOnce('pm-icon-picker-mobile', () => PMIconPickerMobile.define())
  defineOnce(PMEntrySshGenerator.elementName, () => PMEntrySshGenerator.define())
  defineOnce('pm-import-dialog', () => ImportDialog.define())
}
