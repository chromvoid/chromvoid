import {atom} from '@reatom/core'
import {describe, expect, it} from 'vitest'

import {CatalogService} from '../../src/core/catalog/catalog'
import type {TransportLike} from '../../src/core/transport/transport'

function createTransportWithReplace() {
  const calls: Array<{receiver: unknown; nodeId: number; bytes: Uint8Array}> = []
  const transport = {
    kind: 'ws',
    connected: atom(true),
    connecting: atom(false),
    lastError: atom<string | undefined>(undefined),
    connect() {},
    disconnect() {},
    on() {},
    off() {},
    sendCatalog: async () => undefined,
    sendPassmanager: async () => undefined,
    uploadFile: async () => undefined,
    downloadFile: async function* () {},
    sourceMetadata: async () => ({
      nodeId: 1,
      nodeType: 1,
      name: 'notes.md',
      mimeType: 'text/markdown',
      size: 3,
      sourceRevision: 10,
    }),
    replaceFile(nodeId: number, bytes: Uint8Array, options: {mimeType?: string | null}) {
      calls.push({receiver: this, nodeId, bytes})
      return Promise.resolve({
        nodeId,
        size: bytes.byteLength,
        mimeType: options.mimeType ?? 'application/octet-stream',
        modtime: 123,
        sourceRevision: 11,
      })
    },
    readSecret: async function* () {},
    writeSecret: async () => undefined,
    eraseSecret: async () => undefined,
    generateOTP: async () => '',
    setOTPSecret: async () => undefined,
    removeOTPSecret: async () => undefined,
  } satisfies Partial<TransportLike> & {
    replaceFile: NonNullable<TransportLike['replaceFile']>
  }

  return {transport: transport as TransportLike, calls}
}

describe('CatalogService replaceFile', () => {
  it('calls optional transport replaceFile with the transport receiver', async () => {
    const {transport, calls} = createTransportWithReplace()
    const catalog = new CatalogService(transport)
    const bytes = new TextEncoder().encode('new')

    const result = await catalog.api.replaceFile(1, bytes, {
      mimeType: 'text/markdown',
      expectedSourceRevision: 10,
    })

    expect(result).toMatchObject({
      nodeId: 1,
      size: 3,
      mimeType: 'text/markdown',
      sourceRevision: 11,
    })
    expect(calls).toEqual([{receiver: transport, nodeId: 1, bytes}])
  })
})
