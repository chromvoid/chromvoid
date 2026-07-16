import {describe, expect, it} from 'vitest'

import cases from './credential-tag-normalization-cases.json'
import {
  buildCredentialTagOptions,
  credentialTagKey,
  entryHasCredentialTag,
  fallbackCredentialTagColorId,
  normalizeCredentialTagCatalog,
  normalizeCredentialTagCatalogMeta,
  normalizeCredentialTagColorId,
  normalizeCredentialTags,
  normalizeCredentialTagLabel,
  planCredentialTagDelete,
  planCredentialTagRename,
  pruneCredentialTagCatalogMeta,
  pruneCredentialTagKeys,
  removeCredentialTagLabel,
  renameCredentialTagCatalogMeta,
  replaceCredentialTagLabel,
} from '../tags'

describe('credential tag normalization', () => {
  it('returns an empty array for malformed input', () => {
    expect(normalizeCredentialTags(undefined)).toEqual([])
    expect(normalizeCredentialTags(null)).toEqual([])
    expect(normalizeCredentialTags('Work')).toEqual([])
    expect(normalizeCredentialTags({tags: ['Work']})).toEqual([])
  })

  it.each(cases)('normalizes shared fixture: $name', ({input, labels, keys}) => {
    const normalized = normalizeCredentialTags(input)

    expect(normalized).toEqual(labels)
    expect(normalized.map(credentialTagKey)).toEqual(keys)
  })

  it('uses deterministic lowercase for keys', () => {
    expect(credentialTagKey('Client   A')).toBe('client-a')
    expect(credentialTagKey('I')).toBe('i')
  })

  it('rejects empty labels', () => {
    expect(normalizeCredentialTagLabel('')).toBeUndefined()
    expect(normalizeCredentialTagLabel(' # ')).toBeUndefined()
    expect(normalizeCredentialTagLabel(null)).toBeUndefined()
  })

  it('aggregates option counts by key and preserves the first display label', () => {
    expect(
      buildCredentialTagOptions([
        {tags: ['Work', 'Finance']},
        {tags: ['work', 'Client A']},
        {tags: ['Finance']},
      ]),
    ).toEqual([
      {key: 'finance', label: 'Finance', colorId: fallbackCredentialTagColorId('finance'), count: 2},
      {key: 'work', label: 'Work', colorId: fallbackCredentialTagColorId('work'), count: 2},
      {key: 'client-a', label: 'Client A', colorId: fallbackCredentialTagColorId('client-a'), count: 1},
    ])
  })

  it('builds options from catalog tags including zero-use tags', () => {
    expect(
      buildCredentialTagOptions(
        [{tags: ['work']}, {tags: ['Finance']}],
        ['Work', 'Zero Use', 'Finance'],
      ),
    ).toEqual([
      {key: 'finance', label: 'Finance', colorId: fallbackCredentialTagColorId('finance'), count: 1},
      {key: 'work', label: 'Work', colorId: fallbackCredentialTagColorId('work'), count: 1},
      {key: 'zero-use', label: 'Zero Use', colorId: fallbackCredentialTagColorId('zero-use'), count: 0},
    ])
  })

  it('uses stored catalog metadata before deterministic color fallback', () => {
    expect(
      buildCredentialTagOptions(
        [{tags: ['work']}],
        ['Work', 'Zero Use'],
        {
          work: {colorId: 'pink'},
          'zero-use': {colorId: 'cyan'},
        },
      ),
    ).toEqual([
      {key: 'work', label: 'Work', colorId: 'pink', count: 1},
      {key: 'zero-use', label: 'Zero Use', colorId: 'cyan', count: 0},
    ])
  })

  it('normalizes and prunes tag color metadata', () => {
    expect(normalizeCredentialTagColorId('green')).toBe('green')
    expect(normalizeCredentialTagColorId('red')).toBeUndefined()
    expect(
      normalizeCredentialTagCatalogMeta(
        {
          ' #Work ': {color_id: 'orange'},
          stale: {colorId: 'blue'},
          invalid: {colorId: 'red'},
        },
        ['Work'],
      ),
    ).toEqual({work: {colorId: 'orange'}})
    expect(
      pruneCredentialTagCatalogMeta(
        {
          work: {colorId: 'pink'},
          stale: {colorId: 'cyan'},
        },
        ['Work'],
      ),
    ).toEqual({work: {colorId: 'pink'}})
  })

  it('moves tag color metadata on rename', () => {
    expect(renameCredentialTagCatalogMeta({work: {colorId: 'green'}}, ['Client A'], 'work', 'client-a')).toEqual({
      'client-a': {colorId: 'green'},
    })
    expect(
      renameCredentialTagCatalogMeta({work: {colorId: 'green'}}, ['Client A'], 'work', 'client-a', 'amber'),
    ).toEqual({'client-a': {colorId: 'amber'}})
  })

  it('does not apply the per-entry tag limit to catalog normalization', () => {
    const tags = Array.from({length: 14}, (_, index) => `Tag ${index + 1}`)

    expect(normalizeCredentialTags(tags)).toHaveLength(12)
    expect(normalizeCredentialTagCatalog(tags)).toHaveLength(14)
  })

  it('plans tag rename and blocks target key collisions', () => {
    const plan = planCredentialTagRename(
      ['Work', 'Finance'],
      [
        {id: 'entry-1', tags: ['Work']},
        {id: 'entry-2', tags: ['Personal']},
      ],
      'work',
      'Client A',
    )

    expect(plan).toEqual({
      ok: true,
      sourceKey: 'work',
      nextKey: 'client-a',
      nextLabel: 'Client A',
      catalogTags: ['Client A', 'Finance'],
      affectedEntryIds: ['entry-1'],
    })
    expect(
      planCredentialTagRename(['Work', 'Finance'], [{id: 'entry-1', tags: ['Work']}], 'work', 'finance'),
    ).toEqual({ok: false, reason: 'target_exists'})
  })

  it('renames and removes tag labels inside entry assignments', () => {
    expect(replaceCredentialTagLabel(['Work', 'Rotate'], 'work', 'Client A')).toEqual([
      'Client A',
      'Rotate',
    ])
    expect(removeCredentialTagLabel(['Work', 'Rotate'], 'work')).toEqual(['Rotate'])
  })

  it('plans tag delete with affected entry ids', () => {
    expect(
      planCredentialTagDelete(
        ['Work', 'Finance'],
        [
          {id: 'entry-1', tags: ['Work']},
          {id: 'entry-2', tags: ['Finance']},
        ],
        'work',
      ),
    ).toEqual({
      key: 'work',
      catalogTags: ['Finance'],
      affectedEntryIds: ['entry-1'],
    })
  })

  it('prunes selected keys to currently available options', () => {
    const options = buildCredentialTagOptions([{tags: ['Work']}, {tags: ['Finance']}])

    expect(pruneCredentialTagKeys(['work', 'missing', 'Finance', 'work'], options)).toEqual([
      'work',
      'finance',
    ])
  })

  it('matches entry tags case-insensitively by normalized key', () => {
    expect(entryHasCredentialTag(['Client A'], 'client-a')).toBe(true)
    expect(entryHasCredentialTag(['Client A'], 'client a')).toBe(true)
    expect(entryHasCredentialTag(['Client A'], 'client-b')).toBe(false)
  })
})
