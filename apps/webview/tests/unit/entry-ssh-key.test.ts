import {afterEach, describe, expect, it} from 'vitest'

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
    element.mode = 'view'
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
})
