import type {UrlMatch, UrlRule} from './service/types'

import {formatLink, isLink} from './utils'

export type UrlMatchDefault = Exclude<UrlMatch, 'regex' | 'never'>

export type URLValidationErrorCode = 'invalid_value' | 'invalid_regex'

export type URLValidationError = {
  index: number
  value: string
  code: URLValidationErrorCode
}

export type URLValidationEntry =
  | {
      index: number
      raw: string
      kind: 'url' | 'regex'
      normalized: string
      rule: UrlRule
    }
  | {
      index: number
      raw: string
      kind: 'invalid'
      normalized: string
      error: URLValidationError
    }

export type URLValidationResult = {
  ok: boolean
  entries: URLValidationEntry[]
  rules: UrlRule[]
  errors: URLValidationError[]
}

export type URLValidatorOptions = {
  defaultMatch?: UrlMatchDefault
  allowRegex?: boolean
}

export class URLValidator {
  private readonly defaultMatch: UrlMatchDefault
  private readonly allowRegex: boolean

  constructor(options: URLValidatorOptions = {}) {
    this.defaultMatch = options.defaultMatch ?? 'base_domain'
    this.allowRegex = options.allowRegex ?? true
  }

  validate(values: string[]): URLValidationResult {
    const entries: URLValidationEntry[] = []
    const rules: UrlRule[] = []
    const errors: URLValidationError[] = []

    for (let index = 0; index < values.length; index++) {
      const raw = String(values[index] ?? '').trim()
      if (!raw) continue

      if (this.isValidUrlValue(raw)) {
        const normalized = formatLink(raw)
        const rule: UrlRule = {value: normalized, match: this.defaultMatch}
        entries.push({index, raw, kind: 'url', normalized, rule})
        rules.push(rule)
        continue
      }

      if (this.allowRegex && this.isRegexValue(raw)) {
        const rule: UrlRule = {value: raw, match: 'regex'}
        entries.push({index, raw, kind: 'regex', normalized: raw, rule})
        rules.push(rule)
        continue
      }

      const error: URLValidationError = {index, value: raw, code: 'invalid_value'}
      entries.push({index, raw, kind: 'invalid', normalized: raw, error})
      errors.push(error)
    }

    return {ok: errors.length === 0, entries, rules, errors}
  }

  validateRules(values: readonly UrlRule[]): URLValidationResult {
    const entries: URLValidationEntry[] = []
    const rules: UrlRule[] = []
    const errors: URLValidationError[] = []

    for (let index = 0; index < values.length; index++) {
      const source = values[index]
      if (!source) continue
      const raw = String(source.value ?? '').trim()
      if (!raw) continue

      if (source.match === 'regex') {
        if (this.isValidRegex(raw)) {
          const rule: UrlRule = {value: raw, match: source.match}
          entries.push({index, raw, kind: 'regex', normalized: raw, rule})
          rules.push(rule)
          continue
        }

        const error: URLValidationError = {index, value: raw, code: 'invalid_regex'}
        entries.push({index, raw, kind: 'invalid', normalized: raw, error})
        errors.push(error)
        continue
      }

      if (this.isValidUrlValue(raw)) {
        const normalized = formatLink(raw)
        const rule: UrlRule = {value: normalized, match: source.match}
        entries.push({index, raw, kind: 'url', normalized, rule})
        rules.push(rule)
        continue
      }

      const error: URLValidationError = {index, value: raw, code: 'invalid_value'}
      entries.push({index, raw, kind: 'invalid', normalized: raw, error})
      errors.push(error)
    }

    return {ok: errors.length === 0, entries, rules, errors}
  }

  private isValidUrlValue(value: string): boolean {
    const v = (value ?? '').trim()
    if (!v) return false
    try {
      return isLink(formatLink(v))
    } catch {
      return false
    }
  }

  private isRegexValue(value: string): boolean {
    const v = (value ?? '').trim()
    if (!v) return false

    // If it's a valid URL/domain - treat it as a URL value.
    if (this.isValidUrlValue(v)) return false

    // Require a strong regex signal (avoid classifying domains like "github.com" as regex).
    if (!/[\\^$()[\]{}|*+?]/.test(v)) return false

    return this.isValidRegex(v)
  }

  private isValidRegex(value: string): boolean {
    try {
      // eslint-disable-next-line no-new
      new RegExp(value)
      return true
    } catch {
      return false
    }
  }
}
