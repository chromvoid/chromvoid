import {action, atom, computed} from '@reatom/core'

import {Entry, type OTP} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {pmModel} from '../../password-manager.model'

export type PMOtpQuickViewTypeFilter = 'all' | 'totp' | 'hotp'

export type PMOtpQuickViewRow = {
  id: string
  entryId: string
  entryTitle: string
  displayPath: string
  username: string
  groupPath?: string
  groupLabel: string
  otpId: string
  otpLabel: string
  otpDisplayLabel: string
  otpType: 'TOTP' | 'HOTP'
  digits: number
  period?: number
  urlsText: string
  otp: OTP
}

export type PMOtpQuickViewSummary = {
  total: number
  visible: number
  totp: number
  hotp: number
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function getOtpType(otp: OTP): 'TOTP' | 'HOTP' {
  return otp.type() === 'HOTP' ? 'HOTP' : 'TOTP'
}

function getOtpLabel(otp: OTP): string {
  return String(otp.label || otp.data.label || '').trim()
}

function getEntryDisplayPath(entry: Entry): string {
  return [...(entry.groupPath?.split('/') ?? []), entry.title].map((part) => part.trim()).filter(Boolean).join('/')
}

function getOtpDisplayLabel(otpLabel: string, entryTitle: string): string {
  const label = otpLabel.trim()
  if (!label || label === entryTitle.trim() || label === i18n('otp:default:name').trim() || label === 'OTP') {
    return ''
  }

  return label
}

function getOtpDigits(otp: OTP): number {
  const digits = Number(otp.data.digits ?? 6)
  return Number.isFinite(digits) ? digits : 6
}

function getUrlsText(entry: Entry): string {
  return entry.urls.map((url) => url.value).join(' ')
}

function rowMatchesQuery(row: PMOtpQuickViewRow, query: string): boolean {
  if (!query) {
    return true
  }

  return [
    row.displayPath,
    row.entryTitle,
    row.username,
    row.groupPath ?? '',
    row.groupLabel,
    row.otpLabel,
    row.otpType,
    row.urlsText,
  ].some((value) => normalizeSearchValue(value).includes(query))
}

export class PMOtpQuickViewModel {
  readonly query = atom('', 'passmanager.otpQuickView.query')
  readonly typeFilter = atom<PMOtpQuickViewTypeFilter>('all', 'passmanager.otpQuickView.typeFilter')

  readonly hasRoot = computed(() => Boolean(pmModel.root()), 'passmanager.otpQuickView.hasRoot')
  readonly isLoading = computed(
    () => pmModel.root()?.isLoading?.() ?? false,
    'passmanager.otpQuickView.isLoading',
  )
  readonly isReadOnly = computed(
    () => pmModel.root()?.isReadOnly?.() ?? true,
    'passmanager.otpQuickView.isReadOnly',
  )

  readonly rows = computed(() => {
    const root = pmModel.root()
    if (!root) {
      return [] satisfies PMOtpQuickViewRow[]
    }

    const rows: PMOtpQuickViewRow[] = []
    for (const entry of root.allEntries) {
      if (!(entry instanceof Entry) || entry.entryType === 'payment_card') {
        continue
      }

      const groupPath = entry.groupPath
      const urlsText = getUrlsText(entry)
      const displayPath = getEntryDisplayPath(entry)
      for (const otp of entry.otps()) {
        const otpType = getOtpType(otp)
        const otpLabel = getOtpLabel(otp)
        rows.push({
          id: `${entry.id}:${otp.id}`,
          entryId: entry.id,
          entryTitle: entry.title,
          displayPath,
          username: entry.username,
          groupPath,
          groupLabel: groupPath ?? '',
          otpId: otp.id,
          otpLabel,
          otpDisplayLabel: getOtpDisplayLabel(otpLabel, entry.title),
          otpType,
          digits: getOtpDigits(otp),
          period: otpType === 'TOTP' ? otp.data.period : undefined,
          urlsText,
          otp,
        })
      }
    }

    return rows
  }, 'passmanager.otpQuickView.rows')

  readonly visibleRows = computed(() => {
    const query = normalizeSearchValue(this.query())
    const typeFilter = this.typeFilter()

    return this.rows().filter((row) => {
      if (typeFilter !== 'all' && row.otpType.toLocaleLowerCase() !== typeFilter) {
        return false
      }

      return rowMatchesQuery(row, query)
    })
  }, 'passmanager.otpQuickView.visibleRows')

  readonly summary = computed(() => {
    const rows = this.rows()
    const visible = this.visibleRows()

    return {
      total: rows.length,
      visible: visible.length,
      totp: rows.filter((row) => row.otpType === 'TOTP').length,
      hotp: rows.filter((row) => row.otpType === 'HOTP').length,
    } satisfies PMOtpQuickViewSummary
  }, 'passmanager.otpQuickView.summary')

  readonly hasActiveFilters = computed(
    () => this.query().trim().length > 0 || this.typeFilter() !== 'all',
    'passmanager.otpQuickView.hasActiveFilters',
  )

  readonly setQuery = action((value: string) => {
    this.query.set(value)
  }, 'passmanager.otpQuickView.setQuery')

  readonly setTypeFilter = action((value: PMOtpQuickViewTypeFilter) => {
    this.typeFilter.set(value)
  }, 'passmanager.otpQuickView.setTypeFilter')

  readonly clearFilters = action(() => {
    this.query.set('')
    this.typeFilter.set('all')
  }, 'passmanager.otpQuickView.clearFilters')

  readonly openEntry = action((row: PMOtpQuickViewRow) => {
    navigationModel.openPassmanagerRoute({
      kind: 'entry',
      entryId: row.entryId,
      groupPath: row.groupPath,
    })
  }, 'passmanager.otpQuickView.openEntry')

  readonly openEntryById = action((rowId: string) => {
    const row = this.rows().find((item) => item.id === rowId)
    if (row) {
      this.openEntry(row)
    }
  }, 'passmanager.otpQuickView.openEntryById')

  readonly state = {
    query: this.query,
    typeFilter: this.typeFilter,
    rows: this.rows,
    visibleRows: this.visibleRows,
    summary: this.summary,
    hasRoot: this.hasRoot,
    isLoading: this.isLoading,
    isReadOnly: this.isReadOnly,
    hasActiveFilters: this.hasActiveFilters,
  }

  readonly actions = {
    setQuery: this.setQuery,
    setTypeFilter: this.setTypeFilter,
    clearFilters: this.clearFilters,
    openEntry: this.openEntry,
    openEntryById: this.openEntryById,
  }
}

export const pmOtpQuickViewModel = new PMOtpQuickViewModel()
