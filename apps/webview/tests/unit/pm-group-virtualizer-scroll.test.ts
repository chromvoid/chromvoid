import {Entry, Group, ManagerRoot} from '@project/passmanager'
import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing} from 'lit'
import {keyed} from 'lit/directives/keyed.js'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {PMGroupBase} from '../../src/features/passmanager/components/group/group/group-base'
import {pmActiveRowModel} from '../../src/features/passmanager/models/pm-active-row.model'

function createGroup(id: string, name: string) {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  } as any)
}

function createEntry(parent: Group | ManagerRoot, id: string, title = id) {
  return new Entry(
    parent as Group,
    {
      id,
      title,
      username: `${id}@example.com`,
      urls: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
      otps: [],
    } as any,
  )
}

function createPassmanagerRoot(currentGroup: Group, groups: Group[]) {
  const root = new ManagerRoot({} as any)
  root.entries.set(groups)
  root.showElement.set(currentGroup)
  return root as typeof window.passmanager
}

class TestPMEntryRow extends HTMLElement {
  private readonly rootEl = this.attachShadow({mode: 'open'})
  private readonly buttonEl = document.createElement('button')

  constructor() {
    super()
    this.buttonEl.className = 'list-item'
    this.buttonEl.type = 'button'
    this.buttonEl.addEventListener('focus', this.handleFocus)
    this.rootEl.append(this.buttonEl)
  }

  set entry(entry: Entry) {
    this.dataset['entryId'] = entry.id
    this.buttonEl.textContent = entry.title || entry.id
  }

  disconnectedCallback(): void {
    this.buttonEl.removeEventListener('focus', this.handleFocus)
  }

  focusRow(): void {
    this.buttonEl.focus()
  }

  private handleFocus = () => {
    this.dispatchEvent(new CustomEvent('pm-entry-row-focus', {bubbles: true, composed: true}))
  }
}

class TestPMGroupVirtualizer extends PMGroupBase {
  static styles = []

  protected override render() {
    if (!window.passmanager) return nothing

    const group = this.getCurrentGroup()
    if (!group) return nothing

    const items = this.model.getUniqueRows(this.model.getVisibleRows(group))
    if (!items.length) {
      this.model.resetKeyboardState()
      return nothing
    }

    const activeId = this.model.getActiveItemId()
    const renderKey = this.getVirtualListRenderKey(group, items)

    return keyed(renderKey, html`
      <div class="fake-virtualizer">
        ${items.map((row) => {
          if (row.kind !== 'entry') return nothing

          return html`
            <div class="entry-row" data-row-id=${row.item.id}>
              <test-pm-entry-row
                .entry=${row.item}
                .activeRow=${row.item.id === activeId}
                .rowTabIndex=${row.item.id === activeId ? 0 : -1}
                .manageActiveRowState=${true}
                @pm-entry-row-focus=${() => this.setActiveItemById(row.item.id)}
              ></test-pm-entry-row>
            </div>
          `
        })}
      </div>
    `)
  }
}

class TestPMGroupScrollEdge extends PMGroupBase {
  static styles = []

  protected override render() {
    if (!window.passmanager) return nothing

    const group = this.getCurrentGroup()
    if (!group) return nothing

    const items = this.model.getUniqueRows(this.model.getVisibleRows(group))
    return this.renderGroupsList(group, items)
  }
}

class TestPMGroupBlockStartScrollEdge extends TestPMGroupScrollEdge {
  protected override usesBlockStartScrollEdge(): boolean {
    return true
  }
}

async function flush(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

function getVirtualizer(element: TestPMGroupVirtualizer) {
  return element.shadowRoot?.querySelector('.fake-virtualizer') as HTMLElement | null
}

async function flushFrame(element: HTMLElement & {updateComplete?: Promise<unknown>}) {
  await Promise.resolve()
  await element.updateComplete
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await element.updateComplete
}

function mockVirtualizerMetrics(metrics: {clientHeight: number; scrollHeight: number}) {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.tagName.toLowerCase() === 'lit-virtualizer' ? metrics.clientHeight : 0
  })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.tagName.toLowerCase() === 'lit-virtualizer' ? metrics.scrollHeight : 0
  })
}

describe('PMGroup virtualizer active-row updates', () => {
  let originalPassmanager: typeof window.passmanager
  let originalScrollIntoView: typeof HTMLElement.prototype.scrollIntoView

  beforeEach(() => {
    if (!customElements.get('test-pm-entry-row')) {
      customElements.define('test-pm-entry-row', TestPMEntryRow)
    }
    if (!customElements.get('test-pm-group-virtualizer')) {
      customElements.define('test-pm-group-virtualizer', TestPMGroupVirtualizer)
    }
    if (!customElements.get('test-pm-group-scroll-edge')) {
      customElements.define('test-pm-group-scroll-edge', TestPMGroupScrollEdge)
    }
    if (!customElements.get('test-pm-group-block-start-scroll-edge')) {
      customElements.define('test-pm-group-block-start-scroll-edge', TestPMGroupBlockStartScrollEdge)
    }

    originalPassmanager = window.passmanager
    originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => {},
    })
  })

  afterEach(() => {
    document.querySelectorAll('test-pm-group-virtualizer').forEach((element) => element.remove())
    document.querySelectorAll('test-pm-group-scroll-edge').forEach((element) => element.remove())
    document.querySelectorAll('test-pm-group-block-start-scroll-edge').forEach((element) => element.remove())
    pmActiveRowModel.clearAll()
    window.passmanager = originalPassmanager
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView,
    })
    vi.restoreAllMocks()
  })

  it('keeps the same virtualizer instance and scrollTop when focus activates another row', async () => {
    const group = createGroup('virtualizer-parent', 'Virtualizer Parent')
    const entries = Array.from({length: 18}, (_value, index) =>
      createEntry(group, `virtualizer-entry-${index}`, `Virtualizer Entry ${index}`),
    )
    group.entries.set(entries)

    window.passmanager = createPassmanagerRoot(group, [group])

    const element = document.createElement('test-pm-group-virtualizer') as TestPMGroupVirtualizer
    document.body.appendChild(element)
    await flush(element)

    const virtualizerBefore = getVirtualizer(element)
    expect(virtualizerBefore).not.toBeNull()

    virtualizerBefore!.scrollTop = 640

    const renderedEntryHosts = Array.from(element.shadowRoot?.querySelectorAll('test-pm-entry-row') ?? []) as TestPMEntryRow[]
    expect(renderedEntryHosts.length).toBeGreaterThan(1)

    pmActiveRowModel.setActive(group.id, entries[1]!.id)
    await flush(element)

    const virtualizerAfter = getVirtualizer(element)
    expect(virtualizerAfter).toBe(virtualizerBefore)
    expect(virtualizerAfter?.scrollTop).toBe(640)
    expect(pmActiveRowModel.getActive(group.id)).toBe(entries[1]?.id)
  })

  it('toggles the group list bottom edge when the virtualizer reaches the end', async () => {
    mockVirtualizerMetrics({clientHeight: 400, scrollHeight: 1200})
    const group = createGroup('scroll-edge-parent', 'Scroll Edge Parent')
    const entries = Array.from({length: 30}, (_value, index) =>
      createEntry(group, `scroll-edge-entry-${index}`, `Scroll Edge Entry ${index}`),
    )
    group.entries.set(entries)
    window.passmanager = createPassmanagerRoot(group, [group])

    const element = document.createElement('test-pm-group-scroll-edge') as TestPMGroupScrollEdge
    document.body.appendChild(element)
    await flushFrame(element)

    const frame = element.shadowRoot?.querySelector<HTMLElement>('.pm-group-scroll-edge')
    const virtualizer = element.shadowRoot?.querySelector<HTMLElement>('lit-virtualizer')
    expect(frame).not.toBeNull()
    expect(virtualizer).not.toBeNull()
    expect(frame?.getAttribute('data-scroll-block-start')).toBe('false')
    expect(frame?.getAttribute('data-scroll-block-end')).toBe('true')

    virtualizer!.scrollTop = 20
    virtualizer!.dispatchEvent(new Event('scroll'))
    await flushFrame(element)

    expect(frame?.getAttribute('data-scroll-block-start')).toBe('false')
    expect(frame?.getAttribute('data-scroll-block-end')).toBe('true')

    virtualizer!.scrollTop = 800
    virtualizer!.dispatchEvent(new Event('scroll'))
    await flushFrame(element)

    expect(frame?.getAttribute('data-scroll-block-start')).toBe('false')
    expect(frame?.getAttribute('data-scroll-block-end')).toBe('false')
  })

  it('toggles the group list top edge only when block-start affordance is enabled', async () => {
    mockVirtualizerMetrics({clientHeight: 400, scrollHeight: 1200})
    const group = createGroup('scroll-edge-start-parent', 'Scroll Edge Start Parent')
    const entries = Array.from({length: 30}, (_value, index) =>
      createEntry(group, `scroll-edge-start-entry-${index}`, `Scroll Edge Start Entry ${index}`),
    )
    group.entries.set(entries)
    window.passmanager = createPassmanagerRoot(group, [group])

    const element = document.createElement(
      'test-pm-group-block-start-scroll-edge',
    ) as TestPMGroupBlockStartScrollEdge
    document.body.appendChild(element)
    await flushFrame(element)

    const frame = element.shadowRoot?.querySelector<HTMLElement>('.pm-group-scroll-edge')
    const virtualizer = element.shadowRoot?.querySelector<HTMLElement>('lit-virtualizer')
    expect(frame).not.toBeNull()
    expect(virtualizer).not.toBeNull()
    expect(frame?.getAttribute('data-scroll-block-start')).toBe('false')
    expect(frame?.getAttribute('data-scroll-block-end')).toBe('true')

    virtualizer!.scrollTop = 20
    virtualizer!.dispatchEvent(new Event('scroll'))
    await flushFrame(element)

    expect(frame?.getAttribute('data-scroll-block-start')).toBe('true')
    expect(frame?.getAttribute('data-scroll-block-end')).toBe('true')

    virtualizer!.scrollTop = 800
    virtualizer!.dispatchEvent(new Event('scroll'))
    await flushFrame(element)

    expect(frame?.getAttribute('data-scroll-block-start')).toBe('true')
    expect(frame?.getAttribute('data-scroll-block-end')).toBe('false')
  })
})
