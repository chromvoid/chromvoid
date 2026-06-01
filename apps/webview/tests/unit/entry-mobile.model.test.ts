import {afterEach, describe, expect, it, vi} from 'vitest'

import {Entry, ManagerRoot} from '@project/passmanager'

import {PMEntryEditModel} from '../../src/features/passmanager/components/card/entry/entry-edit.model'
import {pmEntryEditorModel} from '../../src/features/passmanager/models/pm-entry-editor.model'
import {passmanagerSshKeygen} from 'root/features/passmanager/service/passmanager-ssh-keygen'

vi.mock('root/features/passmanager/service/passmanager-ssh-keygen', () => ({
  passmanagerSshKeygen: vi.fn(),
}))

function createEntry(options: {id: string; entryType?: 'default' | 'payment_card'}): Entry {
  return new Entry(
    Object.create(ManagerRoot.prototype) as ManagerRoot,
    {
      id: options.id,
      entryType: options.entryType,
      title: 'Entry title',
      username: 'user',
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

describe('PMEntryEditModel external editor surface sync', () => {
  afterEach(() => {
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
