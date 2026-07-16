import assert from 'node:assert/strict'
import {createReadStream} from 'node:fs'
import {mkdir} from 'node:fs/promises'
import {createServer} from 'node:http'
import {extname, join, normalize} from 'node:path'
import {fileURLToPath} from 'node:url'
import {after, before, describe, it} from 'node:test'

import {chromium} from 'playwright'

const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url))
const screenshotRoot = join(workspaceRoot, 'output', 'playwright')
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
])

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

const close = (server) => new Promise((resolve) => server.close(resolve))
const waitForPaint = (page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

describe('browser extension popup UI', {timeout: 30_000}, () => {
  let browser
  let server
  let origin

  before(async () => {
    await mkdir(screenshotRoot, {recursive: true})
    server = createServer((request, response) => {
      const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
      const filePath = normalize(join(workspaceRoot, requestPath))
      if (!filePath.startsWith(workspaceRoot)) {
        response.writeHead(403).end()
        return
      }
      response.setHeader('content-type', contentTypes.get(extname(filePath)) ?? 'application/octet-stream')
      const stream = createReadStream(filePath)
      stream.on('error', () => response.writeHead(404).end('Not found'))
      stream.pipe(response)
    })
    await listen(server)
    const address = server.address()
    assert.equal(typeof address, 'object')
    origin = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({headless: true})
  })

  after(async () => {
    await browser?.close()
    await close(server)
  })

  it('renders a compact site-first list and preserves focus across detail navigation', async () => {
    const page = await browser.newPage({viewport: {width: 420, height: 560}, colorScheme: 'dark'})
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto(`${origin}/apps/browser-extensions/tests/popup-fixture.html`)

    await page.locator('app-root credential-row').first().waitFor()
    assert.equal(await page.locator('app-root credential-row').count(), 4)
    assert.equal(
      await page
        .locator('app-root .search-input')
        .evaluate((input) => input.getRootNode().activeElement === input),
      true,
    )
    await page.screenshot({path: join(screenshotRoot, 'browser-extension-popup-ready.png')})

    const firstRowButton = page.locator('app-root credential-row .identity').first()
    await firstRowButton.click()
    await page.locator('app-root credential-detail').waitFor()
    assert.equal(await page.locator('app-root credential-detail select option').count(), 2)
    await page.keyboard.press('Escape')
    await page.locator('app-root credential-row').first().waitFor()
    assert.equal(
      await firstRowButton.evaluate(
        (button) =>
          new Promise((resolve) =>
            requestAnimationFrame(() => resolve(button.getRootNode().activeElement === button)),
          ),
      ),
      true,
    )
    assert.deepEqual(pageErrors, [])
    await page.close()
  })

  it('keeps cross-site search results metadata-only', async () => {
    const page = await browser.newPage({viewport: {width: 420, height: 560}})
    await page.goto(`${origin}/apps/browser-extensions/tests/popup-fixture.html`)
    await page.locator('app-root .search-input').fill('other')
    await page.locator('app-root credential-row').waitFor()
    assert.equal(await page.locator('app-root credential-row .fill').count(), 0)

    await page.locator('app-root credential-row .identity').click()
    const detailButtons = await page.locator('app-root credential-detail button').allTextContents()
    assert.equal(
      detailButtons.some((text) => /password|пароль/i.test(text)),
      false,
    )
    assert.equal(
      detailButtons.some((text) => /open saved site|открыть/i.test(text)),
      true,
    )
    await waitForPaint(page)
    await page.screenshot({path: join(screenshotRoot, 'browser-extension-popup-cross-site.png')})
    await page.close()
  })

  it('submits an empty pairing form, explains the error, and focuses the PIN', async () => {
    const page = await browser.newPage({viewport: {width: 420, height: 560}})
    await page.goto(`${origin}/apps/browser-extensions/tests/popup-fixture.html?state=unpaired`)
    const submit = page.locator('app-root ext-pairing-form button')
    await submit.waitFor()
    assert.equal(await submit.isEnabled(), true)
    await submit.click()

    const input = page.locator('app-root ext-pairing-form input')
    await page.locator('app-root ext-pairing-form .error').waitFor()
    assert.equal(await input.getAttribute('aria-invalid'), 'true')
    assert.equal(await input.evaluate((element) => element.getRootNode().activeElement === element), true)
    await waitForPaint(page)
    await page.screenshot({path: join(screenshotRoot, 'browser-extension-popup-pairing-error.png')})
    await page.close()
  })

  it('keeps long Russian content usable at a short popup height', async () => {
    const page = await browser.newPage({viewport: {width: 420, height: 420}, colorScheme: 'dark'})
    await page.goto(`${origin}/apps/browser-extensions/tests/popup-fixture.html?lang=ru&long=1`)
    await page.locator('app-root credential-row').first().waitFor()
    assert.equal(await page.locator('app-root credential-row').count(), 4)
    assert.equal(
      (await page.locator('app-root credential-row .fill').first().textContent())?.trim(),
      'Заполнить',
    )
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight), true)
    await page.screenshot({path: join(screenshotRoot, 'browser-extension-popup-ru-short.png')})
    await page.close()
  })
})
