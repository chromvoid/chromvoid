import {describe, expect, it} from 'vitest'
import type {RpcCommandData, RpcCommandResultData} from '@chromvoid/scheme'
import {CredentialImportService, type ImportCommand} from './credential-import-service.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return {promise, resolve}
}

function harness() {
  const calls: Array<{command: ImportCommand; data: unknown}> = []
  const responses: {[K in ImportCommand]: RpcCommandResultData<K>} = {
    'passmanager:import:limits': {max_input_bytes: 50 * 1024 * 1024, max_chunk_bytes: 4},
    'passmanager:import:start': {import_id: 'synthetic-token'},
    'passmanager:import:append': {received_bytes: 0},
    'passmanager:import:review': {
      revision: 'reviewed-revision',
      mode: 'merge',
      entry_count: 3,
      created_entry_count: 2,
      updated_entry_count: 1,
      folder_count: 1,
      ssh_key_count: 0,
    },
    'passmanager:import:commit': {},
    'passmanager:import:cancel': {},
  }
  let intercept: ((command: ImportCommand) => Promise<void>) | undefined
  function rpc<T extends ImportCommand>(command: T, data: RpcCommandData<T>): Promise<RpcCommandResultData<T>>
  async function rpc(command: ImportCommand, data: unknown): Promise<unknown> {
    calls.push({command, data})
    await intercept?.(command)
    if (
      command === 'passmanager:import:append' &&
      typeof data === 'object' &&
      data !== null &&
      'offset' in data &&
      typeof data.offset === 'number' &&
      'chunk_base64' in data &&
      typeof data.chunk_base64 === 'string'
    ) {
      responses['passmanager:import:append'] = {received_bytes: data.offset + atob(data.chunk_base64).length}
    }
    return responses[command]
  }
  const service = new CredentialImportService(rpc)
  return {
    service,
    calls,
    responses,
    intercept: (value: typeof intercept) => {
      intercept = value
    },
  }
}

const file = () => new File(['synthetic bytes'], 'export.json')
const signal = () => new AbortController().signal

describe('Core credential import transport', () => {
  it('uploads exact bounded chunks and retains only the reviewed token until explicit commit', async () => {
    const h = harness()
    const progress: number[] = []
    const review = await h.service.review(file(), undefined, signal(), (p) => progress.push(p.received))
    expect(review).toMatchObject({entry_count: 3, created_entry_count: 2, updated_entry_count: 1})
    expect(progress).toEqual([4, 8, 12, 15])
    const chunks = h.calls.filter((call) => call.command === 'passmanager:import:append')
    expect(
      chunks.map((call) =>
        typeof call.data === 'object' &&
        call.data !== null &&
        'chunk_base64' in call.data &&
        typeof call.data.chunk_base64 === 'string'
          ? atob(call.data.chunk_base64)
          : '',
      ),
    ).toEqual(['synt', 'heti', 'c by', 'tes'])
    expect(h.calls.some((call) => call.command === 'passmanager:import:commit')).toBe(false)
    await h.service.commit(signal())
    expect(h.calls.at(-1)).toEqual({
      command: 'passmanager:import:commit',
      data: {import_id: 'synthetic-token', confirm: true},
    })
    await expect(h.service.commit(signal())).rejects.toThrow('Review the file again')
    expect(h.calls.filter((call) => call.command === 'passmanager:import:commit')).toHaveLength(1)
  })

  it('releases a late start token after cancellation without uploading or committing', async () => {
    const h = harness(),
      started = deferred(),
      reply = deferred(),
      controller = new AbortController()
    h.intercept(async (command) => {
      if (command === 'passmanager:import:start') {
        started.resolve()
        await reply.promise
      }
    })
    const preparing = h.service.review(file(), undefined, controller.signal, () => {})
    const rejected = expect(preparing).rejects.toMatchObject({name: 'AbortError'})
    await started.promise
    controller.abort()
    const cleanup = h.service.cancel()
    reply.resolve()
    await rejected
    await cleanup
    expect(h.calls.map((call) => call.command)).toEqual([
      'passmanager:import:limits',
      'passmanager:import:start',
      'passmanager:import:cancel',
    ])
  })

  it('releases late previews on vault/host disposal and rejects later commits', async () => {
    const h = harness(),
      reviewing = deferred(),
      reply = deferred()
    h.intercept(async (command) => {
      if (command === 'passmanager:import:review') {
        reviewing.resolve()
        await reply.promise
      }
    })
    const preparing = h.service.review(file(), '', signal(), () => {})
    const rejected = expect(preparing).rejects.toMatchObject({name: 'AbortError'})
    await reviewing.promise
    h.service.dispose()
    reply.resolve()
    await rejected
    await h.service.cancel()
    await expect(h.service.commit(signal())).rejects.toMatchObject({name: 'AbortError'})
    expect(h.calls.at(-1)?.command).toBe('passmanager:import:cancel')
    expect(h.calls.find((call) => call.command === 'passmanager:import:review')?.data).toEqual({
      import_id: 'synthetic-token',
      source_password: '',
    })
  })

  it('does not reissue a commit after an uncertain response', async () => {
    const h = harness()
    await h.service.review(file(), undefined, signal(), () => {})
    h.intercept(async (command) => {
      if (command === 'passmanager:import:commit') throw new Error('Disconnected')
    })
    await expect(h.service.commit(signal())).rejects.toThrow('Disconnected')
    expect(h.calls.at(-1)?.command).toBe('passmanager:import:cancel')
    await expect(h.service.commit(signal())).rejects.toThrow('Review the file again')
    expect(h.calls.filter((call) => call.command === 'passmanager:import:commit')).toHaveLength(1)
  })

  it('rejects incompatible counts and oversized files without allowing confirmation', async () => {
    const h = harness()
    delete h.responses['passmanager:import:review'].created_entry_count
    await expect(h.service.review(file(), undefined, signal(), () => {})).rejects.toThrow(
      'incompatible import preview',
    )
    expect(h.calls.at(-1)?.command).toBe('passmanager:import:cancel')
    h.calls.length = 0
    h.responses['passmanager:import:limits'].max_input_bytes = 3
    await expect(h.service.review(file(), undefined, signal(), () => {})).rejects.toThrow('non-empty export')
    expect(h.calls.map((call) => call.command)).toEqual(['passmanager:import:limits'])
  })
})
