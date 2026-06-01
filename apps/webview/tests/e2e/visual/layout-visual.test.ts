import {expect, test} from 'vitest'

import {
  hasDeepSelector,
  hasHorizontalOverflow,
  installFixedVisualClock,
  openFiles,
  openNotes,
  openPasswords,
  seedVisualFilesFixture,
  seedVisualNotesFixture,
  seedVisualPassmanagerFixture,
  selectFirstDesktopTableRow,
  selectFirstMobileFile,
  showCreateEntry,
  showFirstMobileLoginEntryEdit,
  waitForDeepSelector,
  waitForOtpRows,
} from '../visual-fixtures'
import {assertVisualSnapshot} from '../visual-snapshot'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

function getPage(ctx: {skip: () => void}): import('playwright').Page | undefined {
  const page = globalThis.__E2E_PAGE__
  if (!page) {
    ctx.skip()
  }
  return page
}

test('visual: forced mobile shell on desktop viewport', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualFilesFixture()
  await openFiles(page, 'mobile')

  expect(await hasDeepSelector(page, 'mobile-tab-bar')).toBe(true)
  expect(await hasDeepSelector(page, 'file-app-shell-mobile-layout')).toBe(true)
  expect(await hasDeepSelector(page, 'file-app-shell-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'forced-mobile-shell-desktop-viewport', {
    suite: 'layout-shell',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: forced desktop shell on mobile viewport', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualFilesFixture()
  await openFiles(page, 'desktop')
  await page.setViewportSize({width: 375, height: 812})
  await page.goto('http://localhost:4400/index.html?surface=files&path=%2F&layout=desktop', {
    waitUntil: 'domcontentloaded',
  })
  await waitForDeepSelector(page, 'file-app-shell-desktop-layout')
  await waitForDeepSelector(page, 'navigation-rail')

  expect(await hasDeepSelector(page, 'file-app-shell-desktop-layout')).toBe(true)
  expect(await hasDeepSelector(page, 'navigation-rail')).toBe(true)
  expect(await hasDeepSelector(page, 'file-app-shell-mobile-layout')).toBe(false)
  expect(await hasDeepSelector(page, 'file-app-shell-desktop-layout mobile-tab-bar')).toBe(false)

  await assertVisualSnapshot(page, 'forced-desktop-shell-mobile-viewport', {
    suite: 'layout-shell',
    viewport: {width: 375, height: 812},
  })
})

test('visual: mobile file row selection surface', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualFilesFixture()
  await openFiles(page, 'mobile', 390)
  await selectFirstMobileFile(page)

  expect(await hasDeepSelector(page, 'file-item-mobile[selected]')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'file-manager-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-selected-file-row', {
    suite: 'file-manager',
    viewport: {width: 390, height: 844},
  })
})

test('visual: desktop table selected row surface', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualFilesFixture()
  await openFiles(page, 'desktop')
  await selectFirstDesktopTableRow(page)

  expect(await hasDeepSelector(page, '.table-view .file-item-wrapper.selected')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'file-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-table-selected-row', {
    suite: 'file-manager',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: desktop password manager gutters and integrated rail', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop')

  expect(await hasDeepSelector(page, 'password-manager-desktop-layout')).toBe(true)
  expect(await hasDeepSelector(page, '.sidebar')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-password-manager-surface', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: mobile password manager compact gutter', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 390)

  expect(await hasDeepSelector(page, 'password-manager-mobile-layout')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'password-manager-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-password-manager-390', {
    suite: 'password-manager',
    viewport: {width: 390, height: 844},
  })
})

test('visual: mobile password manager wide gutter', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 430)

  expect(await hasDeepSelector(page, 'password-manager-mobile-layout')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'password-manager-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-password-manager-430', {
    suite: 'password-manager',
    viewport: {width: 430, height: 844},
  })
})

test('visual: desktop create entry footer CTA', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop')
  await showCreateEntry(page, 'desktop')

  expect(await hasDeepSelector(page, 'pm-entry-create-desktop')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'password-manager-desktop-layout')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-create-entry', {
    suite: 'password-manager',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: mobile create entry footer CTA', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 390)
  await showCreateEntry(page, 'mobile')

  expect(await hasDeepSelector(page, 'pm-entry-create-mobile')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'password-manager-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-create-entry-390', {
    suite: 'password-manager',
    viewport: {width: 390, height: 844},
  })
})

test('visual: mobile entry edit footer CTA', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', undefined, 390)
  await showFirstMobileLoginEntryEdit(page)

  expect(await hasDeepSelector(page, 'pm-entry-mobile')).toBe(true)
  expect(await hasDeepSelector(page, '.entry-edit-save-action')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'password-manager-mobile-layout')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-entry-edit-footer-390', {
    suite: 'password-manager',
    viewport: {width: 390, height: 844},
  })
})

test('visual: desktop OTP quick view shared gutter', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'desktop', 'otp')
  await waitForOtpRows(page, 3)

  expect(await hasDeepSelector(page, 'pm-otp-quick-view')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'pm-otp-quick-view')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-otp-quick-view', {
    suite: 'otp-quick-view',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: mobile OTP quick view summary rail', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualPassmanagerFixture()
  await openPasswords(page, 'mobile', 'otp', 390)
  await waitForOtpRows(page, 3)

  expect(await hasDeepSelector(page, 'pm-otp-quick-view-mobile')).toBe(true)
  expect(await hasDeepSelector(page, '.quick-view__summary-rail')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'pm-otp-quick-view-mobile')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-otp-quick-view-390', {
    suite: 'otp-quick-view',
    viewport: {width: 390, height: 844},
  })
})

test('visual: desktop notes quick view shared gutter', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualNotesFixture()
  await openNotes(page, 'desktop')

  expect(await hasDeepSelector(page, 'notes-quick-view')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'notes-quick-view')).toBe(false)

  await assertVisualSnapshot(page, 'desktop-notes-quick-view', {
    suite: 'notes-quick-view',
    viewport: {width: 1280, height: 720},
  })
})

test('visual: mobile notes quick view wide gutter', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualNotesFixture()
  await openNotes(page, 'mobile', 430)

  expect(await hasDeepSelector(page, 'notes-quick-view-mobile')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'notes-quick-view-mobile')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-notes-quick-view-430', {
    suite: 'notes-quick-view',
    viewport: {width: 430, height: 844},
  })
})

test('visual: mobile notes quick view compact gutter', async (ctx) => {
  const page = getPage(ctx)
  if (!page) return

  await installFixedVisualClock(page)
  await seedVisualNotesFixture()
  await openNotes(page, 'mobile', 390)

  expect(await hasDeepSelector(page, 'notes-quick-view-mobile')).toBe(true)
  expect(await hasHorizontalOverflow(page, 'notes-quick-view-mobile')).toBe(false)

  await assertVisualSnapshot(page, 'mobile-notes-quick-view-390', {
    suite: 'notes-quick-view',
    viewport: {width: 390, height: 844},
  })
})
