import {Group, ManagerRoot} from '@project/passmanager/core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {PMEntryCreateLocationSheet} from '../../src/features/passmanager/components/card/entry-create/entry-create-location-sheet'
import {PMEntryCreateModel} from '../../src/features/passmanager/components/card/entry-create/entry-create.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

function createGroup(id: string, name: string): Group {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as never)
}

function createRoot(groups: Group[]): ManagerRoot {
  const root = new ManagerRoot({} as never)
  root.entries.set(groups)
  root.showElement.set('createEntry')
  return root
}

async function settle(element: HTMLElement & {updateComplete: Promise<unknown>}): Promise<void> {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

describe('PMEntryCreateLocationSheet', () => {
  beforeEach(() => {
    PMEntryCreateLocationSheet.define()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    setPassmanagerRoot(undefined)
    vi.restoreAllMocks()
  })

  it('preselects root and confirms a nested group without inheriting Move disabled targets', async () => {
    const nested = createGroup('group:work/private', 'Work/Private')
    const root = createRoot([nested])
    setPassmanagerRoot(root)
    const model = new PMEntryCreateModel()
    model.openLocationSheet()

    const sheet = document.createElement('pm-entry-create-location-sheet') as PMEntryCreateLocationSheet
    sheet.model = model
    document.body.append(sheet)
    await settle(sheet)

    const picker = sheet.shadowRoot?.querySelector('pm-group-target-picker-mobile') as
      | (HTMLElement & {shadowRoot?: ShadowRoot; updateComplete: Promise<unknown>; selectedId: string})
      | null
    if (picker) await settle(picker)
    expect(picker?.selectedId).toBe(root.id)
    expect(picker?.shadowRoot?.querySelector(`[data-option-id="${root.id}"]`)?.getAttribute('aria-selected')).toBe(
      'true',
    )
    picker?.shadowRoot?.querySelector('cv-input')?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'private'},
        bubbles: true,
        composed: true,
      }),
    )
    if (picker) await settle(picker)
    expect(picker?.shadowRoot?.querySelector(`[data-option-id="${nested.id}"]`)?.getAttribute('aria-disabled')).toBe(
      'false',
    )

    picker?.shadowRoot?.querySelector<HTMLElement>(`[data-option-id="${nested.id}"]`)?.click()
    await settle(sheet)
    sheet.shadowRoot?.querySelectorAll<HTMLElement>('.sheet-action')[1]?.click()
    await settle(sheet)

    expect(model.targetGroupId()).toBe(nested.id)
    expect(model.locationSheetOpen()).toBe(false)
    expect(model.dirty()).toBe(true)
  })

  it('keeps the selected destination unchanged on Cancel', async () => {
    const nested = createGroup('group:personal', 'Personal')
    const root = createRoot([nested])
    setPassmanagerRoot(root)
    const model = new PMEntryCreateModel()
    model.setTargetGroupId(nested.id)
    model.openLocationSheet()

    const sheet = document.createElement('pm-entry-create-location-sheet') as PMEntryCreateLocationSheet
    sheet.model = model
    document.body.append(sheet)
    await settle(sheet)

    sheet.shadowRoot?.querySelector<HTMLElement>('.sheet-action')?.click()
    await settle(sheet)

    expect(model.targetGroupId()).toBe(nested.id)
    expect(model.locationSheetOpen()).toBe(false)
  })
})
