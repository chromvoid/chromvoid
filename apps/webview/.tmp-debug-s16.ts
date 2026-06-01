import {chromium} from 'playwright'
import {ensureViteStarted, stopVite} from './tests/e2e/server.ts'

void (async () => {
  await ensureViteStarted()
  const browser = await chromium.launch({headless: true})
  const page = await (await browser.newContext()).newPage()
  await page.goto('http://localhost:4400/index.html?surface=files')
  await page.waitForFunction(() => {
    const ctx = window.getAppContext?.()
    return !!ctx?.ws?.connected?.() && ctx?.state?.data?.()?.StorageOpened === true
  })

  console.log('before', await page.evaluate(() => ({
    connected: window.getAppContext?.()?.ws?.connected?.(),
    connecting: window.getAppContext?.()?.ws?.connecting?.(),
    state: window.getAppContext?.()?.state?.data?.(),
    route: window.router?.route?.(),
  })))

  await page.evaluate(() => window.getAppContext?.()?.ws?.disconnect?.())
  console.log('after disconnect', await page.evaluate(() => ({
    connected: window.getAppContext?.()?.ws?.connected?.(),
    connecting: window.getAppContext?.()?.ws?.connecting?.(),
    state: window.getAppContext?.()?.state?.data?.(),
    route: window.router?.route?.(),
  })))

  await page.evaluate(() => window.getAppContext?.()?.ws?.connect?.())
  for (let i = 0; i < 10; i += 1) {
    await page.waitForTimeout(500)
    console.log('tick', i, await page.evaluate(() => ({
      connected: window.getAppContext?.()?.ws?.connected?.(),
      connecting: window.getAppContext?.()?.ws?.connecting?.(),
      state: window.getAppContext?.()?.state?.data?.(),
      route: window.router?.route?.(),
    })))
  }

  await browser.close()
  await stopVite()
})()
