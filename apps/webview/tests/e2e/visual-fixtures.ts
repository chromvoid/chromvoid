import type {Page} from 'playwright'

import {clearMockPassmanagerState, writeMockPassmanagerState} from './utils'

const BASE_URL = 'http://localhost:4400/index.html'
const FIXED_TIME = 1_700_000_000_000

type CatalogNode = {
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

type VisualLayout = 'desktop' | 'mobile'

export async function installFixedVisualClock(page: Page): Promise<void> {
  await page.addInitScript((fixedTime) => {
    const NativeDate = Date
    class FixedDate extends NativeDate {
      constructor(...args: ConstructorParameters<DateConstructor>) {
        super(...(args.length > 0 ? args : [fixedTime]))
      }

      static now() {
        return fixedTime
      }
    }
    Object.setPrototypeOf(FixedDate, NativeDate)
    globalThis.Date = FixedDate as DateConstructor
  }, FIXED_TIME)
}

export async function waitForDeepSelector(page: Page, selector: string, timeout = 10_000): Promise<void> {
  await page.waitForFunction(
    (sel) => {
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

      return Boolean(deepFind(document, sel))
    },
    selector,
    {timeout},
  )
}

export async function hasDeepSelector(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
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

    return Boolean(deepFind(document, sel))
  }, selector)
}

export async function hasHorizontalOverflow(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
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

    const element = deepFind(document, sel) as HTMLElement | null
    return element ? element.scrollWidth > element.clientWidth + 1 : true
  }, selector)
}

async function writeMockCatalogState(state: unknown): Promise<void> {
  const response = await fetch('http://localhost:4400/api/mock-state', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(state),
  })
  if (!response.ok) {
    throw new Error(`mock state write failed: ${response.status}`)
  }
}

export async function seedVisualFilesFixture(): Promise<void> {
  const nodes: CatalogNode[] = [
    {
      id: 0,
      type: 0,
      name: '/',
      size: 0,
      modtime: FIXED_TIME,
      parentId: null,
      children: [1, 2, 3, 4, 5, 6],
    },
    {
      id: 1,
      type: 1,
      name: 'Project brief.md',
      size: 18_432,
      modtime: FIXED_TIME - 60_000,
      parentId: 0,
      children: [],
      mimeType: 'text/markdown',
      sourceRevision: 1,
    },
    {
      id: 2,
      type: 0,
      name: 'Design assets',
      size: 0,
      modtime: FIXED_TIME - 120_000,
      parentId: 0,
      children: [],
    },
    {
      id: 3,
      type: 1,
      name: 'Quarterly report.pdf',
      size: 485_376,
      modtime: FIXED_TIME - 180_000,
      parentId: 0,
      children: [],
      mimeType: 'application/pdf',
    },
    {
      id: 4,
      type: 1,
      name: 'Vault diagram.png',
      size: 96_512,
      modtime: FIXED_TIME - 240_000,
      parentId: 0,
      children: [],
      mimeType: 'image/png',
    },
    {
      id: 5,
      type: 1,
      name: 'Release checklist.txt',
      size: 7_168,
      modtime: FIXED_TIME - 300_000,
      parentId: 0,
      children: [],
      mimeType: 'text/plain',
    },
    {
      id: 6,
      type: 0,
      name: 'Archive',
      size: 0,
      modtime: FIXED_TIME - 360_000,
      parentId: 0,
      children: [],
    },
  ]

  await writeMockCatalogState({
    version: 1,
    nextId: 7,
    nodes: nodes.map((node) => [node.id, node]),
    files: [
      [1, Buffer.from('# Project brief').toString('base64')],
      [5, Buffer.from('Release checklist').toString('base64')],
    ],
    secrets: [],
    otpSecrets: [],
  })
}

export async function seedVisualNotesFixture(): Promise<void> {
  const notes: CatalogNode[] = [
    {
      id: 1,
      type: 1,
      name: 'Design notes.md',
      size: 16_384,
      modtime: FIXED_TIME - 60_000,
      parentId: 0,
      children: [],
      mimeType: 'text/markdown',
      sourceRevision: 1,
    },
    {
      id: 2,
      type: 0,
      name: 'Projects',
      size: 0,
      modtime: FIXED_TIME - 120_000,
      parentId: 0,
      children: [3, 4],
    },
    {
      id: 3,
      type: 1,
      name: 'Roadmap.markdown',
      size: 12_288,
      modtime: FIXED_TIME - 180_000,
      parentId: 2,
      children: [],
      mimeType: 'text/markdown',
      sourceRevision: 2,
    },
    {
      id: 4,
      type: 1,
      name: 'Release notes.md',
      size: 8_192,
      modtime: FIXED_TIME - 240_000,
      parentId: 2,
      children: [],
      mimeType: 'text/markdown',
      sourceRevision: 3,
    },
  ]
  const root: CatalogNode = {
    id: 0,
    type: 0,
    name: '/',
    size: 0,
    modtime: FIXED_TIME,
    parentId: null,
    children: [1, 2],
  }

  await writeMockCatalogState({
    version: 1,
    nextId: 5,
    nodes: [root, ...notes].map((node) => [node.id, node]),
    files: notes
      .filter((node) => node.type === 1)
      .map((node) => [node.id, Buffer.from(`# ${node.name}`).toString('base64')]),
    secrets: [],
    otpSecrets: [],
  })
}

export async function seedVisualPassmanagerFixture(): Promise<void> {
  await clearMockPassmanagerState()
  await writeMockPassmanagerState({
    version: 1,
    revision: 1,
    nextNodeId: 6,
    folders: ['Production'],
    foldersMeta: [],
    entries: [
      {
        nodeId: 2,
        meta: {
          id: 'visual-github',
          title: 'GitHub Admin',
          username: 'alice@example.test',
          urls: [{value: 'https://github.com/login', match: 'base_domain'}],
          otps: [
            {
              id: 'visual-github-otp',
              label: 'Primary',
              algorithm: 'SHA1',
              digits: 6,
              period: 60,
              encoding: 'base32',
              type: 'TOTP',
            },
          ],
        },
      },
      {
        nodeId: 3,
        meta: {
          id: 'visual-aws',
          title: 'AWS Console',
          username: 'root@example.test',
          folderPath: 'Production',
          urls: [{value: 'https://console.aws.amazon.com', match: 'base_domain'}],
          otps: [
            {
              id: 'visual-aws-otp',
              label: 'Admin',
              algorithm: 'SHA1',
              digits: 6,
              period: 60,
              encoding: 'base32',
              type: 'TOTP',
            },
          ],
        },
      },
      {
        nodeId: 4,
        meta: {
          id: 'visual-vpn',
          title: 'Legacy VPN',
          username: 'ops',
          urls: [{value: 'https://vpn.example.test', match: 'base_domain'}],
          otps: [
            {
              id: 'visual-vpn-otp',
              label: 'Hardware',
              algorithm: 'SHA1',
              digits: 6,
              counter: 7,
              encoding: 'base32',
              type: 'HOTP',
            },
          ],
        },
      },
      {
        nodeId: 5,
        meta: {
          id: 'visual-card',
          title: 'Corporate Card',
          entryType: 'payment_card',
          paymentCard: {
            holderName: 'Visual Tester',
            brand: 'visa',
            last4: '4242',
            expiryMonth: '12',
            expiryYear: '2030',
          },
        },
      },
    ],
    secrets: [],
    otpSecrets: [
      ['visual-github:Primary', {secret: 'JBSWY3DPEHPK3PXP', digits: 6, period: 60}],
      ['visual-aws:Admin', {secret: 'JBSWY3DPEHPK3PXP', digits: 6, period: 60}],
      ['visual-vpn:Hardware', {secret: 'JBSWY3DPEHPK3PXP', digits: 6, period: 30}],
    ],
    icons: [],
  })
}

export async function openFiles(page: Page, layout: VisualLayout, width?: number): Promise<void> {
  const viewport = layout === 'mobile' ? {width: width ?? 390, height: 844} : {width: 1280, height: 720}
  await page.setViewportSize(viewport)
  const url = new URL(BASE_URL)
  url.searchParams.set('surface', 'files')
  url.searchParams.set('path', '/')
  url.searchParams.set('layout', layout)
  if (layout === 'mobile') {
    url.searchParams.set('e2eWidth', String(width ?? 390))
  }
  await page.goto(url.toString(), {waitUntil: 'domcontentloaded'})
  await waitForDeepSelector(page, layout === 'mobile' ? 'file-manager-mobile-layout' : 'file-manager-desktop-layout')
  await waitForDeepSelector(page, layout === 'mobile' ? 'file-item-mobile' : 'dashboard-file-list')
}

export async function openPasswords(page: Page, layout: VisualLayout, pm?: string, width?: number): Promise<void> {
  const viewport = layout === 'mobile' ? {width: width ?? 390, height: 844} : {width: 1280, height: 720}
  await page.setViewportSize(viewport)
  const url = new URL(BASE_URL)
  url.searchParams.set('surface', 'passwords')
  url.searchParams.set('layout', layout)
  if (layout === 'mobile') {
    url.searchParams.set('e2eWidth', String(width ?? 390))
  }
  if (pm) {
    url.searchParams.set('pm', pm)
  }
  await page.goto(url.toString(), {waitUntil: 'domcontentloaded'})
  await waitForDeepSelector(page, 'password-manager')
  await page.waitForFunction(() => Boolean((window as unknown as {passmanager?: unknown}).passmanager), undefined, {
    timeout: 10_000,
  })
}

export async function openNotes(page: Page, layout: VisualLayout, width?: number): Promise<void> {
  const viewport = layout === 'mobile' ? {width: width ?? 390, height: 844} : {width: 1280, height: 720}
  await page.setViewportSize(viewport)
  const url = new URL(BASE_URL)
  url.searchParams.set('surface', 'notes')
  url.searchParams.set('layout', layout)
  await page.goto(url.toString(), {waitUntil: 'domcontentloaded'})
  await waitForDeepSelector(page, layout === 'mobile' ? 'notes-quick-view-mobile' : 'notes-quick-view')
  await waitForNotesRows(page, 3)
}

export async function waitForNotesRows(page: Page, expectedCount: number): Promise<void> {
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

export async function waitForOtpRows(page: Page, expectedCount: number): Promise<void> {
  await page.waitForFunction(
    (count) => {
      const host = deepFind(document, 'pm-otp-quick-view, pm-otp-quick-view-mobile')
      return (host?.shadowRoot?.querySelectorAll('.row').length ?? 0) === count

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

export async function showCreateEntry(page: Page, layout: VisualLayout): Promise<void> {
  await page.evaluate(() => {
    const passmanager = (window as unknown as {passmanager?: {showElement?: {set(value: string): void}}}).passmanager
    passmanager?.showElement?.set('createEntry')
  })
  await waitForDeepSelector(page, layout === 'mobile' ? 'pm-entry-create-mobile' : 'pm-entry-create-desktop')
}

export async function showFirstMobileLoginEntryEdit(page: Page): Promise<void> {
  const entryId = await page.evaluate(() => {
    const passmanager = (
      window as unknown as {
        passmanager?: {
          entriesList?: () => Array<{entryType?: string; id?: string; title?: string}>
          showElement?: {set(value: unknown): void}
        }
      }
    ).passmanager
    const entry = passmanager
      ?.entriesList?.()
      ?.find((item) => item && item.title && item.entryType !== 'payment_card')
    if (!entry?.id) {
      return null
    }

    passmanager?.showElement?.set(entry)
    return entry.id
  })

  if (!entryId) {
    throw new Error('visual password fixture did not contain a login entry')
  }

  await page.waitForFunction(
    (id) => {
      const passmanager = (window as unknown as {passmanager?: {showElement?: () => {id?: string}}}).passmanager
      return passmanager?.showElement?.()?.id === id
    },
    entryId,
    {timeout: 10_000},
  )
  await waitForDeepSelector(page, 'pm-entry-mobile')

  await page.evaluate(() => {
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

    const editButton = deepFind(document, '.entry-edit-entry-action') as HTMLElement | null
    editButton?.click()
  })

  await page.waitForFunction(
    () => {
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

      const entry = deepFind(document, 'pm-entry-mobile') as HTMLElement | null
      const root = entry?.shadowRoot
      return Boolean(root?.querySelector('mobile-bottom-action-footer.entry-action-footer[columns="2"]'))
        && Boolean(root?.querySelector('.entry-edit-save-action'))
    },
    undefined,
    {timeout: 10_000},
  )
}

export async function selectFirstMobileFile(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const host = deepFind(document, 'file-item-mobile[data-id]') as HTMLElement | null
    const id = Number(host?.getAttribute('data-id') ?? Number.NaN)
    if (!host || !Number.isFinite(id)) {
      throw new Error('mobile file item not found')
    }

    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<typeof import('../../src/shared/services/app-context')>
    const {getAppContext} = await dynamicImport('/shared/services/app-context.ts')
    const store = getAppContext().store
    store.setSelectionMode(true)
    store.setSelectedItems([id])
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
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
  await waitForDeepSelector(page, 'file-item-mobile[selected]')
}

export async function selectFirstDesktopTableRow(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<typeof import('../../src/shared/services/app-context')>
    const {getAppContext} = await dynamicImport('/shared/services/app-context.ts')
    const store = getAppContext().store
    store.setSearchFilters({...store.searchFilters(), viewMode: 'table'})
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const row = deepFind(document, '.table-view .file-item-wrapper[data-id]') as HTMLElement | null
    const id = Number(row?.getAttribute('data-id') ?? Number.NaN)
    if (!row || !Number.isFinite(id)) {
      throw new Error('desktop table row not found')
    }

    store.setSelectionMode(true)
    store.setSelectedItems([id])
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
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
  await waitForDeepSelector(page, '.table-view .file-item-wrapper.selected')
}
