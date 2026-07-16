import {atom} from '@reatom/core'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {CVButton, CVDialog, CVField, CVIcon} from '@chromvoid/uikit'
import type {ManagerRoot} from '@project/passmanager/core'

import {runtimeModeModel} from '../../src/core/runtime/runtime-mode.model'
import {OtpImportReview} from '../../src/features/passmanager/components/otp-import-review/otp-import-review'
import {otpImportReviewModel} from '../../src/features/passmanager/components/otp-import-review/otp-import-review.model'
import {clearPassmanagerRoot, setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {
  clearAppContext,
  createMockAppContext,
  initAppContext,
  type AppContext,
} from '../../src/shared/services/app-context'

async function settle(element: OtpImportReview): Promise<void> {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

describe('OtpImportReview', () => {
  beforeEach(() => {
    CVButton.define()
    CVDialog.define()
    CVField.define()
    CVIcon.define()
    OtpImportReview.define()
    runtimeModeModel.setCoreMode('local')
    const vaultData = atom({StorageOpened: true})
    initAppContext(
      createMockAppContext({
        state: {data: vaultData} as AppContext['state'],
      }),
    )
    setPassmanagerRoot({
      isReadOnly: () => false,
      allEntries: [],
      getEntry: () => undefined,
    } as unknown as ManagerRoot)
  })

  afterEach(async () => {
    document.body.innerHTML = ''
    otpImportReviewModel.pending.set(null)
    await otpImportReviewModel.cancel()
    clearPassmanagerRoot()
    clearAppContext()
  })

  it('keeps the primary action available for validation and focuses the missing target after submit', async () => {
    otpImportReviewModel.pending.set({
      pending_id: 'pending-render',
      origin: 'system_url',
      expires_at_ms: Date.now() + 120_000,
    })
    otpImportReviewModel.otpDraft.applyDraft({
      id: '',
      secret: 'JBSWY3DPEHPK3PXP',
      label: 'alice@example.com',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      encoding: 'base32',
      type: 'TOTP',
    })
    otpImportReviewModel.phase.set('review')
    const element = document.createElement('otp-import-review') as OtpImportReview
    document.body.append(element)
    await settle(element)

    const primary = Array.from(element.shadowRoot?.querySelectorAll<CVButton>('cv-button') ?? []).find(
      (button) => button.variant === 'primary',
    )
    await primary?.updateComplete
    expect(primary?.disabled).toBe(false)
    primary?.shadowRoot
      ?.querySelector('button')
      ?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(element)

    expect(otpImportReviewModel.targetError()).not.toBe('')
    expect(primary?.disabled).toBe(false)
    expect(element.shadowRoot?.activeElement?.id).toBe('otp-import-target-existing')
    expect(element.shadowRoot?.querySelector('[role="alert"]')).not.toBeNull()
  })
})
