import {Entry, Group, ManagerRoot, filterValue, quickFilters} from '@project/passmanager'
import type {CredentialAuditEntrySummary} from '@project/passmanager/security-audit'

import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMGroupModel} from '../../src/features/passmanager/components/group/group'
import {pmEntryMoveModel} from '../../src/features/passmanager/models/pm-entry-move-model'
import {pmCredentialSecurityAuditModel} from '../../src/features/passmanager/models/pm-credential-security-audit.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {groupBy, sortDirection, sortField} from '../../src/features/passmanager/components/list/sort-controls'
import {pmModel} from '../../src/features/passmanager/password-manager.model'

function createGroup(name: string, entries: Entry[] = []) {
  return new Group({
    id: `group-${name}`,
    name,
    entries,
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(
  parent: unknown,
  input: {id: string; title: string; username?: string; website?: string; otps?: unknown[]; sshKeys?: unknown[]},
): Entry {
  return new Entry(parent as any, {
    id: input.id,
    title: input.title,
    username: input.username ?? '',
    urls: input.website ? [{value: input.website, match: 'host'}] : [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: input.otps ?? [],
    sshKeys: input.sshKeys ?? [],
  } as any)
}

function createPaymentCardEntry(parent: unknown, input: {id: string; title: string; last4?: string}): Entry {
  return new Entry(parent as any, {
    id: input.id,
    entryType: 'payment_card',
    title: input.title,
    username: '',
    urls: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: [],
    sshKeys: [],
    paymentCard: {
      cardholderName: 'Test User',
      expMonth: 12,
      expYear: 2030,
      brand: 'visa',
      last4: input.last4 ?? '4242',
    },
  } as any)
}

function setAuditEntries(
  entries: Array<[Entry, Partial<Omit<CredentialAuditEntrySummary, 'entryId'>>]>,
): void {
  pmCredentialSecurityAuditModel.status.set('ready')
  pmCredentialSecurityAuditModel.failedEntryIds.set(new Set())
  pmCredentialSecurityAuditModel.entries.set(
    new Map(
      entries.map(([entry, state]) => [
        entry.id,
        {
          entryId: entry.id,
          weakPassword: false,
          reusedPassword: false,
          hasTwoFactor: false,
          strengthScore: null,
          ...state,
        },
      ]),
    ),
  )
}

function rowSnapshot(model: PMGroupModel, target: Group) {
  return model.getVisibleRows(target as any).map((row) => {
    switch (row.kind) {
      case 'group':
        return `group:${row.item.name}`
      case 'entry':
        return `entry:${row.item.title}`
      case 'header':
        return `header:${row.label}:${row.count}`
    }
  })
}

describe('PMGroupModel sorting and grouping', () => {
  afterEach(() => {
    filterValue.set('')
    quickFilters.set([])
    sortField.set('name')
    sortDirection.set('asc')
    groupBy.set('none')
    setPassmanagerRoot(undefined)
    pmCredentialSecurityAuditModel.dispose()
    vi.restoreAllMocks()
    ;(window as any).passmanager = undefined
  })

  it('keeps child folders above sorted entries in the current group', () => {
    const model = new PMGroupModel()
    const currentGroup = createGroup('Parent')
    const alpha = createEntry(currentGroup, {id: 'entry-alpha', title: 'Alpha', website: 'https://zeta.test'})
    const zulu = createEntry(currentGroup, {id: 'entry-zulu', title: 'Zulu', website: 'https://alpha.test'})
    currentGroup.entries.set([zulu, alpha])

    const childGroup = createGroup('Parent/Child')
    const passmanager = {
      entriesList: () => [currentGroup, childGroup],
    }
    ;(window as any).passmanager = passmanager
    setPassmanagerRoot(passmanager as any)

    expect(rowSnapshot(model, currentGroup)).toEqual(['group:Parent/Child', 'entry:Alpha', 'entry:Zulu'])

    sortField.set('website')

    expect(rowSnapshot(model, currentGroup)).toEqual(['group:Parent/Child', 'entry:Zulu', 'entry:Alpha'])
  })

  it('builds website grouping rows for current group entries', () => {
    const model = new PMGroupModel()
    const currentGroup = createGroup('Vault')
    const alpha = createEntry(currentGroup, {id: 'entry-alpha', title: 'Alpha', website: 'https://zeta.test'})
    const zulu = createEntry(currentGroup, {id: 'entry-zulu', title: 'Zulu', website: 'https://alpha.test'})
    currentGroup.entries.set([alpha, zulu])

    const passmanager = {
      entriesList: () => [currentGroup],
    }
    ;(window as any).passmanager = passmanager
    setPassmanagerRoot(passmanager as any)

    groupBy.set('website')

    expect(rowSnapshot(model, currentGroup)).toEqual([
      'header:alpha.test:1',
      'entry:Zulu',
      'header:zeta.test:1',
      'entry:Alpha',
    ])
  })

  it('reports filtered visible entry count for the current group presentation', () => {
    const model = new PMGroupModel()
    const currentGroup = createGroup('Vault')
    const alpha = createEntry(currentGroup, {id: 'entry-alpha', title: 'Alpha'})
    const zulu = createEntry(currentGroup, {id: 'entry-zulu', title: 'Zulu'})
    currentGroup.entries.set([alpha, zulu])

    const passmanager = {
      entriesList: () => [currentGroup],
    }
    ;(window as any).passmanager = passmanager
    setPassmanagerRoot(passmanager as any)

    filterValue.set('Alpha')

    const rows = model.getUniqueRows(model.getVisibleRows(currentGroup))
    const summary = model.getGroupPresentation(currentGroup, rows, false)

    expect(summary.entryCount).toBe(1)
    expect(summary.visibleLabel).toBe('0 groups · 1 entry')
    expect(summary.metrics).toEqual([
      {id: 'entries', label: 'records', value: 1, family: 'neutral'},
      {
        id: 'reused_passwords',
        label: 'reused',
        value: null,
        family: 'risk',
        severity: 'warning',
      },
      {
        id: 'weak_passwords',
        label: 'weak',
        value: null,
        family: 'risk',
        severity: 'critical',
      },
      {id: 'two_factor', label: '2FA', value: null, family: 'attribute'},
    ])
    expect(summary.securityStatus).toBe('idle')
    expect(summary.riskSeverity).toBe('unknown')
  })

  it('derives group security metrics from visible rows only', () => {
    const model = new PMGroupModel()
    const currentGroup = createGroup('Vault')
    const otp = createEntry(currentGroup, {
      id: 'entry-otp',
      title: 'OTP Login',
      otps: [{id: 'otp-1', label: 'Main'}],
    })
    const ssh = createEntry(currentGroup, {
      id: 'entry-ssh',
      title: 'SSH Login',
      sshKeys: [{id: 'ssh-1', type: 'ed25519', fingerprint: 'SHA256:test'}],
    })
    const card = createPaymentCardEntry(currentGroup, {id: 'entry-card', title: 'Team Card'})
    const plain = createEntry(currentGroup, {id: 'entry-plain', title: 'Plain'})
    currentGroup.entries.set([otp, ssh, card, plain])
    setAuditEntries([
      [otp, {hasTwoFactor: true}],
      [ssh, {weakPassword: true, strengthScore: 1}],
      [card, {}],
      [plain, {reusedPassword: true}],
    ])

    const passmanager = {
      entriesList: () => [currentGroup],
    }
    ;(window as any).passmanager = passmanager
    setPassmanagerRoot(passmanager as any)

    const rows = model.getUniqueRows(model.getVisibleRows(currentGroup))
    const summary = model.getGroupPresentation(currentGroup, rows, false)

    expect(summary.metrics).toEqual([
      {id: 'entries', label: 'records', value: 4, family: 'neutral'},
      {
        id: 'reused_passwords',
        label: 'reused',
        value: 1,
        family: 'risk',
        severity: 'warning',
      },
      {
        id: 'weak_passwords',
        label: 'weak',
        value: 1,
        family: 'risk',
        severity: 'critical',
      },
      {id: 'two_factor', label: '2FA', value: 1, family: 'attribute'},
    ])
    expect(summary.securityStatus).toBe('ready')
    expect(summary.riskSeverity).toBe('critical')
  })

  it('builds row presentation with description, count, and critical risk priority', () => {
    const model = new PMGroupModel()
    const currentGroup = createGroup('Vault/Crypto')
    currentGroup.updateData({description: 'Wallets and seed phrases'})
    const weak = createEntry(currentGroup, {id: 'entry-weak', title: 'Weak'})
    const reused = createEntry(currentGroup, {id: 'entry-reused', title: 'Reused'})
    currentGroup.entries.set([weak, reused])
    setAuditEntries([
      [weak, {weakPassword: true, reusedPassword: true, strengthScore: 1}],
      [reused, {reusedPassword: true}],
    ])

    const presentation = model.getGroupRowPresentation(currentGroup)

    expect(presentation.displayName).toBe('Crypto')
    expect(presentation.description).toBe('Wallets and seed phrases')
    expect(presentation.entryCount).toBe(2)
    expect(presentation.riskIndicator).toMatchObject({
      severity: 'critical',
      count: 1,
      label: '1 weak passwords',
    })
  })

  it('returns warning row risk for reused-only groups', () => {
    const model = new PMGroupModel()
    const currentGroup = createGroup('Vault/Shared')
    const first = createEntry(currentGroup, {id: 'entry-first', title: 'First'})
    const second = createEntry(currentGroup, {id: 'entry-second', title: 'Second'})
    currentGroup.entries.set([first, second])
    setAuditEntries([
      [first, {reusedPassword: true}],
      [second, {reusedPassword: true}],
    ])

    expect(model.getGroupRowPresentation(currentGroup).riskIndicator).toMatchObject({
      severity: 'warning',
      count: 2,
      label: '2 reused passwords',
    })
  })

  it('does not emit a row risk indicator for clean or loading audit states', () => {
    const model = new PMGroupModel()
    const currentGroup = createGroup('Vault/Clean')
    const entry = createEntry(currentGroup, {id: 'entry-clean', title: 'Clean'})
    currentGroup.entries.set([entry])
    setAuditEntries([[entry, {}]])

    expect(model.getGroupRowPresentation(currentGroup).riskIndicator).toBeNull()

    pmCredentialSecurityAuditModel.status.set('loading')
    const rows = [{kind: 'entry', id: entry.id, item: entry} as const]
    const summary = model.getGroupPresentation(currentGroup, rows, false)

    expect(model.getGroupRowPresentation(currentGroup).riskIndicator).toBeNull()
    expect(summary.metrics.map((metric) => `${metric.id}:${metric.value}`)).toEqual([
      'entries:1',
      'reused_passwords:null',
      'weak_passwords:null',
      'two_factor:null',
    ])
  })

  it('derives root metrics from visible credential entries', () => {
    const model = new PMGroupModel()
    const root = new ManagerRoot({} as any)
    const nestedGroup = createGroup('Nested')
    const nestedEntry = createEntry(nestedGroup, {id: 'entry-nested', title: 'Nested Login'})
    const rootEntry = createEntry(root, {id: 'entry-root', title: 'Root Login'})
    nestedGroup.entries.set([nestedEntry])
    root.entries.set([nestedGroup, rootEntry])
    setAuditEntries([
      [nestedEntry, {weakPassword: true, strengthScore: 1}],
      [rootEntry, {reusedPassword: true, hasTwoFactor: true}],
    ])
    setPassmanagerRoot(root)

    const rows = model.getUniqueRows(model.getVisibleRows(root))
    const summary = model.getGroupPresentation(root as unknown as Group, rows, true)

    expect(summary.metrics).toEqual([
      {id: 'entries', label: 'records', value: 2, family: 'neutral'},
      {
        id: 'reused_passwords',
        label: 'reused',
        value: 1,
        family: 'risk',
        severity: 'warning',
      },
      {
        id: 'weak_passwords',
        label: 'weak',
        value: 1,
        family: 'risk',
        severity: 'critical',
      },
      {id: 'two_factor', label: '2FA', value: 1, family: 'attribute'},
    ])
  })
})

describe('PMGroupModel pointer drag helpers', () => {
  afterEach(() => {
    setPassmanagerRoot(undefined)
    vi.restoreAllMocks()
  })

  it('starts entry/group drag through pmEntryMoveModel and returns a human label', () => {
    const model = new PMGroupModel()
    const group = createGroup('Parent/Infra')
    const entry = createEntry(group, {id: 'entry-alpha', title: 'Alpha'})
    setPassmanagerRoot({
      getEntry: (id: string) => (id === entry.id ? entry : undefined),
      getGroup: (id: string) => (id === group.id ? group : undefined),
    } as any)

    const startEntryDragSpy = vi.spyOn(pmEntryMoveModel, 'startDrag').mockImplementation(() => {})
    const startGroupDragSpy = vi.spyOn(pmEntryMoveModel, 'startGroupDrag').mockImplementation(() => {})

    expect(model.startPointerDrag(entry.id, 'entry')).toBe('Alpha')
    expect(model.startPointerDrag(group.id, 'group')).toBe('Parent/Infra')
    expect(startEntryDragSpy).toHaveBeenCalledWith(entry.id)
    expect(startGroupDragSpy).toHaveBeenCalledWith(group.id)
  })

  it('resolves and applies only valid pointer drop targets', async () => {
    const model = new PMGroupModel()
    const el = document.createElement('div')
    const payload = {domain: 'passmanager', kind: 'entry', id: 'entry-alpha'} as const

    vi.spyOn(pmEntryMoveModel, 'hitTestDropTarget').mockReturnValue({id: 'target-id', el})
    vi.spyOn(pmEntryMoveModel, 'canDropToTarget').mockReturnValue(true)
    const setDropTargetSpy = vi.spyOn(pmEntryMoveModel, 'setDropTarget').mockImplementation(() => {})
    const dropToTargetSpy = vi.spyOn(pmEntryMoveModel, 'dropToTarget').mockResolvedValue(true)
    const clearDragStateSpy = vi.spyOn(pmEntryMoveModel, 'clearDragState').mockImplementation(() => {})

    expect(model.findPointerDropTarget(12, 24, payload)).toEqual({id: 'target-id', el})
    model.setPointerDropTarget('target-id')
    await expect(model.dropPointerPayload('target-id', payload)).resolves.toBe(true)
    model.clearPointerDragState()

    expect(setDropTargetSpy).toHaveBeenCalledWith('target-id')
    expect(dropToTargetSpy).toHaveBeenCalledWith('target-id', payload)
    expect(clearDragStateSpy).toHaveBeenCalled()
  })
})

describe('PMGroupModel keyboard navigation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('skips header rows and opens the active actionable row', () => {
    const model = new PMGroupModel()
    const group = createGroup('Keyboard Group')
    const alpha = createEntry(group, {id: 'entry-alpha', title: 'Alpha'})
    const beta = createEntry(group, {id: 'entry-beta', title: 'Beta'})
    const rows = [
      {kind: 'header', id: 'header-a', label: 'A', count: 1},
      {kind: 'entry', id: alpha.id, item: alpha},
      {kind: 'header', id: 'header-b', label: 'B', count: 1},
      {kind: 'entry', id: beta.id, item: beta},
    ] as const

    const openSpy = vi.spyOn(pmModel, 'openItem').mockImplementation(() => {})

    model.syncKeyboardState([...rows], 'keyboard-context', group)
    expect(model.getActiveItemId()).toBe(alpha.id)

    expect(model.moveKeyboardFocus(1)).toBe(3)
    expect(model.getActiveItemId()).toBe(beta.id)

    expect(model.openActiveItem()).toBe(true)
    expect(openSpy).toHaveBeenCalledWith(beta)
  })
})
