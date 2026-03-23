import {describe, expect, it} from 'vitest'

import {Entry, ManagerRoot} from '@project/passmanager'
import type {OTPOptions} from '@project/passmanager'

class MemorySaver {
  private rootValue: string | undefined
  private meta = new Map<string, unknown>()

  async save(_key: string, value: File): Promise<boolean> {
    const anyValue = value as unknown as {text?: () => Promise<string>}
    const text = typeof anyValue.text === 'function' ? await anyValue.text() : undefined
    this.rootValue = text
    return true
  }

  async read<T = unknown>(_key: string): Promise<T | undefined> {
    return this.rootValue as unknown as T | undefined
  }

  async remove(_key: string): Promise<boolean> {
    this.rootValue = undefined
    this.meta.clear()
    return true
  }

  async getOTP(): Promise<string | undefined> {
    return undefined
  }
  async getOTPSeckey(): Promise<string | undefined> {
    return undefined
  }
  async removeOTP(): Promise<boolean> {
    return true
  }
  async saveOTP(): Promise<boolean> {
    return true
  }

  async readEntryPassword(): Promise<string | undefined> {
    return undefined
  }
  async readEntryNote(): Promise<string | undefined> {
    return undefined
  }
  async saveEntryPassword(): Promise<boolean> {
    return true
  }
  async saveEntryNote(): Promise<boolean> {
    return true
  }
  async removeEntryPassword(): Promise<boolean> {
    return true
  }
  async removeEntryNote(): Promise<boolean> {
    return true
  }

  async saveEntryMeta(data: {id: string}): Promise<boolean> {
    this.meta.set(data.id, data)
    return true
  }

  async removeEntry(id: string): Promise<boolean> {
    this.meta.delete(id)
    return true
  }

  async readEntrySshPrivateKey(): Promise<string | undefined> {
    return undefined
  }
  async readEntrySshPublicKey(): Promise<string | undefined> {
    return undefined
  }
  async saveEntrySshPrivateKey(): Promise<boolean> {
    return true
  }
  async saveEntrySshPublicKey(): Promise<boolean> {
    return true
  }
  async removeEntrySshPrivateKey(): Promise<boolean> {
    return true
  }
  async removeEntrySshPublicKey(): Promise<boolean> {
    return true
  }
}

class SshTrackingSaver extends MemorySaver {
  lastMetaCall: Record<string, unknown> | null = null
  sshPrivateKeys = new Map<string, string>()
  sshPublicKeys = new Map<string, string>()

  async saveEntryMeta(data: {id: string}): Promise<boolean> {
    this.lastMetaCall = data as Record<string, unknown>
    return super.saveEntryMeta(data)
  }

  async readEntrySshPrivateKey(id: string, keyId: string) {
    return this.sshPrivateKeys.get(`${id}/${keyId}`)
  }
  async readEntrySshPublicKey(id: string, keyId: string) {
    return this.sshPublicKeys.get(`${id}/${keyId}`)
  }
  async saveEntrySshPrivateKey(id: string, keyId: string, key: string) {
    this.sshPrivateKeys.set(`${id}/${keyId}`, key)
    return true
  }
  async saveEntrySshPublicKey(id: string, keyId: string, key: string) {
    this.sshPublicKeys.set(`${id}/${keyId}`, key)
    return true
  }
  async removeEntrySshPrivateKey(id: string, keyId: string) {
    this.sshPrivateKeys.delete(`${id}/${keyId}`)
    return true
  }
  async removeEntrySshPublicKey(id: string, keyId: string) {
    this.sshPublicKeys.delete(`${id}/${keyId}`)
    return true
  }
}

function createTestOtp(): OTPOptions {
  return {
    id: '',
    label: 'TOTP-1',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    encoding: 'base32',
    type: 'TOTP',
    secret: 'JBSWY3DPEHPK3PXP',
  }
}

describe('SSH metadata preservation', () => {
  it('entry.update() preserves sshKeys array in saveEntryMeta call', async () => {
    const saver = new SshTrackingSaver() as any
    const pm = new ManagerRoot(saver)
    pm.entries.set([])

    const entry = pm.createEntry(
      {
        title: 'SSH Test',
        username: 'user',
        urls: [],
        sshKeys: [{id: 'k1', type: 'ed25519', fingerprint: 'SHA256:abc123', comment: 'test@host'}],
      },
      'pw',
      '',
      undefined,
    )
    await entry.flushPendingPersistence()

    saver.lastMetaCall = null

    entry.update({...entry.data(), title: 'SSH Test Updated'}, undefined, undefined)
    await new Promise((r) => setTimeout(r, 50))

    expect(saver.lastMetaCall).not.toBeNull()
    expect(saver.lastMetaCall!.sshKeys).toEqual([{id: 'k1', type: 'ed25519', fingerprint: 'SHA256:abc123', comment: 'test@host'}])
  })

  it('entry.addOTP() preserves sshKeys array in saveEntryMeta call', async () => {
    const saver = new SshTrackingSaver() as any
    const pm = new ManagerRoot(saver)
    pm.entries.set([])

    const entry = pm.createEntry(
      {
        title: 'SSH+OTP',
        username: 'user',
        urls: [],
        sshKeys: [{id: 'k2', type: 'rsa', fingerprint: 'SHA256:rsa456', comment: 'rsa@key'}],
      },
      'pw',
      '',
      undefined,
    )
    await entry.flushPendingPersistence()

    saver.lastMetaCall = null

    await entry.addOTP(createTestOtp())

    expect(saver.lastMetaCall).not.toBeNull()
    expect(saver.lastMetaCall!.sshKeys).toEqual([{id: 'k2', type: 'rsa', fingerprint: 'SHA256:rsa456', comment: 'rsa@key'}])
  })

  it('entry.updateSshKeys() sets sshKeys in _data and saveEntryMeta', async () => {
    const saver = new SshTrackingSaver() as any
    const pm = new ManagerRoot(saver)
    pm.entries.set([])

    const entry = pm.createEntry({title: 'NoSSH', username: 'u', urls: [], sshKeys: []}, 'pw', '', undefined)
    await entry.flushPendingPersistence()

    saver.lastMetaCall = null

    await entry.updateSshKeys([{id: 'k3', type: 'ecdsa', fingerprint: 'SHA256:ec789', comment: 'ec@key'}])

    expect(entry.sshKeys).toEqual([{id: 'k3', type: 'ecdsa', fingerprint: 'SHA256:ec789', comment: 'ec@key'}])

    expect(saver.lastMetaCall).not.toBeNull()
    expect(saver.lastMetaCall!.sshKeys).toEqual([{id: 'k3', type: 'ecdsa', fingerprint: 'SHA256:ec789', comment: 'ec@key'}])
  })

  it('entry.removeSshKey() removes one key from array and deletes secrets', async () => {
    const saver = new SshTrackingSaver() as any
    const pm = new ManagerRoot(saver)
    pm.entries.set([])

    const entry = pm.createEntry(
      {
        title: 'ClearSSH',
        username: 'u',
        urls: [],
        sshKeys: [
          {id: 'k4', type: 'ed25519', fingerprint: 'SHA256:del000', comment: 'del@key'},
          {id: 'k5', type: 'rsa', fingerprint: 'SHA256:keep111'},
        ],
      },
      'pw',
      '',
      undefined,
    )
    await entry.flushPendingPersistence()

    saver.lastMetaCall = null

    await entry.removeSshKey('k4')

    expect(entry.sshKeys).toEqual([{id: 'k5', type: 'rsa', fingerprint: 'SHA256:keep111'}])

    expect(saver.lastMetaCall).not.toBeNull()
    expect(saver.lastMetaCall!.sshKeys).toEqual([{id: 'k5', type: 'rsa', fingerprint: 'SHA256:keep111'}])
  })
})
