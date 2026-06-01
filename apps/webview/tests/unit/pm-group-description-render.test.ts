import {html, nothing} from '@chromvoid/uikit/reatom-lit'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {Entry, Group, ManagerRoot} from '@project/passmanager'
import type {CredentialAuditEntrySummary} from '@project/passmanager/security-audit'
import {PMWorkspaceHeader} from '../../src/features/passmanager/components/card/pm-workspace-header'
import {PMGroupBase} from '../../src/features/passmanager/components/group/group/group-base'
import {PMSummaryRail} from '../../src/features/passmanager/components/summary-rail'
import {pmCredentialSecurityAuditModel} from '../../src/features/passmanager/models/pm-credential-security-audit.model'

class TestPMGroupDescriptionRender extends PMGroupBase {
  static styles = []

  protected override render() {
    if (!window.passmanager) return nothing

    const current = this.getCurrentGroup()
    if (!(current instanceof Group)) return nothing

    const items = this.model.getUniqueRows(this.model.getVisibleRows(current))
    const summary = this.model.getGroupPresentation(current, items, false)

    return html`
      <div class="wrapper">
        ${this.renderHeader(current, summary, false)}
        ${this.renderGroupMetrics(summary)}
        <div class="rows">
          ${items.map((row) => (row.kind === 'group' ? this.renderFolderItem(row.item, false) : nothing))}
        </div>
      </div>
    `
  }
}

function createEntry(parent: Group, id: string, options: {title?: string; otps?: unknown[]; sshKeys?: unknown[]} = {}) {
  return new Entry(parent, {
    id,
    title: options.title ?? id,
    username: `${id}@example.com`,
    urls: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
    otps: options.otps ?? [],
    sshKeys: options.sshKeys ?? [],
  } as any)
}

function setAuditEntries(
  entries: Array<[Entry, Partial<Omit<CredentialAuditEntrySummary, 'entryId'>>]>,
): void {
  pmCredentialSecurityAuditModel.status.set('ready')
  pmCredentialSecurityAuditModel.failedEntryIds.set(new Set())
  pmCredentialSecurityAuditModel.entries.set(
    new Map(
      entries.map(([entry, state]) => [
        entry.id,
        {
          entryId: entry.id,
          weakPassword: false,
          reusedPassword: false,
          hasTwoFactor: false,
          strengthScore: null,
          ...state,
        },
      ]),
    ),
  )
}

async function flush(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await element.updateComplete
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  const nested = element.shadowRoot?.querySelectorAll<HTMLElement & {updateComplete?: Promise<unknown>}>(
    'pm-workspace-header, pm-summary-rail',
  )
  if (nested?.length) {
    await Promise.all([...nested].map((item) => item.updateComplete ?? Promise.resolve()))
  }
  await Promise.resolve()
}

describe('PMGroup description rendering', () => {
  let originalPassmanager: typeof window.passmanager

  beforeEach(() => {
    if (!customElements.get('pm-workspace-header')) {
      PMWorkspaceHeader.define()
    }
    if (!customElements.get('pm-summary-rail')) {
      PMSummaryRail.define()
    }
    if (!customElements.get('test-pm-group-description-render')) {
      customElements.define('test-pm-group-description-render', TestPMGroupDescriptionRender)
    }

    originalPassmanager = window.passmanager
  })

  afterEach(() => {
    document.body.innerHTML = ''
    window.passmanager = originalPassmanager
    pmCredentialSecurityAuditModel.dispose()
  })

  it('shows the selected group description in the header and subgroup rows', async () => {
    const now = Date.now()
    const parent = new Group({
      id: 'group-parent',
      name: 'Operations',
      description: 'Runbooks and production access',
      entries: [],
      createdTs: now,
      updatedTs: now,
    })
    const child = new Group({
      id: 'group-child',
      name: 'Operations/On-call',
      description: 'Escalation notes',
      entries: [],
      createdTs: now,
      updatedTs: now,
    })
    const otpEntry = createEntry(parent, 'otp-entry', {
      title: 'PagerDuty',
      otps: [{id: 'otp-1', label: 'Main'}],
    })
    parent.entries.set([otpEntry])
    const weakChildEntry = createEntry(child, 'weak-child-entry', {title: 'Old VPN'})
    child.entries.set([weakChildEntry])
    setAuditEntries([
      [otpEntry, {hasTwoFactor: true}],
      [weakChildEntry, {weakPassword: true, strengthScore: 1}],
    ])
    const root = new ManagerRoot({} as any)
    root.entries.set([parent, child])
    root.showElement.set(parent)
    ;(root as ManagerRoot & {isReadOnly: () => boolean}).isReadOnly = () => false
    window.passmanager = root as typeof window.passmanager

    const element = document.createElement('test-pm-group-description-render') as TestPMGroupDescriptionRender
    document.body.appendChild(element)
    await flush(element)

    const header = element.shadowRoot?.querySelector('pm-workspace-header') as PMWorkspaceHeader | null
    expect(header?.shadowRoot?.querySelector('.title-summary')?.textContent).toContain(
      'Runbooks and production access',
    )
    expect(element.shadowRoot?.querySelector('.group-description')?.textContent).toContain('Escalation notes')
    const riskDot = element.shadowRoot?.querySelector('.group-risk-dot[data-severity="critical"]')
    expect(riskDot?.getAttribute('aria-label')).toContain('1 weak passwords')
    expect(element.shadowRoot?.querySelector('.group-chevron')).not.toBeNull()
    const summaryRail = element.shadowRoot?.querySelector('pm-summary-rail.group-metrics-strip')
    expect(summaryRail?.shadowRoot?.textContent).toContain('records')
    expect(summaryRail?.shadowRoot?.textContent).toContain('reused')
    expect(summaryRail?.shadowRoot?.textContent).toContain('weak')
    expect(summaryRail?.shadowRoot?.textContent).toContain('2FA')
    expect(summaryRail?.shadowRoot?.querySelector('[data-summary-id="two_factor"]')?.textContent).toContain('1')
    expect(summaryRail?.shadowRoot?.querySelector('[data-summary-id="weak_passwords"]')?.textContent).toContain('0')
  })

  it('does not replace a missing group row description with status text', async () => {
    const now = Date.now()
    const parent = new Group({
      id: 'group-parent-empty-description',
      name: 'Engineering',
      entries: [],
      createdTs: now,
      updatedTs: now,
    } as any)
    const child = new Group({
      id: 'group-child-empty-description',
      name: 'Engineering/Internal',
      entries: [],
      createdTs: now,
      updatedTs: now,
    } as any)
    const root = new ManagerRoot({} as any)
    root.entries.set([parent, child])
    root.showElement.set(parent)
    ;(root as ManagerRoot & {isReadOnly: () => boolean}).isReadOnly = () => false
    window.passmanager = root as typeof window.passmanager

    const element = document.createElement('test-pm-group-description-render') as TestPMGroupDescriptionRender
    document.body.appendChild(element)
    await flush(element)

    const text = element.shadowRoot?.textContent ?? ''

    expect(element.shadowRoot?.querySelector('.group-description')).toBeNull()
    expect(text).not.toContain('OK')
    expect(text).not.toContain('risk')
    expect(text).not.toContain('status')
  })
})
