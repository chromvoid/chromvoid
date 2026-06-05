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
    expect(cardElement.shadowRoot?.querySelector('.entry-type-glyph cv-icon[name="credit-card"]')).not.toBeNull()
    expect(cardBadge?.textContent).toContain('Card')
    expect(cardElement.shadowRoot?.textContent).toContain('•••• 4242')
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
      tags: ['Finance', 'Travel'],
    })

    const loginPresentation = model.getPresentation(login)
    const cardPresentation = model.getPresentation(card)
    const mobileCardPresentation = model.getMobilePresentation(card)

    expect(loginPresentation.entryType).toBe('login')
    expect(loginPresentation.typeMarker).toBeNull()
    expect(cardPresentation.entryType).toBe('payment_card')
    expect(cardPresentation.typeMarker).toMatchObject({
      id: 'card',
      icon: 'credit-card',
      label: 'Card',
    })
    expect(cardPresentation.visibleBadges.map((badge) => badge.id)).toContain('card')
    expect(mobileCardPresentation.typeMarker?.id).toBe('card')
    expect(mobileCardPresentation.statusBadges.map((badge) => badge.id)).not.toContain('card')
    expect(mobileCardPresentation.visibleTextBadges.map((badge) => badge.id)).toEqual(['tag:finance'])
    expect(mobileCardPresentation.textOverflowCount).toBe(1)
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

    expect(model.getEntryBadges(login).map((badge) => badge.id)).toEqual([
      'two_factor',
      'ssh',
      'tag:work',
      'tag:rotate',
    ])
    expect(model.getEntryBadges(card).map((badge) => badge.id)).toEqual(['card', 'tag:finance'])
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
      overflowCount: 2,
    })
  })

  it('adds weak and reused password risk badges from safe audit state', () => {
    const model = new PMEntryListItemModel()
    const group = createGroup('entry-item-risk-badge-model-group')
    const login = createEntry(group, 'entry-item-login-risk-badges', {
      otps: [{id: 'otp-1', label: 'Main'}],
      sshKeys: [{id: 'ssh-1', type: 'ed25519', fingerprint: 'SHA256:test'}],
    })
    const noBadgeLogin = createEntry(group, 'entry-item-no-risk-badges')
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
