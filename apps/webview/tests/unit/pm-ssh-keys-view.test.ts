import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Entry, ManagerRoot} from '@project/passmanager'
import type {ManagerSaver, PassManagerSshKey} from '@project/passmanager/types'
import {dialogService} from '../../src/shared/services/dialog-service'
import {PMSshKeysView} from '../../src/features/passmanager/components/ssh-keys-view/ssh-keys-view'
import {PMSshKeysViewMobile} from '../../src/features/passmanager/components/ssh-keys-view/ssh-keys-view-mobile'
import {pmSshKeysViewModel} from '../../src/features/passmanager/components/ssh-keys-view/ssh-keys-view.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

function createFixture() {
  const keys: PassManagerSshKey[] = [
    {
      id: 'key-1',
      type: 'ed25519',
      fingerprint: 'SHA256:first',
      name: 'Production deploy',
      sourceEntryId: 'entry-1',
      updatedTs: 2,
    },
    {id: 'key-2', type: 'rsa', fingerprint: 'SHA256:second', name: 'Legacy host', updatedTs: 1},
  ]
  const saver = {
    listSshKeys: vi.fn(async () => [...keys]),
    updateSshKey: vi.fn(async () => true),
    removeSshKey: vi.fn(async (keyId: string) => {
      const index = keys.findIndex((key) => key.id === keyId)
      if (index >= 0) keys.splice(index, 1)
      return true
    }),
    readSshPublicKey: vi.fn(async (keyId: string) => `ssh-ed25519 PUBLIC-${keyId}`),
    generateSshKey: vi.fn(async () => ({
      keyId: 'key-3',
      keyType: 'ed25519' as const,
      fingerprint: 'SHA256:third',
      publicKeyOpenssh: 'ssh-ed25519 PUBLIC-key-3',
    })),
  } satisfies Partial<ManagerSaver>
  const root = new ManagerRoot(saver as ManagerSaver)
  const entry = new Entry(root, {
    id: 'entry-1',
    title: 'Production',
    username: 'deploy',
    urls: [],
    otps: [],
    sshKeys: [],
    createdTs: 1,
    updatedTs: 1,
  })
  root.entries.set([entry])
  root.sshKeys.set(keys)
  setPassmanagerRoot(root)
  return {root, saver, keys}
}

describe('PMSshKeysView', () => {
  beforeEach(() => {
    PMSshKeysView.define()
    PMSshKeysViewMobile.define()
    pmSshKeysViewModel.clearFilters()
    pmSshKeysViewModel.closeCreate()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    setPassmanagerRoot(undefined)
    vi.restoreAllMocks()
  })

  it('renders shared search chips and summary rail, then filters root keys reactively', async () => {
    createFixture()
    const view = document.createElement('pm-ssh-keys-view') as PMSshKeysView
    document.body.append(view)
    await view.updateComplete

    const controls = view.shadowRoot?.querySelector('workspace-dashboard-header')
    await controls?.updateComplete
    const controlsRoot = controls?.shadowRoot
    const search = controlsRoot?.querySelector('cv-input.workspace-search')
    const chipGroup = controlsRoot?.querySelector('cv-chip-group.workspace-filter-chips')
    const chips = Array.from(controlsRoot?.querySelectorAll('cv-chip.workspace-filter-chip') ?? [])
    const summaryRail = view.shadowRoot?.querySelector('pm-summary-rail')
    await summaryRail?.updateComplete

    expect(view.shadowRoot?.querySelector('h1')?.textContent).toContain('SSH')
    expect(view.shadowRoot?.querySelectorAll('[role="listitem"]')).toHaveLength(2)
    expect(view.shadowRoot?.querySelector('pm-entry-ssh-key')?.getAttribute('layout')).toBe('inventory')
    expect(view.shadowRoot?.textContent).toContain('Production')
    expect(search).not.toBeNull()
    expect(view.shadowRoot?.querySelector('cv-select')).toBeNull()
    expect(chipGroup?.getAttribute('selection-mode')).toBe('single')
    expect(chips.map((chip) => chip.getAttribute('value'))).toEqual(['all', 'ed25519', 'rsa', 'ecdsa'])
    expect(summaryRail?.previousElementSibling?.classList.contains('ssh-view__workspace')).toBe(true)
    expect(
      Array.from(summaryRail?.shadowRoot?.querySelectorAll('[data-summary-id]') ?? []).map((item) =>
        item.getAttribute('data-summary-id'),
      ),
    ).toEqual(['total', 'visible', 'ed25519', 'other'])

    search?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'legacy'},
        bubbles: true,
        composed: true,
      }),
    )
    await Promise.resolve()
    await view.updateComplete
    expect(view.shadowRoot?.querySelectorAll('[role="listitem"]')).toHaveLength(1)
    expect(view.shadowRoot?.querySelector('[data-key-id="key-2"]')).not.toBeNull()

    pmSshKeysViewModel.setQuery('')
    chipGroup?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'ed25519', changedValue: 'ed25519', selected: true},
        bubbles: true,
        composed: true,
      }),
    )
    await Promise.resolve()
    await view.updateComplete
    expect(view.shadowRoot?.querySelectorAll('[role="listitem"]')).toHaveLength(1)
    expect(view.shadowRoot?.querySelector('[data-key-id="key-1"]')).not.toBeNull()
  })

  it('generates, reads, and deletes keys only through root model methods', async () => {
    const {root, saver, keys} = createFixture()
    pmSshKeysViewModel.openCreate()
    pmSshKeysViewModel.createForm.setName('New deploy key')
    pmSshKeysViewModel.createForm.setComment('deploy@example.test')

    keys.push({id: 'key-3', type: 'ed25519', fingerprint: 'SHA256:third', name: 'New deploy key'})
    await expect(pmSshKeysViewModel.generate()).resolves.toBe(true)
    expect(saver.generateSshKey).toHaveBeenCalledWith({
      keyType: 'ed25519',
      name: 'New deploy key',
      comment: 'deploy@example.test',
    })
    expect(root.sshKeys().map((key) => key.id)).toContain('key-3')

    await expect(pmSshKeysViewModel.readPublicKey('key-3')).resolves.toBe('ssh-ed25519 PUBLIC-key-3')
    expect(saver.readSshPublicKey).toHaveBeenCalledWith('key-3')

    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    await expect(pmSshKeysViewModel.remove('key-3')).resolves.toBe(true)
    expect(saver.removeSshKey).toHaveBeenCalledWith('key-3')
    expect(root.sshKeys().map((key) => key.id)).not.toContain('key-3')
  })

  it('keeps key creation actions out of the page content and empty state', async () => {
    const {root} = createFixture()
    root.sshKeys.set([])
    const view = document.createElement('pm-ssh-keys-view') as PMSshKeysView
    document.body.append(view)
    await view.updateComplete

    expect(view.shadowRoot?.querySelector('.ssh-view__add')).toBeNull()
    expect(view.shadowRoot?.querySelector('cv-empty-state [slot="actions"]')).toBeNull()
    expect(pmSshKeysViewModel.createOpen()).toBe(false)
  })

  it('uses the shared create model through a dismissible bottom sheet on mobile', async () => {
    createFixture()
    const view = document.createElement('pm-ssh-keys-view-mobile') as PMSshKeysViewMobile
    document.body.append(view)
    pmSshKeysViewModel.openCreate()
    await Promise.resolve()
    await view.updateComplete

    const surfaceLayout = view.shadowRoot?.querySelector('mobile-surface-layout')
    const controls = view.shadowRoot?.querySelector('workspace-dashboard-header[slot="header"]')
    const summaryRail = view.shadowRoot?.querySelector('pm-summary-rail[slot="footer"]')
    const sheet = view.shadowRoot?.querySelector('cv-bottom-sheet')
    expect(surfaceLayout?.getAttribute('scroll')).toBe('owned')
    expect(controls).not.toBeNull()
    expect(summaryRail).not.toBeNull()
    expect(sheet?.open).toBe(true)
    expect(view.shadowRoot?.querySelector('.ssh-view__create')).toBeNull()
    expect(view.shadowRoot?.querySelector('pm-entry-ssh-create')?.getAttribute('layout')).toBe('sheet')

    sheet?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {open: false},
        bubbles: true,
        composed: true,
      }),
    )
    await Promise.resolve()
    expect(pmSshKeysViewModel.createOpen()).toBe(false)
  })
})
