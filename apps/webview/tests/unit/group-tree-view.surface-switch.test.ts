import {afterEach, describe, expect, it, vi} from 'vitest'

import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {atom} from '@reatom/core'
import {Group, ManagerRoot} from '@project/passmanager/core'
import {pmModel} from '../../src/features/passmanager/password-manager.model'
import {GroupTreeView} from '../../src/features/passmanager/components/list/group-tree-view'
import {PasswordManagerElement} from '../../src/features/passmanager/components/main'
import {pmGroupTreeModel} from '../../src/features/passmanager/models/pm-group-tree-model'
import {pmRootSearchProjectionModel} from '../../src/features/passmanager/models/pm-root-search-projection'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {dialogService} from '../../src/shared/services/dialog-service'

type TestPasswordManagerElement = PasswordManagerElement & {
  updateComplete: Promise<unknown>
}

function makePayload() {
  const now = Date.now()
  return {
    version: 2 as const,
    createdTs: now,
    updatedTs: now,
    folders: ['Work'],
    entries: [
      {
        id: 'entry-root',
        title: 'Root entry',
        username: '',
        urls: [],
        otps: [],
        folderPath: null,
      },
      {
        id: 'entry-work',
        title: 'Work entry',
        username: '',
        urls: [],
        otps: [],
        folderPath: 'Work',
      },
    ],
  }
}

async function waitForPassmanagerLoad() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve()
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    if ((window.passmanager?.entriesList().length ?? 0) > 0) {
      return
    }
  }
}

function createGroup(id: string, name: string) {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

async function settleElement(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await Promise.resolve()
}

function setupDesktopContext() {
  initAppContext(
    createMockAppContext({
      store: {
        layoutMode: atom<'mobile' | 'desktop'>('desktop'),
        pushNotification: () => {},
      } as any,
    }),
  )
}

const surfaceState = atom<'files' | 'passwords'>('passwords')

class TestSurfaceSwitchHost extends ReatomLitElement {
  static define() {
    if (!customElements.get('test-surface-switch-host')) {
      customElements.define('test-surface-switch-host', this)
    }
  }

  protected override render() {
    return surfaceState() === 'passwords' ? html`<password-manager></password-manager>` : html`<div>files</div>`
  }
}

describe('group-tree-view surface remount', () => {
  let originalPassmanager: typeof window.passmanager
  const originalStyles = GroupTreeView.styles

  afterEach(() => {
    if (pmModel.alive()) {
      pmModel.cleanup()
    }
    pmModel.root.set(undefined)
    window.passmanager = originalPassmanager
    Object.defineProperty(GroupTreeView, 'styles', {
      configurable: true,
      value: originalStyles,
    })
    document.querySelectorAll('group-tree-view').forEach((element) => element.remove())
    document.querySelectorAll('test-surface-switch-host').forEach((element) => element.remove())
    clearAppContext()
    surfaceState.set('passwords')
    pmGroupTreeModel.expandedPaths.set(new Set())
    vi.restoreAllMocks()
  })

  it('restores group tree and root rows after passmanager re-init', async () => {
    originalPassmanager = window.passmanager
    pmModel.managerSaver = {
      read: vi.fn(async () => makePayload()),
    } as any

    pmModel.init()
    await waitForPassmanagerLoad()

    expect(pmGroupTreeModel.tree().groups.map((group) => group.path)).toEqual(['Work'])
    expect(pmRootSearchProjectionModel.getSnapshot().rows.map((row) => row.id)).toEqual(['group:Work', 'entry-root'])

    pmModel.cleanup()

    pmModel.init()
    await waitForPassmanagerLoad()

    expect(pmGroupTreeModel.tree().groups.map((group) => group.path)).toEqual(['Work'])
    expect(pmRootSearchProjectionModel.getSnapshot().rows.map((row) => row.id)).toEqual(['group:Work', 'entry-root'])
  })

  it('renders group rows again after the tree is remounted with a new root instance', async () => {
    originalPassmanager = window.passmanager
    Object.defineProperty(GroupTreeView, 'styles', {
      configurable: true,
      value: [],
    })
    GroupTreeView.define()

    const rootBefore = new ManagerRoot({} as any)
    window.passmanager = rootBefore
    pmModel.root.set(rootBefore)

    const firstTree = document.createElement('group-tree-view') as GroupTreeView & {
      updateComplete: Promise<unknown>
    }
    document.body.append(firstTree)
    await settleElement(firstTree)

    rootBefore.entries.set([createGroup('group-before', 'Work')])
    await settleElement(firstTree)

    expect(
      [...(firstTree.shadowRoot?.querySelectorAll<HTMLElement>('.row[data-kind="group"]') ?? [])].map((row) =>
        row.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['Work 0'])

    firstTree.remove()
    rootBefore.clean()
    window.passmanager = undefined as unknown as typeof window.passmanager
    pmModel.root.set(undefined)

    const rootAfter = new ManagerRoot({} as any)
    window.passmanager = rootAfter
    pmModel.root.set(rootAfter)

    const secondTree = document.createElement('group-tree-view') as GroupTreeView & {
      updateComplete: Promise<unknown>
    }
    document.body.append(secondTree)
    await settleElement(secondTree)

    rootAfter.entries.set([createGroup('group-after', 'Work')])
    await settleElement(secondTree)

    expect(
      [...(secondTree.shadowRoot?.querySelectorAll<HTMLElement>('.row[data-kind="group"]') ?? [])].map((row) =>
        row.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['Work 0'])
  })

  it('keeps group rows visible after switching files -> passwords through a host rerender', async () => {
    originalPassmanager = window.passmanager
    setupDesktopContext()
    Object.defineProperty(GroupTreeView, 'styles', {
      configurable: true,
      value: [],
    })
    if (!customElements.get('pm-group')) {
      customElements.define('pm-group', class extends HTMLElement {})
    }
    const read = vi.fn(async () => makePayload())
    PasswordManagerElement.define({
      read,
    } as any)
    TestSurfaceSwitchHost.define()

    const host = document.createElement('test-surface-switch-host') as TestSurfaceSwitchHost & {
      updateComplete: Promise<unknown>
    }
    document.body.append(host)
    await settleElement(host)

    let passwordManager = host.shadowRoot?.querySelector('password-manager') as TestPasswordManagerElement | null
    expect(passwordManager).not.toBeNull()
    await settleElement(passwordManager!)

    let layout = passwordManager?.shadowRoot?.querySelector('password-manager-desktop-layout') as
      | (HTMLElement & {updateComplete?: Promise<unknown>})
      | null
    await settleElement(layout!)

    let tree = layout?.shadowRoot?.querySelector('group-tree-view') as
      | (HTMLElement & {updateComplete?: Promise<unknown>})
      | null
    await waitForPassmanagerLoad()
    await settleElement(tree!)

    expect(read).toHaveBeenCalledTimes(1)
    expect(window.passmanager?.entriesList().length).toBeGreaterThan(0)
    expect(pmGroupTreeModel.tree().groups.map((group) => group.path)).toEqual(['Work'])
    expect(
      [...(tree?.shadowRoot?.querySelectorAll<HTMLElement>('.row[data-kind="group"]') ?? [])].map((row) =>
        row.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['Work 1'])

    surfaceState.set('files')
    await settleElement(host)
    expect(host.shadowRoot?.querySelector('password-manager')).toBeNull()

    surfaceState.set('passwords')
    await settleElement(host)

    passwordManager = host.shadowRoot?.querySelector('password-manager') as TestPasswordManagerElement | null
    expect(passwordManager).not.toBeNull()
    await settleElement(passwordManager!)

    layout = passwordManager?.shadowRoot?.querySelector('password-manager-desktop-layout') as
      | (HTMLElement & {updateComplete?: Promise<unknown>})
      | null
    await settleElement(layout!)

    tree = layout?.shadowRoot?.querySelector('group-tree-view') as
      | (HTMLElement & {updateComplete?: Promise<unknown>})
      | null
    await waitForPassmanagerLoad()
    await settleElement(tree!)

    expect(read).toHaveBeenCalledTimes(2)
    expect(window.passmanager?.entriesList().length).toBeGreaterThan(0)
    expect(pmGroupTreeModel.tree().groups.map((group) => group.path)).toEqual(['Work'])
    expect(
      [...(tree?.shadowRoot?.querySelectorAll<HTMLElement>('.row[data-kind="group"]') ?? [])].map((row) =>
        row.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['Work 1'])
  })

  it('does not create a group when the create dialog is cancelled', async () => {
    originalPassmanager = window.passmanager
    const root = new ManagerRoot({} as any)
    window.passmanager = root
    pmModel.root.set(root)
    vi.spyOn(dialogService, 'showInputDialog').mockResolvedValue(null)

    await pmGroupTreeModel.createGroupUnder(null)

    expect(root.entriesList()).toEqual([])
  })

  it('does not create a group on a stale root after the create dialog resolves', async () => {
    originalPassmanager = window.passmanager
    const rootBefore = new ManagerRoot({} as any)
    const rootAfter = new ManagerRoot({} as any)
    window.passmanager = rootBefore
    pmModel.root.set(rootBefore)
    let resolveDialog!: (value: string) => void
    vi.spyOn(dialogService, 'showInputDialog').mockReturnValue(
      new Promise<string>((resolve) => {
        resolveDialog = resolve
      }),
    )

    const createPromise = pmGroupTreeModel.createGroupUnder(null)
    window.passmanager = rootAfter
    pmModel.root.set(rootAfter)
    resolveDialog('Stale group')
    await createPromise

    expect(rootBefore.entriesList()).toEqual([])
    expect(rootAfter.entriesList()).toEqual([])
  })

  it('creates a subgroup on the current root and expands the parent path', async () => {
    originalPassmanager = window.passmanager
    const root = new ManagerRoot({save: vi.fn(async () => true)} as any)
    root.entries.set([createGroup('group-parent', 'Parent')])
    window.passmanager = root
    pmModel.root.set(root)
    vi.spyOn(dialogService, 'showInputDialog').mockResolvedValue('Child')

    await pmGroupTreeModel.createGroupUnder('Parent')

    expect(
      root
        .entriesList()
        .filter((item): item is Group => item instanceof Group)
        .map((group) => group.name)
        .sort(),
    ).toEqual(['Parent', 'Parent/Child'])
    expect(pmGroupTreeModel.expandedPaths().has('Parent')).toBe(true)
  })
})
