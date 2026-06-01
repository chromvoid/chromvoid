import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMEntrySshKey} from '../../src/features/passmanager/components/card/entry-ssh/entry-ssh-key'

let defined = false

function ensureDefined() {
  if (defined) return
  PMEntrySshKey.define()
  defined = true
}

describe('PMEntrySshKey', () => {
  afterEach(() => {
    document.querySelectorAll('pm-entry-ssh-key').forEach((element) => element.remove())
  })

  it('rerenders public key when it changes after the initial render', async () => {
    ensureDefined()
    const element = document.createElement('pm-entry-ssh-key') as PMEntrySshKey
    element.keyId = 'key-1'
    element.keyType = 'ed25519'
    element.fingerprint = 'SHA256:test'

    document.body.appendChild(element)
    await element.updateComplete

    const publicKeyValue = () =>
      element.shadowRoot?.querySelector('.entry-ssh-public')?.textContent?.trim() ?? ''

    expect(publicKeyValue()).toBe('...')

    element.publicKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITest'
    await element.updateComplete

    expect(publicKeyValue()).toContain('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITest')
  })

  it('uses the saved SSH name as the primary display label', async () => {
    ensureDefined()
    const element = document.createElement('pm-entry-ssh-key') as PMEntrySshKey
    element.name = 'OpenAI SSH'
    element.keyId = 'key-name'
    element.keyType = 'ed25519'
    element.fingerprint = 'SHA256:named'
    element.comment = 'user@OpenAI'

    document.body.appendChild(element)
    await element.updateComplete

    expect(element.shadowRoot?.querySelector('.entry-ssh-name')?.textContent?.trim()).toBe('OpenAI SSH')
    expect(element.shadowRoot?.querySelector('.entry-ssh-meta-line')?.textContent).toContain(
      'Ed25519 · SHA256:named',
    )
    expect(element.shadowRoot?.querySelector('.entry-ssh-summary-copy')?.textContent).toContain('user@OpenAI')
  })

  it('dispatches remove event when removable delete action is clicked', async () => {
    ensureDefined()
    const element = document.createElement('pm-entry-ssh-key') as PMEntrySshKey
    element.keyId = 'key-2'
    element.keyType = 'ed25519'
    element.fingerprint = 'SHA256:test-2'
    element.publicKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAISecond'
    element.removable = true

    const removeListener = vi.fn()
    element.addEventListener('pm-entry-ssh-key-remove', removeListener)

    document.body.appendChild(element)
    await element.updateComplete

    const removeButton = element.shadowRoot?.querySelector('.ssh-remove-action') as HTMLButtonElement | null
    expect(removeButton).not.toBeNull()

    removeButton?.click()

    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(removeListener.mock.calls[0]?.[0].detail).toEqual({keyId: 'key-2'})
  })
})
