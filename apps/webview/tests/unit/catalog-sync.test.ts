import {describe, expect, it} from 'vitest'

import {getCatalogSyncPayloadDebugMetrics} from '../../src/core/catalog/catalog'
import {CatalogMirror} from '../../src/core/catalog/local-catalog/catalog-mirror'
import {applyManifestFixture, catalogDir, catalogFile, catalogManifest} from './helpers/catalog-manifest'

describe('Catalog manifest sync', () => {
  it('applies root summaries and eager shard data to the mirror', () => {
    const mirror = new CatalogMirror()

    mirror.applyManifest(
      catalogManifest(
        [
          catalogDir({id: 1, name: 'docs', hasChildren: true}),
          catalogDir({id: 2, name: 'images', children: []}),
        ],
        {
          eagerData: {
            '.passmanager': {
              version: 1,
              root: catalogDir({
                id: 10,
                name: '.passmanager',
                children: [catalogDir({id: 11, name: 'Work', children: []})],
              }),
            },
          },
        },
      ),
    )

    expect(mirror.getChildren('/').map((node) => node.name)).toEqual(['.passmanager', 'docs', 'images'])
    expect(mirror.findByPath('/docs')?.deferredChildren).toBe(true)
    expect(mirror.findByPath('/.passmanager/Work')).toBeTruthy()
  })

  it('keeps nested manifest children addressable', () => {
    const mirror = new CatalogMirror()

    applyManifestFixture(mirror, [
      catalogDir({
        id: 100,
        name: 'parent',
        children: [
          catalogDir({id: 101, name: 'child', children: []}),
          catalogFile({id: 102, name: 'file.txt', size: 50}),
        ],
      }),
    ])

    expect(mirror.getChildren('/').map((node) => node.name)).toEqual(['parent'])
    expect(mirror.getChildren('/parent').map((node) => node.name)).toEqual(['child', 'file.txt'])
  })

  it('computes deterministic payload bytes and node counts for synthetic gate fixtures', () => {
    const manifest = catalogManifest([
      catalogDir({id: 1, name: 'docs', children: []}),
      catalogDir({
        id: 2,
        name: 'media',
        children: [catalogFile({id: 3, name: 'clip.mp4', size: 128})],
      }),
    ])

    const metrics = getCatalogSyncPayloadDebugMetrics(manifest)

    expect(metrics.nodeCount).toBe(1)
    expect(metrics.payloadBytes).toBe(new TextEncoder().encode(JSON.stringify(manifest)).byteLength)
    expect(metrics.payloadBytes).toBeLessThan(512)
  })

  it('keeps a synthetic lazy startup manifest under the v1 payload budget', () => {
    const fullCatalog = catalogDir({
      id: 0,
      name: '/',
      children: Array.from({length: 10_000}, (_, index) =>
        catalogFile({
          id: index + 1,
          name: `file-${String(index).padStart(5, '0')}.txt`,
          size: index,
        }),
      ),
    })
    const manifest = catalogManifest([catalogDir({id: 1, name: 'docs', hasChildren: true})], {
      shards: [
        {
          shard_id: 'docs',
          version: 1,
          size: 10_000,
          node_count: 10_001,
          strategy: 'lazy',
          has_deltas: false,
          loaded: false,
        },
      ],
    })

    const fullMetrics = getCatalogSyncPayloadDebugMetrics(fullCatalog)
    const manifestMetrics = getCatalogSyncPayloadDebugMetrics(manifest)

    expect(fullMetrics.payloadBytes).toBeGreaterThan(manifest.manifest_budget_bytes)
    expect(manifestMetrics.payloadBytes).toBeLessThan(manifest.manifest_budget_bytes)
    expect(manifestMetrics.nodeCount).toBe(1)
  })
})
