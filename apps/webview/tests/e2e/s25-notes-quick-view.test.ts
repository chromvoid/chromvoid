import {expect, test} from 'vitest'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined

  interface Window {
    __markdownImagePickerClicks?: number
  }
}

const BASE_URL = 'http://localhost:4400/index.html?layout=desktop'

type PersistedNode = {
  id: number
  type: number
  name: string
  size: number
  modtime: number
  parentId: number | null
  children: number[]
  mimeType?: string
  sourceRevision?: number
}

type NotesFixture = {
  rootNote: PersistedNode
  projectsDir: PersistedNode
  nestedNote: PersistedNode
  mimeOnlyNote: PersistedNode
  textFile: PersistedNode
  imageFile: PersistedNode
  hiddenFile: PersistedNode
  shardNote: PersistedNode
}

type MockStateSnapshot = {
  nodes: Array<[number, PersistedNode]>
  files: Array<[number, string]>
}

type MockStatePayload = {
  version: number
  nextId: number
  nodes: Array<[number, PersistedNode]>
  files: Array<[number, string]>
  secrets: unknown[]
  otpSecrets: unknown[]
}

function getPage(): import('playwright').Page | undefined {
  return globalThis.__E2E_PAGE__
}

function encodeText(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

async function writeMockState(state: MockStatePayload): Promise<void> {
  const response = await fetch('http://localhost:4400/api/mock-state', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(state),
  })
  if (!response.ok) {
    throw new Error(`mock state write failed: ${response.status}`)
  }
}

async function seedNotesFixture(): Promise<NotesFixture> {
  const now = Date.now()
  const suffix = `${now}-${Math.random().toString(36).slice(2, 8)}`
  const rootNote: PersistedNode = {
    id: 1,
    type: 1,
    name: `S25 Root ${suffix}.md`,
    size: 17,
    modtime: now,
    parentId: 0,
    children: [],
    mimeType: 'text/markdown',
    sourceRevision: 1,
  }
  const projectsDir: PersistedNode = {
    id: 2,
    type: 0,
    name: `S25 Projects ${suffix}`,
    size: 0,
    modtime: now,
    parentId: 0,
    children: [3, 4, 5],
  }
  const nestedNote: PersistedNode = {
    id: 3,
    type: 1,
    name: `Roadmap ${suffix}.markdown`,
    size: 20,
    modtime: now,
    parentId: 2,
    children: [],
    sourceRevision: 2,
  }
  const textFile: PersistedNode = {
    id: 4,
    type: 1,
    name: `Plain ${suffix}.txt`,
    size: 11,
    modtime: now,
    parentId: 2,
    children: [],
    mimeType: 'text/plain',
  }
  const mimeOnlyNote: PersistedNode = {
    id: 5,
    type: 1,
    name: `MimeOnly ${suffix}`,
    size: 13,
    modtime: now,
    parentId: 2,
    children: [],
    mimeType: 'text/markdown',
    sourceRevision: 3,
  }
  const imageFile: PersistedNode = {
    id: 6,
    type: 1,
    name: `Photo ${suffix}.png`,
    size: 9,
    modtime: now,
    parentId: 0,
    children: [],
    mimeType: 'image/png',
  }
  const hiddenFile: PersistedNode = {
    id: 7,
    type: 1,
    name: `.Hidden ${suffix}.md`,
    size: 8,
    modtime: now,
    parentId: 0,
    children: [],
    mimeType: 'text/markdown',
  }
  const walletDir: PersistedNode = {
    id: 8,
    type: 0,
    name: '.wallet',
    size: 0,
    modtime: now,
    parentId: 0,
    children: [9],
  }
  const shardNote: PersistedNode = {
    id: 9,
    type: 1,
    name: `Shard ${suffix}.md`,
    size: 10,
    modtime: now,
    parentId: 8,
    children: [],
    mimeType: 'text/markdown',
  }
  const root: PersistedNode = {
    id: 0,
    type: 0,
    name: '/',
    size: 0,
    modtime: now,
    parentId: null,
    children: [1, 2, 6, 7, 8],
  }

  const state = {
    version: 1,
    nextId: 10,
    nodes: [root, rootNote, projectsDir, nestedNote, textFile, mimeOnlyNote, imageFile, hiddenFile, walletDir, shardNote].map(
      (node) => [node.id, node],
    ),
    files: [
      [rootNote.id, encodeText(`# ${rootNote.name}`)],
      [nestedNote.id, encodeText(`# ${nestedNote.name}`)],
      [mimeOnlyNote.id, encodeText(`# ${mimeOnlyNote.name}`)],
      [textFile.id, encodeText('plain text')],
      [hiddenFile.id, encodeText('hidden')],
      [shardNote.id, encodeText('shard')],
    ],
    secrets: [],
    otpSecrets: [],
  }

  const response = await fetch('http://localhost:4400/api/mock-state', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(state),
  })
  if (!response.ok) {
    throw new Error(`mock state write failed: ${response.status}`)
  }

  return {rootNote, projectsDir, nestedNote, mimeOnlyNote, textFile, imageFile, hiddenFile, shardNote}
}

async function seedEmptyNotesFixture(): Promise<void> {
  const now = Date.now()
  const root: PersistedNode = {
    id: 0,
    type: 0,
    name: '/',
    size: 0,
    modtime: now,
    parentId: null,
    children: [],
  }

  await writeMockState({
    version: 1,
    nextId: 1,
    nodes: [[root.id, root]],
    files: [],
    secrets: [],
    otpSecrets: [],
  })
}

async function seedLongNotesFixture(count = 28): Promise<void> {
  const now = Date.now()
  const suffix = `${now}-${Math.random().toString(36).slice(2, 8)}`
  const notes = Array.from({length: count}, (_, index): PersistedNode => {
    const id = index + 1
    return {
      id,
      type: 1,
      name: `S25 Long ${String(id).padStart(2, '0')} ${suffix}.md`,
      size: 24,
      modtime: now + id,
      parentId: 0,
      children: [],
      mimeType: 'text/markdown',
      sourceRevision: id,
    }
  })
  const root: PersistedNode = {
    id: 0,
    type: 0,
    name: '/',
    size: 0,
    modtime: now,
    parentId: null,
    children: notes.map((node) => node.id),
  }

  await writeMockState({
    version: 1,
    nextId: count + 1,
    nodes: [root, ...notes].map((node): [number, PersistedNode] => [node.id, node]),
    files: notes.map((node) => [node.id, encodeText(`# ${node.name}`)]),
    secrets: [],
    otpSecrets: [],
  })
}

async function readMockState(): Promise<MockStateSnapshot> {
  const response = await fetch('http://localhost:4400/api/mock-state')
  if (!response.ok) {
    throw new Error(`mock state read failed: ${response.status}`)
  }

  return (await response.json()) as MockStateSnapshot
}

async function waitForPersistedNote(
  fileId: number,
  expectedName: string,
  expectedContent: string,
): Promise<MockStateSnapshot> {
  const startedAt = Date.now()
  let lastName = ''
  let lastContent = ''

  while (Date.now() - startedAt < 5_000) {
    const state = await readMockState()
    const nodes = new Map(state.nodes)
    const files = new Map(state.files)
    lastName = nodes.get(fileId)?.name ?? ''
    lastContent = Buffer.from(files.get(fileId) ?? '', 'base64').toString('utf8')
    if (lastName === expectedName && lastContent === expectedContent) {
      return state
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error(`note ${fileId} was not persisted as ${expectedName}; last=${lastName}:${lastContent}`)
}

type NotesOpenOptions = {
  expectedRows?: number
  layout?: 'desktop' | 'mobile'
  viewport?: {width: number; height: number}
}

async function openNotes(page: import('playwright').Page, options: NotesOpenOptions = {}): Promise<void> {
  if (options.viewport) {
    await page.setViewportSize(options.viewport)
  }
  const url = new URL(BASE_URL)
  url.searchParams.set('surface', 'notes')
  url.searchParams.set('layout', options.layout ?? 'desktop')
  await page.goto(url.toString(), {waitUntil: 'domcontentloaded'})
  await waitForNotesRows(page, options.expectedRows ?? 3)
}

async function waitForNotesRows(page: import('playwright').Page, expectedCount: number): Promise<void> {
  await page.waitForFunction(
    (count) => {
      const host = deepFind(document, 'notes-quick-view, notes-quick-view-mobile')
      return Boolean(host?.shadowRoot) && (host?.shadowRoot?.querySelectorAll('.row').length ?? 0) === count

      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    expectedCount,
    {timeout: 15_000},
  )
}

async function notesSnapshot(page: import('playwright').Page) {
  return page.evaluate(() => {
    const host = deepFind(document, 'notes-quick-view, notes-quick-view-mobile') as HTMLElement | null
    const root = host?.shadowRoot
    const rows = Array.from(root?.querySelectorAll('.row') ?? []).map((row) => ({
      rowId: row.getAttribute('data-row-id') ?? '',
      title: row.querySelector('.row__title')?.textContent?.trim() ?? '',
      text: row.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    }))

    return {
      url: window.location.href,
      rows,
      text: root?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    }

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

async function notesVerticalOverflowSnapshot(page: import('playwright').Page) {
  return page.evaluate(() => {
    const host = deepFind(document, 'notes-quick-view, notes-quick-view-mobile') as HTMLElement | null
    const root = host?.shadowRoot
    const shellLayout = deepFind(document, 'file-app-shell-mobile-layout') as HTMLElement | null
    const shellContent = shellLayout?.shadowRoot?.querySelector('.content') as HTMLElement | null
    const routeContent = deepFind(document, '.route-content[data-route="dashboard"]') as HTMLElement | null
    const quickViewContent = root?.querySelector('.quick-view__content') as HTMLElement | null

    const metricsFor = (element: HTMLElement | null) => {
      if (!element) return null
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollDelta: element.scrollHeight - element.clientHeight,
        overflowY: style.overflowY,
        rect: {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
        },
        paddingBlockStart: parseFloat(style.paddingBlockStart || '0'),
        paddingBlockEnd: parseFloat(style.paddingBlockEnd || '0'),
      }
    }

    return {
      contentScrollMode: shellLayout?.getAttribute('content-scroll-mode') ?? null,
      hostName: host?.localName ?? null,
      rowCount: root?.querySelectorAll('.row').length ?? null,
      host: metricsFor(host),
      quickViewContent: metricsFor(quickViewContent),
      routeContent: metricsFor(routeContent),
      shellContent: metricsFor(shellContent),
    }

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

function expectNoMobileNotesVerticalOverflow(
  snapshot: Awaited<ReturnType<typeof notesVerticalOverflowSnapshot>>,
): void {
  expect(snapshot.hostName).toBe('notes-quick-view-mobile')
  expect(snapshot.contentScrollMode).toBe('surface')
  expect(snapshot.shellContent?.scrollDelta).toBeLessThanOrEqual(1)
  expect(snapshot.routeContent?.scrollDelta).toBeLessThanOrEqual(1)
  expect(snapshot.host?.scrollDelta).toBeLessThanOrEqual(1)
  expect(snapshot.quickViewContent?.scrollDelta).toBeLessThanOrEqual(1)
  expectHostFillsShellContent(snapshot)
}

function expectHostFillsShellContent(
  snapshot: Awaited<ReturnType<typeof notesVerticalOverflowSnapshot>>,
): void {
  const hostRect = snapshot.host?.rect
  const shellContent = snapshot.shellContent

  expect(hostRect).toBeDefined()
  expect(shellContent).not.toBeNull()
  if (!hostRect || !shellContent) return

  const availableHeight = shellContent.rect.height - shellContent.paddingBlockStart - shellContent.paddingBlockEnd
  const availableBottom = shellContent.rect.bottom - shellContent.paddingBlockEnd

  expect(Math.abs(hostRect.height - availableHeight)).toBeLessThanOrEqual(2)
  expect(Math.abs(hostRect.bottom - availableBottom)).toBeLessThanOrEqual(2)
}

async function notesViewSwitchSnapshot(page: import('playwright').Page) {
  return page.evaluate(() => {
    const host = deepFind(document, 'notes-quick-view, notes-quick-view-mobile') as HTMLElement | null
    const root = host?.shadowRoot
    const switchEl = root?.querySelector('.view-switch') as HTMLElement | null
    const buttons = Array.from(root?.querySelectorAll('.view-switch__button') ?? []) as HTMLElement[]
    const switchStyles = switchEl ? getComputedStyle(switchEl) : null
    const switchRect = switchEl?.getBoundingClientRect() ?? null
    const contentRight =
      switchRect && switchStyles
        ? switchRect.right -
          parseFloat(switchStyles.borderRightWidth || '0') -
          parseFloat(switchStyles.paddingRight || '0')
        : null

    const buttonRects = buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      return {
        viewMode: button.getAttribute('data-view-mode') ?? '',
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }
    })

    const flatRect = buttonRects.find((rect) => rect.viewMode === 'flat') ?? null
    const hierarchyRect = buttonRects.find((rect) => rect.viewMode === 'hierarchy') ?? null
    const hierarchyRightProbeY = hierarchyRect ? hierarchyRect.top + hierarchyRect.height / 2 : null

    return {
      buttonCount: buttons.length,
      buttons: buttonRects,
      hasHorizontalOverflow: host ? host.scrollWidth > host.clientWidth : null,
      rightEdgeDeadSpace:
        contentRight !== null && hierarchyRect ? contentRight - hierarchyRect.right : null,
      points: {
        flatCenter: flatRect
          ? {x: flatRect.left + flatRect.width / 2, y: flatRect.top + flatRect.height / 2}
          : null,
        hierarchyCenter: hierarchyRect
          ? {x: hierarchyRect.left + hierarchyRect.width / 2, y: hierarchyRect.top + hierarchyRect.height / 2}
          : null,
        hierarchyRightEdge:
          contentRight !== null && hierarchyRightProbeY !== null
            ? {x: contentRight - 1, y: hierarchyRightProbeY}
            : null,
      },
    }

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

async function clickNotesViewSwitchPoint(
  page: import('playwright').Page,
  point: {x: number; y: number},
  expectedMode: 'flat' | 'hierarchy',
): Promise<void> {
  const dispatchedMode = await page.evaluate(({x, y}) => {
    const host = deepFind(document, 'notes-quick-view, notes-quick-view-mobile') as HTMLElement | null
    const buttons = Array.from(host?.shadowRoot?.querySelectorAll('.view-switch__button') ?? []) as HTMLElement[]
    const button = buttons.find((candidate) => {
      const rect = candidate.getBoundingClientRect()
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    })
    button?.dispatchEvent(
      new MouseEvent('click', {bubbles: true, composed: true, clientX: x, clientY: y}),
    )
    return button?.getAttribute('data-view-mode') ?? null

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  }, point)
  expect(dispatchedMode).toBe(expectedMode)
  await page.waitForFunction(
    (mode) => {
      const host = deepFind(document, 'notes-quick-view, notes-quick-view-mobile') as HTMLElement | null
      const button = host?.shadowRoot?.querySelector(
        '.view-switch__button[aria-pressed="true"]',
      ) as HTMLElement | null
      return button?.getAttribute('data-view-mode') === mode

      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    expectedMode,
    {timeout: 2_000},
  )
}

async function expectNotesViewSwitchGeometry(page: import('playwright').Page): Promise<void> {
  const snapshot = await notesViewSwitchSnapshot(page)
  const flat = snapshot.buttons.find((button) => button.viewMode === 'flat')
  const hierarchy = snapshot.buttons.find((button) => button.viewMode === 'hierarchy')

  expect(snapshot.buttonCount).toBe(2)
  expect(flat).toBeTruthy()
  expect(hierarchy).toBeTruthy()
  if (!flat || !hierarchy) {
    throw new Error('Notes view switch buttons not found')
  }

  expect(Math.abs(flat.width - hierarchy.width)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(flat.height - hierarchy.height)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(snapshot.rightEdgeDeadSpace ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(0.75)
  expect(snapshot.hasHorizontalOverflow).toBe(false)

  if (!snapshot.points.flatCenter || !snapshot.points.hierarchyCenter || !snapshot.points.hierarchyRightEdge) {
    throw new Error('Notes view switch hit-test points not found')
  }

  await clickNotesViewSwitchPoint(page, snapshot.points.flatCenter, 'flat')
  await clickNotesViewSwitchPoint(page, snapshot.points.hierarchyCenter, 'hierarchy')
  await clickNotesViewSwitchPoint(page, snapshot.points.flatCenter, 'flat')
  await clickNotesViewSwitchPoint(page, snapshot.points.hierarchyRightEdge, 'hierarchy')
}

async function setNotesSearch(page: import('playwright').Page, value: string): Promise<void> {
  await page.evaluate((nextValue) => {
    const host = deepFind(document, 'notes-quick-view, notes-quick-view-mobile') as HTMLElement | null
    const input = host?.shadowRoot?.querySelector('.search') as HTMLInputElement | null
    if (!input) throw new Error('Notes Quick View search input not found')
    input.value = nextValue
    input.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true, data: nextValue}))

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  }, value)
}

async function setNotesViewMode(page: import('playwright').Page, viewMode: 'flat' | 'hierarchy'): Promise<void> {
  await page.evaluate((nextViewMode) => {
    const host = deepFind(document, 'notes-quick-view, notes-quick-view-mobile') as HTMLElement | null
    const button = host?.shadowRoot?.querySelector(
      `[data-view-mode="${nextViewMode}"]`,
    ) as HTMLButtonElement | null
    if (!button) throw new Error(`Notes Quick View ${nextViewMode} button not found`)
    button.click()

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  }, viewMode)
}

async function notesHierarchySnapshot(page: import('playwright').Page, folderPath: string) {
  return page.evaluate((path) => {
    const host = deepFind(document, 'notes-quick-view, notes-quick-view-mobile') as HTMLElement | null
    const root = host?.shadowRoot
    const folders = Array.from(root?.querySelectorAll('.tree-folder') ?? [])
    const folder = folders.find((candidate) => candidate.getAttribute('data-folder-path') === path)

    return {
      hasTree: Boolean(root?.querySelector('.tree')),
      folderText: folder?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      nestedRows: Array.from(folder?.querySelectorAll('.row') ?? []).map(
        (row) => row.querySelector('.row__title')?.textContent?.trim() ?? '',
      ),
    }

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  }, folderPath)
}

async function openNoteFromQuickView(page: import('playwright').Page, title: string): Promise<void> {
  await page.evaluate((noteTitle) => {
    const host = deepFind(document, 'notes-quick-view, notes-quick-view-mobile') as HTMLElement | null
    const row = Array.from(host?.shadowRoot?.querySelectorAll('.row') ?? []).find((candidate) =>
      candidate.querySelector('.row__title')?.textContent?.includes(noteTitle),
    )
    const openTarget = (row?.querySelector('.open-note') as HTMLElement | null) ?? (row as HTMLElement | null)
    if (!openTarget) throw new Error(`open-note target not found for ${noteTitle}`)
    openTarget.click()

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  }, title)
}

async function waitForMarkdownDocument(page: import('playwright').Page, fileId: number, fileName: string): Promise<void> {
  await page.waitForFunction(
    ({id, name}) => {
      const url = new URL(window.location.href)
      if (url.searchParams.get('surface') !== 'files') return false
      if (url.searchParams.get('document') !== 'markdown') return false
      if (url.searchParams.get('file') !== String(id)) return false
      const documentPage = deepFind(document, 'markdown-document-page') as HTMLElement | null
      return Boolean(documentPage?.shadowRoot?.textContent?.includes(name))

      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    {id: fileId, name: fileName},
    {timeout: 15_000},
  )
}

async function openMarkdownEditor(page: import('playwright').Page): Promise<void> {
  return page.evaluate(() => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const root = host?.shadowRoot
    const editButton = Array.from(root?.querySelectorAll('.mode-button') ?? []).find((button) =>
      button.textContent?.includes('Edit'),
    ) as HTMLButtonElement | undefined
    if (!editButton) throw new Error('Markdown Edit mode button not found')
    editButton.click()

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

async function markdownEditorSnapshot(page: import('playwright').Page) {
  return page.evaluate(() => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const root = host?.shadowRoot
    const editor = root?.querySelector('.source-editor') as HTMLTextAreaElement | null
    const editButton = Array.from(root?.querySelectorAll('.mode-button') ?? []).find((button) =>
      button.textContent?.includes('Edit'),
    )

    return {
      hasEditor: Boolean(editor),
      activeEditor: Boolean(editor && root?.activeElement === editor),
      selectionStart: editor?.selectionStart ?? null,
      value: editor?.value ?? '',
      editPressed: editButton?.getAttribute('aria-pressed') ?? null,
    }

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

async function markdownEditorKeyboardClearanceSnapshot(
  page: import('playwright').Page,
  keyboardInset: number,
) {
  return page.evaluate(async (inset) => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const root = host?.shadowRoot
    const content = root?.querySelector('.content') as HTMLElement | null
    const editor = root?.querySelector('.source-editor') as HTMLTextAreaElement | null
    if (!host || !content || !editor) {
      return null
    }

    const rootElement = document.documentElement
    rootElement.style.setProperty('--visual-viewport-bottom-inset', `${inset}px`)
    rootElement.setAttribute('data-mobile-keyboard-expanded', '')

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    editor.scrollTop = editor.scrollHeight
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const editorRect = editor.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()
    const editorStyles = getComputedStyle(editor)
    const contentStyles = getComputedStyle(content)
    const maxScroll = editor.scrollHeight - editor.clientHeight

    return {
      contentBottom: contentRect.bottom,
      contentPaddingBlockEnd: contentStyles.paddingBlockEnd,
      editorBottom: editorRect.bottom,
      editorLineHeight: editorStyles.lineHeight,
      editorPaddingBlockEnd: editorStyles.paddingBlockEnd,
      editorPaddingBlockStart: editorStyles.paddingBlockStart,
      editorScrollPaddingBlockEnd: editorStyles.scrollPaddingBlockEnd,
      keyboardTop: window.innerHeight - inset,
      maxScroll,
      scrollAtBottom: Math.abs(editor.scrollTop - maxScroll) <= 1,
      scrollOverflowY: editorStyles.overflowY,
    }

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  }, keyboardInset)
}

async function markdownPreviewFabClearanceSnapshot(page: import('playwright').Page) {
  return page.evaluate(async () => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const root = host?.shadowRoot
    const preview = root?.querySelector('.rendered-markdown') as HTMLElement | null
    const fab = root?.querySelector('.fab-edit') as HTMLElement | null
    if (!host || !preview || !fab) {
      return null
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    preview.scrollTop = preview.scrollHeight
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const fabRect = fab.getBoundingClientRect()
    const previewStyles = getComputedStyle(preview)
    const fabStyles = getComputedStyle(fab)
    const maxScroll = preview.scrollHeight - preview.clientHeight
    const fabVisible =
      fabStyles.display !== 'none' &&
      fabStyles.visibility !== 'hidden' &&
      fab.getClientRects().length > 0
    const lastBlock =
      Array.from(preview.children)
        .filter((child): child is HTMLElement => child instanceof HTMLElement)
        .at(-1) ?? null
    const lastRect = lastBlock?.getBoundingClientRect() ?? null
    const overlapsLastBlock = Boolean(
      lastRect &&
        lastRect.left < fabRect.right &&
        lastRect.right > fabRect.left &&
        lastRect.top < fabRect.bottom &&
        lastRect.bottom > fabRect.top,
    )

    return {
      fabBackgroundColor: fabStyles.backgroundColor,
      fabBackgroundImage: fabStyles.backgroundImage,
      fabHeight: fabRect.height,
      fabTop: fabRect.top,
      fabVisible,
      lastBlockBottom: lastRect?.bottom ?? null,
      overlapsLastBlock,
      previewPaddingBlockEnd: previewStyles.paddingBlockEnd,
      previewScrollPaddingBlockEnd: previewStyles.scrollPaddingBlockEnd,
      scrollAtBottom: Math.abs(preview.scrollTop - maxScroll) <= 1,
      scrollOverflowY: previewStyles.overflowY,
    }

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

async function setMarkdownEditorSource(page: import('playwright').Page, value: string): Promise<void> {
  await page.evaluate((nextValue) => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const editor = host?.shadowRoot?.querySelector('.source-editor') as HTMLTextAreaElement | null
    if (!editor) throw new Error('Markdown source editor not found')
    editor.value = nextValue
    editor.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true, data: nextValue}))

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  }, value)
}

async function setMarkdownEditorSelectionToEnd(page: import('playwright').Page): Promise<void> {
  await page.evaluate(() => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const editor = host?.shadowRoot?.querySelector('.source-editor') as HTMLTextAreaElement | null
    if (!editor) throw new Error('Markdown source editor not found')
    const end = editor.value.length
    editor.focus()
    editor.setSelectionRange(end, end)
    editor.dispatchEvent(new Event('select', {bubbles: true, composed: true}))

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

async function markdownImageInsertControlsSnapshot(page: import('playwright').Page) {
  return page.evaluate(() => {
    const preview = deepFind(document, 'markdown-preview') as HTMLElement | null
    const previewRoot = preview?.shadowRoot
    const input = previewRoot?.querySelector('.image-input') as HTMLInputElement | null
    const editorButton = previewRoot?.querySelector('.insert-image-action') as HTMLElement | null
    const editorButtonStyle = editorButton ? getComputedStyle(editorButton) : null
    const toolbar = deepFind(document, 'mobile-top-toolbar') as HTMLElement | null
    const topbarButton = toolbar?.shadowRoot?.querySelector(
      '[data-action="markdown-insert-image"]',
    ) as HTMLElement | null
    const topbarButtonStyle = topbarButton ? getComputedStyle(topbarButton) : null

    return {
      inputType: input?.type ?? null,
      inputAccept: input?.accept ?? null,
      inputMultiple: input?.multiple ?? null,
      editorButtonVisible: Boolean(
        editorButton &&
          editorButtonStyle?.display !== 'none' &&
          editorButtonStyle?.visibility !== 'hidden' &&
          editorButton.getClientRects().length > 0,
      ),
      topbarButtonVisible: Boolean(
        topbarButton &&
          topbarButtonStyle?.display !== 'none' &&
          topbarButtonStyle?.visibility !== 'hidden' &&
          topbarButton.getClientRects().length > 0,
      ),
    }

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

async function clickMarkdownInsertImageTopbar(page: import('playwright').Page): Promise<number> {
  return page.evaluate(() => {
    const preview = deepFind(document, 'markdown-preview') as HTMLElement | null
    const input = preview?.shadowRoot?.querySelector('.image-input') as HTMLInputElement | null
    const toolbar = deepFind(document, 'mobile-top-toolbar') as HTMLElement | null
    const button = toolbar?.shadowRoot?.querySelector(
      '[data-action="markdown-insert-image"]',
    ) as HTMLElement | null
    if (!input || !button) throw new Error('Markdown image insert controls not found')

    Object.defineProperty(window, '__markdownImagePickerClicks', {
      configurable: true,
      writable: true,
      value: 0,
    })
    Object.defineProperty(input, 'click', {
      configurable: true,
      value: () => {
        window.__markdownImagePickerClicks = (window.__markdownImagePickerClicks ?? 0) + 1
      },
    })
    button.click()
    return window.__markdownImagePickerClicks ?? 0

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

async function chooseMarkdownImageFile(page: import('playwright').Page): Promise<void> {
  await page.locator('markdown-preview .image-input').setInputFiles({
    name: 'e2e-inline.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    ),
  })
}

async function waitForMarkdownEditorValue(
  page: import('playwright').Page,
  expectedText: string,
): Promise<void> {
  await page.waitForFunction(
    (text) => {
      const host = deepFind(document, 'markdown-preview') as HTMLElement | null
      const editor = host?.shadowRoot?.querySelector('.source-editor') as HTMLTextAreaElement | null
      return editor?.value.includes(text) ?? false

      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    expectedText,
    {timeout: 5_000},
  )
}

async function waitForInsertedMarkdownImageLink(
  page: import('playwright').Page,
): Promise<{markdown: string; path: string}> {
  await page.waitForFunction(
    () => {
      const host = deepFind(document, 'markdown-preview') as HTMLElement | null
      const editor = host?.shadowRoot?.querySelector('.source-editor') as HTMLTextAreaElement | null
      return /!\[e2e inline\]\((\/attachments\/e2e-inline-[^)]+\.png)\)/u.test(editor?.value ?? '')

      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    undefined,
    {timeout: 5_000},
  )

  return page.evaluate(() => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const editor = host?.shadowRoot?.querySelector('.source-editor') as HTMLTextAreaElement | null
    const match = /(!\[e2e inline\]\((\/attachments\/e2e-inline-[^)]+\.png)\))/u.exec(
      editor?.value ?? '',
    )
    if (!match?.[1] || !match[2]) {
      throw new Error('Inserted Markdown image link not found')
    }
    return {markdown: match[1], path: match[2]}

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

async function showMarkdownPreview(page: import('playwright').Page): Promise<void> {
  await page.evaluate(() => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const root = host?.shadowRoot
    const previewButton = Array.from(root?.querySelectorAll('.mode-button') ?? []).find((button) =>
      button.textContent?.includes('Preview'),
    ) as HTMLElement | undefined
    if (!previewButton) throw new Error('Markdown Preview mode button not found')
    previewButton.click()

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

async function waitForResolvedMarkdownImage(
  page: import('playwright').Page,
  expectedRef: string,
): Promise<void> {
  await page.waitForFunction(
    (ref) => {
      const host = deepFind(document, 'markdown-preview') as HTMLElement | null
      const root = host?.shadowRoot
      return Array.from(root?.querySelectorAll('.cv-markdown-image') ?? []).some((element) => {
        return (
          element instanceof HTMLImageElement &&
          element.classList.contains('cv-markdown-image--loaded') &&
          element.dataset['cvImageRef'] === ref &&
          Boolean(element.src)
        )
      })

      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    expectedRef,
    {timeout: 5_000},
  )
}

async function renameOpenMarkdownTitle(page: import('playwright').Page, value: string): Promise<void> {
  await page.evaluate(() => {
    const documentPage = deepFind(document, 'markdown-document-page') as HTMLElement | null
    const root = documentPage?.shadowRoot
    const titleButton = root?.querySelector('.title-button') as HTMLButtonElement | null
    if (!titleButton) throw new Error('Markdown title rename button not found')
    titleButton.click()

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })

  await page.waitForFunction(
    () => {
      const documentPage = deepFind(document, 'markdown-document-page') as HTMLElement | null
      return Boolean(documentPage?.shadowRoot?.querySelector('.title-input'))

      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    undefined,
    {timeout: 5_000},
  )

  await page.evaluate((nextValue) => {
    const documentPage = deepFind(document, 'markdown-document-page') as HTMLElement | null
    const root = documentPage?.shadowRoot
    const input = root?.querySelector('.title-input') as HTMLInputElement | null
    const form = root?.querySelector('.title-form') as HTMLFormElement | null
    if (!input || !form) throw new Error('Markdown title rename input not found')

    input.value = nextValue
    input.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true, data: nextValue}))
    form.dispatchEvent(new SubmitEvent('submit', {bubbles: true, cancelable: true, composed: true}))

    function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  }, value)
}

test('S25: mobile Notes surface keeps scroll on the content list only when needed', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }

  const mobileViewport = {width: 390, height: 844}

  await seedEmptyNotesFixture()
  await openNotes(page, {expectedRows: 0, layout: 'mobile', viewport: mobileViewport})
  const emptySnapshot = await notesVerticalOverflowSnapshot(page)
  expect(emptySnapshot.rowCount).toBe(0)
  expectNoMobileNotesVerticalOverflow(emptySnapshot)

  await seedNotesFixture()
  await openNotes(page, {layout: 'mobile', viewport: mobileViewport})
  const shortListSnapshot = await notesVerticalOverflowSnapshot(page)
  expect(shortListSnapshot.rowCount).toBe(3)
  expectNoMobileNotesVerticalOverflow(shortListSnapshot)

  await seedLongNotesFixture()
  await openNotes(page, {expectedRows: 28, layout: 'mobile', viewport: mobileViewport})
  const longListSnapshot = await notesVerticalOverflowSnapshot(page)
  expect(longListSnapshot.rowCount).toBe(28)
  expect(longListSnapshot.hostName).toBe('notes-quick-view-mobile')
  expect(longListSnapshot.contentScrollMode).toBe('surface')
  expect(longListSnapshot.shellContent?.scrollDelta).toBeLessThanOrEqual(1)
  expect(longListSnapshot.routeContent?.scrollDelta).toBeLessThanOrEqual(1)
  expect(longListSnapshot.host?.scrollDelta).toBeLessThanOrEqual(1)
  expectHostFillsShellContent(longListSnapshot)
  expect(longListSnapshot.quickViewContent?.overflowY).toBe('auto')
  expect(longListSnapshot.quickViewContent?.scrollDelta).toBeGreaterThan(1)
})

test('S25: mobile Markdown editor reserves keyboard clearance while scrolling to the last line', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }

  const fixture = await seedNotesFixture()
  await openNotes(page, {layout: 'mobile', viewport: {width: 390, height: 844}})
  await openNoteFromQuickView(page, fixture.rootNote.name)
  await waitForMarkdownDocument(page, fixture.rootNote.id, fixture.rootNote.name)
  await openMarkdownEditor(page)

  const longMarkdown = Array.from(
    {length: 80},
    (_, index) => `Line ${String(index + 1).padStart(2, '0')} ${fixture.rootNote.name}`,
  ).join('\n')
  await setMarkdownEditorSource(page, longMarkdown)
  await page.waitForFunction(
    (expectedLastLine) => {
      const host = deepFind(document, 'markdown-preview') as HTMLElement | null
      const editor = host?.shadowRoot?.querySelector('.source-editor') as HTMLTextAreaElement | null
      return editor?.value.includes(expectedLastLine) ?? false

      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    `Line 80 ${fixture.rootNote.name}`,
    {timeout: 5_000},
  )

  const snapshot = await markdownEditorKeyboardClearanceSnapshot(page, 240)

  expect(snapshot).not.toBeNull()
  expect(snapshot!.scrollOverflowY).toBe('auto')
  expect(snapshot!.contentPaddingBlockEnd).toBe('240px')
  expect(Number.parseFloat(snapshot!.editorScrollPaddingBlockEnd)).toBeGreaterThanOrEqual(240)
  expect(Number.parseFloat(snapshot!.editorPaddingBlockEnd)).toBeGreaterThanOrEqual(
    Number.parseFloat(snapshot!.editorPaddingBlockStart) + Number.parseFloat(snapshot!.editorLineHeight) - 1,
  )
  expect(snapshot!.editorBottom).toBeLessThanOrEqual(snapshot!.keyboardTop + 1)
  expect(snapshot!.maxScroll).toBeGreaterThan(0)
  expect(snapshot!.scrollAtBottom).toBe(true)
})

test('S25: mobile Markdown preview keeps the edit button opaque and clear of bottom content', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }

  const fixture = await seedNotesFixture()
  await openNotes(page, {layout: 'mobile', viewport: {width: 390, height: 844}})
  await openNoteFromQuickView(page, fixture.rootNote.name)
  await waitForMarkdownDocument(page, fixture.rootNote.id, fixture.rootNote.name)
  await openMarkdownEditor(page)

  const longMarkdown = Array.from(
    {length: 64},
    (_, index) => `Preview paragraph ${String(index + 1).padStart(2, '0')} ${fixture.rootNote.name}`,
  ).join('\n\n')
  await setMarkdownEditorSource(page, longMarkdown)
  await showMarkdownPreview(page)
  await page.waitForFunction(
    (expectedLastParagraph) => {
      const host = deepFind(document, 'markdown-preview') as HTMLElement | null
      const preview = host?.shadowRoot?.querySelector('.rendered-markdown') as HTMLElement | null
      return preview?.textContent?.includes(expectedLastParagraph) ?? false

      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    `Preview paragraph 64 ${fixture.rootNote.name}`,
    {timeout: 5_000},
  )

  const snapshot = await markdownPreviewFabClearanceSnapshot(page)

  expect(snapshot).not.toBeNull()
  expect(snapshot!.fabVisible).toBe(true)
  expect(snapshot!.fabBackgroundImage).toContain('linear-gradient')
  expect(snapshot!.fabBackgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(snapshot!.scrollOverflowY).toBe('auto')
  expect(Number.parseFloat(snapshot!.previewPaddingBlockEnd)).toBeGreaterThan(snapshot!.fabHeight)
  expect(Number.parseFloat(snapshot!.previewScrollPaddingBlockEnd)).toBeGreaterThanOrEqual(snapshot!.fabHeight)
  expect(snapshot!.lastBlockBottom).not.toBeNull()
  expect(snapshot!.lastBlockBottom!).toBeLessThanOrEqual(snapshot!.fabTop - 1)
  expect(snapshot!.overlapsLastBlock).toBe(false)
  expect(snapshot!.scrollAtBottom).toBe(true)
})

test('S25: mobile Markdown image insert controls open the picker and insert an uploaded image link', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }

  const fixture = await seedNotesFixture()
  await openNotes(page, {layout: 'mobile', viewport: {width: 390, height: 844}})
  await openNoteFromQuickView(page, fixture.rootNote.name)
  await waitForMarkdownDocument(page, fixture.rootNote.id, fixture.rootNote.name)
  await openMarkdownEditor(page)
  await waitForMarkdownEditorValue(page, fixture.rootNote.name)
  await setMarkdownEditorSelectionToEnd(page)

  const controls = await markdownImageInsertControlsSnapshot(page)
  expect(controls.topbarButtonVisible).toBe(true)
  expect(controls.editorButtonVisible).toBe(true)
  expect(controls.inputType).toBe('file')
  expect(controls.inputAccept).toBe('image/*')
  expect(controls.inputMultiple).toBe(true)

  expect(await clickMarkdownInsertImageTopbar(page)).toBe(1)
  await chooseMarkdownImageFile(page)

  const inserted = await waitForInsertedMarkdownImageLink(page)
  expect((await markdownEditorSnapshot(page)).value).toContain(`\n${inserted.markdown}`)

  await showMarkdownPreview(page)
  await waitForResolvedMarkdownImage(page, inserted.path)
})

test('S25: Notes Quick View view switch has matching visual and hitbox geometry', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }

  await seedNotesFixture()

  await openNotes(page)
  await expectNotesViewSwitchGeometry(page)

  await openNotes(page, {layout: 'mobile', viewport: {width: 430, height: 844}})
  await expectNotesViewSwitchGeometry(page)

  await page.setViewportSize({width: 390, height: 844})
  await page.waitForTimeout(50)
  await expectNotesViewSwitchGeometry(page)
})

test('S25: Notes Quick View lists Markdown, searches by name/path, opens editor, and returns on back', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }

  const fixture = await seedNotesFixture()

  await openNotes(page)

  const initial = await notesSnapshot(page)
  expect(initial.url).toContain('surface=notes')
  expect(initial.rows.map((row) => row.title).sort()).toEqual(
    [fixture.rootNote.name, fixture.nestedNote.name, fixture.mimeOnlyNote.name].sort(),
  )
  expect(initial.text).not.toContain(fixture.textFile.name)
  expect(initial.text).not.toContain(fixture.imageFile.name)
  expect(initial.text).not.toContain(fixture.hiddenFile.name)
  expect(initial.text).not.toContain(fixture.shardNote.name)

  await setNotesViewMode(page, 'hierarchy')
  await waitForNotesRows(page, 3)
  const hierarchy = await notesHierarchySnapshot(page, `/${fixture.projectsDir.name}`)
  expect(hierarchy.hasTree).toBe(true)
  expect(hierarchy.folderText).toContain(fixture.projectsDir.name)
  expect(hierarchy.nestedRows.sort()).toEqual([fixture.nestedNote.name, fixture.mimeOnlyNote.name].sort())

  await setNotesViewMode(page, 'flat')
  await waitForNotesRows(page, 3)

  await setNotesSearch(page, fixture.projectsDir.name)
  await waitForNotesRows(page, 2)
  expect((await notesSnapshot(page)).rows.map((row) => row.title).sort()).toEqual(
    [fixture.nestedNote.name, fixture.mimeOnlyNote.name].sort(),
  )

  await setNotesSearch(page, fixture.nestedNote.name)
  await waitForNotesRows(page, 1)
  expect((await notesSnapshot(page)).rows[0]?.title).toBe(fixture.nestedNote.name)

  await setNotesSearch(page, '')
  await waitForNotesRows(page, 3)

  await openNoteFromQuickView(page, fixture.nestedNote.name)
  await waitForMarkdownDocument(page, fixture.nestedNote.id, fixture.nestedNote.name)

  await openMarkdownEditor(page)
  await page.waitForFunction(
    () => {
      const host = deepFind(document, 'markdown-preview') as HTMLElement | null
      const root = host?.shadowRoot
      const editor = root?.querySelector('.source-editor') as HTMLTextAreaElement | null
      return Boolean(editor && root?.activeElement === editor)

      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    undefined,
    {timeout: 5_000},
  )
  const editor = await markdownEditorSnapshot(page)
  expect(editor.hasEditor).toBe(true)
  expect(editor.activeEditor).toBe(true)
  expect(editor.editPressed).toBe('true')
  expect(editor.value).toContain(fixture.nestedNote.name)

  const editorUrl = new URL(page.url())
  expect(editorUrl.searchParams.get('path')).toBe('/')

  const renamedName = fixture.nestedNote.name.replace('Roadmap', 'Renamed Roadmap')
  const editedMarkdown = `# Edited ${fixture.nestedNote.name}\n\nSaved before rename`
  await setMarkdownEditorSource(page, editedMarkdown)
  await renameOpenMarkdownTitle(page, renamedName)
  await waitForMarkdownDocument(page, fixture.nestedNote.id, renamedName)

  const renamedUrl = new URL(page.url())
  expect(renamedUrl.searchParams.get('surface')).toBe('files')
  expect(renamedUrl.searchParams.get('path')).toBe('/')
  expect(renamedUrl.searchParams.get('document')).toBe('markdown')
  expect(renamedUrl.searchParams.get('file')).toBe(String(fixture.nestedNote.id))

  const persistedState = await waitForPersistedNote(fixture.nestedNote.id, renamedName, editedMarkdown)
  const persistedNodes = new Map(persistedState.nodes)
  const persistedFiles = new Map(persistedState.files)
  expect(persistedNodes.get(fixture.nestedNote.id)?.name).toBe(renamedName)
  expect(Buffer.from(persistedFiles.get(fixture.nestedNote.id) ?? '', 'base64').toString('utf8')).toBe(
    editedMarkdown,
  )

  await page.goBack()
  await waitForNotesRows(page, 3)
  expect(new URL(page.url()).searchParams.get('surface')).toBe('notes')
  const returned = await notesSnapshot(page)
  expect(returned.rows.map((row) => row.title)).toContain(renamedName)
  expect(returned.rows.map((row) => row.title)).not.toContain(fixture.nestedNote.name)
})
