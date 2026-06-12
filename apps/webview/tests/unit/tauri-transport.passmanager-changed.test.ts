const {dispatchTauriCatalogCommandMock} = vi.hoisted(() => ({
  dispatchTauriCatalogCommandMock: vi.fn(),
}))

vi.mock('../../src/core/transport/tauri/tauri-catalog-command-dispatcher', () => ({
  dispatchTauriCatalogCommand: dispatchTauriCatalogCommandMock,
}))

import {afterEach, describe, expect, it, vi} from 'vitest'

import {TauriTransport} from '../../src/core/transport/tauri/tauri-transport'

describe('TauriTransport passmanager change events', () => {
  afterEach(() => {
    dispatchTauriCatalogCommandMock.mockReset()
  })

  it('does not emit passmanager:changed for icon reads', async () => {
    dispatchTauriCatalogCommandMock.mockResolvedValueOnce({ok: true, result: {content_base64: ''}})
    const transport = new TauriTransport()
    const onChanged = vi.fn()
    transport.on('passmanager:changed', onChanged)

    await transport.sendPassmanager('passmanager:icon:get', {icon_ref: 'sha256:test'})
    await Promise.resolve()

    expect(onChanged).not.toHaveBeenCalled()
  })

  it('still emits passmanager:changed for mutations', async () => {
    dispatchTauriCatalogCommandMock.mockResolvedValueOnce({ok: true, result: null})
    const transport = new TauriTransport()
    const onChanged = vi.fn()
    transport.on('passmanager:changed', onChanged)

    await transport.sendPassmanager('passmanager:entry:save', {id: 'entry-1'})
    await Promise.resolve()

    expect(onChanged).toHaveBeenCalledWith(undefined, {command: 'passmanager:entry:save'})
  })
})
