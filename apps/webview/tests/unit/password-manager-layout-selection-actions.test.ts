import {atom} from '@reatom/core'
import {Entry, Group, ManagerRoot} from '@project/passmanager/core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {PMGroupModel} from '../../src/features/passmanager/components/group/group/group.model'
import {PasswordManagerLayoutModel} from '../../src/features/passmanager/components/password-manager-layout/password-manager-layout.model'
import {pmMobileChromeModel} from '../../src/features/passmanager/models/pm-mobile-chrome.model'
import {pmMobileSelectionModel} from '../../src/features/passmanager/models/pm-mobile-selection.model'
import {pmDeleteMotionModel} from '../../src/features/passmanager/models/pm-delete-motion.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {pmSelectionModeModel} from '../../src/features/passmanager/models/pm-selection-mode.model'
import {dialogService} from '../../src/shared/services/dialog-service'
import {pmModel} from '../../src/features/passmanager/password-manager.model'
import {toast} from '../../src/shared/services/toast-manager'
import type {ManagerSaver} from '@project/passmanager/core/service/types'

type PassmanagerMock = {
  id: string
  showElement: ReturnType<typeof atom<any>>
  isLoading: ReturnType<typeof atom<boolean>>
  isReadOnly: ReturnType<typeof atom<boolean>>
  isEditMode: ReturnType<typeof atom<boolean>>
  entriesList: () => Array<Entry | Group>
  getCardByID: (id: string) => Entry | Group | undefined
  getEntry: (id: string) => Entry | undefined
  getGroup: (id: string) => Group | undefined
}

let previousPassmanager: typeof window.passmanager
let previousPassmanagerDescriptor: PropertyDescriptor | undefined
let currentPassmanager: typeof window.passmanager

function createGroup(id: string, name = 'Group A') {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(group: Group, id: string, title = 'Entry A') {
  return new Entry(
    group as any,
    {
      id,
      title,
      username: '',
      urls: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
      otps: [],
    } as any,
  )
}

function createPassmanager(showElement: unknown, items: Array<Entry | Group> = []): PassmanagerMock {
  return {
    id: 'selection-passmanager-root',
    showElement: atom(showElement),
    isLoading: atom(false),
    isReadOnly: atom(false),
    isEditMode: atom(false),
    entriesList: () => items,
    getCardByID: (id: string) => items.find((item) => item.id === id),
    getEntry: (id: string) => items.find((item): item is Entry => item instanceof Entry && item.id === id),
    getGroup: (id: string) => items.find((item): item is Group => item instanceof Group && item.id === id),
  }
}

function createMockSaver(overrides: Partial<ManagerSaver> = {}): ManagerSaver {
  return {
    save: vi.fn(async () => true),
    read: vi.fn(async () => undefined),
    remove: vi.fn(async () => true),
    getOTP: vi.fn(async () => undefined),
    getOTPSeckey: vi.fn(async () => undefined),
    removeOTP: vi.fn(async () => true),
    saveOTP: vi.fn(async () => true),
    readEntryPassword: vi.fn(async () => undefined),
    readEntryNote: vi.fn(async () => undefined),
    saveEntryPassword: vi.fn(async () => true),
    saveEntryNote: vi.fn(async () => true),
    removeEntryPassword: vi.fn(async () => true),
    removeEntryNote: vi.fn(async () => true),
    readEntrySshPrivateKey: vi.fn(async () => undefined),
    readEntrySshPublicKey: vi.fn(async () => undefined),
    saveEntrySshPrivateKey: vi.fn(async () => true),
    saveEntrySshPublicKey: vi.fn(async () => true),
    removeEntrySshPrivateKey: vi.fn(async () => true),
    removeEntrySshPublicKey: vi.fn(async () => true),
    saveEntryMeta: vi.fn(async () => true),
    moveEntryToGroup: vi.fn(async () => true),
    removeEntry: vi.fn(async () => true),
    ...overrides,
  }
}

describe('PasswordManagerLayoutModel selection actions', () => {
  beforeEach(() => {
    previousPassmanager = window.passmanager
    previousPassmanagerDescriptor = Object.getOwnPropertyDescriptor(window, 'passmanager')
    currentPassmanager = previousPassmanager
    Object.defineProperty(window, 'passmanager', {
      configurable: true,
      get() {
        return currentPassmanager
      },
      set(value) {
        currentPassmanager = value
        setPassmanagerRoot(value as any)
      },
    })
    setPassmanagerRoot(previousPassmanager as any)
  })

  afterEach(() => {
    currentPassmanager = previousPassmanager
    setPassmanagerRoot(previousPassmanager as any)
    if (previousPassmanagerDescriptor) {
      Object.defineProperty(window, 'passmanager', previousPassmanagerDescriptor)
    } else {
      delete (window as {passmanager?: typeof window.passmanager}).passmanager
    }
    pmSelectionModeModel.exit()
    pmDeleteMotionModel.reset()
    new PMGroupModel().exitEditMode()
    vi.restoreAllMocks()
  })

  it('exposes and dispatches the desktop OTP quick view action', () => {
    const root = new ManagerRoot(createMockSaver())
    root.entries.set([])
    root.showElement.set(root)
    ;(window as any).passmanager = root

    const model = new PasswordManagerLayoutModel()
    const openSpy = vi.spyOn(pmModel, 'openOtpView').mockImplementation(() => {})
    const actions = model.getDesktopToolbarSections().flatMap((section) => section.actions)

    expect(actions.find((action) => action.id === 'pm-otp-view')).toMatchObject({
      icon: 'shield-check',
      disabled: false,
    })
    expect(model.isDesktopToolbarAction('pm-otp-view')).toBe(true)

    model.executeDesktopToolbarAction('pm-otp-view')

    expect(openSpy).toHaveBeenCalledTimes(1)
  })

  it('does not expose or dispatch the mobile passwords-list OTP quick view action', () => {
    const root = new ManagerRoot(createMockSaver())
    root.entries.set([])
    root.showElement.set(root)
    ;(window as any).passmanager = root

    const openSpy = vi.spyOn(pmModel, 'openOtpView').mockImplementation(() => {})

    expect(pmMobileChromeModel.getToolbarActions().map((action) => action.id)).not.toContain('pm-otp-view')
    expect(pmMobileChromeModel.executeCommand('pm-otp-view')).toBe(false)
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('reports passwords-selection context and exits selection mode on mobile back', () => {
    const group = createGroup('selection-back-group')
    ;(window as any).passmanager = createPassmanager(group, [group])
    pmSelectionModeModel.enterWithGroup(group.id)

    expect(pmMobileChromeModel.getCommandContext().kind).toBe('passwords-selection')
    expect((window as any).passmanager.showElement()).toBe(group)

    const handled = pmMobileChromeModel.handleBack()

    expect(handled).toBe(true)
    expect(pmSelectionModeModel.active()).toBe(false)
    expect(pmMobileSelectionModel.selectedEntryIds()).toEqual([])
    expect(pmMobileSelectionModel.selectedGroupIds()).toEqual([])
    expect((window as any).passmanager.showElement()).toBe(group)
  })

  it('does not dispatch removed mobile selection edit and move commands', () => {
    const group = createGroup('selection-entry-edit-group')
    const entry = createEntry(group, 'selection-entry-edit')
    ;(window as any).passmanager = createPassmanager(group, [group, entry])
    pmSelectionModeModel.enterWithEntry(entry.id)

    const openItemSpy = vi.spyOn(pmModel, 'openItem').mockImplementation(() => {})
    expect(pmMobileChromeModel.executeCommand('pm-selection-edit')).toBe(false)
    expect(pmMobileChromeModel.executeCommand('pm-selection-move')).toBe(false)
    expect(openItemSpy).not.toHaveBeenCalled()
    expect(pmSelectionModeModel.active()).toBe(true)
  })

  it('deletes mixed multi-selection and clears selection after bulk delete', async () => {
    const parent = createGroup('selection-delete-parent', 'Selection Delete Parent')
    const child = createGroup('selection-delete-child', 'Selection Delete Parent/Child')
    const entry = createEntry(parent, 'selection-delete-entry')
    ;(window as any).passmanager = createPassmanager(parent, [parent, child, entry])
    pmSelectionModeModel.enterWithEntry(entry.id)
    pmSelectionModeModel.toggleGroup(child.id)

    entry.remove = vi.fn().mockResolvedValue(undefined) as typeof entry.remove
    child.remove = vi.fn().mockResolvedValue(undefined) as typeof child.remove
    const confirmSpy = vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)

    expect(pmMobileChromeModel.getCommandContext()).toMatchObject({
      kind: 'passwords-selection',
      selectedCount: 2,
      singleSelectionKind: null,
    })

    expect(pmMobileChromeModel.executeCommand('pm-selection-edit')).toBe(false)
    expect(pmMobileChromeModel.executeCommand('pm-selection-move')).toBe(false)

    expect(pmMobileChromeModel.executeCommand('pm-selection-delete')).toBe(true)

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmVariant: 'danger',
        variant: 'danger',
      }),
    )
    await vi.waitFor(() => {
      expect(entry.remove).toHaveBeenCalledTimes(1)
      expect(entry.remove).toHaveBeenCalledWith({silent: true})
      expect(pmMobileSelectionModel.selectedEntryIds()).toEqual([])
      expect(pmMobileSelectionModel.selectedGroupIds()).toEqual([])
    })
  })

  it('bulk deletes selected top-level groups with one confirmation', async () => {
    const root = new ManagerRoot(createMockSaver())
    const alpha = createGroup('delete-group-alpha', 'Delete Group Alpha')
    const beta = createGroup('delete-group-beta', 'Delete Group Beta')
    root.entries.set([alpha, beta])
    root.showElement.set(root)

    ;(window as any).passmanager = root as any
    pmSelectionModeModel.enterWithGroup(alpha.id)
    pmSelectionModeModel.toggleGroup(beta.id)

    const confirmSpy = vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    expect(pmMobileChromeModel.executeCommand('pm-selection-delete')).toBe(true)

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(root.entriesList().filter((item) => item instanceof Group)).toHaveLength(0)
    })
  })

  it('keeps mobile selection when bulk delete confirmation is cancelled', async () => {
    const parent = createGroup('selection-delete-cancel-parent', 'Selection Delete Cancel Parent')
    const entry = createEntry(parent, 'selection-delete-cancel-entry')
    ;(window as any).passmanager = createPassmanager(parent, [parent, entry])
    pmSelectionModeModel.enterWithEntry(entry.id)

    entry.remove = vi.fn().mockResolvedValue(undefined) as typeof entry.remove
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(false)

    expect(pmMobileChromeModel.executeCommand('pm-selection-delete')).toBe(true)

    await Promise.resolve()
    await Promise.resolve()

    expect(entry.remove).not.toHaveBeenCalled()
    expect(pmSelectionModeModel.active()).toBe(true)
    expect(pmMobileSelectionModel.selectedEntryIds()).toEqual([entry.id])
  })

  it('clears pending delete motion when selected entry delete fails', async () => {
    const parent = createGroup('selection-delete-fail-parent', 'Selection Delete Fail Parent')
    const entry = createEntry(parent, 'selection-delete-fail-entry')
    ;(window as any).passmanager = createPassmanager(parent, [parent, entry])
    pmSelectionModeModel.enterWithEntry(entry.id)

    entry.remove = vi.fn().mockRejectedValue(new Error('entry remove failed')) as typeof entry.remove
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    const clearSpy = vi.spyOn(pmDeleteMotionModel, 'clearPending')
    const toastSpy = vi.spyOn(toast, 'error').mockReturnValue('toast-delete-failed')
    const deleteSelection = (pmMobileChromeModel as unknown as {deleteSelection: () => Promise<void>}).deleteSelection.bind(
      pmMobileChromeModel,
    )

    await expect(deleteSelection()).resolves.toBeUndefined()

    expect(clearSpy).toHaveBeenCalledWith([entry.id])
    expect(toastSpy).toHaveBeenCalledWith('Delete failed')
    expect(pmSelectionModeModel.active()).toBe(true)
    expect(pmMobileSelectionModel.selectedEntryIds()).toEqual([entry.id])
  })

  it('clears pending delete motion when selected group persistence fails', async () => {
    const root = new ManagerRoot(createMockSaver())
    const group = createGroup('selection-group-delete-fail', 'Selection Group Delete Fail')
    root.entries.set([group])
    root.showElement.set(root)
    root.save = vi.fn().mockRejectedValue(new Error('root save failed')) as typeof root.save
    ;(window as any).passmanager = root as any
    pmSelectionModeModel.enterWithGroup(group.id)

    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    const clearSpy = vi.spyOn(pmDeleteMotionModel, 'clearPending')
    const toastSpy = vi.spyOn(toast, 'error').mockReturnValue('toast-delete-failed')
    const deleteSelection = (pmMobileChromeModel as unknown as {deleteSelection: () => Promise<void>}).deleteSelection.bind(
      pmMobileChromeModel,
    )

    await expect(deleteSelection()).resolves.toBeUndefined()

    expect(clearSpy).toHaveBeenCalledWith([group.id])
    expect(toastSpy).toHaveBeenCalledWith('Delete failed')
    expect(root.entriesList()).toEqual([group])
    expect(pmSelectionModeModel.active()).toBe(true)
    expect(pmMobileSelectionModel.selectedGroupIds()).toEqual([group.id])
  })
})
