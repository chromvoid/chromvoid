import {describe, expect, it} from 'vitest'

import {Entry, ManagerRoot} from '@project/passmanager'
import type {PassManagerRootV2} from '@project/passmanager'
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

  async getOTP(_data: unknown): Promise<string | undefined> {
    return undefined
  }
  async getOTPSeckey(_id: string): Promise<string | undefined> {
    return undefined
  }
  async removeOTP(_id: string): Promise<boolean> {
    return true
  }
  async saveOTP(_id: string, _secret: string): Promise<boolean> {
    return true
  }

  async readEntryPassword(_entryId: string): Promise<string | undefined> {
    return undefined
  }
  async readEntryNote(_entryId: string): Promise<string | undefined> {
    return undefined
  }
  async saveEntryPassword(_entryId: string, _password: string | null): Promise<boolean> {
    return true
  }
  async saveEntryNote(_entryId: string, _note: string | null): Promise<boolean> {
    return true
  }
  async removeEntryPassword(_entryId: string): Promise<boolean> {
    return true
  }
  async removeEntryNote(_entryId: string): Promise<boolean> {
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

class OtpMetaFailSaver extends MemorySaver {
  saveEntryMetaCalls = 0
  saveOtpCalls = 0

  async saveEntryMeta(data: {id: string}): Promise<boolean> {
    this.saveEntryMetaCalls += 1
    if (this.saveEntryMetaCalls >= 2) {
      return false
    }
    return super.saveEntryMeta(data)
  }

  async saveOTP(_id: string, _secret: string): Promise<boolean> {
    this.saveOtpCalls += 1
    return true
  }
}

class DeferredOtpSaver extends MemorySaver {
  saveOtpCalls = 0
  private resolveSaveOtp: ((value: boolean) => void) | undefined
  private resolveSaveOtpStarted: (() => void) | undefined
  readonly saveOtpStarted: Promise<void>

  constructor() {
    super()
    this.saveOtpStarted = new Promise<void>((resolve) => {
      this.resolveSaveOtpStarted = resolve
    })
  }

  async saveOTP(_id: string, _secret: string): Promise<boolean> {
    this.saveOtpCalls += 1
    this.resolveSaveOtpStarted?.()
    return new Promise<boolean>((resolve) => {
      this.resolveSaveOtp = resolve
    })
  }

  finishSaveOtp(value = true): void {
    this.resolveSaveOtp?.(value)
  }
}

class FullRoundTripSaver extends MemorySaver {
  private passwords = new Map<string, string>()
  private notes = new Map<string, string>()
  private otpSecrets = new Map<string, string>()

  async saveEntryPassword(entryId: string, password: string | null): Promise<boolean> {
    if (password === null) {
      this.passwords.delete(entryId)
      return true
    }
    this.passwords.set(entryId, password)
    return true
  }

  async saveEntryNote(entryId: string, note: string | null): Promise<boolean> {
    if (note === null) {
      this.notes.delete(entryId)
      return true
    }
    this.notes.set(entryId, note)
    return true
  }

  async readEntryPassword(entryId: string): Promise<string | undefined> {
    return this.passwords.get(entryId)
  }

  async readEntryNote(entryId: string): Promise<string | undefined> {
    return this.notes.get(entryId)
  }

  async saveOTP(id: string, secret: string): Promise<boolean> {
    this.otpSecrets.set(id, secret)
    return true
  }

  async getOTPSeckey(id: string): Promise<string | undefined> {
    return this.otpSecrets.get(id)
  }
}

describe('PassManager persistence regression', () => {
  it('root.createEntry triggers root save (SAVE_KEY) so entry survives reload', async () => {
    const saver = new MemorySaver() as any
    const pm1 = new ManagerRoot(saver)
    pm1.entries.set([])

    const entry = pm1.createEntry({title: 'Example', username: 'u', urls: []}, 'p', 'n', undefined)
    await entry.flushPendingPersistence()
    await pm1.save()

    const pm2 = new ManagerRoot(saver)
    pm2.entries.set([])

    const raw = await (saver as unknown as {read: (k: string) => Promise<string | undefined>}).read(
      'PASSWORDMANAGER',
    )
    const parsed = raw ? (JSON.parse(raw) as PassManagerRootV2) : undefined
    expect(parsed?.entries.some((e) => e.id === entry.id)).toBe(true)

    await pm2.load()
    expect(pm2.allEntries.some((e: Entry) => e.id === entry.id)).toBe(true)
  })

  it('create/edit/save/reload preserves password, note, otp, and icon metadata', async () => {
    const saver = new FullRoundTripSaver() as any
    const pm1 = new ManagerRoot(saver)
    pm1.entries.set([])

    const iconRef = `sha256:${'c'.repeat(64)}`
    const entry = pm1.createEntry(
      {title: 'Complex', username: 'alice', urls: [], iconRef},
      'pw-1',
      'note-1',
      createTestOtp(),
    )
    await entry.flushPendingPersistence()

    await entry.update(
      {
        ...entry.data(),
        title: 'Complex Updated',
        username: 'alice.updated',
      },
      undefined,
      undefined,
    )

    await pm1.save()

    const raw = await (saver as unknown as {read: (k: string) => Promise<string | undefined>}).read(
      'PASSWORDMANAGER',
    )
    const parsed = raw ? (JSON.parse(raw) as PassManagerRootV2) : undefined
    const savedEntry = parsed?.entries.find((item) => item.id === entry.id)

    expect(savedEntry).toBeDefined()
    expect(savedEntry?.title).toBe('Complex Updated')
    expect(savedEntry?.iconRef).toBe(iconRef)
    expect(savedEntry?.otps.length).toBe(1)

    const otpId = savedEntry?.otps[0]?.id
    expect(typeof otpId).toBe('string')
    expect(await saver.readEntryPassword(entry.id)).toBe('pw-1')
    expect(await saver.readEntryNote(entry.id)).toBe('note-1')
    expect(await saver.getOTPSeckey(String(otpId))).toBe('JBSWY3DPEHPK3PXP')

    const pm2 = new ManagerRoot(saver)
    pm2.entries.set([])
    await pm2.load()

    const reloaded = pm2.getEntry(entry.id)
    expect(reloaded).toBeDefined()
    expect(reloaded?.title).toBe('Complex Updated')
    expect(reloaded?.iconRef).toBe(iconRef)
    expect(reloaded?.otps().length).toBe(1)

    if (!reloaded) throw new Error('Entry not reloaded')
    expect(await reloaded.password()).toBe('pw-1')
    expect(await reloaded.note()).toBe('note-1')
  })

  it('meta-only updates preserve password, note, otp, and icon references', async () => {
    const saver = new FullRoundTripSaver() as any
    const pm1 = new ManagerRoot(saver)
    pm1.entries.set([])

    const iconRef = `sha256:${'d'.repeat(64)}`
    const entry = pm1.createEntry(
      {title: 'MetaOnly', username: 'alice', urls: [], iconRef},
      'pw-meta',
      'note-meta',
      createTestOtp(),
    )
    await entry.flushPendingPersistence()
    await pm1.save()

    const rawBefore = await (saver as unknown as {read: (k: string) => Promise<string | undefined>}).read(
      'PASSWORDMANAGER',
    )
    const parsedBefore = rawBefore ? (JSON.parse(rawBefore) as PassManagerRootV2) : undefined
    const savedEntryBefore = parsedBefore?.entries.find((item) => item.id === entry.id)
    const otpId = savedEntryBefore?.otps[0]?.id
    expect(typeof otpId).toBe('string')

    await entry.update(
      {
        ...entry.data(),
        title: 'MetaOnly Updated',
        username: 'alice-updated',
      },
      undefined,
      undefined,
    )

    await pm1.save()

    const rawAfter = await (saver as unknown as {read: (k: string) => Promise<string | undefined>}).read(
      'PASSWORDMANAGER',
    )
    const parsedAfter = rawAfter ? (JSON.parse(rawAfter) as PassManagerRootV2) : undefined
    const savedEntryAfter = parsedAfter?.entries.find((item) => item.id === entry.id)
    expect(savedEntryAfter?.title).toBe('MetaOnly Updated')
    expect(savedEntryAfter?.iconRef).toBe(iconRef)
    expect(savedEntryAfter?.otps).toHaveLength(1)
    expect(savedEntryAfter?.otps[0]?.id).toBe(otpId)
    expect(await saver.readEntryPassword(entry.id)).toBe('pw-meta')
    expect(await saver.readEntryNote(entry.id)).toBe('note-meta')
    expect(await saver.getOTPSeckey(String(otpId))).toBe('JBSWY3DPEHPK3PXP')

    const pm2 = new ManagerRoot(saver)
    pm2.entries.set([])
    await pm2.load()

    const reloaded = pm2.getEntry(entry.id)
    expect(reloaded).toBeDefined()
    expect(reloaded?.title).toBe('MetaOnly Updated')
    expect(reloaded?.iconRef).toBe(iconRef)
    expect(reloaded?.otps().length).toBe(1)
    if (!reloaded) throw new Error('Entry not reloaded')
    expect(await reloaded.password()).toBe('pw-meta')
    expect(await reloaded.note()).toBe('note-meta')
  })


  it('skips secret writes when saveEntryMeta fails', async () => {
    class MetaFailSaver extends MemorySaver {
      passwordCalls = 0
      noteCalls = 0

      async saveEntryMeta(): Promise<boolean> {
        return false
      }

      async saveEntryPassword(_entryId: string, _password: string | null): Promise<boolean> {
        this.passwordCalls += 1
        return true
      }

      async saveEntryNote(_entryId: string, _note: string | null): Promise<boolean> {
        this.noteCalls += 1
        return true
      }
    }

    const saver = new MetaFailSaver() as any
    const pm = new ManagerRoot(saver)
    pm.entries.set([])

    const entry = pm.createEntry({title: 'Blocked', username: 'u', urls: []}, 'secret', 'note', undefined)
    await entry.flushPendingPersistence()

    expect((saver as MetaFailSaver).passwordCalls).toBe(0)
    expect((saver as MetaFailSaver).noteCalls).toBe(0)
  })

  it('does not expose OTP or write secret when OTP meta save fails', async () => {
    const saver = new OtpMetaFailSaver() as any
    const pm = new ManagerRoot(saver)
    pm.entries.set([])

    const entry = pm.createEntry({title: 'OtpMetaFail', username: 'u', urls: []}, 'p', 'n', createTestOtp())
    await entry.flushPendingPersistence()

    expect((saver as OtpMetaFailSaver).saveOtpCalls).toBe(0)
    expect(entry.otps().length).toBe(0)
  })

  it('adds OTP to state only after saveOTP resolves', async () => {
    const saver = new DeferredOtpSaver() as any
    const pm = new ManagerRoot(saver)
    pm.entries.set([])

    const entry = pm.createEntry({title: 'OtpDeferred', username: 'u', urls: []}, 'p', 'n', createTestOtp())

    await (saver as DeferredOtpSaver).saveOtpStarted
    expect(entry.otps().length).toBe(0)
    ;(saver as DeferredOtpSaver).finishSaveOtp(true)
    await entry.flushPendingPersistence()

    expect((saver as DeferredOtpSaver).saveOtpCalls).toBe(1)
    expect(entry.otps().length).toBe(1)
  })
})

class TrackingSecretsSaver extends MemorySaver {
  passwords = new Map<string, string>()
  notes = new Map<string, string>()
  passwordSaveCalls = 0
  noteSaveCalls = 0

  async saveEntryPassword(entryId: string, password: string | null): Promise<boolean> {
    if (password === null) {
      this.passwords.delete(entryId)
      return true
    }
    this.passwordSaveCalls += 1
    this.passwords.set(entryId, password)
    return true
  }

  async saveEntryNote(entryId: string, note: string | null): Promise<boolean> {
    if (note === null) {
      this.notes.delete(entryId)
      return true
    }
    this.noteSaveCalls += 1
    this.notes.set(entryId, note)
    return true
  }

  async readEntryPassword(entryId: string): Promise<string | undefined> {
    return this.passwords.get(entryId)
  }

  async readEntryNote(entryId: string): Promise<string | undefined> {
    return this.notes.get(entryId)
  }
}

describe('Entry.update secret preservation', () => {
  it('does not overwrite password when update receives undefined', async () => {
    const saver = new TrackingSecretsSaver() as any
    const pm = new ManagerRoot(saver)
    pm.entries.set([])

    const entry = pm.createEntry({title: 'Test', username: 'u', urls: []}, 'mySecret', 'myNote', undefined)
    await entry.flushPendingPersistence()

    expect(saver.passwords.get(entry.id)).toBe('mySecret')
    expect(saver.notes.get(entry.id)).toBe('myNote')
    const callsBefore = saver.passwordSaveCalls
    const noteCallsBefore = saver.noteSaveCalls

    // Update with undefined password and note — secrets must be preserved
    entry.update(entry.data(), undefined, undefined)

    // Wait for any async saves to flush
    await new Promise((r) => setTimeout(r, 50))

    expect(saver.passwordSaveCalls).toBe(callsBefore)
    expect(saver.noteSaveCalls).toBe(noteCallsBefore)
    expect(saver.passwords.get(entry.id)).toBe('mySecret')
    expect(saver.notes.get(entry.id)).toBe('myNote')
  })

  it('overwrites password when update receives explicit empty string', async () => {
    const saver = new TrackingSecretsSaver() as any
    const pm = new ManagerRoot(saver)
    pm.entries.set([])

    const entry = pm.createEntry({title: 'Test', username: 'u', urls: []}, 'mySecret', 'myNote', undefined)
    await entry.flushPendingPersistence()

    expect(saver.passwords.get(entry.id)).toBe('mySecret')

    // Update with explicit empty string — user intentionally cleared the password
    entry.update(entry.data(), '', undefined)

    await new Promise((r) => setTimeout(r, 50))

    expect(saver.passwords.get(entry.id)).toBe('')
    // Note must remain untouched
    expect(saver.notes.get(entry.id)).toBe('myNote')
  })

  it('overwrites note when update receives explicit new value', async () => {
    const saver = new TrackingSecretsSaver() as any
    const pm = new ManagerRoot(saver)
    pm.entries.set([])

    const entry = pm.createEntry({title: 'Test', username: 'u', urls: []}, 'pw', 'oldNote', undefined)
    await entry.flushPendingPersistence()

    entry.update(entry.data(), undefined, 'newNote')

    await new Promise((r) => setTimeout(r, 50))

    expect(saver.notes.get(entry.id)).toBe('newNote')
    // Password must remain untouched
    expect(saver.passwords.get(entry.id)).toBe('pw')
  })
})
