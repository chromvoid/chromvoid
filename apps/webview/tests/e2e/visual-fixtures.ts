import type {Page} from 'playwright'
import type * as AppContextModule from '../../src/shared/services/app-context'

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

export async function seedVisualFilesGridFixture(extraItems = 0): Promise<void> {
  const previewSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
      <rect width="640" height="420" fill="currentColor"/>
      <path d="M0 320L190 142l112 104 86-78 252 252H0Z" fill="currentColor" opacity=".42"/>
      <circle cx="488" cy="104" r="54" fill="currentColor" opacity=".72"/>
      <path d="M86 92h228v18H86zm0 38h164v12H86z" fill="currentColor" opacity=".88"/>
    </svg>
  `.trim()
  const baseNodes: CatalogNode[] = [
    {
      id: 1,
      type: 1,
      name: 'Vault architecture overview.svg',
      size: Buffer.byteLength(previewSvg),
      modtime: FIXED_TIME - 60_000,
      parentId: 0,
      children: [],
      mimeType: 'image/svg+xml',
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
      name: 'Quarterly security architecture review final approved copy 2026.md',
      size: 18_432,
      modtime: FIXED_TIME - 240_000,
      parentId: 0,
      children: [],
      mimeType: 'text/markdown',
      sourceRevision: 1,
    },
    {
      id: 5,
      type: 1,
      name: 'Product walkthrough.mp4',
      size: 28_311_552,
      modtime: FIXED_TIME - 300_000,
      parentId: 0,
      children: [],
      mimeType: 'video/mp4',
    },
    {
      id: 6,
      type: 1,
      name: 'Release bundle.zip',
      size: 7_340_032,
      modtime: FIXED_TIME - 360_000,
      parentId: 0,
      children: [],
      mimeType: 'application/zip',
    },
    {
      id: 7,
      type: 1,
      name: 'storage-adapter.ts',
      size: 7_168,
      modtime: FIXED_TIME - 420_000,
      parentId: 0,
      children: [],
      mimeType: 'text/typescript',
    },
    {
      id: 8,
      type: 1,
      name: 'Recovery checklist.txt',
      size: 4_096,
      modtime: FIXED_TIME - 480_000,
      parentId: 0,
      children: [],
      mimeType: 'text/plain',
    },
    {
      id: 9,
      type: 0,
      name: 'Archive 2026',
      size: 0,
      modtime: FIXED_TIME - 540_000,
      parentId: 0,
      children: [],
    },
    {
      id: 10,
      type: 1,
      name: '.retention-policy.json',
      size: 2_048,
      modtime: FIXED_TIME - 600_000,
      parentId: 0,
      children: [],
      mimeType: 'application/json',
    },
    {
      id: 11,
      type: 1,
      name: 'Vendor agreement.docx',
      size: 192_512,
      modtime: FIXED_TIME - 660_000,
      parentId: 0,
      children: [],
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    {
      id: 12,
      type: 1,
      name: 'Network map.svg',
      size: Buffer.byteLength(previewSvg),
      modtime: FIXED_TIME - 720_000,
      parentId: 0,
      children: [],
      mimeType: 'image/svg+xml',
      sourceRevision: 1,
    },
  ]
  const overflowNodes = Array.from({length: extraItems}, (_, index): CatalogNode => {
    const id = baseNodes.length + index + 1
    return {
      id,
      type: 1,
      name: `Archived release note ${String(index + 1).padStart(2, '0')}.txt`,
      size: 1_024 + index * 97,
      modtime: FIXED_TIME - (id + 1) * 60_000,
      parentId: 0,
      children: [],
      mimeType: 'text/plain',
    }
  })
  const nodes = [...baseNodes, ...overflowNodes]

  await writeMockCatalogState({
    version: 1,
    nextId: nodes.length + 1,
    nodes: [
      [
        0,
        {
          id: 0,
          type: 0,
          name: '/',
          size: 0,
          modtime: FIXED_TIME,
          parentId: null,
          children: nodes.map((node) => node.id),
        },
      ],
      ...nodes.map((node) => [node.id, node]),
    ],
    files: [
      [1, Buffer.from(previewSvg).toString('base64')],
      [4, Buffer.from('# Quarterly security architecture review').toString('base64')],
      [7, Buffer.from('export const adapter = true').toString('base64')],
      [8, Buffer.from('Recovery checklist').toString('base64')],
      [10, Buffer.from('{"retention": true}').toString('base64')],
      [12, Buffer.from(previewSvg).toString('base64')],
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

export async function seedVisualEmptyNotesFixture(): Promise<void> {
  const root: CatalogNode = {
    id: 0,
    type: 0,
    name: '/',
    size: 0,
    modtime: FIXED_TIME,
    parentId: null,
    children: [],
  }

  await writeMockCatalogState({
    version: 1,
    nextId: 1,
    nodes: [[root.id, root]],
    files: [],
    secrets: [],
    otpSecrets: [],
  })
}

export async function seedVisualPassmanagerFixture(options?: {
  authoredGroupDescription?: boolean
  structuredWebsites?: boolean
}): Promise<void> {
  await clearMockPassmanagerState()
  await writeMockPassmanagerState({
    version: 1,
    revision: 1,
    nextNodeId: 6,
    folders: ['Production'],
    foldersMeta: [
      {
        path: 'Production',
        description: options?.authoredGroupDescription
          ? 'Deployment credentials for production services.'
          : undefined,
      },
    ],
    entries: [
      {
        nodeId: 2,
        meta: {
          id: 'visual-github',
          title: 'GitHub Admin',
          username: 'alice@example.test',
          urls: options?.structuredWebsites
            ? [
                {value: 'https://github.com', match: 'host'},
                {value: 'https://github.com/login', match: 'exact'},
                {value: '^https://github\\.com/orgs/.+/settings$', match: 'regex'},
                {value: 'https://docs.github.com', match: 'base_domain'},
              ]
            : [{value: 'https://github.com/login', match: 'base_domain'}],
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

export async function seedVisualEmptyPassmanagerFixture(): Promise<void> {
  await clearMockPassmanagerState()
  await writeMockPassmanagerState({
    version: 1,
    revision: 1,
    nextNodeId: 2,
    folders: [],
    foldersMeta: [],
    entries: [],
    secrets: [],
    otpSecrets: [],
    icons: [],
  })
}

export async function seedVisualPassmanagerTagSnippetFixture(): Promise<void> {
  const tags = ['Work', 'Production', 'Security Audit', 'Emergency Access', 'Operations']

  await clearMockPassmanagerState()
  await writeMockPassmanagerState({
    version: 1,
    revision: 1,
    nextNodeId: 3,
    folders: [],
    foldersMeta: [],
    tags,
    tagMeta: {
      work: {colorId: 'green'},
      production: {colorId: 'blue'},
      'security audit': {colorId: 'pink'},
      'emergency access': {colorId: 'orange'},
      operations: {colorId: 'cyan'},
    },
    entries: [
      {
        nodeId: 2,
        meta: {
          id: 'visual-tag-snippet',
          title: 'Infrastructure Admin',
          username: 'ops@example.test',
          urls: [{value: 'https://admin.example.test', match: 'base_domain'}],
          tags,
          otps: [
            {
              id: 'visual-tag-snippet-otp',
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
    ],
    secrets: [['visual-tag-snippet:password', 'CorrectHorseBatteryStaple!2026']],
    otpSecrets: [['visual-tag-snippet:Primary', {secret: 'JBSWY3DPEHPK3PXP', digits: 6, period: 60}]],
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
  await waitForDeepSelector(
    page,
    layout === 'mobile' ? 'file-manager-mobile-layout' : 'file-manager-desktop-layout',
  )
  await waitForDeepSelector(page, layout === 'mobile' ? 'file-item-mobile' : 'dashboard-file-list')
}

export async function setFilesViewMode(page: Page, viewMode: 'list' | 'grid' | 'table'): Promise<void> {
  await page.evaluate(async (nextViewMode) => {
    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<typeof AppContextModule>
    const {getAppContext} = await dynamicImport('/shared/services/app-context.ts')
    const store = getAppContext().store
    store.setSearchFilters({...store.searchFilters(), viewMode: nextViewMode})
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }, viewMode)

  await waitForDeepSelector(
    page,
    `file-item-desktop[view-mode="${viewMode}"], file-item-mobile[view-mode="${viewMode}"]`,
  )
}

export async function selectFileGridItem(page: Page, itemIndex = 0): Promise<void> {
  const selectedId = await page.evaluate(async (index) => {
    function deepCollect(root: Document | ShadowRoot, selector: string, acc: Element[] = []): Element[] {
      acc.push(...root.querySelectorAll(selector))
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) deepCollect(element.shadowRoot, selector, acc)
      }
      return acc
    }

    const hosts = deepCollect(
      document,
      'file-item-desktop[view-mode="grid"][data-id], file-item-mobile[view-mode="grid"][data-id]',
    )
    const host = hosts[index] as HTMLElement | undefined
    const id = Number(host?.getAttribute('data-id') ?? Number.NaN)
    if (!host || !Number.isFinite(id)) throw new Error(`grid file item not found at index ${index}`)

    const dynamicImport = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<typeof AppContextModule>
    const {getAppContext} = await dynamicImport('/shared/services/app-context.ts')
    const store = getAppContext().store
    store.setSelectionMode(true)
    store.setSelectedItems([id])
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    return id
  }, itemIndex)

  await waitForDeepSelector(page, `[view-mode="grid"][data-id="${selectedId}"][selected]`)
}

export async function openPasswords(
  page: Page,
  layout: VisualLayout,
  pm?: string,
  width?: number,
): Promise<void> {
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
  await page.waitForFunction(
    () => Boolean((window as unknown as {passmanager?: unknown}).passmanager),
    undefined,
    {
      timeout: 10_000,
    },
  )
}

export async function selectPasswordGroup(page: Page, name: string): Promise<void> {
  await page.locator('group-tree-view .row[data-kind="group"]').filter({hasText: name}).first().click()
  await page.waitForFunction(
    (expectedName) => {
      function deepFind(root: Document | ShadowRoot, selector: string): Element | null {
        const found = root.querySelector(selector)
        if (found) return found
        for (const element of root.querySelectorAll('*')) {
          if (element.shadowRoot) {
            const inner = deepFind(element.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }

      const header = deepFind(document, 'pm-workspace-header') as (HTMLElement & {title?: string}) | null
      return header?.title === expectedName
    },
    name,
    {timeout: 10_000},
  )
}

export async function openNotes(
  page: Page,
  layout: VisualLayout,
  width?: number,
  expectedRows = 3,
): Promise<void> {
  const viewport = layout === 'mobile' ? {width: width ?? 390, height: 844} : {width: 1280, height: 720}
  await page.setViewportSize(viewport)
  const url = new URL(BASE_URL)
  url.searchParams.set('surface', 'notes')
  url.searchParams.set('layout', layout)
  await page.goto(url.toString(), {waitUntil: 'domcontentloaded'})
  await waitForDeepSelector(page, layout === 'mobile' ? 'notes-quick-view-mobile' : 'notes-quick-view')
  await waitForNotesRows(page, expectedRows)
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
    const passmanager = (window as unknown as {passmanager?: {showElement?: {set(value: string): void}}})
      .passmanager
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
      const passmanager = (window as unknown as {passmanager?: {showElement?: () => {id?: string}}})
        .passmanager
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
      return (
        Boolean(root?.querySelector('mobile-bottom-action-footer.entry-action-footer[columns="2"]')) &&
        Boolean(root?.querySelector('.entry-edit-save-action'))
      )
    },
    undefined,
    {timeout: 10_000},
  )
}

export async function showFirstMobileGroupEdit(page: Page): Promise<void> {
  await page.evaluate(() => {
    const passmanager = (
      window as unknown as {
        passmanager?: {
          entriesList?: () => Array<{constructor?: {name?: string}; name?: string}>
          showElement?: {set(value: unknown): void}
        }
      }
    ).passmanager
    const group = passmanager
      ?.entriesList?.()
      ?.find((item) => item?.constructor?.name === 'Group' && item.name === 'Production')
    if (!group) throw new Error('visual password fixture did not contain the Production group')

    passmanager?.showElement?.set(group)
  })

  await page.waitForFunction(() => {
    const passmanager = (
      window as unknown as {
        passmanager?: {showElement?: () => {name?: string}}
      }
    ).passmanager
    return passmanager?.showElement?.()?.name === 'Production'
  })
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )

  await page.evaluate(async () => {
    const {pmMobileChromeModel} = await (0, eval)(
      'import("/features/passmanager/models/pm-mobile-chrome.model.ts")',
    )
    if (!pmMobileChromeModel.executeCommand('pm-edit-group')) {
      throw new Error('mobile group edit command was not available')
    }
  })

  await waitForDeepSelector(page, 'pm-group-edit-mobile')
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
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
    ) => Promise<typeof AppContextModule>
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
    ) => Promise<typeof AppContextModule>
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
