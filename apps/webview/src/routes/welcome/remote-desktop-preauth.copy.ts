import {html, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'

export type RemotePreauthDeviceLabelCopyKey =
  | 'remote:preauth-cable-detected'
  | 'remote:preauth-usb-detected'
  | 'remote:preauth-wait-unlock-description'
  | 'remote:preauth-wait-approval-description'

const DEVICE_LABEL_SLOT = '__CHROMVOID_DEVICE_LABEL_SLOT__'

export function renderDeviceLabelCopy(key: RemotePreauthDeviceLabelCopyKey, label: string): TemplateResult {
  const copy = i18n(key, {label: DEVICE_LABEL_SLOT})
  const slotIndex = copy.indexOf(DEVICE_LABEL_SLOT)

  if (slotIndex < 0) {
    return html`<bdi dir="auto">${label}</bdi> ${copy}`
  }

  return html`${copy.slice(0, slotIndex)}<bdi dir="auto">${label}</bdi>${copy.slice(
      slotIndex + DEVICE_LABEL_SLOT.length,
    )}`
}
