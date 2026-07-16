import {afterEach, describe, expect, it} from 'vitest'

import {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import type {CVDialog} from '@chromvoid/uikit/components/cv-dialog'

import {MobileUsbHostApproval} from '../../src/features/mobile-usb-host/mobile-usb-host-approval'
import {mobileUsbHostApprovalModel} from '../../src/features/mobile-usb-host/mobile-usb-host-approval.model'

async function settle(element: {updateComplete: Promise<unknown>}): Promise<void> {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

describe('mobile-usb-host-approval', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    mobileUsbHostApprovalModel.pairingApproval.set(null)
    mobileUsbHostApprovalModel.sessionApproval.set(null)
    mobileUsbHostApprovalModel.busy.set(false)
    mobileUsbHostApprovalModel.errorText.set(null)
  })

  it('opens as a non-dismissible native top-layer alert above an existing bottom sheet', async () => {
    CVBottomSheet.define()
    MobileUsbHostApproval.define()

    const bottomSheet = document.createElement('cv-bottom-sheet') as CVBottomSheet
    bottomSheet.open = true
    document.body.append(bottomSheet)
    await settle(bottomSheet)

    const bottomSheetDialog = bottomSheet.shadowRoot?.querySelector('cv-dialog') as CVDialog | null
    expect(bottomSheetDialog).not.toBeNull()
    await settle(bottomSheetDialog!)
    expect(bottomSheetDialog?.shadowRoot?.querySelector('dialog.portal-shell')).not.toBeNull()

    const approval = document.createElement('mobile-usb-host-approval') as MobileUsbHostApproval
    document.body.append(approval)
    await settle(approval)
    expect(approval.shadowRoot?.querySelector('cv-dialog')).toBeNull()

    mobileUsbHostApprovalModel.sessionApproval.set({
      attempt_id: 'session-attempt-1',
      peer_id: 'desktop-peer-1',
      peer_label: 'MacBook',
      transport_type: 'UsbMobile',
      decision: 'pending',
      expires_at_ms: Date.now() + 60_000,
    })
    await settle(approval)

    const approvalDialog = approval.shadowRoot?.querySelector('cv-dialog') as CVDialog | null
    expect(approvalDialog).not.toBeNull()
    await settle(approvalDialog!)

    expect(approvalDialog?.open).toBe(true)
    expect(approvalDialog?.modal).toBe(true)
    expect(approvalDialog?.alwaysOnTop).toBe(true)
    expect(approvalDialog?.type).toBe('alertdialog')
    expect(approvalDialog?.closeOnEscape).toBe(false)
    expect(approvalDialog?.closeOnOutsidePointer).toBe(false)
    expect(approvalDialog?.closeOnOutsideFocus).toBe(false)
    expect(approvalDialog?.shadowRoot?.querySelector('dialog.portal-shell')).not.toBeNull()
    expect(approval.shadowRoot?.querySelector('code.meta-value[dir="ltr"]')?.textContent).toBe(
      'desktop-peer-1',
    )
    expect(
      [...(approval.shadowRoot?.querySelectorAll('code.meta-value[dir="ltr"]') ?? [])].some(
        (value) => value.textContent === 'UsbMobile',
      ),
    ).toBe(true)
    expect(approval.shadowRoot?.querySelector('.meta-value bdi[dir="auto"]')?.textContent).toBe('MacBook')
    expect(bottomSheetDialog?.open).toBe(true)
  })
})
