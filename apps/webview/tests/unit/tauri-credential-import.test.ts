import {afterEach, describe, expect, it, vi} from 'vitest'
import {TauriTransport} from '../../src/core/transport/tauri/tauri-transport'

const {invoke} = vi.hoisted(() => ({invoke: vi.fn()}))
vi.mock('../../src/core/transport/tauri/ipc', () => ({tauriInvoke: invoke}))

afterEach(() => invoke.mockReset())
describe('Tauri Core import RPC', () => {
  it('sends the generated command and returns the host review without a domain conversion', async () => {
    const review = {revision: 'revision', mode: 'merge', entry_count: 2, created_entry_count: 1,
      updated_entry_count: 1, folder_count: 0, ssh_key_count: 0, warnings: []}
    invoke.mockResolvedValueOnce({ok: true, result: {command: 'passmanager:import:review', result: review}})
    const transport = new TauriTransport()
    expect(await transport.rpc('passmanager:import:review', {import_id: 'token', source_password: null})).toEqual(review)
    expect(invoke).toHaveBeenCalledWith('rpc_dispatch', {args: {v: 1, command: 'passmanager:import:review', data: {import_id: 'token', source_password: null}}})
  })
  it('preserves unsupported-host and password error codes for the import UI', async () => {
    const transport = new TauriTransport()
    for (const code of ['UNKNOWN_COMMAND', 'CREDENTIAL_IMPORT_PASSWORD_INVALID']) {
      invoke.mockResolvedValueOnce({ok: false, error: 'Host rejected import', code})
      await expect(transport.rpc('passmanager:import:review', {import_id: 'token', source_password: 'synthetic'})).rejects.toMatchObject({code})
    }
  })
})
