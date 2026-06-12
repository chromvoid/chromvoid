import {afterEach, describe, expect, it, vi} from 'vitest'

import {Entry, ManagerRoot} from '@project/passmanager'

import {PMEntryEditModel} from '../../src/features/passmanager/components/card/entry/entry-edit.model'
import {pmEntryEditorModel} from '../../src/features/passmanager/models/pm-entry-editor.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {passmanagerSshKeygen} from 'root/features/passmanager/service/passmanager-ssh-keygen'

vi.mock('root/features/passmanager/service/passmanager-ssh-keygen', () => ({
  passmanagerSshKeygen: vi.fn(),
}))

function createEntry(options: {
  id: string
  entryType?: 'default' | 'payment_card'
  title?: string
  username?: string
}): Entry {
  return new Entry(
    Object.create(ManagerRoot.prototype) as ManagerRoot,
    {
      id: options.id,
      entryType: options.entryType,
      title: options.title ?? 'Entry title',
      username: options.username ?? 'user',
      urls: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
      otps: [],
      sshKeys: [],
      paymentCard:
        options.entryType === 'payment_card'
          ? {
              cardholderName: 'Alice Doe',
              expMonth: 12,
              expYear: 2032,
              brand: 'visa',
              last4: '1111',
            }
          : undefined,
    } as any,
  )
}

function allowEntryEditing(): void {
  setPassmanagerRoot({isReadOnly: () => false} as never)
}

describe('PMEntryEditModel external editor surface sync', () => {
  afterEach(() => {
    setPassmanagerRoot(undefined)
    pmEntryEditorModel.reset()
    vi.restoreAllMocks()
  })

  it('opens the requested section only once for the same active surface', () => {
    const entry = createEntry({id: 'entry-note'})
    const model = new PMEntryEditModel()
    const beginNoteSpy = vi.spyOn(model, 'beginNoteEdit').mockImplementation(() => {})

    vi.spyOn(pmEntryEditorModel, 'isActiveForEntry').mockReturnValue(true)
    vi.spyOn(pmEntryEditorModel, 'activeSurface').mockReturnValue('note')
    model.syncRequestedSurfaceFromEditor(entry)
    model.syncRequestedSurfaceFromEditor(entry)

    expect(beginNoteSpy).toHaveBeenCalledTimes(1)
    expect(beginNoteSpy).toHaveBeenCalledWith(entry)
  })

  it('maps payment-card title requests to the payment-card section flow', () => {
    const entry = createEntry({id: 'entry-card', entryType: 'payment_card'})
    const model = new PMEntryEditModel()
    const beginPaymentCardSpy = vi.spyOn(model, 'beginPaymentCardEdit').mockImplementation(() => {})

    vi.spyOn(pmEntryEditorModel, 'isActiveForEntry').mockReturnValue(true)
    vi.spyOn(pmEntryEditorModel, 'activeSurface').mockReturnValue('title')
    model.syncRequestedSurfaceFromEditor(entry)

    expect(beginPaymentCardSpy).toHaveBeenCalledTimes(1)
    expect(beginPaymentCardSpy).toHaveBeenCalledWith(entry)
  })

  it('prefills payment-card expiry year draft as two digits', () => {
    allowEntryEditing()
    const entry = createEntry({id: 'entry-card-prefill', entryType: 'payment_card'})
    const model = new PMEntryEditModel()

    model.beginPaymentCardEdit(entry)

    expect(model.paymentCardExpYearDraft()).toBe('32')
  })

  it('publishes dirty state for full entry drafts and clears it on cancel', () => {
    allowEntryEditing()
    const entry = createEntry({id: 'entry-dirty'})
    const model = new PMEntryEditModel()

    model.beginEntryEdit(entry)
    expect(pmEntryEditorModel.dirty()).toBe(false)

    model.setInlineDraft('title', 'Updated title')

    expect(pmEntryEditorModel.dirty()).toBe(true)
    expect(pmEntryEditorModel.dirtyEntryId()).toBe(entry.id)

    model.cancelEntryEdit(entry)

    expect(pmEntryEditorModel.dirty()).toBe(false)
  })

  it('publishes dirty state for note, OTP label, tags, and payment-card drafts', () => {
    allowEntryEditing()
    const entry = createEntry({id: 'entry-section-dirty'})
    const paymentCard = createEntry({id: 'entry-card-dirty', entryType: 'payment_card'})
    const model = new PMEntryEditModel()

    model.beginNoteEdit(entry)
    model.setNoteDraft('Local note')
    expect(pmEntryEditorModel.dirtyEntryId()).toBe(entry.id)
    model.cancelNoteEdit()
    expect(pmEntryEditorModel.dirty()).toBe(false)

    model.beginEntryEdit(entry)
    model.setOtpLabelDraft('otp-1', 'Primary')
    expect(pmEntryEditorModel.dirtyEntryId()).toBe(entry.id)
    model.cancelEntryEdit(entry)

    model.startTagEdit(entry)
    model.setTagDraft(['work'])
    expect(pmEntryEditorModel.dirtyEntryId()).toBe(entry.id)
    model.cancelTagEdit()
    expect(pmEntryEditorModel.dirty()).toBe(false)

    model.beginPaymentCardEdit(paymentCard)
    model.setPaymentCardDraft('cardNumber', '4111 1111 1111 1111')
    expect(pmEntryEditorModel.dirtyEntryId()).toBe(paymentCard.id)
  })

  it('re-seeds full entry drafts when the same requested surface moves to another entry', async () => {
    allowEntryEditing()
    const entryA = createEntry({id: 'entry-cross-a', title: 'Entry A', username: 'alice'})
    const entryB = createEntry({id: 'entry-cross-b', title: 'Entry B', username: 'bob'})
    const updateB = vi.spyOn(entryB, 'update').mockResolvedValue(true)
    const model = new PMEntryEditModel()

    pmEntryEditorModel.openSurface(entryA.id, 'entry')
    model.syncRequestedSurfaceFromEditor(entryA)
    model.setInlineDraft('title', 'Entry A local draft')

    pmEntryEditorModel.openSurface(entryB.id, 'entry')
    model.syncRequestedSurfaceFromEditor(entryB)
    await expect(model.saveEntryEdit(entryB)).resolves.toBe(true)

    expect(updateB).toHaveBeenCalledWith(
      expect.objectContaining({title: 'Entry B', username: 'bob'}),
      undefined,
      undefined,
    )
  })

  it('clears secret-bearing edit drafts on cancel', () => {
    allowEntryEditing()
    const entry = createEntry({id: 'entry-cancel-secrets'})
    const paymentCard = createEntry({id: 'entry-card-cancel-secrets', entryType: 'payment_card'})
    const model = new PMEntryEditModel()

    model.actions.applySavedSecrets({
      password: 'draft-password',
      note: 'draft-note',
      cardPan: '4111111111111111',
      cardCvv: '123',
    })

    model.beginEntryEdit(entry)
    expect(model.inlinePassword()).toBe('draft-password')
    expect(model.noteDraft()).toBe('draft-note')
    model.cancelEntryEdit(entry)
    expect(model.inlinePassword()).toBe('')
    expect(model.noteDraft()).toBe('')

    model.beginPaymentCardEdit(paymentCard)
    expect(model.paymentCardNumberDraft()).toBe('4111111111111111')
    expect(model.paymentCardCvvDraft()).toBe('123')
    model.cancelEntryEdit(paymentCard)
    expect(model.paymentCardNumberDraft()).toBe('')
    expect(model.paymentCardCvvDraft()).toBe('')
  })

  it('clears dirty state after successful full entry save', async () => {
    allowEntryEditing()
    const entry = createEntry({id: 'entry-save-dirty'})
    vi.spyOn(entry, 'update').mockResolvedValue(true)
    const model = new PMEntryEditModel()

    model.beginEntryEdit(entry)
    model.setInlineDraft('title', 'Updated title')
    expect(pmEntryEditorModel.dirty()).toBe(true)

    await expect(model.saveEntryEdit(entry)).resolves.toBe(true)

    expect(pmEntryEditorModel.dirty()).toBe(false)
  })

  it('keeps OTP snippet open while native QR scanner is active', () => {
    const model = new PMEntryEditModel()

    model.sectionSnippet.set('otp')
    model.otpDraft.setQrScannerScanning(true)
    model.closeSectionSnippet()

    expect(model.sectionSnippet()).toBe('otp')
    expect(model.otpSaving()).toBe(false)
  })

  it('saves full entry edits on success', async () => {
    const entry = createEntry({id: 'entry-save'})
    const updateEntry = vi.spyOn(entry, 'update').mockResolvedValue(true)
    const model = new PMEntryEditModel()

    model.inlineTitle.set(entry.title ?? '')
    model.inlineUsername.set(entry.username ?? '')
    model.inlineWebsite.set('')
    model.setInlineDraft('title', 'Updated title')

    await expect(model.saveEntryEdit(entry)).resolves.toBe(true)

    expect(updateEntry).toHaveBeenCalledWith(
      expect.objectContaining({title: 'Updated title'}),
      undefined,
      undefined,
    )
  })

  it('keeps entry edit state and exposes an error when saving fails', async () => {
    const entry = createEntry({id: 'entry-save-fail'})
    vi.spyOn(entry, 'update').mockRejectedValue(new Error('save failed'))
    const model = new PMEntryEditModel()

    model.inlineTitle.set(entry.title ?? '')
    model.inlineUsername.set(entry.username ?? '')
    model.inlineWebsite.set('')
    model.setInlineDraft('title', 'Updated title')

    await expect(model.saveEntryEdit(entry)).resolves.toBe(false)

    expect(model.inlineSaving()).toBe(false)
    expect(model.inlineError()).toBe('save failed')
  })

  it('saves two-digit payment-card expiry years as full years', async () => {
    const entry = createEntry({id: 'entry-card-save', entryType: 'payment_card'})
    const updateEntry = vi.spyOn(entry, 'update').mockResolvedValue(undefined)
    const saveCardPan = vi.spyOn(entry, 'saveCardPan').mockResolvedValue(true)
    const saveCardCvv = vi.spyOn(entry, 'saveCardCvv').mockResolvedValue(true)
    const model = new PMEntryEditModel()

    model.paymentCardTitleDraft.set('Team Visa')
    model.paymentCardholderNameDraft.set('Alice Doe')
    model.paymentCardNumberDraft.set('4111 1111 1111 1111')
    model.paymentCardExpMonthDraft.set('12')
    model.paymentCardExpYearDraft.set('33')
    model.paymentCardCvvDraft.set('123')

    await expect(model.savePaymentCardEdit(entry)).resolves.toBe(true)

    expect(updateEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentCard: expect.objectContaining({
          expMonth: 12,
          expYear: 2033,
        }),
      }),
      undefined,
      undefined,
    )
    expect(saveCardPan).toHaveBeenCalledWith('4111111111111111')
    expect(saveCardCvv).toHaveBeenCalledWith('123')
  })

  it('does not commit payment-card metadata or last4 before PAN/CVV saves succeed', async () => {
    const entry = createEntry({id: 'entry-card-pan-fail', entryType: 'payment_card'})
    const updateEntry = vi.spyOn(entry, 'update').mockResolvedValue(undefined)
    const saveCardPan = vi.spyOn(entry, 'saveCardPan').mockResolvedValue(false)
    const saveCardCvv = vi.spyOn(entry, 'saveCardCvv').mockResolvedValue(true)
    const model = new PMEntryEditModel()

    model.paymentCardTitleDraft.set('Team Visa')
    model.paymentCardholderNameDraft.set('Alice Doe')
    model.paymentCardNumberDraft.set('5555 5555 5555 4444')
    model.paymentCardExpMonthDraft.set('12')
    model.paymentCardExpYearDraft.set('33')
    model.paymentCardCvvDraft.set('123')

    await expect(model.savePaymentCardEdit(entry)).resolves.toBe(false)

    expect(saveCardPan).toHaveBeenCalledWith('5555555555554444')
    expect(saveCardCvv).not.toHaveBeenCalled()
    expect(updateEntry).not.toHaveBeenCalled()
    expect(entry.paymentCard?.last4).toBe('1111')
  })

  it('rejects four-digit payment-card expiry years during edit save', async () => {
    const entry = createEntry({id: 'entry-card-invalid-year', entryType: 'payment_card'})
    const updateEntry = vi.spyOn(entry, 'update').mockResolvedValue(undefined)
    const model = new PMEntryEditModel()

    model.paymentCardTitleDraft.set('Team Visa')
    model.paymentCardholderNameDraft.set('Alice Doe')
    model.paymentCardNumberDraft.set('4111 1111 1111 1111')
    model.paymentCardExpMonthDraft.set('12')
    model.paymentCardExpYearDraft.set('2033')

    await expect(model.savePaymentCardEdit(entry)).resolves.toBe(false)

    expect(model.paymentCardError()).not.toBe('')
    expect(updateEntry).not.toHaveBeenCalled()
  })

  it('generates and stores SSH key metadata through the edit model', async () => {
    vi.mocked(passmanagerSshKeygen).mockResolvedValue({
      key_id: 'key-1',
      key_type: 'ed25519',
      fingerprint: 'SHA256:test',
      public_key_openssh: 'ssh-ed25519 test',
    })
    const entry = createEntry({id: 'entry-ssh'})
    const updateSshKeys = vi.spyOn(entry, 'updateSshKeys').mockResolvedValue(true)
    const model = new PMEntryEditModel()

    model.sshDraft.reset({entryTitle: entry.title, username: entry.username})

    await expect(model.generateSshKey(entry)).resolves.toBe(true)

    expect(passmanagerSshKeygen).toHaveBeenCalledWith({
      entryId: entry.id,
      keyType: 'ed25519',
      comment: 'user@Entry title',
    })
    expect(updateSshKeys).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'key-1',
        type: 'ed25519',
        fingerprint: 'SHA256:test',
        name: 'Entry title SSH',
      }),
    ])
    expect(model.sshResult()).toMatchObject({
      keyId: 'key-1',
      publicKey: 'ssh-ed25519 test',
      pending: false,
    })
    expect(model.sshGenerating()).toBe(false)
  })

  it('keeps SSH generator open and reports failures', async () => {
    vi.mocked(passmanagerSshKeygen).mockRejectedValue(new Error('keygen failed'))
    const entry = createEntry({id: 'entry-ssh-fail'})
    const model = new PMEntryEditModel()

    model.sshDraft.reset({entryTitle: entry.title, username: entry.username})
    model.sshGeneratorOpen.set(true)

    await expect(model.generateSshKey(entry)).resolves.toBe(false)

    expect(model.sshGeneratorOpen()).toBe(true)
    expect(model.sshGenerating()).toBe(false)
    expect(model.sshError()).toBe('keygen failed')
  })
})
