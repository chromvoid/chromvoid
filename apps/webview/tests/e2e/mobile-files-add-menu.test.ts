import {expect, test} from 'vitest'

import type {Browser} from 'playwright'
import type * as AppContextModule from '../../src/shared/services/app-context'
declare global {
  var __E2E_BROWSER__: Browser | undefined
}

const BASE_URL = 'http://localhost:4400/index.html'

test('mobile Files add menu opens one popup and executes from touch coordinates', async () => {
  const browser = globalThis.__E2E_BROWSER__!
  const context = await browser.newContext({
    viewport: {width: 390, height: 844},
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()

  try {
    await page.goto(`${BASE_URL}?surface=files&path=%2F&layout=mobile`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForFunction(
      () =>
        !document.documentElement.hasAttribute('loading') &&
        !document.body.hasAttribute('loading'),
      undefined,
      {timeout: 15_000},
    )

    const topToolbar = page.locator('mobile-top-toolbar').first()
    const dashboardHeader = page.locator('workspace-dashboard-header').first()
    const fileList = page.locator('dashboard-file-list').first()
    await Promise.all([
      topToolbar.waitFor({state: 'attached'}),
      dashboardHeader.waitFor({state: 'attached'}),
      fileList.waitFor({state: 'attached'}),
    ])

    const menu = dashboardHeader.locator('cv-menu-button.mobile-add-menu')
    const trigger = menu.locator('[part="trigger"]')
    await menu.waitFor({state: 'visible'})

    expect(await topToolbar.locator('cv-menu-button.overflow-menu').count()).toBe(0)
    expect(await menu.getAttribute('aria-label')).toBe('Add')
    expect(await menu.locator('cv-icon[name="plus"]').count()).toBe(1)

    const folderName = `touch-add-${Date.now()}`
    await page.evaluate((nextName) => {
      ;(window as any).dialogService.showCreateFolderDialog = async () => nextName
    }, folderName)

    const triggerBox = await trigger.boundingBox()
    expect(triggerBox).not.toBeNull()
    await page.touchscreen.tap(
      triggerBox!.x + triggerBox!.width / 2,
      triggerBox!.y + triggerBox!.height / 2,
    )

    const menuSurface = menu.locator('[part="menu"]')
    await menuSurface.waitFor({state: 'visible', timeout: 3_000})

    expect(await menu.evaluate((element) => (element as HTMLElement & {open?: boolean}).open)).toBe(true)
    expect(await menuSurface.count()).toBe(1)
    expect(await page.locator('[data-cv-menu-button-portal]').count()).toBe(0)
    expect(
      await menu.locator('cv-menu-item').evaluateAll((items) =>
        items.map((item) => item.getAttribute('value')),
      ),
    ).toEqual(['create-note', 'create-dir', 'upload'])

    const createFolderItem = menu.locator('cv-menu-item[value="create-dir"]')
    const itemBox = await createFolderItem.boundingBox()
    expect(itemBox).not.toBeNull()
    await page.touchscreen.tap(itemBox!.x + itemBox!.width / 2, itemBox!.y + itemBox!.height / 2)

    await page.waitForFunction(
      async (name) => {
        const dynamicImport = new Function('path', 'return import(path)') as (
          path: string,
        ) => Promise<typeof AppContextModule>
        const {getAppContext} = await dynamicImport('/shared/services/app-context.ts')
        const children = getAppContext().catalog.catalog.getChildren('/')
        return Array.isArray(children) && children.some((node) => node?.name === name)
      },
      folderName,
      {timeout: 8_000},
    )
  } finally {
    await context.close()
  }
})
