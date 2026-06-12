import {describe, expect, it} from 'vitest'

import {CatalogService} from '../../src/core/catalog/catalog'
import {CatalogMirror} from '../../src/core/catalog/local-catalog/catalog-mirror'
import {CatalogEventType} from '../../src/core/catalog/local-catalog/types'
import type {TransportEventHandler, TransportLike} from '../../src/core/transport/transport'
import {applyManifestFixture, catalogDir, catalogFile} from './helpers/catalog-manifest'

function passmanagerRoot() {
  return [
    catalogDir({
      id: 10,
      name: '.passmanager',
      children: [
        catalogDir({
          id: 11,
          name: 'Work',
          children: [catalogDir({id: 12, name: 'Jira', children: []})],
        }),
      ],
    }),
  ]
}

async function* textStream(text: string): AsyncIterable<Uint8Array> {
  yield new TextEncoder().encode(text)
}

function createTauriCatalog(downloadText = '{"title":"Cached"}') {
  const handlers = new Map<string, TransportEventHandler[]>()
  const ws = {
    kind: 'tauri' as const,
    on: (event: string, handler: TransportEventHandler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
    },
    downloadFile: async () => textStream(downloadText),
  } as unknown as TransportLike

  return {
    catalog: new CatalogService(ws),
    handlers,
  }
}

describe('CatalogMirror delete subtree', () => {
  it('removes descendants on NODE_DELETED', () => {
    const mirror = new CatalogMirror()
    applyManifestFixture(mirror, passmanagerRoot())

    expect(mirror.findByPath('/.passmanager/Work')).toBeTruthy()
    expect(mirror.findByPath('/.passmanager/Work/Jira')).toBeTruthy()

    mirror.applyEvent({
      type: CatalogEventType.NODE_DELETED,
      nodeId: 11,
      timestamp: Date.now(),
      version: 1,
    })

    expect(mirror.findByPath('/.passmanager/Work')).toBeUndefined()
    expect(mirror.findByPath('/.passmanager/Work/Jira')).toBeUndefined()

    const children = mirror.getChildren('/.passmanager')
    expect(children.some((c) => c.name === 'Work')).toBe(false)
  })

  it('keeps compact source revision from manifest nodes', () => {
    const mirror = new CatalogMirror()
    applyManifestFixture(mirror, [
      catalogFile({
        id: 21,
        name: 'notes.md',
        size: 12,
        modtime: 100,
        sourceRevision: 77,
        mimeType: 'text/markdown',
        mediaInfo: {k: 'audio', a: 1, v: 0, m: 'audio/mp4'},
      }),
    ])

    const node = mirror.findByPath('/notes.md')
    expect(node?.sourceRevision).toBe(77)
    expect(node?.mediaInfo).toEqual({
      kind: 'audio',
      audioTracks: 1,
      videoTracks: 0,
      playbackMimeType: 'audio/mp4',
    })
  })

  it('updates descendant path indexes when a directory moves', () => {
    const mirror = new CatalogMirror()
    applyManifestFixture(mirror, [
      catalogDir({
        id: 20,
        name: 'inbox',
        children: [
          catalogDir({
            id: 21,
            name: 'nested',
            children: [catalogFile({id: 22, name: 'note.txt', size: 12})],
          }),
        ],
      }),
      catalogDir({id: 30, name: 'archive', children: []}),
    ])

    mirror.applyEvent({
      type: CatalogEventType.NODE_MOVED,
      nodeId: 20,
      timestamp: Date.now(),
      version: 2,
      metadata: {
        oldParentId: null,
        newParentId: 30,
        newName: 'Inbox',
      },
    })

    expect(mirror.findByPath('/inbox')).toBeUndefined()
    expect(mirror.findByPath('/inbox/nested')).toBeUndefined()
    expect(mirror.findByPath('/archive/Inbox')?.nodeId).toBe(20)
    expect(mirror.findByPath('/archive/Inbox/nested')?.nodeId).toBe(21)
    expect(mirror.findByPath('/archive/Inbox/nested/note.txt')?.nodeId).toBe(22)
    expect(mirror.getChildren('/archive/Inbox/nested').map((node) => node.name)).toEqual(['note.txt'])
  })

  it('updates descendant path indexes when a directory is renamed', () => {
    const mirror = new CatalogMirror()
    applyManifestFixture(mirror, [
      catalogDir({
        id: 40,
        name: 'drafts',
        children: [catalogFile({id: 41, name: 'todo.md', size: 4})],
      }),
    ])

    expect(mirror.getFolderState('/')).toBeTruthy()

    mirror.applyEvent({
      type: CatalogEventType.NODE_RENAMED,
      nodeId: 40,
      timestamp: Date.now(),
      version: 2,
      metadata: {newName: 'notes'},
    })

    expect(mirror.getFolderState('/')).toBeUndefined()
    expect(mirror.findByPath('/drafts')).toBeUndefined()
    expect(mirror.findByPath('/drafts/todo.md')).toBeUndefined()
    expect(mirror.findByPath('/notes')?.nodeId).toBe(40)
    expect(mirror.findByPath('/notes/todo.md')?.nodeId).toBe(41)
    expect(mirror.getChildren('/notes').map((node) => node.name)).toEqual(['todo.md'])
  })
})

describe('CatalogService (tauri) catalog:event deltas', () => {
  it('applies delete delta directly to the mirror', () => {
    const handlers = new Map<string, TransportEventHandler[]>()
    const ws = {
      kind: 'tauri' as const,
      // Minimal fields required by CatalogService constructor.
      on: (event: string, handler: TransportEventHandler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler])
      },
    } as unknown as TransportLike

    const catalog = new CatalogService(ws)
    applyManifestFixture(catalog.catalog, passmanagerRoot())

    const evt = {
      type: 'delete',
      shard_id: '.passmanager',
      node_id: 11,
      version: 2,
      delta: {
        seq: 2,
        ts: Date.now(),
        op: {type: 'delete'},
        path: '/Work',
        node_id: 11,
      },
    }

    for (const h of handlers.get('catalog:event') ?? []) {
      h(null, evt)
    }

    expect(catalog.catalog.findByPath('/.passmanager/Work')).toBeUndefined()
    expect(catalog.catalog.findByPath('/.passmanager/Work/Jira')).toBeUndefined()
  })

  it('clears cached entry meta before applying a meta.json delete delta', async () => {
    const {catalog, handlers} = createTauriCatalog('{"title":"Cached entry"}')
    applyManifestFixture(catalog.catalog, [
      catalogDir({
        id: 10,
        name: '.passmanager',
        children: [
          catalogDir({
            id: 11,
            name: 'Entry',
            children: [catalogFile({id: 12, name: 'meta.json', size: 24, mimeType: 'application/json'})],
          }),
        ],
      }),
    ])

    await catalog.ensureEntryMeta(11)
    expect(catalog.getEntryMeta(11)?.title).toBe('Cached entry')

    for (const h of handlers.get('catalog:event') ?? []) {
      h(null, {
        type: 'delete',
        shard_id: '.passmanager',
        node_id: 12,
        version: 2,
        delta: {
          seq: 2,
          ts: Date.now(),
          path: '/Entry/meta.json',
          op: {type: 'delete'},
          node_id: 12,
        },
      })
    }

    expect(catalog.getEntryMeta(11)).toBeUndefined()
    expect(catalog.catalog.findByPath('/.passmanager/Entry/meta.json')).toBeUndefined()
  })

  it('clears cached entry meta before applying an entry directory delete delta', async () => {
    const {catalog, handlers} = createTauriCatalog('{"title":"Cached entry"}')
    applyManifestFixture(catalog.catalog, [
      catalogDir({
        id: 10,
        name: '.passmanager',
        children: [
          catalogDir({
            id: 11,
            name: 'Entry',
            children: [catalogFile({id: 12, name: 'meta.json', size: 24, mimeType: 'application/json'})],
          }),
        ],
      }),
    ])

    await catalog.ensureEntryMeta(11)
    expect(catalog.getEntryMeta(11)?.title).toBe('Cached entry')

    for (const h of handlers.get('catalog:event') ?? []) {
      h(null, {
        type: 'delete',
        shard_id: '.passmanager',
        node_id: 11,
        version: 2,
        delta: {
          seq: 2,
          ts: Date.now(),
          path: '/Entry',
          op: {type: 'delete'},
          node_id: 11,
        },
      })
    }

    expect(catalog.getEntryMeta(11)).toBeUndefined()
    expect(catalog.catalog.findByPath('/.passmanager/Entry')).toBeUndefined()
    expect(catalog.catalog.findByPath('/.passmanager/Entry/meta.json')).toBeUndefined()
  })

  it('applies source revision and media info from create and update deltas', () => {
    const handlers = new Map<string, TransportEventHandler[]>()
    const ws = {
      kind: 'tauri' as const,
      on: (event: string, handler: TransportEventHandler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler])
      },
    } as unknown as TransportLike

    const catalog = new CatalogService(ws)
    applyManifestFixture(catalog.catalog, [])

    for (const h of handlers.get('catalog:event') ?? []) {
      h(null, {
        type: 'create',
        shard_id: 'notes',
        node_id: 31,
        version: 1,
        delta: {
          seq: 1,
          ts: 100,
          path: '/',
          op: {
            type: 'create',
            node: {
              i: 31,
              t: 1,
              n: 'draft.md',
              s: 6,
              m: 100,
              r: 12,
              y: 'text/markdown',
              u: {k: 'audio', a: 1, v: 0, m: 'audio/mp4'},
            },
          },
        },
      })
    }

    expect(catalog.catalog.findByPath('/notes/draft.md')).toMatchObject({
      sourceRevision: 12,
      mediaInfo: {
        kind: 'audio',
        audioTracks: 1,
        videoTracks: 0,
        playbackMimeType: 'audio/mp4',
      },
    })

    for (const h of handlers.get('catalog:event') ?? []) {
      h(null, {
        type: 'update',
        shard_id: 'notes',
        node_id: 31,
        version: 2,
        delta: {
          seq: 2,
          ts: 200,
          path: '/',
          op: {
            type: 'update',
            fields: {
              size: 9,
              modtime: 200,
              source_revision: 13,
              mime_type: 'text/markdown',
              media_info: null,
            },
          },
        },
      })
    }

    const node = catalog.catalog.findByPath('/notes/draft.md')
    expect(node?.size).toBe(9)
    expect(node?.modtime).toBe(200)
    expect(node?.sourceRevision).toBe(13)
    expect(node?.mimeType).toBe('text/markdown')
    expect(node?.mediaInfo).toBeNull()
  })

  it('applies catalog:event:batch in one mirror notification', () => {
    const handlers = new Map<string, TransportEventHandler[]>()
    const ws = {
      kind: 'tauri' as const,
      on: (event: string, handler: TransportEventHandler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler])
      },
    } as unknown as TransportLike

    const catalog = new CatalogService(ws)
    applyManifestFixture(catalog.catalog, [])
    let emitCount = 0
    catalog.catalog.subscribe(() => {
      emitCount += 1
    })

    for (const h of handlers.get('catalog:event:batch') ?? []) {
      h(null, {
        events: [
          {
            type: 'create',
            shard_id: 'notes',
            node_id: 41,
            version: 1,
            delta: {
              seq: 1,
              ts: 100,
              path: '/',
              op: {
                type: 'create',
                node: {i: 41, t: 1, n: 'a.md', s: 6, m: 100, r: 12},
              },
            },
          },
          {
            type: 'create',
            shard_id: 'notes',
            node_id: 42,
            version: 2,
            delta: {
              seq: 2,
              ts: 101,
              path: '/',
              op: {
                type: 'create',
                node: {i: 42, t: 1, n: 'b.md', s: 7, m: 101, r: 13},
              },
            },
          },
        ],
      })
    }

    expect(catalog.catalog.findByPath('/notes/a.md')).toBeTruthy()
    expect(catalog.catalog.findByPath('/notes/b.md')).toBeTruthy()
    expect(emitCount).toBe(1)
  })
})
