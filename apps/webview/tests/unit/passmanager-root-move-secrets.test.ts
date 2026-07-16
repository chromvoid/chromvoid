import {describe, expect, it, vi} from 'vitest'

import type {PassManagerRootV4, PassManagerSshKey} from '@project/passmanager/types'
import {CatalogPasswordsRepository, CatalogTransport} from '../../src/core/state/passmanager'
import {MockTransport} from '../../src/core/transport/mock/mock-transport'

function fileFromJson(value: unknown): File {
  const text = JSON.stringify(value)
  return {name: 'PASSWORDMANAGER', type: 'application/json', size: text.length, text: async () => text} as unknown as File
}

function createRepo() {
  const transport = new MockTransport()
  const catalog = {
    transport,
    catalog: {getChildren: vi.fn().mockReturnValue([]), getNode: vi.fn().mockReturnValue(undefined)},
    refresh: vi.fn().mockResolvedValue(undefined),
    queueRefresh: vi.fn(),
    lastError: {set: vi.fn()},
  }
  return {
    repo: new CatalogPasswordsRepository(catalog as any, new CatalogTransport(catalog as any)),
    transport,
    catalog,
  }
}

describe('CatalogPasswordsRepository root move preserves OTP and SSH', () => {
  it('keeps root SSH public-key access working after moving its source entry', async () => {
    const ctx = createRepo()
    await ctx.transport.sendPassmanager('passmanager:group:ensure', {path: 'Work'})
    await ctx.transport.sendPassmanager('passmanager:entry:save', {
      id: 'entry-1',
      title: 'Entry 1',
      group_path: 'Work',
      username: 'alice',
      urls: [],
      otps: [{id: 'otp-1', label: 'Main', algorithm: 'SHA1', digits: 6, period: 30, encoding: 'base32', type: 'TOTP'}],
    })
    await ctx.transport.sendPassmanager('passmanager:otp:setSecret', {
      otp_id: 'otp-1',
      secret: 'JBSWY3DPEHPK3PXP',
      encoding: 'base32',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    })
    const generated = (await ctx.transport.sendPassmanager('passmanager:ssh:keygen', {
      key_type: 'ed25519',
      name: 'Entry 1 key',
      comment: 'alice@example.test',
      source_entry_id: 'entry-1',
    })) as {ok: boolean; result: {key_id: string; public_key_openssh: string}}
    const listed = (await ctx.transport.sendPassmanager('passmanager:ssh:list', {})) as {
      ok: boolean
      result: {sshKeys: PassManagerSshKey[]}
    }

    const movedRoot: PassManagerRootV4 = {
      version: 4,
      createdTs: Date.now(),
      updatedTs: Date.now(),
      folders: [],
      foldersMeta: [],
      tags: [],
      entries: [{
        id: 'entry-1',
        entryType: 'login',
        title: 'Entry 1',
        username: 'alice',
        urls: [],
        folderPath: null,
        tags: [],
        otps: [{id: 'otp-1', label: 'Main', algorithm: 'SHA1', digits: 6, period: 30, encoding: 'base32', type: 'TOTP'}],
      }],
      sshKeys: listed.result.sshKeys,
    }

    await expect(ctx.repo.saveRoot(fileFromJson(movedRoot))).resolves.toBe(true)

    const otp = (await ctx.transport.sendPassmanager('passmanager:otp:generate', {
      entry_id: 'entry-1',
      otp_id: 'otp-1',
      ts: 0,
    })) as {ok: boolean; result?: {otp?: string}}
    expect(otp.ok).toBe(true)
    expect(otp.result?.otp).toMatch(/^\d{6}$/)

    const publicRead = (await ctx.transport.sendPassmanager('passmanager:ssh:secret:read', {
      key_id: generated.result.key_id,
      secret_type: 'ssh_public_key',
    })) as {ok: boolean; result?: {value?: string}}
    expect(publicRead).toEqual({ok: true, result: {value: generated.result.public_key_openssh}})

    const privateRead = (await ctx.transport.sendPassmanager('passmanager:ssh:secret:read', {
      key_id: generated.result.key_id,
      secret_type: 'ssh_private_key',
    })) as {ok: boolean}
    expect(privateRead.ok).toBe(false)

    const exported = await ctx.repo.readRoot<{version: number; sshKeys: PassManagerSshKey[]; entries: Array<{sshKeys?: unknown[]}>}>()
    expect(exported?.version).toBe(4)
    expect(exported?.sshKeys).toEqual(listed.result.sshKeys)
    expect(exported?.entries[0]).not.toHaveProperty('sshKeys')
    expect(ctx.catalog.lastError.set).not.toHaveBeenCalled()
  })
})
