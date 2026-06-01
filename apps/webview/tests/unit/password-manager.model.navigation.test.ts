import {afterEach, describe, expect, it, vi} from 'vitest'

const announceMock = vi.hoisted(() => vi.fn())

vi.mock('@chromvoid/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@chromvoid/ui')>()
  return {
    ...actual,
    announce: announceMock,
  }
})

import {Entry, Group, ManagerRoot} from '@project/passmanager'
import {
  consumeAndroidPasswordSavePrefill,
  stageAndroidPasswordSavePrefill,
} from '../../src/features/passmanager/models/android-password-save-prefill'
import {
  PASSMANAGER_NO_MOTION_INTENT,
  pmMotionModel,
} from '../../src/features/passmanager/models/pm-motion.model'
import {pmEntryEditorModel} from '../../src/features/passmanager/models/pm-entry-editor.model'
import {clearPassmanagerRoot, setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {passmanagerNavigationController} from '../../src/features/passmanager/passmanager-navigation.controller'
import {pmModel} from '../../src/features/passmanager/password-manager.model'

function createGroup(id: string, name: string) {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(parent: Group, id: string, title: string) {
  return new Entry(parent, {
    id,
    title,
    urls: [],
    username: '',
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: [],
  } as any)
}

function selectEntryForCopy(entry: Entry) {
  const root = new ManagerRoot({} as any)
  const group = entry.parent instanceof Group ? entry.parent : createGroup('copy-group', 'Copy Group')

  group.entries.set([entry])
  root.entries.set([group])
  root.showElement.set(entry)
  window.passmanager = root
  setPassmanagerRoot(root)
}

function installClipboardInvokeSpy(result: Promise<unknown> = Promise.resolve(undefined)) {
  const invoke = vi.fn(() => result)
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {invoke},
  })
  return invoke
}

describe('PasswordManagerModel navigation', () => {
  let originalPassmanager: typeof window.passmanager

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    announceMock.mockReset()
    delete (globalThis as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
    window.passmanager = originalPassmanager
    clearPassmanagerRoot()
    passmanagerNavigationController.reset()
    pmEntryEditorModel.reset()
    pmModel.cleanup()
    consumeAndroidPasswordSavePrefill()
  })

  it('returns to root after root -> group -> entry back chain', () => {
    originalPassmanager = window.passmanager

    const root = new ManagerRoot({} as any)
    const group = createGroup('group-a', 'Group A')
    const entry = createEntry(group, 'entry-a', 'Entry A')

    group.entries.set([entry])
    root.entries.set([group])
    window.passmanager = root

    pmModel.openItem(group)
    expect(pmMotionModel.intent()).toEqual({
      kind: 'surface-change',
      direction: 'forward',
      target: `group:${group.id}`,
    })

    pmModel.openItem(entry)
    expect(pmMotionModel.intent()).toEqual({
      kind: 'surface-change',
      direction: 'forward',
      target: `entry:${entry.id}`,
    })

    expect(root.showElement()).toBe(entry)

    expect(pmModel.goBackFromCurrent()).toBe(true)
    expect(root.showElement()).toBe(group)
    expect(pmModel.consumeRestoreSelection(group.id)).toBe(entry.id)
    expect(pmMotionModel.intent()).toEqual({
      kind: 'surface-change',
      direction: 'back',
      target: `group:${group.id}`,
    })

    expect(pmModel.goBackFromCurrent()).toBe(true)
    expect(root.showElement()).toBe(root)
    expect(pmModel.consumeRestoreSelection(root.id)).toBe(group.id)
    expect(pmMotionModel.intent()).toEqual({
      kind: 'surface-change',
      direction: 'back',
      target: `root:${root.id}`,
    })
  })

  it('remembers restore selection when route back applies entry -> group and group -> root', () => {
    originalPassmanager = window.passmanager

    const root = new ManagerRoot({} as any)
    const group = createGroup('group-route-a', 'Group Route A')
    const entry = createEntry(group, 'entry-route-a', 'Entry Route A')

    group.entries.set([entry])
    root.entries.set([group])
    window.passmanager = root

    passmanagerNavigationController.applyRoute({kind: 'group', groupPath: group.name})
    passmanagerNavigationController.applyRoute({
      kind: 'entry',
      entryId: entry.id,
      groupPath: group.name,
    })

    expect(root.showElement()).toBe(entry)

    expect(passmanagerNavigationController.applyRoute({kind: 'group', groupPath: group.name})).toBe(true)
    expect(root.showElement()).toBe(group)
    expect(pmModel.consumeRestoreSelection(group.id)).toBe(entry.id)
    expect(pmMotionModel.intent()).toEqual({
      kind: 'surface-change',
      direction: 'back',
      target: `group:${group.id}`,
    })

    expect(passmanagerNavigationController.applyRoute({kind: 'root'})).toBe(true)
    expect(root.showElement()).toBe(root)
    expect(pmModel.consumeRestoreSelection(root.id)).toBe(group.id)
    expect(pmMotionModel.intent()).toEqual({
      kind: 'surface-change',
      direction: 'back',
      target: `root:${root.id}`,
    })
  })

  it('applies, reads, and backs out of the OTP quick view route', () => {
    originalPassmanager = window.passmanager

    const root = new ManagerRoot({} as any)
    root.entries.set([])
    window.passmanager = root

    expect(passmanagerNavigationController.applyRoute({kind: 'otp-view'})).toBe(true)
    expect(root.showElement()).toBe('otpView')
    expect(passmanagerNavigationController.readRoute()).toEqual({kind: 'otp-view'})
    expect(pmMotionModel.intent()).toEqual({
      kind: 'surface-change',
      direction: 'open',
      target: 'otp-view',
    })

    expect(pmModel.goBackFromCurrent()).toBe(true)
    expect(root.showElement()).toBe(root)
    expect(passmanagerNavigationController.readRoute()).toEqual({kind: 'root'})
  })

  it('announces shortcut password copy success after clipboard write succeeds', async () => {
    vi.useFakeTimers()
    originalPassmanager = window.passmanager
    const group = createGroup('copy-success-group', 'Copy Success Group')
    const entry = createEntry(group, 'copy-success-entry', 'Copy Success Entry')
    vi.spyOn(entry, 'password').mockResolvedValue('secret')
    const invoke = installClipboardInvokeSpy()

    selectEntryForCopy(entry)

    await pmModel.copyCurrentPassword()

    expect(invoke).toHaveBeenCalledWith('plugin:clipboard-manager|write_text', {text: 'secret'})
    expect(announceMock).toHaveBeenCalledWith('Password copied', 'polite')
  })

  it('announces shortcut password copy failure when clipboard write rejects', async () => {
    originalPassmanager = window.passmanager
    const group = createGroup('copy-failure-group', 'Copy Failure Group')
    const entry = createEntry(group, 'copy-failure-entry', 'Copy Failure Entry')
    vi.spyOn(entry, 'password').mockResolvedValue('secret')
    const invoke = installClipboardInvokeSpy(Promise.reject(new Error('Clipboard rejected')))

    selectEntryForCopy(entry)

    await pmModel.copyCurrentPassword()

    expect(invoke).toHaveBeenCalledWith('plugin:clipboard-manager|write_text', {text: 'secret'})
    expect(announceMock).toHaveBeenCalledWith('Failed to copy password', 'assertive')
    expect(announceMock).not.toHaveBeenCalledWith('Password copied', 'polite')
  })

  it('does not write an empty string when shortcut password secret is missing', async () => {
    originalPassmanager = window.passmanager
    const group = createGroup('copy-missing-group', 'Copy Missing Group')
    const entry = createEntry(group, 'copy-missing-entry', 'Copy Missing Entry')
    vi.spyOn(entry, 'password').mockResolvedValue(undefined)
    const invoke = installClipboardInvokeSpy()

    selectEntryForCopy(entry)

    await pmModel.copyCurrentPassword()

    expect(invoke).not.toHaveBeenCalled()
    expect(announceMock).toHaveBeenCalledWith('Failed to copy password', 'assertive')
  })

  it('closes the active inline editor before leaving the current entry', () => {
    originalPassmanager = window.passmanager

    const root = new ManagerRoot({} as any)
    const group = createGroup('group-b', 'Group B')
    const entry = createEntry(group, 'entry-b', 'Entry B')

    group.entries.set([entry])
    root.entries.set([group])
    root.showElement.set(entry)
    window.passmanager = root
    pmEntryEditorModel.openSurface(entry.id, 'note')

    expect(pmModel.goBackFromCurrent()).toBe(true)
    expect(pmEntryEditorModel.active()).toBe(false)
    expect(root.showElement()).toBe(entry)

    expect(pmModel.goBackFromCurrent()).toBe(true)
    expect(root.showElement()).toBe(group)
  })

  it('sets open and close motion for create and import surfaces', () => {
    originalPassmanager = window.passmanager

    const root = new ManagerRoot({} as any)
    const group = createGroup('group-create-a', 'Group Create A')

    root.entries.set([group])
    window.passmanager = root

    passmanagerNavigationController.openCreateEntry(group.name)
    expect(root.showElement()).toBe('createEntry')
    expect(pmMotionModel.intent()).toEqual({
      kind: 'surface-change',
      direction: 'open',
      target: `create-entry:${group.id}`,
    })

    passmanagerNavigationController.openCreateGroup(group.name)
    expect(root.showElement()).toBe('createGroup')
    expect(pmMotionModel.intent()).toEqual({
      kind: 'surface-change',
      direction: 'open',
      target: `create-group:${group.id}`,
    })

    passmanagerNavigationController.openImport()
    expect(root.showElement()).toBe('importDialog')
    expect(pmMotionModel.intent()).toEqual({
      kind: 'surface-change',
      direction: 'open',
      target: 'import',
    })

    passmanagerNavigationController.closeImport()
    expect(root.showElement()).toBe(root)
    expect(pmMotionModel.intent()).toEqual({
      kind: 'surface-change',
      direction: 'close',
      target: `root:${root.id}`,
    })
  })

  it('resets motion and active row state on controller reset', () => {
    originalPassmanager = window.passmanager

    const root = new ManagerRoot({} as any)
    const group = createGroup('group-reset-a', 'Group Reset A')

    root.entries.set([group])
    window.passmanager = root

    pmModel.openItem(group)
    expect(pmModel.consumeRestoreSelection(root.id)).toBe(group.id)
    expect(pmMotionModel.intent()).toMatchObject({
      kind: 'surface-change',
      direction: 'forward',
    })

    passmanagerNavigationController.reset()

    expect(pmModel.consumeRestoreSelection(root.id)).toBeUndefined()
    expect(pmMotionModel.intent()).toEqual(PASSMANAGER_NO_MOTION_INTENT)
  })

  it('clears motion intent for no-op item navigation', () => {
    originalPassmanager = window.passmanager

    const root = new ManagerRoot({} as any)
    const group = createGroup('group-noop-a', 'Group Noop A')

    root.entries.set([group])
    window.passmanager = root

    pmModel.openItem(group)
    expect(pmMotionModel.intent()).toMatchObject({
      kind: 'surface-change',
      direction: 'forward',
      target: `group:${group.id}`,
    })
    pmModel.openItem(group)

    expect(root.showElement()).toBe(group)
    expect(pmMotionModel.intent()).toEqual(PASSMANAGER_NO_MOTION_INTENT)
  })

  it('opens create entry when Android password save prefill is pending during init', () => {
    originalPassmanager = window.passmanager
    pmModel.managerSaver = {
      read: () => ({version: 2, folders: [], entries: [], createdTs: 0, updatedTs: 0}),
    } as any
    stageAndroidPasswordSavePrefill({
      token: 'token-1',
      title: 'github.com',
      username: 'alice@example.com',
      password: 'pw-123',
      urls: 'https://github.com/login',
    })

    window.passmanager = undefined as unknown as typeof window.passmanager

    pmModel.init()

    expect(passmanagerNavigationController.readRoute()).toEqual({
      kind: 'create-entry',
      targetGroupPath: undefined,
    })
  })
})
