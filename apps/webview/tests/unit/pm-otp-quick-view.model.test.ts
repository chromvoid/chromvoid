import {afterEach, describe, expect, it, vi} from 'vitest'

import {Entry, Group, ManagerRoot} from '@project/passmanager'
import {navigationModel} from '../../src/app/navigation/navigation.model'
import {
  PMOtpQuickViewModel,
  type PMOtpQuickViewRow,
} from '../../src/features/passmanager/components/otp-quick-view'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

function createGroup(id: string, name: string) {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(
  parent: Group | ManagerRoot,
  id: string,
  input: {
    title: string
    username?: string
    urls?: Array<{value: string; match: 'base_domain'}>
    entryType?: 'login' | 'payment_card'
    otps?: Array<{
      id: string
      label: string
      type?: 'TOTP' | 'HOTP'
      digits?: number
      period?: number
      counter?: number
    }>
  },
) {
  return new Entry(parent, {
    id,
    title: input.title,
    username: input.username ?? '',
    urls: input.urls ?? [],
    entryType: input.entryType,
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: (input.otps ?? []).map((otp) => ({
      algorithm: 'SHA1',
      encoding: 'base32',
      digits: otp.digits ?? 6,
      period: otp.period ?? 30,
      counter: otp.counter ?? 0,
      ...otp,
    })),
  } as any)
}

function createRootFixture() {
  const root = new ManagerRoot({} as any)
  const group = createGroup('group-prod', 'Production/Infra')
  const github = createEntry(root, 'entry-github', {
    title: 'GitHub',
    username: 'alice@example.test',
    urls: [{value: 'https://github.com/login', match: 'base_domain'}],
    otps: [{id: 'otp-github', label: 'Primary', type: 'TOTP', period: 30}],
  })
  const aws = createEntry(group, 'entry-aws', {
    title: 'AWS Console',
    username: 'root@example.test',
    urls: [{value: 'https://console.aws.amazon.com', match: 'base_domain'}],
    otps: [{id: 'otp-aws', label: 'Admin', type: 'TOTP', period: 60}],
  })
  const yubikey = createEntry(root, 'entry-yubikey', {
    title: 'Legacy VPN',
    username: 'ops',
    urls: [{value: 'https://vpn.example.test', match: 'base_domain'}],
    otps: [{id: 'otp-vpn', label: 'Hardware token', type: 'HOTP', counter: 7}],
  })
  const card = createEntry(root, 'entry-card', {
    title: 'Corporate Card',
    entryType: 'payment_card',
    otps: [{id: 'otp-card', label: 'Invalid', type: 'TOTP'}],
  })

  group.entries.set([aws])
  root.entries.set([github, group, yubikey, card])

  return {root, group, github, aws, yubikey, card}
}

function rowIds(rows: PMOtpQuickViewRow[]) {
  return rows.map((row) => row.id)
}

afterEach(() => {
  setPassmanagerRoot(undefined)
  vi.restoreAllMocks()
})

describe('PMOtpQuickViewModel', () => {
  it('aggregates root and grouped login OTPs and excludes payment cards', () => {
    const {root} = createRootFixture()
    setPassmanagerRoot(root)
    const model = new PMOtpQuickViewModel()

    expect(rowIds(model.rows())).toEqual([
      'entry-github:otp-github',
      'entry-aws:otp-aws',
      'entry-yubikey:otp-vpn',
    ])
  })

  it('reacts when an entry OTP atom changes', () => {
    const {root, github} = createRootFixture()
    setPassmanagerRoot(root)
    const model = new PMOtpQuickViewModel()

    github.otps.set([
      ...github.otps(),
      createEntry(root, 'entry-temp', {
        title: 'Temp',
        otps: [{id: 'otp-next', label: 'Backup'}],
      }).otps()[0]!,
    ])

    expect(rowIds(model.rows())).toContain('entry-github:otp-next')
    expect(model.summary().total).toBe(4)
  })

  it('filters by entry, group, username, URL, OTP label, and type', () => {
    const {root} = createRootFixture()
    setPassmanagerRoot(root)
    const model = new PMOtpQuickViewModel()

    model.setQuery('aws')
    expect(rowIds(model.visibleRows())).toEqual(['entry-aws:otp-aws'])

    model.setQuery('production/infra')
    expect(rowIds(model.visibleRows())).toEqual(['entry-aws:otp-aws'])

    model.setQuery('alice@example.test')
    expect(rowIds(model.visibleRows())).toEqual(['entry-github:otp-github'])

    model.setQuery('vpn.example')
    expect(rowIds(model.visibleRows())).toEqual(['entry-yubikey:otp-vpn'])

    model.setQuery('hardware')
    expect(rowIds(model.visibleRows())).toEqual(['entry-yubikey:otp-vpn'])

    model.setQuery('hotp')
    expect(rowIds(model.visibleRows())).toEqual(['entry-yubikey:otp-vpn'])
  })

  it('applies type filters and computes summary from unfiltered rows', () => {
    const {root} = createRootFixture()
    setPassmanagerRoot(root)
    const model = new PMOtpQuickViewModel()

    model.setTypeFilter('totp')
    expect(rowIds(model.visibleRows())).toEqual(['entry-github:otp-github', 'entry-aws:otp-aws'])
    expect(model.summary()).toEqual({total: 3, visible: 2, totp: 2, hotp: 1})

    model.setTypeFilter('hotp')
    expect(rowIds(model.visibleRows())).toEqual(['entry-yubikey:otp-vpn'])
    expect(model.summary()).toEqual({total: 3, visible: 1, totp: 2, hotp: 1})

    model.clearFilters()
    expect(model.query()).toBe('')
    expect(model.typeFilter()).toBe('all')
    expect(model.summary()).toEqual({total: 3, visible: 3, totp: 2, hotp: 1})
  })

  it('opens the source entry through app navigation', () => {
    const {root} = createRootFixture()
    setPassmanagerRoot(root)
    const model = new PMOtpQuickViewModel()
    const openRouteSpy = vi.spyOn(navigationModel, 'openPassmanagerRoute').mockImplementation(() => {})

    model.openEntry(model.rows()[1]!)

    expect(openRouteSpy).toHaveBeenCalledWith({
      kind: 'entry',
      entryId: 'entry-aws',
      groupPath: 'Production/Infra',
    })
  })

  it('does not project generated OTP code values', () => {
    const {root, github} = createRootFixture()
    setPassmanagerRoot(root)
    const model = new PMOtpQuickViewModel()
    github.otps()[0]?.currentOtp.set('654321')

    const row = model.rows()[0]!

    expect(row).not.toHaveProperty('code')
    expect(row).not.toHaveProperty('currentOtp')
    expect(JSON.stringify(row)).not.toContain('654321')
  })
})
