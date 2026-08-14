import {html} from '@chromvoid/uikit/reatom-lit'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {Group, ManagerRoot} from '@project/passmanager'
import {PMGroup} from '../../src/features/passmanager/components/group/group/group'
import {PMGroupMobile} from '../../src/features/passmanager/components/group/group/group-mobile'
import type {PMGroupRow} from '../../src/features/passmanager/components/group/group/group.model'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'

class TestPMGroupDesktopSummaryPlacement extends PMGroup {
  static override styles = []

  protected override renderGroupsList(_group: Group | ManagerRoot, _items: PMGroupRow[]) {
    return html`<div class="fake-group-list"></div>`
  }
}

class TestPMGroupMobileSummaryPlacement extends PMGroupMobile {
  static override styles = []

  protected override renderGroupsList(_group: Group | ManagerRoot, _items: PMGroupRow[]) {
    return html`<div class="fake-group-list"></div>`
  }
}

function createGroup(id: string, name: string, description = '') {
  return new Group({
    id,
    name,
    description,
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
    PMGroupMobile.define()
    if (!customElements.get('test-pm-group-desktop-summary-placement')) {
      customElements.define('test-pm-group-desktop-summary-placement', TestPMGroupDesktopSummaryPlacement)
    }
    if (!customElements.get('test-pm-group-mobile-summary-placement')) {
      customElements.define('test-pm-group-mobile-summary-placement', TestPMGroupMobileSummaryPlacement)
    }
    originalPassmanager = window.passmanager
  })

  afterEach(() => {
    document.body.innerHTML = ''
    setPassmanagerRoot(undefined)
    window.passmanager = originalPassmanager
  })

  it('uses the workbench header for an authored group and omits the local desktop metrics rail', async () => {
    const parent = createGroup(
      'desktop-summary-parent',
      'Operations/On-call',
      'Escalation credentials and service access',
    )
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
    const header = element.shadowRoot?.querySelector('pm-workspace-header') as
      | (HTMLElement & {
          contextItems?: Array<{label: string; value: string; current?: boolean}>
          supportText?: string
          updatedFormatted?: string
          createdFormatted?: string
          updateComplete?: Promise<unknown>
        })
      | null
    const summaryRail = element.shadowRoot?.querySelector('pm-summary-rail.group-metrics-strip')
    await header?.updateComplete

    expect(contentShell).not.toBeNull()
    expect(header).not.toBeNull()
    expect(summaryRail).toBeNull()
    expect(
      header?.shadowRoot?.querySelector('.workspace-header')?.getAttribute('data-density'),
    ).toBe('workbench')
    expect(header?.supportText).toBe('Escalation credentials and service access')
    expect(header?.shadowRoot?.querySelector('.title-summary')?.textContent).toContain(
      'Escalation credentials and service access',
    )
    expect(header?.contextItems?.map((item) => item.label)).toEqual(['Root', 'Operations', 'On-call'])
    expect(header?.updatedFormatted).toBe('')
    expect(header?.createdFormatted).toBe('')
    expect(contentShell?.nextElementSibling).toBeNull()
  })

  it('renders a minimal root workbench header without generic support, context counts, or metadata', async () => {
    const root = new ManagerRoot({} as any)
    root.entries.set([])
    root.showElement.set(root)
    ;(root as ManagerRoot & {isReadOnly: () => boolean}).isReadOnly = () => false
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root)

    const element = document.createElement(
      'test-pm-group-desktop-summary-placement',
    ) as TestPMGroupDesktopSummaryPlacement
    document.body.append(element)
    await element.updateComplete

    const header = element.shadowRoot?.querySelector('pm-workspace-header') as
      | (HTMLElement & {
          title?: string
          supportText?: string
          contextLabel?: string
          contextItems?: unknown[]
          updatedFormatted?: string
          createdFormatted?: string
          updateComplete?: Promise<unknown>
        })
      | null
    await header?.updateComplete

    expect(header?.title).toBe('Root')
    expect(header?.supportText).toBe('')
    expect(header?.contextLabel).toBe('')
    expect(header?.contextItems).toEqual([])
    expect(header?.updatedFormatted).toBe('')
    expect(header?.createdFormatted).toBe('')
    expect(header?.querySelector('[slot="context-end"]')).toBeNull()
    expect(header?.shadowRoot?.querySelector('.workspace-context-band')).toBeNull()
    expect(header?.shadowRoot?.querySelector('.title-summary')).toBeNull()
    expect(header?.shadowRoot?.querySelector('.workspace-meta')).toBeNull()
    expect(element.shadowRoot?.querySelector('pm-summary-rail.group-metrics-strip')).toBeNull()
  })

  it('keeps the local metrics rail on mobile', async () => {
    const parent = createGroup('mobile-summary-parent', 'Mobile Summary')
    const child = createGroup('mobile-summary-child', 'Mobile Summary/Child')
    const root = createPassmanagerRoot(parent, [parent, child])
    window.passmanager = root as typeof window.passmanager
    setPassmanagerRoot(root)

    const element = document.createElement(
      'test-pm-group-mobile-summary-placement',
    ) as TestPMGroupMobileSummaryPlacement
    document.body.append(element)
    await element.updateComplete

    const summaryRail = element.shadowRoot?.querySelector('pm-summary-rail.group-metrics-strip') as
      | (HTMLElement & {updateComplete?: Promise<unknown>})
      | null
    await summaryRail?.updateComplete

    expect(summaryRail).not.toBeNull()
    expect(summaryRail?.shadowRoot?.querySelector('[data-summary-id="entries"]')).not.toBeNull()
  })
})
