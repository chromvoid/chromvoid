import {Group, ManagerRoot} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {PMEntryMoveMobile, PMEntryMoveSheet} from '../../src/features/passmanager/components/card/pm-entry-move'
import {pmEntryMoveModel} from '../../src/features/passmanager/models/pm-entry-move-model'
import {clearPassmanagerRoot, setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

function createGroup(id: string, name: string): Group {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createRoot(groups: Group[]): ManagerRoot {
  const root = new ManagerRoot({} as any)
  root.entries.set(groups)
  root.showElement.set(root)
  return root
}

async function flush(element: HTMLElement & {updateComplete: Promise<unknown>}): Promise<void> {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

describe('PMEntryMoveMobile', () => {
  beforeEach(() => {
    PMEntryMoveMobile.define()
    PMEntryMoveSheet.define()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearPassmanagerRoot()
    vi.restoreAllMocks()
  })

  it('renders root as a localized destination with slash as secondary text', async () => {
    const root = createRoot([createGroup('mail-group', 'Mail')])
    setPassmanagerRoot(root)

    const element = document.createElement('pm-entry-move-mobile') as PMEntryMoveMobile
    element.selectedId = root.id
    document.body.append(element)
    await flush(element)

    const row = element.shadowRoot?.querySelector(`[data-option-id="${root.id}"]`)
    expect(row?.textContent).toContain(i18n('dialog:move:root_label'))
    expect(row?.textContent).toContain(i18n('dialog:move:root_subtitle'))
    expect(row?.textContent?.trim()).not.toBe('/')
  })

  it('marks the selected destination with aria-selected, selected class, and a trailing check icon', async () => {
    const group = createGroup('selected-target', 'Selected Target')
    setPassmanagerRoot(createRoot([group]))

    const element = document.createElement('pm-entry-move-mobile') as PMEntryMoveMobile
    element.selectedId = group.id
    document.body.append(element)
    await flush(element)

    const row = element.shadowRoot?.querySelector(`[data-option-id="${group.id}"]`)
    expect(row?.getAttribute('aria-selected')).toBe('true')
    expect(row?.querySelector('.row-check')).not.toBeNull()
  })

  it('keeps disabled destinations unavailable while preserving search and recent rendering', async () => {
    const nested = createGroup('nested-target', 'Parent/Nested')
    const disabled = createGroup('disabled-target', 'Disabled')
    setPassmanagerRoot(createRoot([nested, disabled]))
    vi.spyOn(pmEntryMoveModel, 'listRecentTargets').mockReturnValue([
      {id: nested.id, path: nested.name, label: nested.name, isRoot: false},
    ])

    const element = document.createElement('pm-entry-move-mobile') as PMEntryMoveMobile
    element.selectedId = nested.id
    element.disabledIds = [disabled.id]
    document.body.append(element)
    await flush(element)

    expect(element.shadowRoot?.querySelector('.recent-btn')?.textContent).toContain(nested.name)
    expect(element.shadowRoot?.querySelector(`[data-option-id="${disabled.id}"]`)?.getAttribute('aria-disabled')).toBe(
      'true',
    )

    element.shadowRoot?.querySelector('cv-input')?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'nested'},
        bubbles: true,
        composed: true,
      }),
    )
    await flush(element)

    const nestedRow = element.shadowRoot?.querySelector(`[data-option-id="${nested.id}"]`)
    expect(nestedRow?.textContent).toContain('Nested')
    expect(nestedRow?.textContent).toContain('Parent/Nested')
  })

  it('keeps keyboard navigation working for destination ids that require CSS escaping', async () => {
    const special = createGroup('group:prod/child', 'Prod')
    setPassmanagerRoot(createRoot([special]))

    const element = document.createElement('pm-entry-move-mobile') as PMEntryMoveMobile
    element.selectedId = special.id
    document.body.append(element)
    await flush(element)

    const input = element.shadowRoot?.querySelector('cv-input')
    expect(input).not.toBeNull()

    expect(() => {
      input?.dispatchEvent(
        new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true, composed: true, cancelable: true}),
      )
    }).not.toThrow()
  })

  it('does not confirm the sheet when Enter comes from search or Cancel', async () => {
    const sheet = document.createElement('pm-entry-move-sheet') as PMEntryMoveSheet
    sheet.selectedId = 'target-group'
    document.body.append(sheet)
    await flush(sheet)

    const confirmSpy = vi.fn()
    sheet.addEventListener('pm-entry-move-sheet-confirm', confirmSpy)

    const surface = sheet.shadowRoot?.querySelector('cv-bottom-sheet')
    const cancelButton = sheet.shadowRoot?.querySelector('[data-move-cancel]')
    expect(surface).not.toBeNull()
    expect(cancelButton).not.toBeNull()

    const searchInput = document.createElement('input')
    const searchEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    Object.defineProperty(searchEvent, 'composedPath', {
      value: () => [searchInput, surface, sheet, document.body, document, window],
    })
    surface?.dispatchEvent(searchEvent)

    const cancelEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    Object.defineProperty(cancelEvent, 'composedPath', {
      value: () => [cancelButton, surface, sheet, document.body, document, window],
    })
    surface?.dispatchEvent(cancelEvent)

    expect(confirmSpy).not.toHaveBeenCalled()
  })
})
