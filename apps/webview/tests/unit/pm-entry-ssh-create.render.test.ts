import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {CVField, CVInput, CVRadio, CVRadioGroup} from '@chromvoid/uikit'
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
    CVInput.define()
    CVRadio.define()
    CVRadioGroup.define()
    PMEntrySshCreate.define()
    PMEntrySshCreateSheet.define()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders all key types as a radio group with Ed25519 selected by default', async () => {
    const model = new PMEntrySshCreateModel()
    model.reset({entryTitle: 'OpenAI', username: 'andry'})
    const element = createSshCreate(model)

    await settle(element)

    const group = element.shadowRoot?.querySelector('.ssh-key-type-options') as CVRadioGroup | null
    const radios = [...(group?.querySelectorAll('cv-radio') ?? [])] as CVRadio[]
    expect(group?.value).toBe('ed25519')
    expect(radios.map((radio) => radio.value)).toEqual(['ed25519', 'rsa', 'ecdsa'])
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual([
      'Ed25519, Recommended',
      'RSA-4096',
      'ECDSA-P256',
    ])
    expect(radios[0]?.checked).toBe(true)
    expect(element.shadowRoot?.querySelector('.ssh-key-type-badge')?.textContent).toContain('Recommended')
    expect(element.shadowRoot?.querySelector('cv-disclosure')).toBeNull()
    expect(element.shadowRoot?.querySelector('cv-select')).toBeNull()
    const nameInput = element.shadowRoot?.querySelector('#ssh-name-input') as CVInput | null
    expect(nameInput?.value).toBe('')
    expect(nameInput?.placeholder).toBe('OpenAI SSH')
    expect(nameInput?.invalid).toBe(false)
    expect(element.shadowRoot?.querySelector('.ssh-error')).toBeNull()
  })

  it('updates the model when another key type is selected', async () => {
    const model = new PMEntrySshCreateModel()
    const element = createSshCreate(model)

    await settle(element)

    const group = element.shadowRoot?.querySelector('.ssh-key-type-options') as CVRadioGroup
    const rsa = group.querySelector('cv-radio[value="rsa"]') as CVRadio
    rsa.click()
    await settle(element)

    expect(model.keyType()).toBe('rsa')
    expect(group.value).toBe('rsa')
    expect(element.shadowRoot?.querySelector('.ssh-key-type-badge')).toBeNull()
    expect(element.shadowRoot?.querySelector('.ssh-key-type-meta')?.textContent).toContain(
      'For older servers and compatibility',
    )
  })

  it('upgrades field wrappers and links labels and helper text to their inputs', async () => {
    const element = createSshCreate()

    await settle(element)

    const fields = [...(element.shadowRoot?.querySelectorAll('cv-field') ?? [])] as CVField[]
    const [nameField, commentField] = fields
    expect(fields).toHaveLength(2)
    expect(nameField).toBeInstanceOf(CVField)
    expect(commentField).toBeInstanceOf(CVField)

    await settle(nameField)
    await settle(commentField)

    const nameInput = nameField.querySelector('cv-input')
    const commentInput = commentField.querySelector('cv-input')
    expect(nameInput?.getAttribute('aria-labelledby')).toMatch(/^cv-field-\d+-label$/)
    expect(commentInput?.getAttribute('aria-describedby')).toMatch(/^cv-field-\d+-description$/)
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
    expect(element.shadowRoot?.querySelector('.ssh-key-type-options')).toBeNull()
  })

  it('keeps the sheet action available and guides an invalid submit to the name field', async () => {
    const model = new PMEntrySshCreateModel()
    model.reset({entryTitle: 'OpenAI'})

    const sheet = document.createElement('pm-entry-ssh-create-sheet') as PMEntrySshCreateSheet
    sheet.model = model
    sheet.open = true
    const primaryEvent = vi.fn()
    sheet.addEventListener('pm-entry-ssh-create-sheet-primary', primaryEvent)
    document.body.append(sheet)
    await settle(sheet)

    const primary = sheet.shadowRoot?.querySelector('.primary-action') as HTMLElement | null
    expect(primary?.hasAttribute('disabled')).toBe(false)

    primary?.click()
    await settle(sheet)

    const form = sheet.shadowRoot?.querySelector('pm-entry-ssh-create') as PMEntrySshCreate | null
    if (form) await settle(form)
    const nameInput = form?.shadowRoot?.querySelector('#ssh-name-input') as CVInput | null
    const nativeInput = nameInput?.shadowRoot?.querySelector('input')

    expect(model.state.nameError()).not.toBe('')
    expect(nameInput?.invalid).toBe(true)
    expect(primaryEvent).not.toHaveBeenCalled()
    expect(nameInput?.shadowRoot?.activeElement).toBe(nativeInput)
  })
})
