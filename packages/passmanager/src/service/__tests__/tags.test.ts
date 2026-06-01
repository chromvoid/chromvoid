import {describe, expect, it} from 'vitest'

import cases from './credential-tag-normalization-cases.json'
import {
  buildCredentialTagOptions,
  credentialTagKey,
  entryHasCredentialTag,
  normalizeCredentialTags,
  normalizeCredentialTagLabel,
  pruneCredentialTagKeys,
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
