import {describe, expect, it, vi} from 'vitest'

import type {Entry} from '@project/passmanager'
import {state} from '@statx/core'
import type {PMEntrySecretResource, PMEntrySessionModel} from '../../src/features/passmanager/components/card/entry/entry-session.model'
import {PMEntryEditModel} from '../../src/features/passmanager/components/card/entry-edit/entry-edit.model'

describe('PMEntryEditModel', () => {
  it('loads secrets from shared session instead of reading entry directly', async () => {
    const model = new PMEntryEditModel()
    const passwordResource = state<PMEntrySecretResource>({
      status: 'ready',
      value: 'pw-1',
    })
    const noteResource = state<PMEntrySecretResource>({
      status: 'ready',
      value: 'note-1',
    })
    const session = {
      ensureSecretsLoaded: vi.fn(async () => {}),
      passwordResource,
      noteResource,
      applySavedSecrets: vi.fn(),
    } as unknown as PMEntrySessionModel

    const password = vi.fn(async () => 'should-not-read-password')
    const note = vi.fn(async () => 'should-not-read-note')

    const entry = {
      title: 'Entry',
      username: 'alice',
      iconRef: undefined,
      urls: [],
      data: () => ({urls: []}),
      password,
      note,
    } as unknown as Entry

    model.loadFromEntry(entry, session)
    await Promise.resolve()
    await Promise.resolve()

    expect(session.ensureSecretsLoaded).toHaveBeenCalledOnce()
    expect(password).not.toHaveBeenCalled()
    expect(note).not.toHaveBeenCalled()
    expect(model.editedPassword()).toBe('pw-1')
    expect(model.editedNote()).toBe('note-1')
  })

  it('applies dirty secrets back into shared session after save', async () => {
    const model = new PMEntryEditModel()
    const applySavedSecrets = vi.fn()
    const session = {
      ensureSecretsLoaded: vi.fn(async () => {}),
      passwordResource: state<PMEntrySecretResource>({
        status: 'ready',
        value: 'pw-1',
      }),
      noteResource: state<PMEntrySecretResource>({
        status: 'ready',
        value: 'note-1',
      }),
      applySavedSecrets,
    } as unknown as PMEntrySessionModel
    const update = vi.fn(async () => {})

    const entry = {
      title: 'Entry',
      username: 'alice',
      iconRef: undefined,
      urls: [],
      data: () => ({
        id: 'entry-edit-submit',
        title: 'Entry',
        username: 'alice',
        urls: [],
        iconRef: undefined,
      }),
      password: vi.fn(async () => 'should-not-read-password'),
      note: vi.fn(async () => 'should-not-read-note'),
      update,
    } as unknown as Entry

    model.loadFromEntry(entry, session)
    await Promise.resolve()
    await Promise.resolve()

    model.setPassword('new-password')
    model.setNote('new-note')

    const result = await model.submitEdit(entry, session)
    expect(result).toEqual({ok: true})
    expect(update).toHaveBeenCalledOnce()
    expect(applySavedSecrets).toHaveBeenCalledWith({
      password: 'new-password',
      note: 'new-note',
    })
  })
})
