import {describe, expect, it} from 'vitest'

import {PMEntrySshCreateModel} from '../../src/features/passmanager/components/card/entry-ssh/entry-ssh-create.model'

describe('PMEntrySshCreateModel', () => {
  it('uses Ed25519 with entry-derived name and comment by default', () => {
    const model = new PMEntrySshCreateModel()

    model.reset({entryTitle: 'OpenAI', username: 'andry.diego2011'})

    expect(model.keyType()).toBe('ed25519')
    expect(model.name()).toBe('OpenAI SSH')
    expect(model.comment()).toBe('andry.diego2011@OpenAI')
    expect(model.canSubmit()).toBe(true)
    expect(model.getFormData()).toEqual({
      keyType: 'ed25519',
      name: 'OpenAI SSH',
      comment: 'andry.diego2011@OpenAI',
    })
  })

  it('requires a key name', () => {
    const model = new PMEntrySshCreateModel()

    model.reset({entryTitle: 'OpenAI'})
    model.setName('')

    expect(model.validate()).toBe(false)
    expect(model.nameError()).toBeTruthy()
    expect(model.canSubmit()).toBe(false)
  })

  it('keeps advanced key type changes in form data', () => {
    const model = new PMEntrySshCreateModel()

    model.reset({entryTitle: 'Legacy'})
    model.setKeyType('rsa')

    expect(model.advancedOpen()).toBe(true)
    expect(model.getFormData()).toMatchObject({
      keyType: 'rsa',
      name: 'Legacy SSH',
    })
  })

  it('stores generated public key result without losing form values', () => {
    const model = new PMEntrySshCreateModel()

    model.reset({entryTitle: 'OpenAI', username: 'alice'})
    model.setPending()
    expect(model.result()).toMatchObject({
      pending: true,
      keyType: 'ed25519',
      name: 'OpenAI SSH',
    })

    model.setResult({
      keyId: 'ssh-1',
      keyType: 'ed25519',
      fingerprint: 'SHA256:test',
      publicKey: 'ssh-ed25519 AAAA OpenAI',
      name: model.name(),
      comment: model.comment(),
    })

    expect(model.result()).toEqual({
      keyId: 'ssh-1',
      keyType: 'ed25519',
      fingerprint: 'SHA256:test',
      publicKey: 'ssh-ed25519 AAAA OpenAI',
      name: 'OpenAI SSH',
      comment: 'alice@OpenAI',
      pending: false,
    })
  })
})
