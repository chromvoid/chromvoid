import {atom} from '@reatom/core'
import {describe, expect, it} from 'vitest'

import {CatalogService} from '../../src/core/catalog/catalog'
import {CatalogEventType} from '../../src/core/catalog/local-catalog/types'
import type {TransportLike} from '../../src/core/transport/transport'
import {applyManifestFixture, catalogFile} from './helpers/catalog-manifest'

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

async function* emptyByteSource(): AsyncIterable<Uint8Array> {
  yield new Uint8Array()
}

describe('CatalogService replaceFile', () => {
  it('calls optional transport replaceFile with the transport receiver', async () => {
    const {transport, calls} = createTransportWithReplace()
    const catalog = new CatalogService(transport)
    applyManifestFixture(catalog.catalog, [
      catalogFile({id: 1, name: 'notes.md', size: 3, sourceRevision: 10, modtime: 100}),
    ])
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

  it('inserts a committed empty root upload into the shared mirror', async () => {
    const {transport} = createTransportWithReplace()
    const uploadTransport = {
      ...transport,
      uploadFile: async () => ({
        nodeId: 7,
        created: true,
        size: 0,
        mimeType: 'text/markdown',
        modtime: 200,
        sourceRevision: 20,
        mediaInfo: null,
        mediaInspectedRevision: 0,
      }),
    } as TransportLike
    const catalog = new CatalogService(uploadTransport)
    applyManifestFixture(catalog.catalog, [])

    await catalog.api.upload(
      {parentPath: '/', name: 'empty.md'},
      0,
      emptyByteSource(),
      {name: 'empty.md', type: 'text/markdown'},
    )

    expect(catalog.catalog.findByPath('/empty.md')).toMatchObject({
      nodeId: 7,
      size: 0,
      mimeType: 'text/markdown',
      modtime: 200,
      sourceRevision: 20,
    })
  })

  it('reconciles an authoritative replace response without waiting for a push event', async () => {
    const {transport} = createTransportWithReplace()
    const catalog = new CatalogService(transport)
    applyManifestFixture(catalog.catalog, [
      catalogFile({
        id: 1,
        name: 'notes.md',
        size: 0,
        mimeType: 'text/markdown',
        sourceRevision: 10,
        modtime: 100,
      }),
    ])

    await catalog.api.replaceFile(1, new TextEncoder().encode('new'), {
      mimeType: 'text/markdown',
      expectedSourceRevision: 10,
    })

    expect(catalog.catalog.findByPath('/notes.md')).toMatchObject({
      size: 3,
      mimeType: 'text/markdown',
      modtime: 123,
      sourceRevision: 11,
    })
  })

  it('does not regress or re-emit duplicate committed metadata', () => {
    const {transport} = createTransportWithReplace()
    const catalog = new CatalogService(transport)
    applyManifestFixture(catalog.catalog, [
      catalogFile({id: 1, name: 'notes.md', size: 3, sourceRevision: 11, modtime: 123}),
    ])
    let emissions = 0
    catalog.catalog.subscribe(() => {
      emissions += 1
    })

    catalog.catalog.applyEvent({
      type: CatalogEventType.NODE_UPDATED,
      nodeId: 1,
      timestamp: 124,
      version: 12,
      metadata: {size: 4, modtime: 124, sourceRevision: 12},
    })
    catalog.catalog.applyEvent({
      type: CatalogEventType.NODE_UPDATED,
      nodeId: 1,
      timestamp: 123,
      version: 11,
      metadata: {size: 3, modtime: 123, sourceRevision: 11},
    })
    catalog.catalog.applyEvent({
      type: CatalogEventType.NODE_UPDATED,
      nodeId: 1,
      timestamp: 124,
      version: 12,
      metadata: {size: 4, modtime: 124, sourceRevision: 12},
    })

    expect(catalog.catalog.findByPath('/notes.md')).toMatchObject({
      size: 4,
      modtime: 124,
      sourceRevision: 12,
    })
    expect(emissions).toBe(1)
  })
})
