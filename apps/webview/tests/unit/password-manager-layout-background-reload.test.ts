import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Group, ManagerRoot} from '@project/passmanager/core'
import {PasswordManagerDesktopLayout} from '../../src/features/passmanager/components/password-manager-layout/password-manager-desktop-layout'

type TestLayoutElement = PasswordManagerDesktopLayout & {
  updateComplete: Promise<unknown>
}

class TestPMGroup extends HTMLElement {
  private readonly rootEl = this.attachShadow({mode: 'open'})
  private readonly listEl = document.createElement('div')
  private unsubscribeShowElement?: () => void
  private unsubscribeEntries?: () => void

  constructor() {
    super()
    this.listEl.className = 'group-virtual-list'
    this.rootEl.append(this.listEl)
  }

  connectedCallback(): void {
    const showElement = window.passmanager?.showElement
    if (showElement && typeof showElement.subscribe === 'function') {
      this.unsubscribeShowElement = showElement.subscribe(() => {
        this.bindEntries()
      })
    }

    this.bindEntries()
  }

  disconnectedCallback(): void {
    this.unsubscribeEntries?.()
    this.unsubscribeEntries = undefined
    this.unsubscribeShowElement?.()
    this.unsubscribeShowElement = undefined
  }

  private bindEntries(): void {
    this.unsubscribeEntries?.()
    this.unsubscribeEntries = undefined

    const current = window.passmanager?.showElement?.()
    if (
      current &&
      typeof current === 'object' &&
      'entries' in current &&
      typeof (current as {entries: {subscribe?: unknown}}).entries?.subscribe === 'function'
    ) {
      this.unsubscribeEntries = (current as {entries: {subscribe(cb: () => void): () => void}}).entries.subscribe(() => {
        this.renderRows()
      })
    }

    this.renderRows()
  }

  private renderRows(): void {
    const current = window.passmanager?.showElement?.()
    const entries =
      current && typeof current === 'object' && 'entries' in current && typeof (current as {entries(): unknown[]}).entries === 'function'
        ? ((current as {entries(): Array<{id: string; title?: string}>}).entries() ?? [])
        : []

    this.listEl.replaceChildren(
      ...entries.map((entry) => {
        const row = document.createElement('div')
        row.dataset['entryId'] = entry.id
        row.textContent = entry.title ?? entry.id
        return row
      }),
    )
  }
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}): Promise<void> {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await Promise.resolve()
}

function makePayload(
  entries: Array<{id: string; title: string; folderPath?: string | null}>,
  folders: string[] = [],
): string {
  const now = Date.now()
  return JSON.stringify({
    version: 2,
    createdTs: now,
    updatedTs: now,
    folders,
    entries: entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      username: '',
      urls: [],
      otps: [],
      folderPath: entry.folderPath ?? null,
    })),
  })
}

describe('Password manager layout background reload', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    PasswordManagerDesktopLayout.define()
    if (!customElements.get('pm-group')) {
      customElements.define('pm-group', TestPMGroup)
    }
    previousPassmanager = window.passmanager
  })

  afterEach(() => {
    window.passmanager = previousPassmanager
    document.querySelectorAll('password-manager-desktop-layout').forEach((element) => element.remove())
  })

  it('keeps the same group host and scroll container during reload inside an open group', async () => {
    const saver = {
      read: vi.fn(),
    }
    const root = new ManagerRoot(saver as never)
    saver.read.mockResolvedValueOnce(makePayload([{id: 'a', title: 'Alpha', folderPath: 'work'}], ['work']))
    await root.load()

    const workGroup = root.getGroup('group:work')
    expect(workGroup).toBeInstanceOf(Group)
    root.showElement.set(workGroup!)
    window.passmanager = root

    const layout = document.createElement('password-manager-desktop-layout') as TestLayoutElement
    document.body.appendChild(layout)
    await settle(layout)

    const groupHostBefore = layout.shadowRoot?.querySelector('pm-group') as TestPMGroup | null
    const listBefore = groupHostBefore?.shadowRoot?.querySelector('.group-virtual-list')
    expect(groupHostBefore).not.toBeNull()
    expect(listBefore).not.toBeNull()

    saver.read.mockResolvedValueOnce(
      makePayload(
        [
          {id: 'a', title: 'Alpha Updated', folderPath: 'work'},
          {id: 'b', title: 'Beta', folderPath: 'work'},
        ],
        ['work'],
      ),
    )
    await root.load()
    await settle(layout)

    const groupHostAfter = layout.shadowRoot?.querySelector('pm-group') as TestPMGroup | null
    const listAfter = groupHostAfter?.shadowRoot?.querySelector('.group-virtual-list')
    expect(groupHostAfter).toBe(groupHostBefore)
    expect(listAfter).toBe(listBefore)
    expect(listAfter?.querySelectorAll('[data-entry-id]').length).toBe(2)
    expect(workGroup?.entries().map((entry) => entry.id)).toEqual(['a', 'b'])
  })
})
