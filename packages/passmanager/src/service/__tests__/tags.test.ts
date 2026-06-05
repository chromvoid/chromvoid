import {describe, expect, it} from 'vitest'

import cases from './credential-tag-normalization-cases.json'
import {
  buildCredentialTagOptions,
  credentialTagKey,
  entryHasCredentialTag,
  normalizeCredentialTagCatalog,
  normalizeCredentialTags,
  normalizeCredentialTagLabel,
  planCredentialTagDelete,
  planCredentialTagRename,
  pruneCredentialTagKeys,
  removeCredentialTagLabel,
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
      {key: 'finance', label: 'Finance', count: 2},
      {key: 'work', label: 'Work', count: 2},
      {key: 'client-a', label: 'Client A', count: 1},
    ])
  })

  it('builds options from catalog tags including zero-use tags', () => {
    expect(
      buildCredentialTagOptions(
        [{tags: ['work']}, {tags: ['Finance']}],
        ['Work', 'Zero Use', 'Finance'],
      ),
    ).toEqual([
      {key: 'finance', label: 'Finance', count: 1},
      {key: 'work', label: 'Work', count: 1},
      {key: 'zero-use', label: 'Zero Use', count: 0},
    ])
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
