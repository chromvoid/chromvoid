import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Entry, Group, ManagerRoot} from '@project/passmanager'
import type {CredentialAuditEntrySummary} from '@project/passmanager/security-audit'
import {pmSelectionModeModel} from '../../src/features/passmanager/models/pm-selection-mode.model'
import {PMEntryListItemMobile} from '../../src/features/passmanager/components/card/entry-list-item/entry-list-item-mobile'
import {pmModel} from '../../src/features/passmanager/password-manager.model'
import {pmCredentialSecurityAuditModel} from '../../src/features/passmanager/models/pm-credential-security-audit.model'

function createEntry(
  id: string,
  options: {
    otps?: unknown[]
    sshKeys?: unknown[]
    tags?: string[]
  } = {},
) {
  const group = new Group({
    id: `group-${id}`,
    name: `Group ${id}`,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)

  return new Entry(
    group,
    {
      id,
      title: `Entry ${id}`,
      username: `${id}@example.com`,
      urls: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
      otps: options.otps ?? [],
      sshKeys: options.sshKeys ?? [],
      tags: options.tags ?? [],
    } as any,
  )
}

function createPassmanagerRoot(entry: Entry): typeof window.passmanager {
  const group = entry.parent as Group
  const root = new ManagerRoot({} as any)
  group.entries.set([entry])
  root.entries.set([group])
  root.showElement.set(group)
  ;(root as ManagerRoot & {isReadOnly: () => boolean}).isReadOnly = () => false
  return root as typeof window.passmanager
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

async function flush(element: PMEntryListItemMobile) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

function getEntryMobileStylesText(): string {
  const styles = PMEntryListItemMobile.styles as unknown[]
  return styles
    .map((style) => (typeof style === 'object' && style && 'cssText' in style ? String(style.cssText) : String(style)))
    .join('\n')
}

describe('PMEntryListItemMobile selection mode', () => {
  let originalPassmanager: typeof window.passmanager

  beforeEach(() => {
    if (!customElements.get('pm-entry-list-item-mobile')) {
      PMEntryListItemMobile.define()
    }

    pmSelectionModeModel.exit()
    originalPassmanager = window.passmanager
  })

  afterEach(() => {
    document.body.innerHTML = ''
    pmSelectionModeModel.exit()
    pmCredentialSecurityAuditModel.dispose()
    window.passmanager = originalPassmanager
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('long tap enters selection mode and selects the pressed entry', async () => {
    vi.useFakeTimers()

    const entry = createEntry('mobile-selection-open')
    window.passmanager = createPassmanagerRoot(entry)

    const element = document.createElement('pm-entry-list-item-mobile') as PMEntryListItemMobile
    element.entry = entry
    document.body.append(element)
    await flush(element)

    const handleTouchStart = (element as PMEntryListItemMobile & {
      handleTouchStart: (event: TouchEvent) => void
    }).handleTouchStart

    const preventDefault = vi.fn()
    handleTouchStart.call(element, {
      touches: [{clientX: 12, clientY: 18}],
      preventDefault,
    } as unknown as TouchEvent)

    vi.advanceTimersByTime(500)
    ;(element as PMEntryListItemMobile & {handleTouchEnd: () => void}).handleTouchEnd()
    await flush(element)

    expect(pmSelectionModeModel.active()).toBe(true)
    expect(pmSelectionModeModel.isEntrySelected(entry.id)).toBe(true)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(element.shadowRoot?.querySelector('.list-item')?.classList.contains('selected')).toBe(true)
  })

  it('keeps normal tap opening the entry outside selection mode', async () => {
    const entry = createEntry('mobile-selection-open-entry')
    window.passmanager = createPassmanagerRoot(entry)

    const openItemSpy = vi.spyOn(pmModel, 'openItem').mockImplementation(() => {})
    const element = document.createElement('pm-entry-list-item-mobile') as PMEntryListItemMobile
    element.entry = entry
    document.body.append(element)
    await flush(element)

    element.shadowRoot?.querySelector('.list-item')?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))

    expect(openItemSpy).toHaveBeenCalledTimes(1)
    expect(openItemSpy).toHaveBeenCalledWith(entry)
  })

  it('toggles selection on tap during selection mode without opening the entry', async () => {
    const entry = createEntry('mobile-selection-toggle')
    window.passmanager = createPassmanagerRoot(entry)

    const openItemSpy = vi.spyOn(pmModel, 'openItem').mockImplementation(() => {})
    const element = document.createElement('pm-entry-list-item-mobile') as PMEntryListItemMobile
    element.entry = entry
    document.body.append(element)
    await flush(element)

    pmSelectionModeModel.enterWithEntry(entry.id)
    pmSelectionModeModel.consumePostLongPressClick('entry', entry.id)
    await flush(element)

    element.shadowRoot?.querySelector('.list-item')?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await flush(element)

    expect(pmSelectionModeModel.active()).toBe(true)
    expect(pmSelectionModeModel.isEntrySelected(entry.id)).toBe(false)
    expect(openItemSpy).not.toHaveBeenCalled()
  })

  it('opens the entry on the first tap after leaving selection mode', async () => {
    vi.useFakeTimers()

    const entry = createEntry('mobile-selection-exit-open')
    window.passmanager = createPassmanagerRoot(entry)

    const openItemSpy = vi.spyOn(pmModel, 'openItem').mockImplementation(() => {})
    const element = document.createElement('pm-entry-list-item-mobile') as PMEntryListItemMobile
    element.entry = entry
    document.body.append(element)
    await flush(element)

    const handleTouchStart = (element as PMEntryListItemMobile & {
      handleTouchStart: (event: TouchEvent) => void
    }).handleTouchStart

    handleTouchStart.call(element, {
      touches: [{clientX: 12, clientY: 18}],
      preventDefault() {},
    } as unknown as TouchEvent)

    vi.advanceTimersByTime(500)
    ;(element as PMEntryListItemMobile & {handleTouchEnd: () => void}).handleTouchEnd()
    await flush(element)

    pmSelectionModeModel.exit()
    await flush(element)

    element.shadowRoot?.querySelector('.list-item')?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))

    expect(openItemSpy).toHaveBeenCalledTimes(1)
    expect(openItemSpy).toHaveBeenCalledWith(entry)
  })

  it('uses contextmenu as a fallback to enter selection mode on mobile', async () => {
    const entry = createEntry('mobile-selection-contextmenu')
    window.passmanager = createPassmanagerRoot(entry)

    const element = document.createElement('pm-entry-list-item-mobile') as PMEntryListItemMobile
    element.entry = entry
    document.body.append(element)
    await flush(element)

    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()

    ;(element as PMEntryListItemMobile & {handleContextMenu: (event: Event) => void}).handleContextMenu({
      preventDefault,
      stopPropagation,
    } as unknown as Event)
    await flush(element)

    expect(pmSelectionModeModel.active()).toBe(true)
    expect(pmSelectionModeModel.isEntrySelected(entry.id)).toBe(true)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(stopPropagation).toHaveBeenCalledTimes(1)
  })

  it('does not render a mobile drag handle on entry rows', async () => {
    const entry = createEntry('mobile-no-dnd-handle')
    window.passmanager = createPassmanagerRoot(entry)

    const element = document.createElement('pm-entry-list-item-mobile') as PMEntryListItemMobile
    element.entry = entry
    document.body.append(element)
    await flush(element)

    expect(element.shadowRoot?.querySelector('.mobile-dnd-handle')).toBeNull()
  })

  it('renders mobile tags as text badges and statuses as dots', async () => {
    const entry = createEntry('mobile-selection-badges', {
      otps: [{id: 'otp-1', label: 'Main'}],
      sshKeys: [{id: 'ssh-1', type: 'ed25519', fingerprint: 'SHA256:test'}],
      tags: ['work', 'banking'],
    })
    window.passmanager = createPassmanagerRoot(entry)

    const element = document.createElement('pm-entry-list-item-mobile') as PMEntryListItemMobile
    element.entry = entry
    document.body.append(element)
    await flush(element)

    const text = element.shadowRoot?.textContent ?? ''
    const statusDots = [...(element.shadowRoot?.querySelectorAll('.entry-status-dot') ?? [])]
    const tagBadges = [...(element.shadowRoot?.querySelectorAll('.entry-badge') ?? [])]

    expect(text).not.toContain('2FA')
    expect(text).not.toContain('SSH')
    expect(text).toContain('work')
    expect(text).toContain('banking')
    expect(text).not.toContain('OTP')
    expect(text).not.toContain('OK')
    expect(element.shadowRoot?.querySelector('.otp-indicator')).toBeNull()
    expect(element.shadowRoot?.querySelector('.ssh-indicator')).toBeNull()
    expect(statusDots.map((dot) => dot.getAttribute('data-badge-id'))).toEqual(['two_factor', 'ssh'])
    expect(statusDots.every((dot) => dot.getAttribute('role') === 'img')).toBe(true)
    expect(statusDots.every((dot) => dot.getAttribute('aria-label'))).toBe(true)
    expect(tagBadges).toHaveLength(2)
    expect(tagBadges.map((badge) => badge.getAttribute('data-family'))).toEqual(['meta', 'meta'])
    expect(element.shadowRoot?.querySelector('.entry-badge cv-icon')).toBeNull()
    expect(element.shadowRoot?.querySelector('.entry-menu-button')?.getAttribute('aria-label')).toBe('More actions')
  })

  it('renders mobile risk badges and keeps selection interactions intact', async () => {
    const entry = createEntry('mobile-selection-risk-badges', {
      otps: [{id: 'otp-1', label: 'Main'}],
      sshKeys: [{id: 'ssh-1', type: 'ed25519', fingerprint: 'SHA256:test'}],
    })
    setAuditEntries([[entry, {weakPassword: true, reusedPassword: true, strengthScore: 1}]])
    window.passmanager = createPassmanagerRoot(entry)

    const element = document.createElement('pm-entry-list-item-mobile') as PMEntryListItemMobile
    element.entry = entry
    document.body.append(element)
    await flush(element)

    const text = element.shadowRoot?.textContent ?? ''
    const statusDots = [...(element.shadowRoot?.querySelectorAll('.entry-status-dot') ?? [])]

    expect(text).not.toContain('Weak')
    expect(text).not.toContain('Reused')
    expect(text).not.toContain('2FA')
    expect(text).not.toContain('SSH')
    expect(text).not.toContain('+2')
    expect(statusDots.map((dot) => dot.getAttribute('data-badge-id'))).toEqual([
      'weak_password',
      'reused_password',
      'two_factor',
      'ssh',
    ])

    pmSelectionModeModel.enterWithEntry(entry.id)
    await flush(element)

    expect(element.shadowRoot?.querySelector('.list-item')?.classList.contains('selected')).toBe(true)
  })

  it('binds left swipe to right-side delete actions through model classes and host css variables', async () => {
    const entry = createEntry('mobile-swipe-visual')
    window.passmanager = createPassmanagerRoot(entry)

    const element = document.createElement('pm-entry-list-item-mobile') as PMEntryListItemMobile
    element.entry = entry
    document.body.append(element)
    await flush(element)

    ;(element as PMEntryListItemMobile & {handleTouchStart: (event: TouchEvent) => void}).handleTouchStart({
      touches: [{clientX: 80, clientY: 0}],
    } as unknown as TouchEvent)

    const preventDefault = vi.fn()
    ;(element as PMEntryListItemMobile & {handleTouchMove: (event: TouchEvent) => void}).handleTouchMove({
      touches: [{clientX: 0, clientY: 0}],
      preventDefault,
    } as unknown as TouchEvent)
    await flush(element)

    const container = element.shadowRoot?.querySelector('.swipe-container')
    const listItem = element.shadowRoot?.querySelector('.list-item') as HTMLElement | null

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(element.style.getPropertyValue('--pm-entry-swipe-offset-x')).toBe('-64px')
    expect(container?.classList.contains('swipe-active')).toBe(true)
    expect(container?.classList.contains('swipe-left')).toBe(true)
    expect(element.shadowRoot?.querySelector('.swipe-actions-right cv-icon[name="trash"]')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('.swipe-actions-left cv-icon[name="person-circle"]')).not.toBeNull()
    expect(listItem?.classList.contains('swiping')).toBe(true)
    expect(listItem?.hasAttribute('style')).toBe(false)

    ;(element as PMEntryListItemMobile & {handleTouchEnd: () => void}).handleTouchEnd()
    await flush(element)

    expect(element.shadowRoot?.querySelector('.list-item')?.getAttribute('data-swipe-state')).toBe('open-left')
    expect(element.shadowRoot?.querySelector('.list-item')?.classList.contains('snap-back')).toBe(true)
  })

  it('emits entry-delete from the right-side swipe delete action', async () => {
    const entry = createEntry('mobile-swipe-delete-event')
    window.passmanager = createPassmanagerRoot(entry)

    const element = document.createElement('pm-entry-list-item-mobile') as PMEntryListItemMobile
    element.entry = entry
    const deleteSpy = vi.fn()
    element.addEventListener('entry-delete', deleteSpy as EventListener)
    document.body.append(element)
    await flush(element)

    element.shadowRoot
      ?.querySelector('.swipe-actions-right .swipe-action')
      ?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))

    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect((deleteSpy.mock.calls[0]?.[0] as CustomEvent<Entry>).detail).toBe(entry)
  })

  it('omits the mobile drag handle column so entry text has more room', () => {
    const styleText = getEntryMobileStylesText()

    expect(styleText).toContain('grid-template-columns: auto minmax(0, 1fr) minmax(0, auto) auto;')
    expect(styleText).not.toContain('.mobile-dnd-handle')
    expect(styleText).toContain('--pm-mobile-list-row-gap: 6px;')
  })
})
