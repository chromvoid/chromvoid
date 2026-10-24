import {expect, test} from 'vitest'

import type {Page} from 'playwright'
declare global {
  var __E2E_PAGE__: Page | undefined

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

function getPage(): Page | undefined {
  return globalThis.__E2E_PAGE__
}

function encodeText(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

function visibleNoteTitle(name: string): string {
  return name.replace(/\.(?:md|markdown)$/i, '') || name
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
    nodes: [
      root,
      rootNote,
      projectsDir,
      nestedNote,
      textFile,
      mimeOnlyNote,
      imageFile,
      hiddenFile,
      walletDir,
      shardNote,
    ].map((node) => [node.id, node]),
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

async function seedTaskListNoteFixture(taskCount = 80): Promise<PersistedNode> {
  const now = Date.now()
  const suffix = `${now}-${Math.random().toString(36).slice(2, 8)}`
  const taskSource = Array.from(
    {length: taskCount},
    (_, index) => `- [ ] S25 task ${String(index + 1).padStart(2, '0')} ${suffix}`,
  ).join('\n')
  const taskNote: PersistedNode = {
    id: 1,
    type: 1,
    name: `S25 Tasks ${suffix}.md`,
    size: Buffer.byteLength(taskSource, 'utf8'),
    modtime: now,
    parentId: 0,
    children: [],
    mimeType: 'text/markdown',
    sourceRevision: 1,
  }
  const root: PersistedNode = {
    id: 0,
    type: 0,
    name: '/',
    size: 0,
    modtime: now,
    parentId: null,
    children: [taskNote.id],
  }

  await writeMockState({
    version: 1,
    nextId: 2,
    nodes: [root, taskNote].map((node): [number, PersistedNode] => [node.id, node]),
    files: [[taskNote.id, encodeText(taskSource)]],
    secrets: [],
    otpSecrets: [],
  })

  return taskNote
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

async function openNotes(page: Page, options: NotesOpenOptions = {}): Promise<void> {
  if (options.viewport) {
    await page.setViewportSize(options.viewport)
  }
  const url = new URL(BASE_URL)
  url.searchParams.set('surface', 'notes')
  url.searchParams.set('layout', options.layout ?? 'desktop')
  await page.goto(url.toString(), {waitUntil: 'domcontentloaded'})
  await waitForNotesRows(page, options.expectedRows ?? 3)
}

async function waitForNotesRows(page: Page, expectedCount: number): Promise<void> {
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

async function notesSnapshot(page: Page) {
  return page.evaluate(() => {
    const host = deepFind(document, 'notes-quick-view, notes-quick-view-mobile') as HTMLElement | null
    const root = host?.shadowRoot
    const rows = Array.from(root?.querySelectorAll('.row') ?? []).map((row) => ({
      rowId: row.getAttribute('data-row-id') ?? '',
      title: row.querySelector('.note-card__title')?.textContent?.trim() ?? '',
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

async function notesViewSwitchSnapshot(page: Page) {
  return page.evaluate(() => {
    const host = deepFind(document, 'notes-quick-view, notes-quick-view-mobile') as HTMLElement | null
    const header = deepFind(document, '[data-testid="workspace-header"]') as HTMLElement | null
    const root = header ?? host
    const switchEl = deepFind(root, '.view-switch') as HTMLElement | null
    const switchBase = switchEl?.shadowRoot?.querySelector('[part="base"]') as HTMLElement | null
    const switchRect = switchEl?.getBoundingClientRect() ?? null
    const switchBaseRect = switchBase?.getBoundingClientRect() ?? null
    const buttons = deepFindAll(root, '.view-switch__button') as HTMLElement[]
    const contentRight = switchBase?.getBoundingClientRect().right ?? null

    const buttonRects = buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      const icon = button.querySelector('.view-switch__icon') as HTMLElement | null
      const iconRect = icon?.getBoundingClientRect() ?? null
      return {
        displayMode: button.getAttribute('data-display-mode') ?? '',
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        iconCenter: iconRect
          ? {
              x: iconRect.left + iconRect.width / 2,
              y: iconRect.top + iconRect.height / 2,
            }
          : null,
      }
    })

    const listRect = buttonRects.find((rect) => rect.displayMode === 'list') ?? null
    const treeRect = buttonRects.find((rect) => rect.displayMode === 'tree') ?? null
    const treeRightProbeY = treeRect ? treeRect.top + treeRect.height / 2 : null

    return {
      buttonCount: buttons.length,
      buttons: buttonRects,
      switchRect: switchRect
        ? {
            top: switchRect.top,
            bottom: switchRect.bottom,
            height: switchRect.height,
            width: switchRect.width,
          }
        : null,
      switchBaseRect: switchBaseRect
        ? {
            top: switchBaseRect.top,
            bottom: switchBaseRect.bottom,
            height: switchBaseRect.height,
            width: switchBaseRect.width,
          }
        : null,
      hasHorizontalOverflow: host ? host.scrollWidth > host.clientWidth : null,
      rightEdgeDeadSpace: contentRight !== null && treeRect ? contentRight - treeRect.right : null,
      points: {
        listCenter: listRect
          ? {x: listRect.left + listRect.width / 2, y: listRect.top + listRect.height / 2}
          : null,
        treeCenter: treeRect
          ? {x: treeRect.left + treeRect.width / 2, y: treeRect.top + treeRect.height / 2}
          : null,
        treeRightEdge:
          contentRight !== null && treeRightProbeY !== null
            ? {x: contentRight - 1, y: treeRightProbeY}
            : null,
      },
    }

    function deepFindAll<T extends Element = Element>(
      root: Document | ShadowRoot | Element | null | undefined,
      selector: string,
    ): T[] {
      if (!root) return []
      const found = Array.from(root.querySelectorAll<T>(selector))
      if (root instanceof Element && root.shadowRoot) {
        found.push(...deepFindAll<T>(root.shadowRoot, selector))
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) found.push(...deepFindAll<T>(el.shadowRoot, selector))
      }
      return found
    }

    function deepFind<T extends Element = Element>(
      root: Document | ShadowRoot | Element | null | undefined,
      selector: string,
    ): T | null {
      if (!root) return null
      const found = root.querySelector<T>(selector)
      if (found) return found
      if (root instanceof Element && root.shadowRoot) {
        const inner = deepFind<T>(root.shadowRoot, selector)
        if (inner) return inner
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind<T>(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

// Chromium 149 can collect an evaluate result while its own mutation triggers Lit/Reatom microtasks.
// Use trusted Playwright input for user actions; programmatic fixtures below yield a frame before return.
async function waitForNotesInput(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.documentElement.hasAttribute('loading'), undefined, {
    timeout: 10_000,
  })
}

// Measure the hit-test point only; dispatch the real click outside evaluate (see waitForNotesInput).
async function clickNotesViewSwitchPoint(
  page: Page,
  point: {x: number; y: number},
  expectedMode: 'list' | 'grid' | 'tree',
): Promise<void> {
  await waitForNotesInput(page)
  const targetMode = await page.evaluate(
    ({x, y, expectedMode}) => {
      const header = deepFind(document, '[data-testid="workspace-header"]') as HTMLElement | null
      const button = deepFind<HTMLElement>(header, `[data-display-mode="${expectedMode}"]`)
      if (!button) return null

      const rect = button.getBoundingClientRect()
      const pointInsideButton = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
      if (!pointInsideButton) return null

      return button.getAttribute('data-display-mode')

      function deepFind<T extends Element = Element>(
        root: Document | ShadowRoot | Element | null | undefined,
        selector: string,
      ): T | null {
        if (!root) return null
        const found = root.querySelector<T>(selector)
        if (found) return found
        if (root instanceof Element && root.shadowRoot) {
          const inner = deepFind<T>(root.shadowRoot, selector)
          if (inner) return inner
        }
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind<T>(el.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    {...point, expectedMode},
  )
  expect(targetMode).toBe(expectedMode)
  await page.mouse.click(point.x, point.y)
  await page.waitForFunction(
    (mode) => {
      const header = deepFind(document, '[data-testid="workspace-header"]') as HTMLElement | null
      const button = deepFind(header, '.view-switch__button[checked]') as HTMLElement | null
      return button?.getAttribute('data-display-mode') === mode

      function deepFind<T extends Element = Element>(
        root: Document | ShadowRoot | Element | null | undefined,
        selector: string,
      ): T | null {
        if (!root) return null
        const found = root.querySelector<T>(selector)
        if (found) return found
        if (root instanceof Element && root.shadowRoot) {
          const inner = deepFind<T>(root.shadowRoot, selector)
          if (inner) return inner
        }
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) {
            const inner = deepFind<T>(el.shadowRoot, selector)
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

async function expectNotesViewSwitchGeometry(page: Page): Promise<void> {
  const snapshot = await notesViewSwitchSnapshot(page)
  const list = snapshot.buttons.find((button) => button.displayMode === 'list')
  const grid = snapshot.buttons.find((button) => button.displayMode === 'grid')
  const tree = snapshot.buttons.find((button) => button.displayMode === 'tree')

  expect(snapshot.buttonCount).toBe(3)
  expect(list).toBeTruthy()
  expect(grid).toBeTruthy()
  expect(tree).toBeTruthy()
  if (!list || !grid || !tree) {
    throw new Error('Notes view switch buttons not found')
  }

  expect(Math.abs(list.width - grid.width)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(list.width - tree.width)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(list.height - grid.height)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(list.height - tree.height)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(list.width - 30)).toBeLessThanOrEqual(0.75)
  expect(Math.abs(list.height - 26)).toBeLessThanOrEqual(0.75)
  expect(Math.abs(snapshot.rightEdgeDeadSpace ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(0.75)
  expect(snapshot.hasHorizontalOverflow).toBe(false)
  for (const button of [list, grid, tree]) {
    expect(button.iconCenter).not.toBeNull()
    if (!button.iconCenter) {
      throw new Error(`Notes view switch icon geometry not found for ${button.displayMode}`)
    }
    expect(Math.abs(button.iconCenter.x - (button.left + button.width / 2))).toBeLessThanOrEqual(0.75)
    expect(Math.abs(button.iconCenter.y - (button.top + button.height / 2))).toBeLessThanOrEqual(0.75)
  }

  expect(snapshot.switchRect).not.toBeNull()
  expect(snapshot.switchBaseRect).not.toBeNull()
  if (!snapshot.switchRect || !snapshot.switchBaseRect) {
    throw new Error('Notes view switch track geometry not found')
  }

  expect(Math.abs(snapshot.switchBaseRect.height - (snapshot.switchRect.height - 8))).toBeLessThanOrEqual(
    0.75,
  )
  expect(Math.abs(list.height - (snapshot.switchRect.height - 8))).toBeLessThanOrEqual(0.75)
  expect(
    Math.abs(list.top + list.height / 2 - (snapshot.switchRect.top + snapshot.switchRect.height / 2)),
  ).toBeLessThanOrEqual(0.75)

  if (!snapshot.points.listCenter || !snapshot.points.treeCenter || !snapshot.points.treeRightEdge) {
    throw new Error('Notes view switch hit-test points not found')
  }

  await clickNotesViewSwitchPoint(page, snapshot.points.listCenter, 'list')
  await clickNotesViewSwitchPoint(page, snapshot.points.treeCenter, 'tree')
  await clickNotesViewSwitchPoint(page, snapshot.points.listCenter, 'list')
  await clickNotesViewSwitchPoint(page, snapshot.points.treeRightEdge, 'tree')
}

async function setNotesSearch(page: Page, value: string): Promise<void> {
  await waitForNotesInput(page)
  await page
    .getByTestId('workspace-header')
    .getByRole('searchbox', {name: 'Search notes & content', exact: true})
    .fill(value)
}

// Use trusted input for the view switch (see waitForNotesInput).
async function setNotesDisplayMode(page: Page, displayMode: 'list' | 'grid' | 'tree'): Promise<void> {
  await waitForNotesInput(page)
  await page.locator(`[data-testid="workspace-header"] [data-display-mode="${displayMode}"]`).click()
}

async function notesHierarchySnapshot(page: Page, folderPath: string) {
  return page.evaluate((path) => {
    const host = deepFind(document, 'notes-quick-view, notes-quick-view-mobile') as HTMLElement | null
    const root = host?.shadowRoot
    const folders = Array.from(root?.querySelectorAll('.tree-folder') ?? [])
    const folder = folders.find((candidate) => candidate.getAttribute('data-folder-path') === path)

    return {
      hasTree: Boolean(root?.querySelector('.tree')),
      folderText: folder?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      nestedRows: Array.from(folder?.querySelectorAll('.row') ?? []).map(
        (row) => row.querySelector('.note-card__title')?.textContent?.trim() ?? '',
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

// Locator input scrolls the note into view and avoids the evaluate GC race (see waitForNotesInput).
async function openNoteFromQuickView(page: Page, title: string): Promise<void> {
  await waitForNotesInput(page)
  await page
    .locator('notes-quick-view .row, notes-quick-view-mobile .row')
    .filter({has: page.locator('.note-card__title', {hasText: visibleNoteTitle(title)})})
    .click()
}

async function waitForMarkdownDocument(page: Page, fileId: number, fileName: string): Promise<void> {
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

// Use trusted input for the mode button (see waitForNotesInput).
async function openMarkdownEditor(page: Page): Promise<void> {
  await waitForNotesInput(page)
  await page.locator('markdown-preview .mode-button[aria-label="Edit"]').click()
}

async function markdownEditorSnapshot(page: Page) {
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

// Synthetic touch preserves the hidden/visible keyboard focus cases; yield after capture (see waitForNotesInput).
async function markdownQuickActionFocusSnapshot(page: Page) {
  return page.evaluate(async () => {
    const host = deepFind(document, 'markdown-preview') as (HTMLElement & {
      updateComplete?: Promise<unknown>
    }) | null
    const editor = host?.shadowRoot?.querySelector('.source-editor') as (HTMLElement & {
      focus(options?: FocusOptions): void
      getSelection(): {selectionStart: number; selectionEnd: number}
      setSelectionRange(start: number, end: number): void
      updateComplete?: Promise<unknown>
      value: string
    }) | null
    const content = editor?.shadowRoot?.querySelector('.cm-content') as HTMLElement | null
    const boldButton = host?.shadowRoot?.querySelector(
      '.editor-quick-bar [aria-label="Bold"]',
    ) as HTMLElement | null
    const italicButton = host?.shadowRoot?.querySelector(
      '.editor-quick-bar [aria-label="Italic"]',
    ) as HTMLElement | null
    if (!host || !editor || !content || !boldButton || !italicButton) {
      throw new Error('Markdown editor quick action controls not found')
    }

    const activateTouchAction = async (button: HTMLElement) => {
      button.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerType: 'touch',
        }),
      )
      button.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerType: 'touch',
        }),
      )
      await Promise.resolve()
      await host.updateComplete
      await editor.updateComplete
    }

    content.blur()
    editor.setSelectionRange(2, editor.value.length)
    await activateTouchAction(boldButton)
    const hiddenKeyboardState = {
      editorFocused: editor.shadowRoot?.activeElement === content,
      selection: editor.getSelection(),
      value: editor.value,
    }

    editor.focus({preventScroll: true})
    editor.setSelectionRange(2, 4)
    await activateTouchAction(italicButton)
    const visibleKeyboardState = {
      editorFocused: editor.shadowRoot?.activeElement === content,
      selection: editor.getSelection(),
      value: editor.value,
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    return {hiddenKeyboardState, visibleKeyboardState}

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

async function markdownEditorKeyboardClearanceSnapshot(page: Page, keyboardInset: number) {
  return page.evaluate(async (inset) => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const root = host?.shadowRoot
    const content = root?.querySelector('.content') as HTMLElement | null
    const quickBar = root?.querySelector('.editor-quick-bar') as HTMLElement | null
    const editor = root?.querySelector('.source-editor') as
      | (HTMLElement & {
          focusAt?(selectionStart: number | null): void
          value?: string
        })
      | null
    const editorContent = editor?.shadowRoot?.querySelector('.cm-content') as HTMLElement | null
    const editorScroller = editor?.shadowRoot?.querySelector('.cm-scroller') as HTMLElement | null
    const documentScroller = document.scrollingElement as HTMLElement | null
    if (!host || !content || !quickBar || !editor || !editorContent || !editorScroller || !documentScroller) {
      return null
    }

    const rootElement = document.documentElement
    const waitFrames = async (count = 2) => {
      for (let index = 0; index < count; index += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
    }
    documentScroller.scrollTop = 0
    rootElement.scrollTop = 0
    document.body.scrollTop = 0
    const closedEditorPaddingBlockEnd = Number.parseFloat(getComputedStyle(editor).paddingBlockEnd)
    editor.focusAt?.(typeof editor.value === 'string' ? editor.value.length : null)
    rootElement.setAttribute('data-native-keyboard-insets', '')
    rootElement.style.setProperty('--app-runtime-keyboard-native-inset-block-end', `${inset}px`)
    rootElement.style.setProperty('--app-runtime-visual-viewport-inset-block-end', `${inset}px`)
    rootElement.style.setProperty('--app-runtime-keyboard-inset-block-end', `${inset}px`)
    rootElement.style.setProperty('--app-runtime-keyboard-scroll-action-offset', `${inset}px`)
    rootElement.style.setProperty('--app-runtime-keyboard-scroll-clearance', `${inset}px`)
    rootElement.style.setProperty('--app-runtime-keyboard-overlay-offset', `${inset}px`)
    rootElement.setAttribute('data-mobile-keyboard-expanded', '')

    await waitFrames(4)

    editorScroller.scrollTop = editorScroller.scrollHeight
    await waitFrames(2)
    editorScroller.scrollTop = Math.max(0, editorScroller.scrollHeight - editorScroller.clientHeight)
    await waitFrames(4)

    const contentRect = content.getBoundingClientRect()
    const editorStyles = getComputedStyle(editor)
    const editorContentStyles = getComputedStyle(editorContent)
    const contentStyles = getComputedStyle(content)
    const editorScrollerRect = editorScroller.getBoundingClientRect()
    const quickBarRect = quickBar.getBoundingClientRect()
    const renderedLines = editorContent.querySelectorAll<HTMLElement>('.cm-line')
    const lastLine = renderedLines.item(renderedLines.length - 1)
    const caret = editor.shadowRoot?.querySelector<HTMLElement>('.cm-cursor-primary, .cm-cursor') ?? null
    const rootStyles = getComputedStyle(rootElement)
    const actionOffset = contentRect.bottom - quickBarRect.bottom
    const contentClearance = Number.parseFloat(editorContentStyles.paddingBlockEnd)
    const editorPaddingBlockEnd = Number.parseFloat(editorStyles.paddingBlockEnd)
    const maxScroll = editorScroller.scrollHeight - editorScroller.clientHeight
    const snapshot = {
      actionOffset,
      bodyMaxScroll: Math.max(0, document.body.scrollHeight - document.body.clientHeight),
      bodyScrollTop: document.body.scrollTop,
      caretBottom: caret?.getBoundingClientRect().bottom ?? null,
      closedEditorPaddingBlockEnd,
      contentClearance,
      contentBottom: contentRect.bottom,
      contentPaddingBlockEnd: contentStyles.paddingBlockEnd,
      documentMaxScroll: Math.max(0, documentScroller.scrollHeight - documentScroller.clientHeight),
      documentScrollTop: documentScroller.scrollTop,
      editorLineHeight: editorStyles.lineHeight,
      editorPaddingBlockEnd,
      editorPaddingBlockStart: editorStyles.paddingBlockStart,
      editorScrollPaddingBlockEnd: editorStyles.scrollPaddingBlockEnd,
      expectedContentClearance: Math.max(0, editorScrollerRect.bottom - (window.innerHeight - inset)),
      keyboardTop: window.innerHeight - inset,
      lastLineBottom: lastLine?.getBoundingClientRect().bottom ?? null,
      layoutKeyboardReserve: editorPaddingBlockEnd - closedEditorPaddingBlockEnd,
      maxScroll,
      overlayOffset: rootStyles.getPropertyValue('--app-runtime-keyboard-overlay-offset').trim(),
      quickBarBottom: quickBarRect.bottom,
      quickBarHeight: quickBarRect.height,
      quickBarTop: quickBarRect.top,
      rootMaxScroll: Math.max(0, rootElement.scrollHeight - rootElement.clientHeight),
      rootScrollTop: rootElement.scrollTop,
      scrollAtBottom: Math.abs(editorScroller.scrollTop - maxScroll) <= 1,
      scrollerBottom: editorScrollerRect.bottom,
      scrollerClientHeight: editorScroller.clientHeight,
      scrollerScrollHeight: editorScroller.scrollHeight,
      scrollerScrollTop: editorScroller.scrollTop,
      scrollerToQuickBarGap: quickBarRect.top - editorScrollerRect.bottom,
      scrollOverflowY: getComputedStyle(editorScroller).overflowY,
    }

    rootElement.style.removeProperty('--app-runtime-keyboard-native-inset-block-end')
    rootElement.style.removeProperty('--app-runtime-visual-viewport-inset-block-end')
    rootElement.style.removeProperty('--app-runtime-keyboard-inset-block-end')
    rootElement.style.removeProperty('--app-runtime-keyboard-scroll-action-offset')
    rootElement.style.removeProperty('--app-runtime-keyboard-scroll-clearance')
    rootElement.style.removeProperty('--app-runtime-keyboard-overlay-offset')
    rootElement.removeAttribute('data-native-keyboard-insets')
    rootElement.removeAttribute('data-mobile-keyboard-expanded')
    await waitFrames(3)

    return snapshot

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

// Keyboard insets are a native-environment fixture; yield after restoring them (see waitForNotesInput).
async function markdownEditorQuickBarKeyboardSnapshots(page: Page, keyboardInsets: readonly number[]) {
  return page.evaluate(async (insets) => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const quickBar = host?.shadowRoot?.querySelector('.editor-quick-bar') as HTMLElement | null
    if (!host || !quickBar) {
      return null
    }

    const rootElement = document.documentElement
    const waitFrames = async (count = 2) => {
      for (let index = 0; index < count; index += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
    }
    const setKeyboardInset = (bottomInset: number) => {
      rootElement.setAttribute('data-mobile-keyboard-expanded', '')
      rootElement.setAttribute('data-native-keyboard-insets', '')
      rootElement.style.setProperty('--app-runtime-keyboard-native-inset-block-end', `${bottomInset}px`)
      rootElement.style.setProperty('--app-runtime-visual-viewport-inset-block-end', `${bottomInset}px`)
      rootElement.style.setProperty('--app-runtime-keyboard-inset-block-end', `${bottomInset}px`)
      rootElement.style.setProperty('--app-runtime-keyboard-scroll-action-offset', `${bottomInset}px`)
      rootElement.style.setProperty('--app-runtime-keyboard-scroll-clearance', `${bottomInset}px`)
      rootElement.style.setProperty('--app-runtime-keyboard-overlay-offset', `${bottomInset}px`)
    }

    const snapshots = []
    for (const inset of insets) {
      setKeyboardInset(inset)
      await waitFrames()

      const rect = quickBar.getBoundingClientRect()
      const quickBarStyle = getComputedStyle(quickBar)
      const rootStyle = getComputedStyle(rootElement)
      snapshots.push({
        actionOffset: rootStyle.getPropertyValue('--app-runtime-keyboard-block-end-action-offset').trim(),
        bottom: rect.bottom,
        display: quickBarStyle.display,
        height: rect.height,
        inset,
        keyboardTop: window.innerHeight - inset,
        top: rect.top,
        visibility: quickBarStyle.visibility,
      })
    }

    rootElement.style.removeProperty('--app-runtime-keyboard-native-inset-block-end')
    rootElement.style.removeProperty('--app-runtime-visual-viewport-inset-block-end')
    rootElement.style.removeProperty('--app-runtime-keyboard-inset-block-end')
    rootElement.style.removeProperty('--app-runtime-keyboard-scroll-action-offset')
    rootElement.style.removeProperty('--app-runtime-keyboard-scroll-clearance')
    rootElement.style.removeProperty('--app-runtime-keyboard-overlay-offset')
    rootElement.removeAttribute('data-native-keyboard-insets')
    rootElement.removeAttribute('data-mobile-keyboard-expanded')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    return snapshots

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
  }, keyboardInsets)
}

// RTL is a document fixture; yield after restoring dir (see waitForNotesInput).
async function markdownEditorQuickBarLayoutSnapshot(page: Page, direction: 'ltr' | 'rtl') {
  return page.evaluate(async (nextDirection) => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const root = host?.shadowRoot
    const quickBar = root?.querySelector('.editor-quick-bar') as HTMLElement | null
    const groups = Array.from(quickBar?.querySelectorAll<HTMLElement>('[data-quick-action-group]') ?? [])
    if (!root || !quickBar || groups.length !== 3) {
      throw new Error('Markdown editor quick action groups not found')
    }

    const documentRoot = document.documentElement
    const previousDirection = documentRoot.getAttribute('dir')
    documentRoot.setAttribute('dir', nextDirection)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    const rectSnapshot = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      }
    }
    const quickBarStyles = getComputedStyle(quickBar)
    const controls = Array.from(
      quickBar.querySelectorAll<HTMLElement>('.editor-quick-button, .editor-quick-overflow'),
    )
    const snapshot = {
      actionLabels: controls.map((control) => control.getAttribute('aria-label')),
      clientWidth: quickBar.clientWidth,
      groupRoles: groups.map((group) => group.getAttribute('role')),
      groups: groups.map((group) => ({
        name: group.dataset.quickActionGroup,
        rect: rectSnapshot(group),
      })),
      paddingInlineEnd: Number.parseFloat(quickBarStyles.paddingInlineEnd),
      paddingInlineStart: Number.parseFloat(quickBarStyles.paddingInlineStart),
      rect: rectSnapshot(quickBar),
      scrollWidth: quickBar.scrollWidth,
      targets: controls.map(rectSnapshot),
      toolbarCount: root.querySelectorAll('[role="toolbar"]').length,
    }

    if (previousDirection === null) {
      documentRoot.removeAttribute('dir')
    } else {
      documentRoot.setAttribute('dir', previousDirection)
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    return snapshot

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
  }, direction)
}

async function markdownEditorRepeatedKeyboardActivationSnapshot(page: Page, keyboardInset: number) {
  return page.evaluate(async (inset) => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const root = host?.shadowRoot
    const content = root?.querySelector('.content') as HTMLElement | null
    const editor = root?.querySelector('.source-editor') as
      | (HTMLElement & {
          focusAt?: (selectionStart: number | null) => void
          value?: string
        })
      | null
    const editorRoot = editor?.shadowRoot
    const editorScroller = editorRoot?.querySelector('.cm-scroller') as HTMLElement | null
    const documentScroller = document.scrollingElement as HTMLElement | null
    if (!host || !content || !editor || !editorScroller || !documentScroller) {
      return null
    }

    const waitFrames = async (count = 2) => {
      for (let index = 0; index < count; index += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
    }
    const waitMs = async (ms: number) => {
      await new Promise<void>((resolve) => setTimeout(resolve, ms))
    }
    const setKeyboard = (visible: boolean, bottomInset: number) => {
      const rootElement = document.documentElement
      rootElement.toggleAttribute('data-mobile-keyboard-expanded', visible)
      rootElement.toggleAttribute('data-native-keyboard-insets', visible)
      rootElement.style.setProperty('--app-runtime-keyboard-native-inset-block-end', `${bottomInset}px`)
      rootElement.style.setProperty('--app-runtime-visual-viewport-inset-block-end', `${bottomInset}px`)
      rootElement.style.setProperty('--app-runtime-keyboard-inset-block-end', `${bottomInset}px`)
      rootElement.style.setProperty('--app-runtime-keyboard-scroll-action-offset', `${bottomInset}px`)
      rootElement.style.setProperty('--app-runtime-keyboard-scroll-clearance', `${bottomInset}px`)
      rootElement.style.setProperty('--app-runtime-keyboard-overlay-offset', `${bottomInset}px`)
    }
    const focusEditorForKeyboardOpen = async () => {
      const end = typeof editor.value === 'string' ? editor.value.length : null
      if (typeof editor.focusAt === 'function') {
        editor.focusAt(end)
      } else {
        editor.focus({preventScroll: true})
      }

      setKeyboard(true, inset)
      await waitFrames(1)

      if (typeof editor.focusAt === 'function') {
        editor.focusAt(end)
      }
    }
    const blurEditor = () => {
      const activeElement = editorRoot?.activeElement
      if (activeElement instanceof HTMLElement) {
        activeElement.blur()
      }
      editor.blur()
    }
    const measure = () => {
      const contentRect = content.getBoundingClientRect()
      const editorRect = editor.getBoundingClientRect()
      const rootStyle = getComputedStyle(document.documentElement)
      return {
        bodyPaddingBottom: getComputedStyle(document.body).paddingBottom,
        contentBottom: contentRect.bottom,
        contentTop: contentRect.top,
        documentMaxScroll: Math.max(0, documentScroller.scrollHeight - documentScroller.clientHeight),
        documentScrollTop: documentScroller.scrollTop,
        editorBottom: editorRect.bottom,
        editorScrollTop: editorScroller.scrollTop,
        keyboardOverlayOffset: rootStyle.getPropertyValue('--app-runtime-keyboard-overlay-offset').trim(),
        visualViewportInset: rootStyle
          .getPropertyValue('--app-runtime-visual-viewport-inset-block-end')
          .trim(),
      }
    }
    documentScroller.scrollTop = 0
    editorScroller.scrollTop = 0
    setKeyboard(false, 0)
    blurEditor()
    await waitFrames(3)

    const baseline = measure()
    const cycles = []
    let previousClosed = baseline

    for (let index = 0; index < 4; index += 1) {
      await focusEditorForKeyboardOpen()
      await waitFrames(2)
      const open = measure()

      setKeyboard(false, 0)
      blurEditor()
      await waitFrames(3)
      const closed = measure()

      cycles.push({
        closed,
        closedContentTopDelta: closed.contentTop - previousClosed.contentTop,
        closedEditorScrollDelta: closed.editorScrollTop - previousClosed.editorScrollTop,
        index,
        open,
        openContentTopDelta: open.contentTop - previousClosed.contentTop,
        openDocumentScrollDelta: open.documentScrollTop - previousClosed.documentScrollTop,
        openEditorScrollDelta: open.editorScrollTop - previousClosed.editorScrollTop,
      })

      previousClosed = closed
      await waitMs(520)
    }

    const [firstCycle, secondCycle] = cycles

    return {
      baseline,
      cycles,
      firstClosed: firstCycle?.closed ?? null,
      firstOpen: firstCycle?.open ?? null,
      keyboardInset: inset,
      secondOpen: secondCycle?.open ?? null,
      firstClosedContentTopDelta: firstCycle?.closedContentTopDelta ?? 0,
      firstOpenContentTopDelta: firstCycle?.openContentTopDelta ?? 0,
      secondOpenContentTopDelta: secondCycle?.openContentTopDelta ?? 0,
      secondOpenDocumentScrollDelta: secondCycle?.openDocumentScrollDelta ?? 0,
      secondOpenEditorScrollDelta: secondCycle?.openEditorScrollDelta ?? 0,
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

// Keyboard insets are a native-environment fixture; yield after restoring them (see waitForNotesInput).
async function markdownEditorKeyboardSelectionRevealSnapshot(page: Page, keyboardInset: number) {
  return page.evaluate(async (inset) => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const root = host?.shadowRoot
    const content = root?.querySelector('.content') as HTMLElement | null
    const editor = root?.querySelector('.source-editor') as
      | (HTMLElement & {
          focusAt?: (selectionStart: number | null) => void
          setSelectionRange?: (selectionStart: number, selectionEnd: number) => void
          value?: string
        })
      | null
    const documentScroller = document.scrollingElement as HTMLElement | null
    if (!host || !content || !editor || !documentScroller) {
      return null
    }

    const waitFrames = async (count = 2) => {
      for (let index = 0; index < count; index += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
    }
    const rootElement = document.documentElement
    const setKeyboard = (visible: boolean, bottomInset: number) => {
      rootElement.toggleAttribute('data-mobile-keyboard-expanded', visible)
      rootElement.toggleAttribute('data-native-keyboard-insets', visible)
      rootElement.style.setProperty('--app-runtime-keyboard-native-inset-block-end', `${bottomInset}px`)
      rootElement.style.setProperty('--app-runtime-visual-viewport-inset-block-end', `${bottomInset}px`)
      rootElement.style.setProperty('--app-runtime-keyboard-inset-block-end', `${bottomInset}px`)
      rootElement.style.setProperty('--app-runtime-keyboard-scroll-action-offset', `${bottomInset}px`)
      rootElement.style.setProperty('--app-runtime-keyboard-scroll-clearance', `${bottomInset}px`)
      rootElement.style.setProperty('--app-runtime-keyboard-overlay-offset', `${bottomInset}px`)
    }
    const measure = () => {
      const contentRect = content.getBoundingClientRect()
      const editorRect = editor.getBoundingClientRect()
      const rootStyle = getComputedStyle(rootElement)
      return {
        contentTop: contentRect.top,
        documentScrollTop: documentScroller.scrollTop,
        editorBottom: editorRect.bottom,
        editorClientHeight: editor.clientHeight,
        editorScrollHeight: editor.scrollHeight,
        editorScrollTop: editor.scrollTop,
        keyboardOverlayOffset: rootStyle.getPropertyValue('--app-runtime-keyboard-overlay-offset').trim(),
        keyboardTop: window.innerHeight - inset,
      }
    }
    const measureSelectionStyle = () => {
      const editorRoot = editor.shadowRoot
      if (!editorRoot) {
        throw new Error('CodeMirror shadow root is unavailable')
      }

      const selectionBackgrounds = [
        ...new Set(
          Array.from(editorRoot.querySelectorAll<HTMLElement>('.cm-selectionBackground')).map(
            (element) => getComputedStyle(element).backgroundColor,
          ),
        ),
      ]
      const activeLineBackgrounds = [
        ...new Set(
          Array.from(editorRoot.querySelectorAll<HTMLElement>('.cm-activeLine')).map(
            (element) => getComputedStyle(element).backgroundColor,
          ),
        ),
      ]
      const tokenProbe = document.createElement('span')
      tokenProbe.hidden = true
      tokenProbe.style.backgroundColor = 'var(--cv-color-editor-selection-background)'
      editorRoot.append(tokenProbe)
      const editorSelectionBackground = getComputedStyle(tokenProbe).backgroundColor
      tokenProbe.remove()

      return {
        activeLineBackgrounds,
        editorSelectionBackground,
        selectionBackgrounds,
      }
    }

    documentScroller.scrollTop = 0
    editor.scrollTop = 0
    setKeyboard(true, inset)
    if (typeof editor.focusAt === 'function') {
      editor.focusAt(0)
    } else {
      editor.focus({preventScroll: true})
    }
    await waitFrames(4)

    const before = measure()
    const source = typeof editor.value === 'string' ? editor.value : ''
    const visibleLines = Array.from(
      editor.shadowRoot?.querySelectorAll<HTMLElement>('.cm-line') ?? [],
    ).filter((line) => {
      const rect = line.getBoundingClientRect()
      return rect.top >= 0 && rect.bottom <= before.keyboardTop
    })
    const visibleLine = visibleLines.at(-1)
    const visibleLineText = visibleLine?.textContent ?? ''
    const visibleLineOffset = source.indexOf(visibleLineText)
    if (!visibleLine || !visibleLineText || visibleLineOffset < 0) {
      throw new Error('No visible CodeMirror line found above the keyboard')
    }

    const visibleSelectionEnd = visibleLineOffset + visibleLineText.length
    const visibleSelectionBottom = visibleLine.getBoundingClientRect().bottom
    editor.setSelectionRange?.(0, visibleSelectionEnd)
    await waitFrames(8)
    const afterVisibleSelection = measure()
    const visibleSelectionStyle = measureSelectionStyle()

    const end = typeof editor.value === 'string' ? editor.value.length : 0
    if (typeof editor.focusAt === 'function') {
      editor.focusAt(end)
    } else {
      editor.setSelectionRange?.(end, end)
    }
    await waitFrames(8)
    const after = measure()

    rootElement.style.removeProperty('--app-runtime-keyboard-native-inset-block-end')
    rootElement.style.removeProperty('--app-runtime-visual-viewport-inset-block-end')
    rootElement.style.removeProperty('--app-runtime-keyboard-inset-block-end')
    rootElement.style.removeProperty('--app-runtime-keyboard-scroll-action-offset')
    rootElement.style.removeProperty('--app-runtime-keyboard-scroll-clearance')
    rootElement.style.removeProperty('--app-runtime-keyboard-overlay-offset')
    rootElement.removeAttribute('data-native-keyboard-insets')
    rootElement.removeAttribute('data-mobile-keyboard-expanded')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    return {
      after,
      afterVisibleSelection,
      before,
      contentTopDelta: after.contentTop - afterVisibleSelection.contentTop,
      documentScrollDelta: after.documentScrollTop - afterVisibleSelection.documentScrollTop,
      editorScrollDelta: after.editorScrollTop - afterVisibleSelection.editorScrollTop,
      keyboardInset: inset,
      visibleSelectionBottom,
      visibleSelectionContentTopDelta: afterVisibleSelection.contentTop - before.contentTop,
      visibleSelectionDocumentScrollDelta: afterVisibleSelection.documentScrollTop - before.documentScrollTop,
      visibleSelectionEditorScrollDelta: afterVisibleSelection.editorScrollTop - before.editorScrollTop,
      visibleSelectionStyle,
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

async function markdownPreviewFabClearanceSnapshot(page: Page) {
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
      fabStyles.display !== 'none' && fabStyles.visibility !== 'hidden' && fab.getClientRects().length > 0
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
      fabBackdropFilter:
        fabStyles.getPropertyValue('backdrop-filter') ||
        fabStyles.getPropertyValue('-webkit-backdrop-filter'),
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

async function toggleMarkdownTaskCheckboxScrollSnapshot(page: Page, taskIndex: number) {
  const before = await page.evaluate(async (index) => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const preview = host?.shadowRoot?.querySelector('.rendered-markdown') as HTMLElement | null
    const checkbox = preview?.querySelectorAll<HTMLElement>('.cv-markdown-task-checkbox')[index] ?? null
    const row = checkbox?.closest('li') as HTMLElement | null
    if (!preview || !checkbox || !row) {
      throw new Error(`Markdown task checkbox ${index} not found`)
    }

    checkbox.scrollIntoView({block: 'center', inline: 'nearest'})
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const rowRect = row.getBoundingClientRect()
    const rowToken = `task-row-${Date.now()}-${Math.random()}`
    const trackedRow = row as HTMLElement & {__cvTaskRowToken?: string}
    trackedRow.__cvTaskRowToken = rowToken
    return {
      checked: checkbox.getAttribute('aria-checked'),
      rowToken,
      rowTop: rowRect.top,
      scrollTop: preview.scrollTop,
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
  }, taskIndex)

  // Preserve preventScroll focus: real input changes this isolated scroll snapshot; yield as in waitForNotesInput.
  await page.evaluate(async (index) => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const preview = host?.shadowRoot?.querySelector('.rendered-markdown') as HTMLElement | null
    const checkbox = preview?.querySelectorAll<HTMLElement>('.cv-markdown-task-checkbox')[index] ?? null
    if (!checkbox) {
      throw new Error(`Markdown task checkbox ${index} not found for activation`)
    }

    checkbox.focus({preventScroll: true})
    checkbox.click()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

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
  }, taskIndex)
  await page.waitForFunction(
    (index) => {
      const host = deepFind(document, 'markdown-preview') as HTMLElement | null
      const preview = host?.shadowRoot?.querySelector('.rendered-markdown') as HTMLElement | null
      const checkbox = preview?.querySelectorAll<HTMLElement>('.cv-markdown-task-checkbox')[index] ?? null
      return checkbox?.getAttribute('aria-checked') === 'true'

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
    taskIndex,
    {timeout: 5_000},
  )

  return page.evaluate(
    async ({index, beforeSnapshot}) => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const host = deepFind(document, 'markdown-preview') as HTMLElement | null
      const preview = host?.shadowRoot?.querySelector('.rendered-markdown') as HTMLElement | null
      const checkbox = preview?.querySelectorAll<HTMLElement>('.cv-markdown-task-checkbox')[index] ?? null
      const row = checkbox?.closest('li') as HTMLElement | null
      if (!preview || !checkbox || !row) {
        throw new Error(`Markdown task checkbox ${index} not found after toggle`)
      }

      return {
        beforeChecked: beforeSnapshot.checked,
        beforeRowTop: beforeSnapshot.rowTop,
        beforeScrollTop: beforeSnapshot.scrollTop,
        afterChecked: checkbox.getAttribute('aria-checked'),
        afterRowTop: row.getBoundingClientRect().top,
        afterScrollTop: preview.scrollTop,
        sameRowNode:
          (row as HTMLElement & {__cvTaskRowToken?: string}).__cvTaskRowToken === beforeSnapshot.rowToken,
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
    },
    {index: taskIndex, beforeSnapshot: before},
  )
}

// The custom editor value/input pair prepares source without changing focus; yield (see waitForNotesInput).
async function setMarkdownEditorSource(page: Page, value: string): Promise<void> {
  await page.evaluate(async (nextValue) => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const editor = host?.shadowRoot?.querySelector('.source-editor') as HTMLTextAreaElement | null
    if (!editor) throw new Error('Markdown source editor not found')
    editor.value = nextValue
    editor.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true, data: nextValue}))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

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

// The custom editor selection/select contract prepares the insertion point; yield (see waitForNotesInput).
async function setMarkdownEditorSelectionToEnd(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const editor = host?.shadowRoot?.querySelector('.source-editor') as HTMLTextAreaElement | null
    if (!editor) throw new Error('Markdown source editor not found')
    const end = editor.value.length
    editor.focus()
    editor.setSelectionRange(end, end)
    editor.dispatchEvent(new Event('select', {bubbles: true, composed: true}))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

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

async function markdownImageInsertControlsSnapshot(page: Page) {
  return page.evaluate(() => {
    const preview = deepFind(document, 'markdown-preview') as HTMLElement | null
    const previewRoot = preview?.shadowRoot
    const input = previewRoot?.querySelector('.image-input') as HTMLInputElement | null
    const previewToolbarLinkButton = previewRoot?.querySelector('.insert-link-action') as HTMLElement | null
    const previewToolbarImageButton = previewRoot?.querySelector('.insert-image-action') as HTMLElement | null
    const toolbar = deepFind(document, '[data-testid="mobile-toolbar"]') as HTMLElement | null
    const topbarButton = deepFind(toolbar, '[data-action="markdown-insert-image"]') as HTMLElement | null
    const topbarActionButtons = Array.from(
      deepFindAll(toolbar, '.trailing > .action-btn[data-action]'),
    ) as HTMLElement[]
    const overflowMenu = deepFind(toolbar, 'cv-menu-button.overflow-menu') as HTMLElement | null
    const overflowTrigger = overflowMenu?.shadowRoot?.querySelector('[part="trigger"]') as HTMLElement | null
    const overflowImageItem = overflowMenu?.querySelector('cv-menu-item[value="markdown-insert-image"]')
    const overflowItemValues = Array.from(overflowMenu?.querySelectorAll('cv-menu-item') ?? [])
      .map((item) => item.getAttribute('value'))
      .filter((value): value is string => Boolean(value))

    return {
      inputType: input?.type ?? null,
      inputAccept: input?.accept ?? null,
      inputMultiple: input?.multiple ?? null,
      previewToolbarImageButtonVisible: isElementVisible(previewToolbarImageButton),
      previewToolbarLinkButtonVisible: isElementVisible(previewToolbarLinkButton),
      topbarButtonVisible: isElementVisible(topbarButton),
      topbarVisibleActions: topbarActionButtons
        .filter((button) => isElementVisible(button))
        .map((button) => button.dataset.action)
        .filter((value): value is string => Boolean(value)),
      topbarOverflowVisible: isElementVisible(overflowTrigger),
      topbarOverflowImageItemPresent: Boolean(overflowImageItem),
      topbarOverflowItems: overflowItemValues,
    }

    function isElementVisible(element: HTMLElement | null): boolean {
      const style = element ? getComputedStyle(element) : null
      return Boolean(
        element &&
        style?.display !== 'none' &&
        style?.visibility !== 'hidden' &&
        element.getClientRects().length > 0,
      )
    }

    function deepFindAll<T extends Element = Element>(
      root: Document | ShadowRoot | Element | null | undefined,
      selector: string,
    ): T[] {
      if (!root) return []
      const found = Array.from(root.querySelectorAll<T>(selector))
      if (root instanceof Element && root.shadowRoot) {
        found.push(...deepFindAll<T>(root.shadowRoot, selector))
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) found.push(...deepFindAll<T>(el.shadowRoot, selector))
      }
      return found
    }

    function deepFind<T extends Element = Element>(
      root: Document | ShadowRoot | Element | null | undefined,
      selector: string,
    ): T | null {
      if (!root) return null
      const found = root.querySelector<T>(selector)
      if (found) return found
      if (root instanceof Element && root.shadowRoot) {
        const inner = deepFind<T>(root.shadowRoot, selector)
        if (inner) return inner
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind<T>(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

// Keep the picker probe separate from trusted menu clicks (see waitForNotesInput).
async function clickMarkdownInsertImageOverflow(page: Page): Promise<number> {
  await page.evaluate(() => {
    const preview = deepFind(document, 'markdown-preview') as HTMLElement | null
    const input = preview?.shadowRoot?.querySelector('.image-input') as HTMLInputElement | null
    if (!input) throw new Error('Markdown image input not found')

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
  await waitForNotesInput(page)
  const menu = page.locator('[data-testid="mobile-toolbar"] cv-menu-button.overflow-menu')
  await menu.locator('[part="trigger"]').click()
  await menu.locator('cv-menu-item[value="markdown-insert-image"]').click()
  return page.evaluate(() => window.__markdownImagePickerClicks ?? 0)
}

async function chooseMarkdownImageFile(page: Page): Promise<void> {
  await page.locator('markdown-preview .image-input').setInputFiles({
    name: 'e2e-inline.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    ),
  })
}

async function waitForMarkdownEditorValue(page: Page, expectedText: string): Promise<void> {
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

async function waitForInsertedMarkdownImageLink(page: Page): Promise<{markdown: string; path: string}> {
  await page.waitForFunction(
    () => {
      const host = deepFind(document, 'markdown-preview') as HTMLElement | null
      const editor = host?.shadowRoot?.querySelector('.source-editor') as HTMLTextAreaElement | null
      return /!\[e2e-inline\]\(<\/attachments\/e2e-inline-[^>]+\.png>\)/u.test(editor?.value ?? '')

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
    const match = /(!\[e2e-inline\]\(<(\/attachments\/e2e-inline-[^>]+\.png)>\))/u.exec(editor?.value ?? '')
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

// Use trusted input for the preview switch (see waitForNotesInput).
async function showMarkdownPreview(page: Page): Promise<void> {
  await waitForNotesInput(page)
  await page.locator('markdown-preview .mode-button[aria-label="Preview"]').click()
}

async function markdownModeScrollSyncSnapshot(page: Page, taskIndex: number) {
  const previewSnapshot = await page.evaluate(async (index) => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const preview = host?.shadowRoot?.querySelector('.rendered-markdown') as HTMLElement | null
    const checkbox = preview?.querySelectorAll<HTMLElement>('.cv-markdown-task-checkbox')[index] ?? null
    const row = checkbox?.closest('li') as HTMLElement | null
    if (!preview || !checkbox || !row) {
      throw new Error(`Markdown task ${index} not found before mode switch`)
    }

    checkbox.scrollIntoView({block: 'center', inline: 'nearest'})
    checkbox.focus({preventScroll: true})
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    return {
      rowText: row.textContent?.trim() ?? '',
      viewportOffset: checkbox.getBoundingClientRect().top - preview.getBoundingClientRect().top,
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
  }, taskIndex)

  await page.getByRole('button', {name: 'Edit', exact: true}).click()
  await page.locator('markdown-source-editor').waitFor({state: 'attached'})
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })

  const editorSnapshot = await page.evaluate((rowText) => {
    const editor = deepFind(document, 'markdown-source-editor') as HTMLElement | null
    const scroller = editor?.shadowRoot?.querySelector('.cm-scroller') as HTMLElement | null
    const line = Array.from(editor?.shadowRoot?.querySelectorAll<HTMLElement>('.cm-line') ?? []).find(
      (candidate) => candidate.textContent?.includes(rowText.replace(/^\s*/, '')),
    )
    if (!scroller || !line) {
      throw new Error(`Markdown editor line not found for ${rowText}`)
    }

    const scrollerTop = scroller.getBoundingClientRect().top
    const topVisibleLine = Array.from(editor.shadowRoot?.querySelectorAll<HTMLElement>('.cm-line') ?? [])
      .filter((candidate) => candidate.getBoundingClientRect().bottom > scrollerTop)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0]

    return {
      topVisibleText: topVisibleLine?.textContent?.replace(/^- \[[ x]\]\s*/, '').trim() ?? '',
      viewportOffset: line.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
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
  }, previewSnapshot.rowText)

  await page.getByRole('button', {name: 'Preview', exact: true}).click()
  await page.locator('.rendered-markdown').waitFor({state: 'attached'})
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })

  const restoredPreviewSnapshot = await page.evaluate((index) => {
    const host = deepFind(document, 'markdown-preview') as HTMLElement | null
    const preview = host?.shadowRoot?.querySelector('.rendered-markdown') as HTMLElement | null
    const checkbox = preview?.querySelectorAll<HTMLElement>('.cv-markdown-task-checkbox')[index] ?? null
    if (!preview || !checkbox) {
      throw new Error(`Markdown task ${index} not found after mode switch`)
    }

    const previewTop = preview.getBoundingClientRect().top
    const topVisibleCheckbox = Array.from(preview.querySelectorAll<HTMLElement>('.cv-markdown-task-checkbox'))
      .filter((candidate) => candidate.getBoundingClientRect().bottom > previewTop)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0]
    return {
      topVisibleText: topVisibleCheckbox?.closest('li')?.textContent?.trim() ?? '',
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
  }, taskIndex)

  return {
    previewOffset: previewSnapshot.viewportOffset,
    editorOffset: editorSnapshot.viewportOffset,
    editorTopVisibleText: editorSnapshot.topVisibleText,
    restoredPreviewTopVisibleText: restoredPreviewSnapshot.topVisibleText,
  }
}

async function waitForResolvedMarkdownImage(page: Page, expectedRef: string): Promise<void> {
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

// Rename through actual text input and Enter (see waitForNotesInput).
async function renameOpenMarkdownTitle(page: Page, value: string): Promise<void> {
  await waitForNotesInput(page)
  await page.locator('markdown-document-page .title-button').click()
  const input = page.locator('markdown-document-page .title-input')
  await input.fill(value)
  await input.press('Enter')
}

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

  for (const keyboardInset of [240, 296]) {
    const snapshot = await markdownEditorKeyboardClearanceSnapshot(page, keyboardInset)

    expect(snapshot).not.toBeNull()
    expect(snapshot!.scrollOverflowY).toBe('auto')
    expect(snapshot!.overlayOffset).toBe(`${keyboardInset}px`)
    expect(snapshot!.actionOffset).toBeGreaterThanOrEqual(keyboardInset)
    expect(snapshot!.layoutKeyboardReserve).toBeCloseTo(snapshot!.actionOffset, 0)
    expect(snapshot!.expectedContentClearance).toBeLessThanOrEqual(1)
    expect(snapshot!.contentClearance).toBeLessThanOrEqual(1)
    expect(snapshot!.editorPaddingBlockEnd).toBeGreaterThanOrEqual(
      Number.parseFloat(snapshot!.editorPaddingBlockStart) +
        Number.parseFloat(snapshot!.editorLineHeight) -
        1,
    )
    expect(snapshot!.scrollerBottom).toBeLessThan(snapshot!.quickBarTop)
    expect(snapshot!.scrollerToQuickBarGap).toBeGreaterThan(0)
    expect(snapshot!.lastLineBottom).not.toBeNull()
    expect(snapshot!.lastLineBottom!).toBeLessThanOrEqual(snapshot!.quickBarTop + 1)
    expect(snapshot!.caretBottom).not.toBeNull()
    expect(snapshot!.caretBottom!).toBeLessThanOrEqual(snapshot!.quickBarTop + 1)
    expect(snapshot!.quickBarBottom).toBeLessThanOrEqual(snapshot!.keyboardTop + 1)
    expect(snapshot!.documentMaxScroll).toBeLessThanOrEqual(1)
    expect(Math.abs(snapshot!.documentScrollTop)).toBeLessThanOrEqual(1)
    expect(snapshot!.rootMaxScroll).toBeLessThanOrEqual(1)
    expect(Math.abs(snapshot!.rootScrollTop)).toBeLessThanOrEqual(1)
    expect(snapshot!.bodyMaxScroll).toBeLessThanOrEqual(1)
    expect(Math.abs(snapshot!.bodyScrollTop)).toBeLessThanOrEqual(1)
    expect(snapshot!.scrollerScrollHeight).toBeGreaterThan(snapshot!.scrollerClientHeight)
    expect(snapshot!.maxScroll).toBeGreaterThan(0)
    expect(snapshot!.scrollAtBottom).toBe(true)
  }
})

test('S25: mobile Markdown quick toolbar balances action groups across phone widths and RTL', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }

  const fixture = await seedNotesFixture()
  for (const width of [360, 390, 430]) {
    await openNotes(page, {layout: 'mobile', viewport: {width, height: 844}})
    await openNoteFromQuickView(page, fixture.rootNote.name)
    await waitForMarkdownDocument(page, fixture.rootNote.id, fixture.rootNote.name)
    await openMarkdownEditor(page)

    for (const direction of ['ltr', 'rtl'] as const) {
      const snapshot = await markdownEditorQuickBarLayoutSnapshot(page, direction)
      const [insertGroup, formatGroup, overflowGroup] = snapshot.groups
      expect(snapshot.toolbarCount).toBe(1)
      expect(snapshot.groupRoles).toEqual([null, null, null])
      expect(snapshot.actionLabels).toEqual([
        'Insert image',
        'Insert file link',
        'Insert table',
        'Bold',
        'Italic',
        'Strikethrough',
        'Markdown quick actions',
      ])
      expect(snapshot.scrollWidth).toBeLessThanOrEqual(snapshot.clientWidth + 1)
      expect(snapshot.targets).toHaveLength(7)
      for (const target of snapshot.targets) {
        expect(target.width).toBeCloseTo(44, 0)
        expect(target.height).toBeCloseTo(44, 0)
      }

      expect(insertGroup?.name).toBe('insert')
      expect(formatGroup?.name).toBe('format')
      expect(overflowGroup?.name).toBe('overflow')
      const leadingGap =
        direction === 'ltr'
          ? insertGroup!.rect.left - snapshot.rect.left
          : snapshot.rect.right - insertGroup!.rect.right
      const trailingGap =
        direction === 'ltr'
          ? snapshot.rect.right - overflowGroup!.rect.right
          : overflowGroup!.rect.left - snapshot.rect.left
      const firstGroupGap =
        direction === 'ltr'
          ? formatGroup!.rect.left - insertGroup!.rect.right
          : insertGroup!.rect.left - formatGroup!.rect.right
      const secondGroupGap =
        direction === 'ltr'
          ? overflowGroup!.rect.left - formatGroup!.rect.right
          : formatGroup!.rect.left - overflowGroup!.rect.right

      expect(leadingGap).toBeCloseTo(snapshot.paddingInlineStart, 0)
      expect(trailingGap).toBeCloseTo(snapshot.paddingInlineEnd, 0)
      expect(firstGroupGap).toBeGreaterThanOrEqual(4)
      expect(secondGroupGap).toBeGreaterThanOrEqual(4)
      expect(firstGroupGap).toBeCloseTo(secondGroupGap, 0)
    }
  }
})

test('S25: mobile Markdown quick actions stay above an expanding IME suggestion row', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }

  const fixture = await seedNotesFixture()
  await openNotes(page, {layout: 'mobile', viewport: {width: 390, height: 844}})
  await openNoteFromQuickView(page, fixture.rootNote.name)
  await waitForMarkdownDocument(page, fixture.rootNote.id, fixture.rootNote.name)
  await openMarkdownEditor(page)

  const snapshots = await markdownEditorQuickBarKeyboardSnapshots(page, [240, 296])

  expect(snapshots).not.toBeNull()
  expect(snapshots).toHaveLength(2)
  for (const snapshot of snapshots!) {
    expect(snapshot.actionOffset).not.toBe('0px')
    expect(snapshot.display).toBe('flex')
    expect(snapshot.visibility).not.toBe('hidden')
    expect(snapshot.height).toBeGreaterThanOrEqual(44)
    expect(snapshot.top).toBeGreaterThanOrEqual(0)
    expect(snapshot.bottom).toBeLessThanOrEqual(snapshot.keyboardTop)
  }
  expect(snapshots![0]!.bottom - snapshots![1]!.bottom).toBeCloseTo(56, 0)
})

test('S25: mobile Markdown quick actions preserve the editor focus state', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }

  const fixture = await seedNotesFixture()
  await openNotes(page, {layout: 'mobile', viewport: {width: 390, height: 844}})
  await openNoteFromQuickView(page, fixture.rootNote.name)
  await waitForMarkdownDocument(page, fixture.rootNote.id, fixture.rootNote.name)
  await openMarkdownEditor(page)

  const snapshot = await markdownQuickActionFocusSnapshot(page)

  expect(snapshot.hiddenKeyboardState.editorFocused).toBe(false)
  expect(snapshot.hiddenKeyboardState.value).toMatch(/^# \*\*/)
  expect(snapshot.hiddenKeyboardState.selection.selectionStart).toBe(
    snapshot.hiddenKeyboardState.value.length,
  )
  expect(snapshot.hiddenKeyboardState.selection.selectionEnd).toBe(
    snapshot.hiddenKeyboardState.value.length,
  )
  expect(snapshot.visibleKeyboardState.editorFocused).toBe(true)
  expect(snapshot.visibleKeyboardState.value).toMatch(/^# \*\*\*\*/)
  expect(snapshot.visibleKeyboardState.selection.selectionStart).toBe(6)
  expect(snapshot.visibleKeyboardState.selection.selectionEnd).toBe(6)
})

test('S25: mobile Markdown editor keeps content anchored across repeated keyboard activations', async (ctx) => {
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
    (_, index) => `Activation line ${String(index + 1).padStart(2, '0')} ${fixture.rootNote.name}`,
  ).join('\n')
  await setMarkdownEditorSource(page, longMarkdown)

  const snapshot = await markdownEditorRepeatedKeyboardActivationSnapshot(page, 240)

  expect(snapshot).not.toBeNull()
  expect(snapshot!.cycles).toHaveLength(4)
  for (const cycle of snapshot!.cycles) {
    expect(Math.abs(cycle.openContentTopDelta)).toBeLessThan(48)
    expect(Math.abs(cycle.closedContentTopDelta)).toBeLessThan(48)
    expect(Math.abs(cycle.openDocumentScrollDelta)).toBeLessThan(48)
  }
})

test('S25: mobile Markdown editor keeps selection uniform and reveals offscreen lines above the keyboard', async (ctx) => {
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
    {length: 90},
    (_, index) => `Keyboard reveal line ${String(index + 1).padStart(2, '0')} ${fixture.rootNote.name}`,
  ).join('\n')
  await setMarkdownEditorSource(page, longMarkdown)

  const snapshot = await markdownEditorKeyboardSelectionRevealSnapshot(page, 240)

  expect(snapshot).not.toBeNull()
  expect(snapshot!.visibleSelectionBottom).toBeLessThanOrEqual(snapshot!.before.keyboardTop)
  expect(Math.abs(snapshot!.visibleSelectionEditorScrollDelta)).toBeLessThanOrEqual(1)
  expect(Math.abs(snapshot!.visibleSelectionDocumentScrollDelta)).toBeLessThanOrEqual(1)
  expect(Math.abs(snapshot!.visibleSelectionContentTopDelta)).toBeLessThanOrEqual(1)
  expect(snapshot!.visibleSelectionStyle.selectionBackgrounds).toEqual([
    snapshot!.visibleSelectionStyle.editorSelectionBackground,
  ])
  expect(snapshot!.visibleSelectionStyle.activeLineBackgrounds).toEqual(['rgba(0, 0, 0, 0)'])
  expect(snapshot!.editorScrollDelta).toBeGreaterThan(120)
  expect(Math.abs(snapshot!.documentScrollDelta)).toBeLessThan(48)
  expect(Math.abs(snapshot!.contentTopDelta)).toBeLessThan(48)
})

test('S25: mobile Markdown preview keeps the glass edit button legible and clear of bottom content', async (ctx) => {
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
  expect(snapshot!.fabBackdropFilter).toContain('blur(10px)')
  expect(snapshot!.fabBackgroundImage).toBe('none')
  expect(snapshot!.fabBackgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(snapshot!.scrollOverflowY).toBe('auto')
  expect(Number.parseFloat(snapshot!.previewPaddingBlockEnd)).toBeGreaterThan(snapshot!.fabHeight)
  expect(Number.parseFloat(snapshot!.previewScrollPaddingBlockEnd)).toBeGreaterThanOrEqual(
    snapshot!.fabHeight,
  )
  expect(snapshot!.lastBlockBottom).not.toBeNull()
  expect(snapshot!.lastBlockBottom!).toBeLessThanOrEqual(snapshot!.fabTop - 1)
  expect(snapshot!.overlapsLastBlock).toBe(false)
  expect(snapshot!.scrollAtBottom).toBe(true)
})

test('S25: Markdown task checkbox toggle preserves preview scroll position', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }

  const taskNote = await seedTaskListNoteFixture()
  await openNotes(page, {expectedRows: 1})
  await openNoteFromQuickView(page, taskNote.name)
  await waitForMarkdownDocument(page, taskNote.id, taskNote.name)

  const snapshot = await toggleMarkdownTaskCheckboxScrollSnapshot(page, 46)

  expect(snapshot.beforeChecked).toBe('false')
  expect(snapshot.afterChecked).toBe('true')
  expect(snapshot.beforeScrollTop).toBeGreaterThan(0)
  expect(snapshot.sameRowNode).toBe(true)
  expect(Math.abs(snapshot.afterScrollTop - snapshot.beforeScrollTop)).toBeLessThanOrEqual(1)
  expect(Math.abs(snapshot.afterRowTop - snapshot.beforeRowTop)).toBeLessThanOrEqual(1)
})

test('S25: Markdown mode switches preserve the focused source row viewport offset', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }

  const taskNote = await seedTaskListNoteFixture()
  await openNotes(page, {expectedRows: 1})
  await openNoteFromQuickView(page, taskNote.name)
  await waitForMarkdownDocument(page, taskNote.id, taskNote.name)

  const snapshot = await markdownModeScrollSyncSnapshot(page, 46)

  expect(
    Math.abs(snapshot.editorOffset - snapshot.previewOffset),
    JSON.stringify(snapshot),
  ).toBeLessThanOrEqual(4)
  expect(snapshot.restoredPreviewTopVisibleText, JSON.stringify(snapshot)).toContain(
    snapshot.editorTopVisibleText,
  )
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
  expect(controls.topbarButtonVisible).toBe(false)
  expect(controls.topbarVisibleActions).toEqual(['markdown-undo', 'markdown-redo'])
  expect(controls.topbarOverflowVisible).toBe(true)
  expect(controls.topbarOverflowImageItemPresent).toBe(true)
  expect(controls.topbarOverflowItems).toContain('markdown-paste')
  expect(controls.previewToolbarImageButtonVisible).toBe(false)
  expect(controls.previewToolbarLinkButtonVisible).toBe(false)
  expect(controls.inputType).toBe('file')
  expect(controls.inputAccept).toBe('image/*')
  expect(controls.inputMultiple).toBe(true)

  expect(await clickMarkdownInsertImageOverflow(page)).toBe(1)
  await chooseMarkdownImageFile(page)

  const inserted = await waitForInsertedMarkdownImageLink(page)
  expect((await markdownEditorSnapshot(page)).value).toContain(`\n${inserted.markdown}`)

  await showMarkdownPreview(page)
  await waitForResolvedMarkdownImage(page, inserted.path)
})

test('S25: Notes Quick View keeps view controls available in desktop and mobile headers', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }

  await seedNotesFixture()

  await openNotes(page)
  await expectNotesViewSwitchGeometry(page)

  await openNotes(page, {layout: 'mobile', viewport: {width: 430, height: 844}})
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
    [fixture.rootNote.name, fixture.nestedNote.name, fixture.mimeOnlyNote.name].map(visibleNoteTitle).sort(),
  )
  expect(initial.text).not.toContain(fixture.textFile.name)
  expect(initial.text).not.toContain(fixture.imageFile.name)
  expect(initial.text).not.toContain(fixture.hiddenFile.name)
  expect(initial.text).not.toContain(fixture.shardNote.name)

  await setNotesDisplayMode(page, 'tree')
  await waitForNotesRows(page, 3)
  const hierarchy = await notesHierarchySnapshot(page, `/${fixture.projectsDir.name}`)
  expect(hierarchy.hasTree).toBe(true)
  expect(hierarchy.folderText).toContain(fixture.projectsDir.name)
  expect(hierarchy.nestedRows.sort()).toEqual(
    [fixture.nestedNote.name, fixture.mimeOnlyNote.name].map(visibleNoteTitle).sort(),
  )

  await setNotesDisplayMode(page, 'list')
  await waitForNotesRows(page, 3)

  await setNotesSearch(page, fixture.projectsDir.name)
  await waitForNotesRows(page, 2)
  expect((await notesSnapshot(page)).rows.map((row) => row.title).sort()).toEqual(
    [fixture.nestedNote.name, fixture.mimeOnlyNote.name].map(visibleNoteTitle).sort(),
  )

  await setNotesSearch(page, fixture.nestedNote.name)
  await waitForNotesRows(page, 1)
  expect((await notesSnapshot(page)).rows[0]?.title).toBe(visibleNoteTitle(fixture.nestedNote.name))

  await setNotesSearch(page, '')
  await waitForNotesRows(page, 3)

  await openNoteFromQuickView(page, fixture.nestedNote.name)
  await waitForMarkdownDocument(page, fixture.nestedNote.id, fixture.nestedNote.name)

  await openMarkdownEditor(page)
  await page.waitForFunction(
    () => {
      const host = deepFind(document, 'markdown-preview') as HTMLElement | null
      const root = host ? host.shadowRoot : null
      const editor = root ? (root.querySelector('.source-editor') as HTMLTextAreaElement | null) : null
      const buttons = root ? Array.from(root.querySelectorAll('.mode-button')) : []
      const editButton = buttons.find((button) => (button.textContent ?? '').includes('Edit'))
      return Boolean(editor && editButton && editButton.getAttribute('aria-pressed') === 'true')

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
  expect(editor.activeEditor).toBe(false)
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
  expect(returned.rows.map((row) => row.title)).toContain(visibleNoteTitle(renamedName))
  expect(returned.rows.map((row) => row.title)).not.toContain(visibleNoteTitle(fixture.nestedNote.name))
})
