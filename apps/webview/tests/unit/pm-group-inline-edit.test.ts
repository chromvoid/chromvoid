import {html, nothing} from '@chromvoid/uikit/reatom-lit'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Group, ManagerRoot, setPassManagerDialogAdapter} from '@project/passmanager/core'
import {PMWorkspaceHeader} from '../../src/features/passmanager/components/card/pm-workspace-header'
import {PMGroupBase} from '../../src/features/passmanager/components/group/group/group-base'
import {PMGroupModel} from '../../src/features/passmanager/components/group/group/group.model'
import {pmDeleteMotionModel} from '../../src/features/passmanager/models/pm-delete-motion.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {dialogService} from '../../src/shared/services/dialog-service'
import {toast} from '../../src/shared/services/toast-manager'

let defined = false

class TestPMGroupInlineEdit extends PMGroupBase {
  static styles = []

  protected override render() {
    if (!window.passmanager) return nothing

    const current = this.getCurrentGroup()
    if (!(current instanceof Group)) return nothing

    const summary = this.model.getGroupPresentation(current, [], false)
    return html`<div class="wrapper">${this.renderHeader(current, summary, false)}</div>`
  }
}

function ensureDefined() {
  if (defined) return
  PMWorkspaceHeader.define()
  if (!customElements.get('test-pm-group-inline-edit')) {
    customElements.define('test-pm-group-inline-edit', TestPMGroupInlineEdit)
  }
  defined = true
}

async function settle(element: TestPMGroupInlineEdit) {
  await element.updateComplete
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  const nested = element.shadowRoot?.querySelectorAll<HTMLElement & {updateComplete?: Promise<unknown>}>(
    'pm-workspace-header, cv-input, cv-textarea',
  )
  if (nested?.length) {
    await Promise.all([...nested].map((item) => item.updateComplete ?? Promise.resolve()))
  }
  await Promise.resolve()
  await element.updateComplete
}

function createRoot(group: Group, extraGroups: Group[] = []) {
  const root = new ManagerRoot({} as any)
  root.entries.set([group, ...extraGroups])
  root.showElement.set(group)
  ;(root as ManagerRoot & {isReadOnly: () => boolean}).isReadOnly = () => false
  return root
}

describe('PMGroup inline edit', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    previousPassmanager = window.passmanager
    ensureDefined()
  })

  afterEach(() => {
    const editModel = new PMGroupModel()
    editModel.exitEditMode()
    document.body.innerHTML = ''
    window.passmanager = previousPassmanager
    setPassmanagerRoot(previousPassmanager as any)
    setPassManagerDialogAdapter(null)
    pmDeleteMotionModel.reset()
    vi.restoreAllMocks()
  })

  it('prefills inline edit drafts when edit mode is started from another group model', async () => {
    const now = Date.now()
    const group = new Group({
      id: 'group-current',
      name: 'Ops/Services',
      description: 'Current notes',
      iconRef: 'stored:group-icon',
      entries: [],
      createdTs: now,
      updatedTs: now,
    })
    const root = createRoot(group)
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root as any)

    const element = document.createElement('test-pm-group-inline-edit') as TestPMGroupInlineEdit
    document.body.append(element)
    await settle(element)

    const externalModel = new PMGroupModel()
    externalModel.enterEditMode()
    await settle(element)

    const header = element.shadowRoot?.querySelector('pm-workspace-header') as
      | (HTMLElement & {
          editableTitle?: boolean
          shadowRoot?: ShadowRoot
        })
      | null
    const titleInput = header?.shadowRoot?.querySelector('cv-input.title-input') as
      | (HTMLElement & {value?: string})
      | null
    const iconPicker = header?.shadowRoot?.querySelector('pm-icon-picker.title-avatar-picker') as
      | (HTMLElement & {iconRef?: string})
      | null
    const descriptionField = element.shadowRoot?.querySelector('cv-textarea[name="description"]') as
      | (HTMLElement & {value?: string})
      | null

    expect(header?.editableTitle).toBe(true)
    expect(titleInput?.value).toBe('Services')
    expect(descriptionField?.value).toBe('Current notes')
    expect(iconPicker?.iconRef).toBe('stored:group-icon')
  })

  it('edits a group inline and renames nested subgroups through the header', async () => {
    const now = Date.now()
    const group = new Group({
      id: 'group-current',
      name: 'Ops/Services',
      description: 'Current notes',
      entries: [],
      createdTs: now,
      updatedTs: now,
    })
    const child = new Group({
      id: 'group-child',
      name: 'Ops/Services/Child',
      description: 'Nested child',
      entries: [],
      createdTs: now,
      updatedTs: now,
    })
    const root = createRoot(group, [child])
    const saveSpy = vi.spyOn(root, 'save').mockResolvedValue(true)
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root as any)

    const element = document.createElement('test-pm-group-inline-edit') as TestPMGroupInlineEdit
    document.body.append(element)
    await settle(element)

    const editAction = element.shadowRoot?.querySelector('.group-title-edit-action') as HTMLButtonElement | null
    expect(editAction).not.toBeNull()

    editAction?.click()
    await settle(element)

    const header = element.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement & {
      shadowRoot?: ShadowRoot
    }
    const titleInput = header.shadowRoot?.querySelector('cv-input.title-input') as HTMLElement | null
    expect(titleInput).not.toBeNull()

    header.dispatchEvent(
      new CustomEvent('pm-workspace-header-title-input', {
        detail: {value: 'Infra'},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(element)

    const descriptionField = element.shadowRoot?.querySelector(
      'cv-textarea[name="description"]',
    ) as HTMLElement | null
    expect(descriptionField).not.toBeNull()

    descriptionField?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'Updated notes'},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(element)

    const saveButton = element.shadowRoot?.querySelector('.inline-edit-save') as HTMLButtonElement | null
    saveButton?.click()
    await settle(element)

    expect(group.name).toBe('Ops/Infra')
    expect(child.name).toBe('Ops/Infra/Child')
    expect(group.description).toBe('Updated notes')
    expect(saveSpy).toHaveBeenCalled()
    expect(element.shadowRoot?.querySelector('.inline-edit-save')).toBeNull()
    expect(element.shadowRoot?.querySelector('.group-title-edit-action')).not.toBeNull()
  })

  it('cancels inline edit without mutating the group', async () => {
    const now = Date.now()
    const group = new Group({
      id: 'group-current',
      name: 'Services',
      description: 'Current notes',
      entries: [],
      createdTs: now,
      updatedTs: now,
    })
    const root = createRoot(group)
    const saveSpy = vi.spyOn(root, 'save').mockResolvedValue(true)
    vi.spyOn(dialogService, 'showConfirmDialog').mockResolvedValue(true)
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root as any)

    const element = document.createElement('test-pm-group-inline-edit') as TestPMGroupInlineEdit
    document.body.append(element)
    await settle(element)

    ;(element.shadowRoot?.querySelector('.group-title-edit-action') as HTMLButtonElement | null)?.click()
    await settle(element)

    const header = element.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement & {
      shadowRoot?: ShadowRoot
    }
    const titleInput = header.shadowRoot?.querySelector('cv-input.title-input') as HTMLElement | null
    expect(titleInput).not.toBeNull()

    header.dispatchEvent(
      new CustomEvent('pm-workspace-header-title-input', {
        detail: {value: 'Discarded'},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(element)

    ;(element.shadowRoot?.querySelector('.inline-edit-cancel') as HTMLButtonElement | null)?.click()
    await settle(element)

    expect(group.name).toBe('Services')
    expect(group.description).toBe('Current notes')
    expect(saveSpy).not.toHaveBeenCalled()
    expect(element.shadowRoot?.querySelector('.inline-edit-save')).toBeNull()
  })

  it('keeps inline edit active when save persistence fails', async () => {
    const now = Date.now()
    const group = new Group({
      id: 'group-current',
      name: 'Services',
      description: 'Current notes',
      entries: [],
      createdTs: now,
      updatedTs: now,
    })
    const root = createRoot(group)
    vi.spyOn(root, 'save').mockRejectedValue(new Error('save failed'))
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root as any)

    const model = new PMGroupModel()
    model.enterEditMode()
    model.setEditedName('Infra')

    await expect(model.saveEdit()).resolves.toBe(false)

    expect(model.isEditMode()).toBe(true)
    expect(model.editedName()).toBe('Infra')
    expect(model.editSubmitError()).not.toBe('')
    expect(group.name).toBe('Services')
  })

  it('clears delete motion when a failed delete leaves the group in the mounted root', async () => {
    const now = Date.now()
    const group = new Group({
      id: 'group-current',
      name: 'Services',
      description: 'Current notes',
      entries: [],
      createdTs: now,
      updatedTs: now,
    })
    const root = createRoot(group)
    ;(root as ManagerRoot & {getCardByID: (id: string) => Group | null}).getCardByID = vi.fn(() => group)
    const remove = vi
      .spyOn(group, 'remove')
      .mockRejectedValueOnce(new Error('remove failed'))
      .mockResolvedValueOnce(true)
    const updateToast = vi.fn(() => true)
    vi.spyOn(toast, 'loading').mockReturnValue({
      id: 'group-delete-toast',
      update: updateToast,
      dismiss: vi.fn(),
    })
    setPassManagerDialogAdapter({confirm: vi.fn(async () => true)})
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root as any)

    const model = new PMGroupModel()
    const revisionBefore = pmDeleteMotionModel.revision()

    model.deleteGroup(group)
    await Promise.resolve()
    await Promise.resolve()
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    expect(pmDeleteMotionModel.revision()).toBe(revisionBefore + 2)
    expect(updateToast).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `passmanager.group.delete:${group.id}`,
        message: 'Couldn’t delete “Services”. The group is still in the vault.',
        variant: 'error',
      }),
    )

    const retry = updateToast.mock.calls[0]?.[0].actions?.[0]?.onClick
    retry?.()
    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(2))
    await vi.waitFor(() =>
      expect(updateToast).toHaveBeenLastCalledWith(
        expect.objectContaining({
          key: `passmanager.group.delete:${group.id}`,
          message: '“Services” deleted',
          variant: 'success',
        }),
      ),
    )
  })

  it('does not start delete motion when group removal is cancelled', async () => {
    const now = Date.now()
    const group = new Group({
      id: 'group-current',
      name: 'Services',
      description: 'Current notes',
      entries: [],
      createdTs: now,
      updatedTs: now,
    })
    const root = createRoot(group)
    const confirm = vi.fn(async () => false)
    setPassManagerDialogAdapter({confirm})
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root as any)

    const model = new PMGroupModel()
    const revisionBefore = pmDeleteMotionModel.revision()

    model.deleteGroup(group)
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce())
    await Promise.resolve()

    expect(pmDeleteMotionModel.revision()).toBe(revisionBefore)
    expect(root.entriesList()).toEqual([group])
  })

  it('deduplicates repeated delete taps while the RPC is pending', async () => {
    const group = new Group({
      id: 'group-pending',
      name: 'Pending',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    })
    const root = createRoot(group)
    let resolveRemoval: (() => void) | undefined
    const remove = vi.spyOn(group, 'remove').mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRemoval = () => resolve(true)
        }),
    )
    const confirm = vi.fn(async () => true)
    setPassManagerDialogAdapter({confirm})
    vi.spyOn(toast, 'loading').mockReturnValue({
      id: 'group-pending-toast',
      update: vi.fn(() => true),
      dismiss: vi.fn(),
    })
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root as any)

    const model = new PMGroupModel()
    model.deleteGroup(group)
    model.deleteGroup(group)

    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
    expect(confirm).toHaveBeenCalledOnce()
    resolveRemoval?.()
    await Promise.resolve()
  })
})
