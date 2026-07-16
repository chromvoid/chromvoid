import {Entry, Group, ManagerRoot} from '@project/passmanager'
import type {CredentialAuditEntrySummary} from '@project/passmanager/security-audit'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {PMEntryListItem} from '../../src/features/passmanager/components/card/entry-list-item'
import {
  PMEntryListItemModel,
  type PMEntryListBadge,
} from '../../src/features/passmanager/components/card/entry-list-item/entry-list-item.model'
import {pmCredentialSecurityAuditModel} from '../../src/features/passmanager/models/pm-credential-security-audit.model'

function createGroup(id: string) {
  return new Group({
    id,
    name: `Group ${id}`,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(
  parent: Group,
  id: string,
  options: {
    username?: string
    title?: string
    otps?: unknown[]
    sshKeys?: unknown[]
    tags?: string[]
  } = {},
) {
  return new Entry(parent, {
    id,
    title: options.title ?? `Entry ${id}`,
    username: options.username ?? `${id}@example.com`,
    urls: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: options.otps ?? [],
    sshKeys: options.sshKeys ?? [],
    tags: options.tags ?? [],
  } as any)
}

function createPaymentCardEntry(
  parent: Group,
  id: string,
  options: {last4?: string; otps?: unknown[]; sshKeys?: unknown[]; tags?: string[]} = {},
) {
  return new Entry(parent, {
    id,
    entryType: 'payment_card',
    title: `Card ${id}`,
    username: '',
    urls: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: options.otps ?? [],
    sshKeys: options.sshKeys ?? [],
    paymentCard: {
      cardholderName: 'Alice Doe',
      expMonth: 12,
      expYear: 2030,
      brand: 'visa',
      last4: options.last4,
    },
    tags: options.tags ?? [],
  } as any)
}

function seedRootSshKeys(root: ManagerRoot, entries: Entry[]) {
  root.sshKeys.set(
    entries.flatMap((entry) =>
      entry.entryType === 'payment_card'
        ? []
        : entry.data().sshKeys.map((key) => ({
            ...key,
            sourceEntryId: entry.id,
          })),
    ),
  )
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

async function flush(element: PMEntryListItem) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

afterEach(() => {
  pmCredentialSecurityAuditModel.dispose()
})

describe('PMEntryListItem active row tab order', () => {
  let originalPassmanager: typeof window.passmanager

  beforeEach(() => {
    if (!customElements.get('pm-entry-list-item')) {
      PMEntryListItem.define()
    }

    originalPassmanager = window.passmanager
  })

  afterEach(() => {
    document.querySelectorAll('pm-entry-list-item').forEach((el) => el.remove())
    window.passmanager = originalPassmanager
  })

  it('keeps inactive managed rows and their buttons out of the tab order', async () => {
    const group = createGroup('entry-item-inactive-group')
    const entry = createEntry(group, 'entry-item-inactive')
    const root = new ManagerRoot({} as any)
    group.entries.set([entry])
    root.entries.set([group])
    seedRootSshKeys(root, [entry])
    root.showElement.set(group)
    window.passmanager = root as typeof window.passmanager

    const element = document.createElement('pm-entry-list-item') as PMEntryListItem
    element.entry = entry
    element.manageActiveRowState = true
    element.activeRow = false
    element.rowTabIndex = -1
    document.body.appendChild(element)
    await flush(element)

    const row = element.shadowRoot?.querySelector('.list-item') as HTMLElement | null
    const primaryAction = element.shadowRoot?.querySelector('.primary-action') as HTMLElement | null

    expect(row?.getAttribute('tabindex')).toBe('-1')
    expect(primaryAction?.getAttribute('button-tabindex')).toBe('-1')
    expect(primaryAction?.getAttribute('aria-label')).toBe('More actions')
  })

  it('exposes the active row and its visible actions to tab navigation', async () => {
    const group = createGroup('entry-item-active-group')
    const entry = createEntry(group, 'entry-item-active')
    const root = new ManagerRoot({} as any)
    group.entries.set([entry])
    root.entries.set([group])
    seedRootSshKeys(root, [entry])
    root.showElement.set(group)
    window.passmanager = root as typeof window.passmanager

    const element = document.createElement('pm-entry-list-item') as PMEntryListItem
    element.entry = entry
    element.manageActiveRowState = true
    element.activeRow = true
    element.rowTabIndex = 0
    document.body.appendChild(element)
    await flush(element)

    const row = element.shadowRoot?.querySelector('.list-item') as HTMLElement | null
    const primaryAction = element.shadowRoot?.querySelector('.primary-action') as HTMLElement | null

    expect(row?.getAttribute('tabindex')).toBe('0')
    expect(primaryAction?.getAttribute('button-tabindex')).toBe('0')
    expect(element.shadowRoot?.querySelector('.item-title > bdi[dir="auto"]')?.textContent).toBe(entry.title)
    expect(element.shadowRoot?.querySelector('.item-subtitle')?.getAttribute('dir')).toBe('ltr')

    row?.focus()
    await flush(element)

    const secondaryAction = element.shadowRoot?.querySelector(
      '.item-actions .action-button',
    ) as HTMLElement | null
    expect(secondaryAction).not.toBeNull()
    expect(secondaryAction?.getAttribute('button-tabindex')).toBe('0')
  })

  it('renders text attribute badges instead of dot-only status indicators', async () => {
    const group = createGroup('entry-item-badges-group')
    const entry = createEntry(group, 'entry-item-badges', {
      otps: [{id: 'otp-1', label: 'Main'}],
      sshKeys: [{id: 'ssh-1', type: 'ed25519', fingerprint: 'SHA256:test'}],
    })
    const root = new ManagerRoot({} as any)
    group.entries.set([entry])
    root.entries.set([group])
    seedRootSshKeys(root, [entry])
    root.showElement.set(group)
    window.passmanager = root as typeof window.passmanager

    const element = document.createElement('pm-entry-list-item') as PMEntryListItem
    element.entry = entry
    document.body.appendChild(element)
    await flush(element)

    const text = element.shadowRoot?.textContent ?? ''

    expect(text).toContain('2FA')
    expect(text).toContain('SSH')
    expect(text).not.toContain('OTP')
    expect(text).not.toContain('OK')
    expect(element.shadowRoot?.querySelector('.otp-indicator')).toBeNull()
    expect(element.shadowRoot?.querySelector('.ssh-indicator')).toBeNull()
    expect(element.shadowRoot?.querySelectorAll('.entry-badge')).toHaveLength(2)
    expect(element.shadowRoot?.querySelector('.entry-badge cv-icon')).not.toBeNull()
  })

  it('renders risk badges before attribute overflow', async () => {
    const group = createGroup('entry-item-risk-badges-group')
    const entry = createEntry(group, 'entry-item-risk-badges', {
      otps: [{id: 'otp-1', label: 'Main'}],
      sshKeys: [{id: 'ssh-1', type: 'ed25519', fingerprint: 'SHA256:test'}],
    })
    setAuditEntries([[entry, {weakPassword: true, reusedPassword: true, strengthScore: 1}]])
    const root = new ManagerRoot({} as any)
    group.entries.set([entry])
    root.entries.set([group])
    seedRootSshKeys(root, [entry])
    root.showElement.set(group)
    window.passmanager = root as typeof window.passmanager

    const element = document.createElement('pm-entry-list-item') as PMEntryListItem
    element.entry = entry
    document.body.appendChild(element)
    await flush(element)

    const text = element.shadowRoot?.textContent ?? ''
    const badges = [...(element.shadowRoot?.querySelectorAll('.entry-badge') ?? [])]

    expect(text).toContain('Weak')
    expect(text).toContain('Reused')
    expect(text).not.toContain('OK')
    expect(badges.map((badge) => badge.getAttribute('data-family'))).toEqual(['risk', 'risk', null])
    expect(element.shadowRoot?.querySelector('.entry-badge-overflow')?.textContent).toContain('+2')
  })

  it('renders payment card rows with a type glyph and card badge', async () => {
    const group = createGroup('entry-item-card-marker-group')
    const login = createEntry(group, 'entry-item-login-marker')
    const card = createPaymentCardEntry(group, 'entry-item-card-marker', {last4: '4242'})
    const root = new ManagerRoot({} as any)
    group.entries.set([login, card])
    root.entries.set([group])
    root.showElement.set(group)
    window.passmanager = root as typeof window.passmanager

    const loginElement = document.createElement('pm-entry-list-item') as PMEntryListItem
    loginElement.entry = login
    const cardElement = document.createElement('pm-entry-list-item') as PMEntryListItem
    cardElement.entry = card
    document.body.append(loginElement, cardElement)
    await flush(loginElement)
    await flush(cardElement)

    const loginRow = loginElement.shadowRoot?.querySelector('.list-item') as HTMLElement | null
    const cardRow = cardElement.shadowRoot?.querySelector('.list-item') as HTMLElement | null
    const cardBadge = cardElement.shadowRoot?.querySelector('.entry-badge[data-badge-id="card"]')

    expect(loginRow?.getAttribute('data-entry-type')).toBe('login')
    expect(loginElement.shadowRoot?.querySelector('.entry-type-glyph')).toBeNull()
    expect(loginElement.shadowRoot?.querySelector('.entry-badge[data-badge-id="card"]')).toBeNull()

    expect(cardRow?.getAttribute('data-entry-type')).toBe('payment_card')
    expect(
      cardElement.shadowRoot?.querySelector('.entry-type-glyph cv-icon[name="credit-card"]'),
    ).not.toBeNull()
    expect(cardBadge?.textContent).toContain('Card')
    expect(cardElement.shadowRoot?.textContent).toContain('•••• 4242')
  })

  it('renders workbench mode cells with kind and modified presentation data', async () => {
    const group = createGroup('entry-item-workbench-group')
    const entry = createEntry(group, 'entry-item-workbench', {username: 'alice@example.test'})
    const root = new ManagerRoot({} as any)
    group.entries.set([entry])
    root.entries.set([group])
    root.showElement.set(group)
    window.passmanager = root as typeof window.passmanager

    const element = document.createElement('pm-entry-list-item') as PMEntryListItem
    element.entry = entry
    element.viewMode = 'workbench'
    document.body.appendChild(element)
    await flush(element)

    const row = element.shadowRoot?.querySelector('.list-item') as HTMLElement | null
    const statusCell = element.shadowRoot?.querySelector('.workbench-status-cell')
    const modifiedCell = element.shadowRoot?.querySelector('.workbench-modified-cell')
    const actionsCell = element.shadowRoot?.querySelector('.workbench-actions-cell')

    expect(row?.getAttribute('data-view-mode')).toBe('workbench')
    expect(element.shadowRoot?.querySelector('.workbench-name-cell')?.textContent).toContain(
      'Entry entry-item-workbench',
    )
    expect(element.shadowRoot?.querySelector('.workbench-name-cell')?.textContent).toContain(
      'alice@example.test',
    )
    expect(statusCell?.textContent).toContain('Login')
    expect(modifiedCell?.textContent).toContain(entry.updatedFormatted)
    expect(actionsCell?.querySelector('.primary-action')).not.toBeNull()
  })

  it('renders desktop tag candidates with separate responsive overflow counts', async () => {
    const group = createGroup('entry-item-tag-overflow-group')
    const entry = createEntry(group, 'entry-item-tag-overflow', {
      tags: ['Operations', 'QA', 'Engineering', 'Security', 'Backup'],
    })
    const root = new ManagerRoot({} as any)
    root.setCredentialTagCatalog(['Operations', 'QA', 'Engineering', 'Security', 'Backup'], {
      operations: {colorId: 'green'},
      qa: {colorId: 'blue'},
      engineering: {colorId: 'pink'},
    })
    group.entries.set([entry])
    root.entries.set([group])
    root.showElement.set(group)
    window.passmanager = root as typeof window.passmanager

    const element = document.createElement('pm-entry-list-item') as PMEntryListItem
    element.entry = entry
    document.body.appendChild(element)
    await flush(element)

    const tagBadges = [...(element.shadowRoot?.querySelectorAll('.entry-tag-badge') ?? [])]
    const narrowOverflow = element.shadowRoot?.querySelector('.entry-tag-overflow[data-tag-limit="2"]')
    const wideOverflow = element.shadowRoot?.querySelector('.entry-tag-overflow[data-tag-limit="3"]')

    expect(tagBadges.map((badge) => badge.querySelector('.entry-badge-label')?.textContent)).toEqual([
      'Operations',
      'QA',
      'Engineering',
    ])
    expect(tagBadges.map((badge) => badge.getAttribute('data-tag-position'))).toEqual(['1', '2', '3'])
    expect(tagBadges.map((badge) => badge.getAttribute('data-tag-color-id'))).toEqual([
      'green',
      'blue',
      'pink',
    ])
    expect(narrowOverflow?.textContent?.trim()).toBe('+3')
    expect(narrowOverflow?.getAttribute('aria-label')).toBe('3 more tags')
    expect(narrowOverflow?.getAttribute('role')).toBe('img')
    expect(wideOverflow?.textContent?.trim()).toBe('+2')
    expect(wideOverflow?.getAttribute('aria-label')).toBe('2 more tags')
    expect(wideOverflow?.getAttribute('role')).toBe('img')
    expect(element.shadowRoot?.querySelector('.entry-badge-suffix')).toBeNull()
  })
})

describe('PMEntryListItemModel presentation', () => {
  it('keeps login subtitles unmasked and omits empty login subtitles', () => {
    const model = new PMEntryListItemModel()
    const group = createGroup('entry-item-model-group')
    const email = createEntry(group, 'entry-item-email', {username: 'user@example.com'})
    const username = createEntry(group, 'entry-item-user', {username: 'developer'})
    const empty = createEntry(group, 'entry-item-empty', {username: ''})

    expect(model.getSubtitle(email)).toBe('user@example.com')
    expect(model.getSubtitle(username)).toBe('developer')
    expect(model.getSubtitle(empty)).toBe('')
  })

  it('uses only masked last4 for payment card subtitles', () => {
    const model = new PMEntryListItemModel()
    const group = createGroup('entry-item-card-group')
    const card = createPaymentCardEntry(group, 'entry-item-card', {last4: '4242'})
    const cardWithoutLast4 = createPaymentCardEntry(group, 'entry-item-card-empty')

    expect(model.getSubtitle(card)).toBe('•••• 4242')
    expect(model.getSubtitle(cardWithoutLast4)).toBe('')
  })

  it('exposes payment card type marker through list presentation', () => {
    const model = new PMEntryListItemModel()
    const group = createGroup('entry-item-card-marker-model-group')
    const login = createEntry(group, 'entry-item-login-marker-model')
    const card = createPaymentCardEntry(group, 'entry-item-card-marker-model', {
      last4: '4242',
      tags: ['Finance'],
    })

    const loginPresentation = model.getPresentation(login)
    const cardPresentation = model.getPresentation(card)
    const mobileCardPresentation = model.getMobilePresentation(card)

    expect(loginPresentation.entryType).toBe('login')
    expect(loginPresentation.kindLabel).toBe('Login')
    expect(loginPresentation.modifiedFormatted).toBe(login.updatedFormatted)
    expect(loginPresentation.modifiedTimestamp).toBe(login.updatedTs)
    expect(loginPresentation.typeMarker).toBeNull()
    expect(cardPresentation.entryType).toBe('payment_card')
    expect(cardPresentation.kindLabel).toBe('Payment card')
    expect(cardPresentation.typeMarker).toMatchObject({
      id: 'card',
      icon: 'credit-card',
      label: 'Card',
    })
    expect(cardPresentation.visibleBadges.map((badge) => badge.id)).toContain('card')
    expect(mobileCardPresentation.typeMarker?.id).toBe('card')
    expect(mobileCardPresentation.statusBadges.map((badge) => badge.id)).not.toContain('card')
    expect(mobileCardPresentation.tagSnippet.mobile.badges.map((badge) => badge.id)).toEqual([
      'tag:finance',
    ])
    expect(mobileCardPresentation.tagSnippet.mobile.overflowCount).toBe(0)
  })

  it('produces metadata-backed badges with priority and overflow', () => {
    const model = new PMEntryListItemModel()
    const group = createGroup('entry-item-badge-model-group')
    const login = createEntry(group, 'entry-item-login-badges', {
      otps: [{id: 'otp-1', label: 'Main'}],
      sshKeys: [{id: 'ssh-1', type: 'ed25519', fingerprint: 'SHA256:test'}],
      tags: ['Work', 'Rotate', 'Hidden Overflow'],
    })
    const card = createPaymentCardEntry(group, 'entry-item-card-badge', {
      last4: '4242',
      otps: [{id: 'otp-legacy'}],
      sshKeys: [{id: 'ssh-legacy'}],
      tags: ['Finance'],
    })
    const noBadgeLogin = createEntry(group, 'entry-item-no-badges')
    const root = new ManagerRoot({} as any)
    seedRootSshKeys(root, [login, card, noBadgeLogin])

    expect(model.getEntryBadges(login).map((badge) => badge.id)).toEqual(['two_factor', 'ssh'])
    expect(model.getEntryBadges(card).map((badge) => badge.id)).toEqual(['card'])
    expect(model.getEntryBadges(noBadgeLogin)).toEqual([])

    const syntheticBadges: PMEntryListBadge[] = [
      {id: 'meta', family: 'meta', severity: 'neutral', label: 'Meta', icon: 'info-circle', priority: 40},
      {id: 'otp', family: 'attribute', severity: 'neutral', label: 'OTP', icon: 'shield-check', priority: 30},
      {id: 'ssh', family: 'attribute', severity: 'neutral', label: 'SSH', icon: 'key', priority: 32},
    ]

    expect(model.getVisibleBadges(syntheticBadges)).toEqual({
      visibleBadges: [syntheticBadges[1], syntheticBadges[2]],
      overflowCount: 1,
    })

    expect(model.getVisibleBadges(model.getEntryBadges(login))).toMatchObject({
      overflowCount: 0,
    })
  })

  it('preserves tag order and calculates platform overflow counts', () => {
    const model = new PMEntryListItemModel()
    const group = createGroup('entry-item-tag-snippet-model-group')
    const cases = [
      {tags: [], mobileOverflow: 0, narrowOverflow: 0, wideOverflow: 0},
      {tags: ['Operations'], mobileOverflow: 0, narrowOverflow: 0, wideOverflow: 0},
      {tags: ['Operations', 'QA'], mobileOverflow: 1, narrowOverflow: 0, wideOverflow: 0},
      {
        tags: ['Operations', 'QA', 'Engineering'],
        mobileOverflow: 2,
        narrowOverflow: 1,
        wideOverflow: 0,
      },
      {
        tags: ['Operations', 'QA', 'Engineering', 'Security', 'Backup'],
        mobileOverflow: 4,
        narrowOverflow: 3,
        wideOverflow: 2,
      },
    ]

    for (const [index, testCase] of cases.entries()) {
      const entry = createEntry(group, `entry-item-tag-snippet-${index}`, {tags: testCase.tags})
      const tagSnippet = model.getPresentation(entry).tagSnippet

      expect(tagSnippet.mobile.badges.map((badge) => badge.label)).toEqual(testCase.tags.slice(0, 1))
      expect(tagSnippet.desktop.badges.map((badge) => badge.label)).toEqual(testCase.tags.slice(0, 3))
      expect(tagSnippet.mobile.overflowCount).toBe(testCase.mobileOverflow)
      expect(tagSnippet.desktop.narrowOverflowCount).toBe(testCase.narrowOverflow)
      expect(tagSnippet.desktop.wideOverflowCount).toBe(testCase.wideOverflow)
    }
  })

  it('resolves mobile tag badge colors from catalog metadata', () => {
    const originalPassmanager = window.passmanager
    const model = new PMEntryListItemModel()
    const group = createGroup('entry-item-tag-color-model-group')
    const login = createEntry(group, 'entry-item-tag-colors', {
      tags: ['Work', 'Banking'],
    })
    const root = new ManagerRoot({} as any)
    root.setCredentialTagCatalog(['Work', 'Banking'], {
      work: {colorId: 'green'},
      banking: {colorId: 'pink'},
    })
    group.entries.set([login])
    root.entries.set([group])

    try {
      window.passmanager = root as typeof window.passmanager

      const initialTagSnippet = model.getPresentation(login).tagSnippet
      expect(initialTagSnippet.mobile.badges.map((badge) => badge.tagColorId)).toEqual(['green'])
      expect(initialTagSnippet.desktop.badges.map((badge) => badge.tagColorId)).toEqual([
        'green',
        'pink',
      ])

      root.setCredentialTagCatalog(['Work', 'Banking'], {
        work: {colorId: 'orange'},
        banking: {colorId: 'cyan'},
      })

      const updatedTagSnippet = model.getPresentation(login).tagSnippet
      expect(updatedTagSnippet.mobile.badges.map((badge) => badge.tagColorId)).toEqual(['orange'])
      expect(updatedTagSnippet.desktop.badges.map((badge) => badge.tagColorId)).toEqual([
        'orange',
        'cyan',
      ])
    } finally {
      window.passmanager = originalPassmanager
    }
  })

  it('adds weak and reused password risk badges from safe audit state', () => {
    const model = new PMEntryListItemModel()
    const group = createGroup('entry-item-risk-badge-model-group')
    const login = createEntry(group, 'entry-item-login-risk-badges', {
      otps: [{id: 'otp-1', label: 'Main'}],
      sshKeys: [{id: 'ssh-1', type: 'ed25519', fingerprint: 'SHA256:test'}],
    })
    const noBadgeLogin = createEntry(group, 'entry-item-no-risk-badges')
    const root = new ManagerRoot({} as any)
    seedRootSshKeys(root, [login, noBadgeLogin])
    setAuditEntries([[login, {weakPassword: true, reusedPassword: true, strengthScore: 1}]])

    expect(model.getEntryBadges(login).map((badge) => badge.id)).toEqual([
      'weak_password',
      'reused_password',
      'two_factor',
      'ssh',
    ])
    expect(model.getVisibleBadges(model.getEntryBadges(login))).toMatchObject({
      overflowCount: 2,
    })
    expect(model.getEntryBadges(noBadgeLogin)).toEqual([])
  })
})
