import {describe, expect, it} from 'vitest'

import {CatalogService} from '../../src/core/catalog/catalog'
import {CatalogMirror} from '../../src/core/catalog/local-catalog/catalog-mirror'
import {CatalogEventType} from '../../src/core/catalog/local-catalog/types'
import type {TransportEventHandler, TransportLike} from '../../src/core/transport/transport'

function buildSnapshot() {
  return {
    header: {root_version: 1},
    data: {
      i: 0,
      t: 0,
      n: '/',
      s: 0,
      z: 0,
      b: 0,
      m: 0,
      c: [
        {
          i: 10,
          t: 0,
          n: '.passmanager',
          s: 0,
          z: 0,
          b: 0,
          m: 0,
          c: [
            {
              i: 11,
              t: 0,
              n: 'Work',
              s: 0,
              z: 0,
              b: 0,
              m: 0,
              c: [
                {
                  i: 12,
                  t: 0,
                  n: 'Jira',
                  s: 0,
                  z: 0,
                  b: 0,
                  m: 0,
                  c: [],
                },
              ],
            },
          ],
        },
      ],
    },
  } as const
}

describe('CatalogMirror delete subtree', () => {
  it('removes descendants on NODE_DELETED', () => {
    const mirror = new CatalogMirror()
    mirror.applySnapshot(buildSnapshot() as any)

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
    catalog.catalog.applySnapshot(buildSnapshot() as any)

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
})
