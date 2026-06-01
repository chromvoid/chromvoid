import {captureSnapshot, writeJson} from '../helpers/artifacts.mjs'

async function waitForFilesDashboard(driver) {
  await driver.waitUntil(
    async () => {
      return await driver.execute(() => {
        function deepFind(root, selector) {
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

        return (
          window.router?.route?.() === 'dashboard'
          && !document.documentElement.hasAttribute('loading')
          && !document.body.hasAttribute('loading')
          && Boolean(deepFind(document, 'mobile-top-toolbar'))
          && Boolean(deepFind(document, 'dashboard-file-list'))
        )
      })
    },
    {
      timeout: 60_000,
      timeoutMsg: 'Expected mobile Files dashboard toolbar was not reached',
      interval: 1_000,
    },
  )
}

async function tapCssPoint(driver, {x, y}) {
  await driver.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: {pointerType: 'touch'},
      actions: [
        {type: 'pointerMove', duration: 0, x: Math.round(x), y: Math.round(y)},
        {type: 'pointerDown', button: 0},
        {type: 'pause', duration: 80},
        {type: 'pointerUp', button: 0},
      ],
    },
  ])
  await driver.releaseActions()
}

async function readTriggerCenter(driver) {
  return await driver.execute(() => {
    function deepFind(root, selector) {
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

    const toolbar = deepFind(document, 'mobile-top-toolbar')
    const menu = toolbar?.shadowRoot?.querySelector('cv-menu-button.overflow-menu')
    const trigger = menu?.shadowRoot?.querySelector('[part="trigger"]')
    if (!trigger) return null

    const rect = trigger.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
    }
  })
}

async function readCreateDirItemCenter(driver) {
  return await driver.execute(() => {
    function deepFind(root, selector) {
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

    const portalItem = document.querySelector(
      '[data-cv-menu-button-portal] cv-menu-item[value="create-dir"]',
    )
    const toolbar = deepFind(document, 'mobile-top-toolbar')
    const fallbackItem = toolbar?.shadowRoot
      ?.querySelector('cv-menu-button.overflow-menu')
      ?.querySelector('cv-menu-item[value="create-dir"]')
    const item = portalItem ?? fallbackItem
    if (!item) return null

    const rect = item.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
      hitTag: hit?.tagName ?? null,
      hitClass: hit?.className ? String(hit.className) : '',
    }
  })
}

export async function runFilesToolbarOverflowSmoke({driver, artifactRoot}) {
  await waitForFilesDashboard(driver)

  const folderName = `android-toolbar-overflow-${Date.now()}`
  await driver.execute((nextName) => {
    window.dialogService.showCreateFolderDialog = async () => nextName
  }, folderName)

  await captureSnapshot(driver, artifactRoot, '17-files-toolbar-overflow-before-open')

  const triggerCenter = await readTriggerCenter(driver)
  await writeJson(artifactRoot, 'files-toolbar-overflow-trigger.json', triggerCenter)
  if (!triggerCenter) {
    throw new Error('Files toolbar overflow trigger is missing')
  }

  await tapCssPoint(driver, triggerCenter)

  await driver.waitUntil(
    async () => {
      return await driver.execute(() => {
        function deepFind(root, selector) {
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

        const toolbar = deepFind(document, 'mobile-top-toolbar')
        const menu = toolbar?.shadowRoot?.querySelector('cv-menu-button.overflow-menu')
        return Boolean(menu?.open)
      })
    },
    {
      timeout: 10_000,
      timeoutMsg: 'Files toolbar overflow menu did not open after touch tap',
      interval: 500,
    },
  )

  await captureSnapshot(driver, artifactRoot, '18-files-toolbar-overflow-open')

  const itemCenter = await readCreateDirItemCenter(driver)
  await writeJson(artifactRoot, 'files-toolbar-overflow-create-dir-item.json', itemCenter)
  if (!itemCenter) {
    throw new Error('Files toolbar create-folder overflow item is missing')
  }

  await tapCssPoint(driver, itemCenter)

  await driver.waitUntil(
    async () => {
      return await driver.execute((expectedName) => {
        const children = window.getAppContext?.().catalog?.catalog?.getChildren?.('/') ?? []
        return Array.isArray(children) && children.some((node) => node?.name === expectedName)
      }, folderName)
    },
    {
      timeout: 15_000,
      timeoutMsg: 'Files toolbar create-folder overflow action did not create a folder',
      interval: 500,
    },
  )

  const result = await driver.execute((expectedName) => {
    const children = window.getAppContext?.().catalog?.catalog?.getChildren?.('/') ?? []
    return {
      folderName: expectedName,
      found: Array.isArray(children) && children.some((node) => node?.name === expectedName),
      route: window.router?.route?.() ?? null,
      href: location.href,
    }
  }, folderName)
  await writeJson(artifactRoot, 'files-toolbar-overflow-result.json', result)
  await captureSnapshot(driver, artifactRoot, '19-files-toolbar-overflow-created')

  if (!result.found) {
    throw new Error(`Created folder is missing after Files toolbar overflow action: ${JSON.stringify(result)}`)
  }
}
