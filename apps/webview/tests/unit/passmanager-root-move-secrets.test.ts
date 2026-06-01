import {describe, expect, it, vi} from 'vitest'

import type {PassManagerRootV2} from '@project/passmanager/types'
import {CatalogPasswordsRepository, CatalogTransport} from '../../src/core/state/passmanager'
import {MockTransport} from '../../src/core/transport/mock/mock-transport'

function fileFromJson(value: unknown): File {
  const text = JSON.stringify(value)
  return {
    name: 'PASSWORDMANAGER',
    type: 'application/json',
    size: text.length,
    text: async () => text,
  } as unknown as File
}

function createRepo() {
  const transport = new MockTransport()
  const catalog = {
    transport,
    catalog: {
      getChildren: vi.fn().mockReturnValue([]),
      getNode: vi.fn().mockReturnValue(undefined),
    },
    refresh: vi.fn().mockResolvedValue(undefined),
    queueRefresh: vi.fn(),
    lastError: {set: vi.fn()},
  }

  const catalogTransport = new CatalogTransport(catalog as any)
  const repo = new CatalogPasswordsRepository(catalog as any, catalogTransport)
  return {repo, transport, catalog}
}

describe('CatalogPasswordsRepository saveRoot move preserves OTP and SSH', () => {
  it('keeps OTP generation and SSH secret reads working after moving an entry to root', async () => {
    const ctx = createRepo()

    await ctx.transport.sendPassmanager('passmanager:group:ensure', {path: 'Work'})
    await ctx.transport.sendPassmanager('passmanager:entry:save', {
      id: 'entry-1',
      title: 'Entry 1',
      group_path: 'Work',
      username: 'alice',
      urls: [],
      sshKeys: [
        {
          id: 'key-1',
          type: 'ed25519',
          fingerprint: 'SHA256:test',
          comment: 'alice@example.test',
        },
      ],
      otps: [
        {
          id: 'otp-1',
          label: 'Main',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          encoding: 'base32',
          type: 'TOTP',
        },
      ],
    })
    await ctx.transport.sendPassmanager('passmanager:secret:save', {
      entry_id: 'entry-1',
      secret_type: 'ssh_private_key:key-1',
      value: 'PRIVATE-KEY-DATA',
    })
    await ctx.transport.sendPassmanager('passmanager:secret:save', {
      entry_id: 'entry-1',
      secret_type: 'ssh_public_key:key-1',
      value: 'PUBLIC-KEY-DATA',
    })
    await ctx.transport.sendPassmanager('passmanager:otp:setSecret', {
      otp_id: 'otp-1',
      secret: 'JBSWY3DPEHPK3PXP',
      encoding: 'base32',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    })

    const movedRoot: PassManagerRootV2 = {
      version: 2,
      createdTs: Date.now(),
      updatedTs: Date.now(),
      folders: [],
      entries: [
        {
          id: 'entry-1',
          title: 'Entry 1',
          username: 'alice',
          urls: [],
          folderPath: null,
          sshKeys: [
            {
              id: 'key-1',
              type: 'ed25519',
              fingerprint: 'SHA256:test',
              comment: 'alice@example.test',
            },
          ],
          otps: [
            {
              id: 'otp-1',
              label: 'Main',
              algorithm: 'SHA1',
              digits: 6,
              period: 30,
              encoding: 'base32',
              type: 'TOTP',
            },
          ],
        },
      ],
    }

    await expect(ctx.repo.saveRoot(fileFromJson(movedRoot))).resolves.toBe(true)

    const generated = (await ctx.transport.sendPassmanager('passmanager:otp:generate', {
      entry_id: 'entry-1',
      otp_id: 'otp-1',
      ts: 0,
    })) as {ok: boolean; result?: {otp?: string}}
    expect(generated.ok).toBe(true)
    expect(generated.result?.otp).toMatch(/^\d{6}$/)

    const readPrivate = (await ctx.transport.sendPassmanager('passmanager:secret:read', {
      entry_id: 'entry-1',
      secret_type: 'ssh_private_key:key-1',
    })) as {ok: boolean; result?: {value?: string}}
    expect(readPrivate.ok).toBe(true)
    expect(readPrivate.result?.value).toBe('PRIVATE-KEY-DATA')

    const readPublic = (await ctx.transport.sendPassmanager('passmanager:secret:read', {
      entry_id: 'entry-1',
      secret_type: 'ssh_public_key:key-1',
    })) as {ok: boolean; result?: {value?: string}}
    expect(readPublic.ok).toBe(true)
    expect(readPublic.result?.value).toBe('PUBLIC-KEY-DATA')

    const readRoot = await ctx.repo.readRoot<{
      entries: Array<{id: string; folderPath: string | null; sshKeys?: unknown[]; otps?: unknown[]}>
    }>()
    const entry = readRoot?.entries.find((item) => item.id === 'entry-1')
    expect(entry?.folderPath ?? null).toBeNull()
    expect(entry?.sshKeys).toHaveLength(1)
    expect(entry?.otps).toHaveLength(1)
    expect(ctx.catalog.lastError.set).not.toHaveBeenCalled()
  })
})
