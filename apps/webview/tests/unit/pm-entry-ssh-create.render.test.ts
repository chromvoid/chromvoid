import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {
  CVDisclosure,
  CVInput,
  CVSelect,
  CVSelectOption,
} from '@chromvoid/uikit'
import {PMEntrySshCreate} from '../../src/features/passmanager/components/card/entry-ssh/entry-ssh-create'
import {PMEntrySshCreateSheet} from '../../src/features/passmanager/components/card/entry-ssh/entry-ssh-create-sheet'
import {PMEntrySshCreateModel} from '../../src/features/passmanager/components/card/entry-ssh/entry-ssh-create.model'

async function settle(element: HTMLElement & {updateComplete: Promise<unknown>}): Promise<void> {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

function createSshCreate(model = new PMEntrySshCreateModel()): PMEntrySshCreate {
  const element = document.createElement('pm-entry-ssh-create') as PMEntrySshCreate
  element.model = model
  document.body.append(element)
  return element
}

describe('PMEntrySshCreate', () => {
  beforeEach(() => {
    CVDisclosure.define()
    CVInput.define()
    CVSelect.define()
    CVSelectOption.define()
    PMEntrySshCreate.define()
    PMEntrySshCreateSheet.define()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders Ed25519 recommended card first and hides alternate types in advanced settings', async () => {
    const model = new PMEntrySshCreateModel()
    model.reset({entryTitle: 'OpenAI', username: 'andry'})
    const element = createSshCreate(model)

    await settle(element)

    const root = element.shadowRoot?.querySelector('.ssh-create')
    const first = root?.firstElementChild

    expect(first?.classList.contains('ssh-key-hero')).toBe(true)
    expect(first?.textContent).toContain('Ed25519')
    expect(first?.textContent).toContain('Recommended')
    expect(element.shadowRoot?.querySelector('input[type="radio"]')).toBeNull()
    expect(element.shadowRoot?.querySelector('cv-disclosure.ssh-advanced')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('cv-select')).not.toBeNull()
  })

  it('renders generated result with fingerprint and public key', async () => {
    const model = new PMEntrySshCreateModel()
    model.reset({entryTitle: 'OpenAI'})
    model.setResult({
      keyId: 'ssh-1',
      keyType: 'ed25519',
      fingerprint: 'SHA256:test',
      publicKey: 'ssh-ed25519 AAAA OpenAI',
      name: 'OpenAI SSH',
      comment: 'OpenAI',
    })
    const element = createSshCreate(model)

    await settle(element)

    expect(element.shadowRoot?.querySelector('.ssh-result')).not.toBeNull()
    expect(element.shadowRoot?.textContent).toContain('SHA256:test')
    expect(element.shadowRoot?.textContent).toContain('ssh-ed25519 AAAA OpenAI')
    expect(element.shadowRoot?.querySelector('.ssh-key-hero')).toBeNull()
  })

  it('disables sheet primary action until the model is valid', async () => {
    const model = new PMEntrySshCreateModel()
    model.reset({entryTitle: 'OpenAI'})
    model.setName('')

    const sheet = document.createElement('pm-entry-ssh-create-sheet') as PMEntrySshCreateSheet
    sheet.model = model
    sheet.open = true
    document.body.append(sheet)
    await settle(sheet)

    const primary = sheet.shadowRoot?.querySelector('.primary-action') as HTMLElement | null
    expect(primary?.hasAttribute('disabled')).toBe(true)
  })
})
