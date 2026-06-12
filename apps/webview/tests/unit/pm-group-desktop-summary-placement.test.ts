import {html} from '@chromvoid/uikit/reatom-lit'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {Group, ManagerRoot} from '@project/passmanager'
import {PMGroup} from '../../src/features/passmanager/components/group/group/group'
import type {PMGroupRow} from '../../src/features/passmanager/components/group/group/group.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

class TestPMGroupDesktopSummaryPlacement extends PMGroup {
  static override styles = []

  protected override renderGroupsList(_group: Group | ManagerRoot, _items: PMGroupRow[]) {
    return html`<div class="fake-group-list"></div>`
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

function createPassmanagerRoot(currentGroup: Group, groups: Group[]) {
  const root = new ManagerRoot({} as any)
  root.entries.set(groups)
  root.showElement.set(currentGroup)
  ;(root as ManagerRoot & {isReadOnly: () => boolean}).isReadOnly = () => false
  return root
}

describe('PMGroup desktop summary placement', () => {
  let originalPassmanager: typeof window.passmanager

  beforeEach(() => {
    PMGroup.define()
    if (!customElements.get('test-pm-group-desktop-summary-placement')) {
      customElements.define('test-pm-group-desktop-summary-placement', TestPMGroupDesktopSummaryPlacement)
    }
    originalPassmanager = window.passmanager
  })

  afterEach(() => {
    document.body.innerHTML = ''
    setPassmanagerRoot(undefined)
    window.passmanager = originalPassmanager
  })

  it('renders desktop content without a local group metrics rail', async () => {
    const parent = createGroup('desktop-summary-parent', 'Desktop Summary')
    const child = createGroup('desktop-summary-child', 'Desktop Summary/Child')
    const root = createPassmanagerRoot(parent, [parent, child])
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root)

    const element = document.createElement(
      'test-pm-group-desktop-summary-placement',
    ) as TestPMGroupDesktopSummaryPlacement
    document.body.append(element)
    await element.updateComplete

    const contentShell = element.shadowRoot?.querySelector('.content-shell')
    const header = element.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement | null
    const summaryRail = element.shadowRoot?.querySelector('pm-summary-rail.group-metrics-strip')

    expect(contentShell).not.toBeNull()
    expect(header).not.toBeNull()
    expect(summaryRail).toBeNull()
    expect(header?.querySelector('pm-summary-rail.group-metrics-strip')).toBeNull()
    expect(
      header?.shadowRoot?.querySelector('.workspace-header')?.getAttribute('data-density'),
    ).toBe('compact')
    expect(contentShell?.nextElementSibling).toBeNull()
  })
})
