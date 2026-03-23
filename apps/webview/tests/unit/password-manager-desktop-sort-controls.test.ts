import {state} from '@statx/core'
import {XLitElement} from '@statx/lit'
import {Entry, Group, filterValue, quickFilters} from '@project/passmanager'
import {html, nothing} from 'lit'

import {afterEach, describe, expect, it} from 'vitest'

import {PMGroupModel} from '../../src/features/passmanager/components/group/group'
import {PMSearch} from '../../src/features/passmanager/components/list/search'
import {groupBy, sortDirection, sortField, SortControls} from '../../src/features/passmanager/components/list/sort-controls'
import {PasswordManagerDesktopLayout} from '../../src/features/passmanager/components/password-manager-desktop-layout'

type PassmanagerMock = {
  id: string
  showElement: ReturnType<typeof state<any>>
  isLoading: ReturnType<typeof state<boolean>>
  isReadOnly: ReturnType<typeof state<boolean>>
  entriesList: () => Array<Entry | Group>
  getCardByID: (id: string) => Entry | Group | undefined
}

class FakeEntryListItem extends HTMLElement {
  set entry(entry: Entry) {
    this.dataset['entryId'] = entry.id
    this.textContent = entry.title || '(empty)'
  }

  focusRow() {}
}

class TestPMGroup extends XLitElement {
  protected readonly model = new PMGroupModel()

  private getGroupLabel(group: Group) {
    const parts = group.name.split('/')
    return parts.at(-1) || group.name
  }

  protected render() {
    const current = window.passmanager?.showElement?.()
    if (!(current instanceof Group)) {
      return nothing
    }

    const rows = this.model.getUniqueRows(this.model.getVisibleRows(current))
    return html`
      <div class="test-rows">
        ${rows.map((row) => {
          switch (row.kind) {
            case 'group':
              return html`<div class="group-row-wrap"><span class="group-name">${this.getGroupLabel(row.item)}</span></div>`
            case 'header':
              return html`<div class="group-header-row">
                <div class="group-header">${row.label} <span class="group-count">${row.count}</span></div>
              </div>`
            case 'entry':
              return html`<div class="entry-row"><pm-entry-list-item .entry=${row.item}></pm-entry-list-item></div>`
          }
        })}
      </div>
    `
  }
}

class TestPMSearch extends PMSearch {
  static override styles = []
}

class TestSortControls extends SortControls {
  static override styles = []
}

class TestPasswordManagerDesktopLayout extends PasswordManagerDesktopLayout {
  static override styles = []
}

let defined = false
let originalPassmanager: unknown

function defineStub(name: string, ctor: CustomElementConstructor) {
  if (!customElements.get(name)) {
    customElements.define(name, ctor)
  }
}

function ensureDefined() {
  if (defined) return

  defineStub('pm-entry-list-item', FakeEntryListItem)
  defineStub('pm-avatar-icon', class extends HTMLElement {})
  defineStub('pm-card-header', class extends HTMLElement {})
  defineStub('back-button', class extends HTMLElement {})
  defineStub('group-tree-view', class extends HTMLElement {})

  if (!customElements.get('pm-group')) {
    customElements.define('pm-group', TestPMGroup)
  }
  if (!customElements.get('pm-search')) {
    customElements.define('pm-search', TestPMSearch)
  }
  if (!customElements.get('pm-sort-controls')) {
    customElements.define('pm-sort-controls', TestSortControls)
  }

  if (!customElements.get('password-manager-desktop-layout')) {
    customElements.define('password-manager-desktop-layout', TestPasswordManagerDesktopLayout)
  }
  defined = true
}

function createGroup(name: string, entries: Entry[] = []) {
  return new Group({
    id: `group-${name}`,
    name,
    entries,
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(
  parent: unknown,
  input: {id: string; title: string; website?: string},
): Entry {
  return new Entry(parent as any, {
    id: input.id,
    title: input.title,
    username: '',
    urls: input.website ? [{value: input.website, match: 'host'}] : [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: [],
  } as any)
}

function createPassmanager(currentGroup: Group, items: Array<Entry | Group>): PassmanagerMock {
  return {
    id: 'pm-desktop-layout-test',
    showElement: state<any>(currentGroup),
    isLoading: state(false),
    isReadOnly: state(false),
    entriesList: () => items,
    getCardByID: (id: string) => items.find((item) => item.id === id),
  }
}

async function flush(element: {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

function getGroupRows(layout: PasswordManagerDesktopLayout): string[] {
  const group = layout.shadowRoot?.querySelector('pm-group') as HTMLElement | null
  const root = group?.shadowRoot
  if (!root) return []

  return Array.from(root.querySelectorAll('.group-row-wrap, .group-header-row, .entry-row')).map((row) => {
    const host = row as HTMLElement
    if (host.classList.contains('group-row-wrap')) {
      return `group:${host.querySelector('.group-name')?.textContent?.trim()}`
    }

    if (host.classList.contains('group-header-row')) {
      return `header:${host.querySelector('.group-header')?.textContent?.replace(/\s+/g, ' ').trim()}`
    }

    return `entry:${host.querySelector('pm-entry-list-item')?.textContent?.trim()}`
  })
}

describe('PasswordManagerDesktopLayout sort controls', () => {
  afterEach(() => {
    document.querySelectorAll('password-manager-desktop-layout').forEach((el) => el.remove())
    ;(window as any).passmanager = originalPassmanager
    localStorage.clear()
    filterValue.set('')
    quickFilters.set([])
    sortField.set('name')
    sortDirection.set('asc')
    groupBy.set('none')
  })

  it('re-renders pm-group rows when pm-search sort and group controls change', async () => {
    ensureDefined()
    originalPassmanager = (window as any).passmanager

    const currentGroup = createGroup('Parent')
    const alpha = createEntry(currentGroup, {
      id: 'entry-alpha-desktop',
      title: 'Alpha',
      website: 'https://zeta.test',
    })
    const zulu = createEntry(currentGroup, {
      id: 'entry-zulu-desktop',
      title: 'Zulu',
      website: 'https://alpha.test',
    })
    currentGroup.entries.set([zulu, alpha])

    const childGroup = createGroup('Parent/Child')
    ;(window as any).passmanager = createPassmanager(currentGroup, [currentGroup, childGroup])

    const layout = document.createElement('password-manager-desktop-layout') as PasswordManagerDesktopLayout
    document.body.appendChild(layout)
    await flush(layout)

    expect(getGroupRows(layout)).toEqual(['group:Child', 'entry:Alpha', 'entry:Zulu'])

    const search = layout.shadowRoot?.querySelector('pm-search') as PMSearch | null
    expect(search).not.toBeNull()

    const toggle = search?.shadowRoot?.querySelector('.toggle-filters') as HTMLButtonElement | null
    toggle?.click()
    await flush(search!)
    await flush(layout)

    const controls = search?.shadowRoot?.querySelector('pm-sort-controls') as SortControls | null
    expect(controls).not.toBeNull()

    const selects = controls?.shadowRoot?.querySelectorAll('cv-select') ?? []
    ;(selects[1] as HTMLElement | undefined)?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {value: 'website'},
        bubbles: true,
        composed: true,
      }),
    )
    await flush(controls!)
    await flush(layout)

    expect(getGroupRows(layout)).toEqual(['group:Child', 'entry:Zulu', 'entry:Alpha'])

    ;(selects[0] as HTMLElement | undefined)?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {value: 'website'},
        bubbles: true,
        composed: true,
      }),
    )
    await flush(controls!)
    await flush(layout)

    expect(getGroupRows(layout)).toEqual([
      'group:Child',
      'header:alpha.test 1',
      'entry:Zulu',
      'header:zeta.test 1',
      'entry:Alpha',
    ])
  })
})
