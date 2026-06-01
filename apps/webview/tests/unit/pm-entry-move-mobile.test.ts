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

function stylesText(styles: unknown): string {
  const list = Array.isArray(styles) ? styles : [styles]
  return list
    .map((style) => (typeof style === 'object' && style && 'cssText' in style ? String(style.cssText) : String(style)))
    .join('\n')
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
    expect(row?.classList.contains('selected')).toBe(true)
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

  it('keeps the mobile move picker and sheet styles compact and sheet-scoped', () => {
    const pickerCss = stylesText(PMEntryMoveMobile.styles)
    const sheetCss = stylesText(PMEntryMoveSheet.styles)

    expect(pickerCss).toContain('grid-template-columns: 24px minmax(0, 1fr) 24px;')
    expect(pickerCss).toContain('min-block-size: 48px;')
    expect(pickerCss).toContain('box-shadow: none;')
    expect(sheetCss).toContain('adaptive-modal-surface::part(footer)')
    expect(sheetCss).toContain('env(safe-area-inset-bottom)')
  })
})
