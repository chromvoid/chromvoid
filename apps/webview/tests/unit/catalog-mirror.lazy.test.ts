import {describe, expect, it, vi} from 'vitest'

import {CatalogMirror} from '../../src/core/catalog/local-catalog/catalog-mirror'
import type {
  CatalogFolderBatchResponse,
  CatalogFolderPageResponse,
  CatalogSyncManifestResponse,
} from '../../src/core/catalog/local-catalog/types'
import {applyManifestFixture, catalogDir, catalogFile} from './helpers/catalog-manifest'

function manifest(): CatalogSyncManifestResponse {
  return {
    root_version: 7,
    format: 'manifest',
    manifest_budget_bytes: 128 * 1024,
    shards: [
      {
        shard_id: 'docs',
        version: 7,
        size: 0,
        node_count: 2,
        strategy: 'lazy',
        has_deltas: false,
        loaded: false,
      },
    ],
    root_summaries: [
      {
        i: 10,
        t: 0,
        n: 'docs',
        s: 0,
        z: 0,
        b: 1,
        m: 1,
        h: true,
      },
    ],
    eager_data: {},
  }
}

function folderPage(offset: number, names: string[], totalCount = 5): CatalogFolderPageResponse {
  return {
    current_path: '/docs',
    version: 7,
    total_count: totalCount,
    offset,
    limit: names.length,
    next_offset: offset + names.length < totalCount ? offset + names.length : null,
    reload_required: false,
    items: names.map((name, index) => ({
      node_id: 100 + offset + index,
      name,
      is_dir: false,
      size: 10,
      mime_type: 'text/plain',
      media_info: null,
      media_inspected_revision: 0,
      created_at: 1,
      updated_at: 2,
    })),
  }
}

describe('CatalogMirror lazy folders', () => {
  it('returns local children as directories first and then files by name', () => {
    const mirror = new CatalogMirror()

    applyManifestFixture(mirror, [
      catalogFile({id: 1, name: 'zeta.txt', size: 10}),
      catalogDir({id: 2, name: 'Zeta', children: []}),
      catalogFile({id: 3, name: 'Alpha.txt', size: 10}),
      catalogDir({id: 4, name: 'alpha', children: []}),
      catalogFile({id: 5, name: 'beta.txt', size: 10}),
    ])

    expect(mirror.getChildren('/').map((node) => `${node.isDir ? 'dir' : 'file'}:${node.name}`)).toEqual([
      'dir:alpha',
      'dir:Zeta',
      'file:Alpha.txt',
      'file:beta.txt',
      'file:zeta.txt',
    ])
  })

  it('stores manifest root folder state in default catalog order', () => {
    const mirror = new CatalogMirror()

    mirror.applyManifest({
      ...manifest(),
      root_summaries: [
        {
          i: 10,
          t: 0,
          n: 'zeta',
          s: 0,
          z: 0,
          b: 1,
          m: 1,
          h: true,
        },
        {
          i: 11,
          t: 0,
          n: 'alpha',
          s: 0,
          z: 0,
          b: 1,
          m: 1,
          h: true,
        },
      ],
    })

    expect(mirror.getFolderItems('/').map((node) => node?.name ?? null)).toEqual(['alpha', 'zeta'])
  })

  it('applies a bounded manifest with deferred root summaries', () => {
    const mirror = new CatalogMirror()
    const listener = vi.fn()
    mirror.subscribe(listener)

    mirror.applyManifest(manifest())

    const children = mirror.getChildren('/')
    expect(children).toHaveLength(1)
    expect(children[0]?.name).toBe('docs')
    expect(children[0]?.deferredChildren).toBe(true)
    expect(mirror.getChildren('/docs')).toEqual([])
    expect(mirror.getFolderState('/')?.totalCount).toBe(1)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stores folder pages as loaded slots with null placeholders', () => {
    const mirror = new CatalogMirror()
    mirror.applyManifest(manifest())

    mirror.applyFolderPage(folderPage(2, ['c.txt', 'd.txt']))

    const items = mirror.getFolderItems('/docs')
    expect(items).toHaveLength(5)
    expect(items[0]).toBeNull()
    expect(items[1]).toBeNull()
    expect(items[2]?.name).toBe('c.txt')
    expect(items[3]?.name).toBe('d.txt')
    expect(items[4]).toBeNull()
    expect(mirror.isFolderRangeLoaded('/docs', 2, 2)).toBe(true)
    expect(mirror.isFolderRangeLoaded('/docs', 0, 3)).toBe(false)
  })

  it('applies folder batches with one subscriber emission', () => {
    const mirror = new CatalogMirror()
    mirror.applyManifest(manifest())
    const listener = vi.fn()
    mirror.subscribe(listener)

    const batch: CatalogFolderBatchResponse = {
      pages: [folderPage(0, ['a.txt', 'b.txt']), folderPage(2, ['c.txt'])],
      truncated: false,
      warnings: [],
    }
    mirror.applyFolderBatch(batch)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(mirror.getFolderItems('/docs').map((item) => item?.name ?? null)).toEqual([
      'a.txt',
      'b.txt',
      'c.txt',
      null,
      null,
    ])
  })
})
