import {describe, expect, it} from 'vitest'

import type {UrlRule} from './service/types'
import {getPrimaryUrlRule, isOpenableUrlRule} from './url-matching'
import {URLValidator} from './url-validator'

describe('URLValidator.validateRules', () => {
  const validator = new URLValidator()

  it.each(['base_domain', 'host', 'starts_with', 'exact', 'never'] as const)(
    'preserves the %s match mode for URL rules',
    (match) => {
      const result = validator.validateRules([{value: 'example.com/path,segment', match}])

      expect(result.ok).toBe(true)
      expect(result.rules).toEqual([{value: 'https://example.com/path,segment', match}])
    },
  )

  it('preserves and validates regex rules explicitly', () => {
    expect(validator.validateRules([{value: '^https://example\\.com', match: 'regex'}])).toMatchObject({
      ok: true,
      rules: [{value: '^https://example\\.com', match: 'regex'}],
    })

    expect(validator.validateRules([{value: '[', match: 'regex'}])).toMatchObject({
      ok: false,
      errors: [{index: 0, value: '[', code: 'invalid_regex'}],
    })
  })

  it('rejects invalid values for non-regex rules', () => {
    expect(validator.validateRules([{value: '[', match: 'exact'}])).toMatchObject({
      ok: false,
      errors: [{index: 0, value: '[', code: 'invalid_value'}],
    })
  })
})

describe('primary URL rules', () => {
  const rules: UrlRule[] = [
    {value: '^https://example', match: 'regex'},
    {value: 'https://blocked.example', match: 'never'},
    {value: 'https://primary.example', match: 'host'},
    {value: 'https://secondary.example', match: 'base_domain'},
  ]

  it('selects the first openable rule after regex and never rules', () => {
    expect(getPrimaryUrlRule(rules)).toEqual(rules[2])
  })

  it('classifies only URL-based match modes as openable', () => {
    expect(
      ['base_domain', 'host', 'starts_with', 'exact', 'regex', 'never'].map((match) =>
        isOpenableUrlRule({value: 'example.com', match: match as UrlRule['match']}),
      ),
    ).toEqual([true, true, true, true, false, false])
  })
})
