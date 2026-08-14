import {atom, computed} from '@reatom/core'

import {i18n} from '@project/passmanager/i18n'
import type {UrlMatch, UrlRule} from '@project/passmanager/types'
import {formatLink, isOpenableUrlRule, URLValidator} from '@project/passmanager/urls'

export type PMEntryWebsiteEditorRow = Readonly<{
  id: string
  value: string
  match: UrlMatch
}>

export type PMEntryWebsiteEditorBuildResult =
  | {ok: true; rules: UrlRule[]}
  | {ok: false; firstInvalidRowId: string}

export type PMEntryWebsiteEditorOptions = {
  onChange?: () => void
}

export type PMEntryWebsiteValidationOptions = {
  allowUnchangedLegacy?: boolean
}

let websiteRowNonce = 0

function createRow(rule: Partial<UrlRule> = {}): PMEntryWebsiteEditorRow {
  return {
    id: `website-row-${++websiteRowNonce}`,
    value: String(rule.value ?? ''),
    match: rule.match ?? 'base_domain',
  }
}

function cloneRules(rules: readonly UrlRule[]): UrlRule[] {
  return rules.map((rule) => ({value: rule.value, match: rule.match}))
}

function comparableRules(rows: readonly PMEntryWebsiteEditorRow[]): UrlRule[] {
  return rows.filter((row) => row.value.trim()).map((row) => ({value: row.value, match: row.match}))
}

function rulesEqual(left: readonly UrlRule[], right: readonly UrlRule[]): boolean {
  return (
    left.length === right.length &&
    left.every((rule, index) => rule.value === right[index]?.value && rule.match === right[index]?.match)
  )
}

function duplicateSignature(rule: UrlRule): string | undefined {
  const value = rule.value.trim()
  if (!value) return undefined
  if (rule.match === 'regex') return `regex:${value}`

  try {
    return `url:${new URL(formatLink(value)).href}`
  } catch {
    return undefined
  }
}

export class PMEntryWebsiteEditorModel {
  readonly rows = atom<readonly PMEntryWebsiteEditorRow[]>([createRow()], 'entryWebsites.rows')
  readonly rowErrors = atom<Readonly<Record<string, string>>>({}, 'entryWebsites.errors')
  readonly touchedRowIds = atom<readonly string[]>([], 'entryWebsites.touchedRows')
  readonly submitAttempted = atom(false, 'entryWebsites.submitAttempted')
  readonly baselineRules = atom<readonly UrlRule[]>([], 'entryWebsites.baselineRules')
  readonly dirty = computed(
    () => !rulesEqual(comparableRules(this.rows()), this.baselineRules()),
    'entryWebsites.dirty',
  )
  readonly hasAdvancedMatching = computed(
    () =>
      this.baselineRules().some((rule) => rule.match !== 'base_domain') ||
      this.rows().some((row) => row.match !== 'base_domain'),
    'entryWebsites.hasAdvancedMatching',
  )
  readonly primaryRowId = computed(
    () => this.rows().find((row) => isOpenableUrlRule(row))?.id ?? '',
    'entryWebsites.primaryRowId',
  )
  readonly firstInvalidRowId = computed(
    () => this.rows().find((row) => Boolean(this.rowErrors()[row.id]))?.id ?? '',
    'entryWebsites.firstInvalidRowId',
  )

  private readonly validator = new URLValidator()
  private readonly onChange?: () => void

  constructor(options: PMEntryWebsiteEditorOptions = {}) {
    this.onChange = options.onChange
  }

  reset(rules: readonly UrlRule[] = []): void {
    const baseline = cloneRules(rules)
    this.baselineRules.set(baseline)
    this.rows.set(baseline.length ? baseline.map(createRow) : [createRow()])
    this.rowErrors.set({})
    this.touchedRowIds.set([])
    this.submitAttempted.set(false)
  }

  setFirstValue(value: string): void {
    const first = this.rows()[0]
    if (!first) {
      this.rows.set([createRow({value, match: 'base_domain'})])
    } else {
      this.replaceRow(first.id, {...first, value})
    }
    this.afterChange()
  }

  updateValue(rowId: string, value: string): void {
    const row = this.getRow(rowId)
    if (!row || row.value === value) return
    this.replaceRow(rowId, {...row, value})
    this.afterChange()
  }

  updateMatch(rowId: string, match: UrlMatch): void {
    const row = this.getRow(rowId)
    if (!row || row.match === match) return
    this.replaceRow(rowId, {...row, match})
    this.afterChange()
  }

  add(): string {
    const row = createRow()
    this.rows.set([...this.rows(), row])
    this.afterChange()
    return row.id
  }

  remove(rowId: string): string | undefined {
    const rows = this.rows()
    const index = rows.findIndex((row) => row.id === rowId)
    if (index <= 0) return undefined

    const focusRowId = rows[index + 1]?.id ?? rows[index - 1]?.id
    this.rows.set(rows.filter((row) => row.id !== rowId))
    this.touchedRowIds.set(this.touchedRowIds().filter((id) => id !== rowId))
    this.afterChange()
    return focusRowId
  }

  pasteMultiline(rowId: string, text: string): boolean {
    const values = text
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
    if (values.length < 2) return false

    const index = this.rows().findIndex((row) => row.id === rowId)
    if (index < 0) return false

    const current = this.rows()[index]
    if (!current) return false
    const inserted = values.map((value, valueIndex) =>
      valueIndex === 0 ? {...current, value} : createRow({value, match: 'base_domain'}),
    )
    this.rows.set([...this.rows().slice(0, index), ...inserted, ...this.rows().slice(index + 1)])
    this.afterChange()
    return true
  }

  markTouched(rowId: string): void {
    if (!this.getRow(rowId) || this.touchedRowIds().includes(rowId)) return
    this.touchedRowIds.set([...this.touchedRowIds(), rowId])
    this.refreshVisibleErrors()
  }

  primaryValue(): string {
    return this.getRow(this.primaryRowId())?.value.trim() ?? ''
  }

  buildRules(options: PMEntryWebsiteValidationOptions = {}): PMEntryWebsiteEditorBuildResult {
    this.submitAttempted.set(true)
    if (options.allowUnchangedLegacy && !this.dirty()) {
      this.rowErrors.set({})
      return {ok: true, rules: cloneRules(this.baselineRules())}
    }

    const {errors, rules} = this.validateRows()
    this.rowErrors.set(errors)
    const firstInvalidRowId = this.firstInvalidRowId()
    return firstInvalidRowId ? {ok: false, firstInvalidRowId} : {ok: true, rules}
  }

  private getRow(rowId: string): PMEntryWebsiteEditorRow | undefined {
    return this.rows().find((row) => row.id === rowId)
  }

  private replaceRow(rowId: string, next: PMEntryWebsiteEditorRow): void {
    this.rows.set(this.rows().map((row) => (row.id === rowId ? next : row)))
  }

  private afterChange(): void {
    this.refreshVisibleErrors()
    this.onChange?.()
  }

  private refreshVisibleErrors(): void {
    if (!this.submitAttempted() && this.touchedRowIds().length === 0) return
    const validation = this.validateRows()
    if (this.submitAttempted()) {
      this.rowErrors.set(validation.errors)
      return
    }

    const touched = new Set(this.touchedRowIds())
    this.rowErrors.set(
      Object.fromEntries(Object.entries(validation.errors).filter(([rowId]) => touched.has(rowId))),
    )
  }

  private validateRows(): {errors: Record<string, string>; rules: UrlRule[]} {
    const rows = this.rows()
    const draftRules = rows.map((row) => ({value: row.value, match: row.match}))
    const validation = this.validator.validateRules(draftRules)
    const errors: Record<string, string> = {}

    for (const error of validation.errors) {
      const rowId = rows[error.index]?.id
      if (!rowId) continue
      errors[rowId] =
        error.code === 'invalid_regex' ? i18n('error:website_regex_invalid') : i18n('error:website_invalid')
    }

    const signatures = new Set<string>()
    for (const entry of validation.entries) {
      if (entry.kind === 'invalid') continue
      const signature = duplicateSignature(entry.rule)
      if (!signature) continue
      const rowId = rows[entry.index]?.id
      if (!rowId) continue
      if (signatures.has(signature)) {
        errors[rowId] = i18n('error:website_duplicate')
      } else {
        signatures.add(signature)
      }
    }

    return {errors, rules: validation.rules}
  }
}
