import assert from 'node:assert/strict'
import {existsSync} from 'node:fs'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {after, before, describe, it} from 'node:test'

import {chromium} from 'playwright'

const testRoot = dirname(fileURLToPath(import.meta.url))
const extensionPath = join(testRoot, '..', 'dist', 'chrome')
const firefoxExtensionPath = join(testRoot, '..', 'dist', 'firefox')

const loginFixture = `<!doctype html>
<html>
  <body>
    <form id="login-form">
      <input id="username" autocomplete="username" />
      <input id="password" type="password" autocomplete="current-password" />
    </form>
    <script>
      window.fillEvents = []
      for (const input of document.querySelectorAll('input')) {
        input.addEventListener('input', () => window.fillEvents.push(input.id + ':input'))
        input.addEventListener('change', () => window.fillEvents.push(input.id + ':change'))
      }
    </script>
  </body>
</html>`

const otpFixture = `<!doctype html>
<html>
  <body>
    <form id="otp-form">
      <input id="otp" inputmode="numeric" autocomplete="one-time-code" />
    </form>
  </body>
</html>`

const splitOtpFixture = `<!doctype html>
<html>
  <body>
    <form id="otp-form">
      <input name="code" inputmode="numeric" />
      <input name="code" inputmode="numeric" />
      <input name="code" inputmode="numeric" />
      <input name="code" inputmode="numeric" />
      <input name="code" inputmode="numeric" />
      <input name="code" inputmode="numeric" />
    </form>
  </body>
</html>`

const shadowOtpFixture = `<!doctype html>
<html>
  <body>
    <div id="otp-host"></div>
    <script>
      const shadowRoot = document.querySelector('#otp-host').attachShadow({mode: 'open'})
      const input = document.createElement('input')
      input.id = 'shadow-otp'
      input.autocomplete = 'one-time-code'
      shadowRoot.append(input)
    </script>
  </body>
</html>`

const fixtures = new Map([
  ['/login', loginFixture],
  ['/otp', otpFixture],
  ['/otp-split', splitOtpFixture],
  ['/otp-shadow', shadowOtpFixture],
])

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

const close = (server) => new Promise((resolve) => server.close(() => resolve()))

const waitForServiceWorker = async (context) => {
  return context.serviceWorkers()[0] ?? context.waitForEvent('serviceworker')
}

const sendToActiveTab = async (worker, message) => {
  await worker.evaluate(async (payload) => {
    const deadline = Date.now() + 5000
    let lastError

    while (Date.now() < deadline) {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true})
      if (tab?.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, payload)
          return
        } catch (error) {
          lastError = error
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    throw lastError ?? new Error('Active extension test tab was not found')
  }, message)
}

describe('packaged Chrome extension', {timeout: 45_000}, () => {
  let browserContext
  let extensionId
  let httpServer
  let origin
  let page
  let profilePath
  let serviceWorker

  before(async () => {
    httpServer = createServer((request, response) => {
      const body = fixtures.get(request.url ?? '')
      response.statusCode = body ? 200 : 404
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.end(body ?? 'Not found')
    })
    await listen(httpServer)
    const address = httpServer.address()
    assert.equal(typeof address, 'object')
    assert.ok(address)
    origin = `http://127.0.0.1:${address.port}`

    profilePath = await mkdtemp(join(tmpdir(), 'chromvoid-extension-test-'))
    browserContext = await chromium.launchPersistentContext(profilePath, {
      channel: 'chromium',
      headless: true,
      locale: 'en-US',
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    })
    serviceWorker = await waitForServiceWorker(browserContext)
    extensionId = new URL(serviceWorker.url()).host
    page = browserContext.pages()[0] ?? (await browserContext.newPage())
  })

  after(async () => {
    await browserContext?.close()
    if (httpServer) {
      await close(httpServer)
    }
    if (profilePath) {
      await rm(profilePath, {recursive: true, force: true})
    }
  })

  it('loads the Manifest V3 service worker', () => {
    assert.match(serviceWorker.url(), /^chrome-extension:\/\/[a-z]+\/dist\/service-worker\.js$/)
    assert.match(extensionId, /^[a-z]+$/)
  })

  it('does not ship popup test fixtures in the production package', () => {
    assert.equal(existsSync(join(extensionPath, 'popup-fixture.js')), false)
    assert.equal(existsSync(join(extensionPath, 'tests')), false)
  })

  it('packages a Firefox manifest with the same popup and content-script contract', async () => {
    const chromeManifest = JSON.parse(await readFile(join(extensionPath, 'manifest.json'), 'utf8'))
    const firefoxManifest = JSON.parse(await readFile(join(firefoxExtensionPath, 'manifest.json'), 'utf8'))

    assert.equal(firefoxManifest.key, undefined)
    assert.equal(firefoxManifest.action.default_popup, chromeManifest.action.default_popup)
    assert.deepEqual(firefoxManifest.content_scripts, chromeManifest.content_scripts)
    assert.deepEqual(firefoxManifest.background, chromeManifest.background)
    assert.equal(
      firefoxManifest.browser_specific_settings?.gecko?.id,
      'chromvoid-passwordmanager@chromvoid.local',
    )
  })

  it('fills username and password through real tab messaging', async () => {
    await page.goto(`${origin}/login`)
    await page.bringToFront()

    await sendToActiveTab(serviceWorker, {
      action: 'fill_form',
      from: 'chrome_smoke_test',
      data: {
        id: 'entry-1',
        username: 'alice@example.com',
        password: 'correct horse battery staple',
        expectedOrigin: origin,
      },
    })

    assert.equal(await page.locator('#username').inputValue(), 'alice@example.com')
    assert.equal(await page.locator('#password').inputValue(), 'correct horse battery staple')
    assert.deepEqual(await page.evaluate(() => window.fillEvents), [
      'username:change',
      'username:input',
      'password:change',
      'password:input',
    ])
  })

  it('fills a standard one-time-code input', async () => {
    await page.goto(`${origin}/otp`)
    await page.bringToFront()

    await sendToActiveTab(serviceWorker, {
      action: 'fill_otp',
      from: 'chrome_smoke_test',
      data: {id: 'entry-1', username: 'alice@example.com', otp: '123456', expectedOrigin: origin},
    })

    assert.equal(await page.locator('#otp').inputValue(), '123456')
  })

  it('fills six-field OTP forms', async () => {
    await page.goto(`${origin}/otp-split`)
    await page.bringToFront()

    await sendToActiveTab(serviceWorker, {
      action: 'fill_otp',
      from: 'chrome_smoke_test',
      data: {id: 'entry-1', username: 'alice@example.com', otp: '654321', expectedOrigin: origin},
    })

    assert.deepEqual(
      await page.locator('input').evaluateAll((inputs) => inputs.map((input) => input.value)),
      ['6', '5', '4', '3', '2', '1'],
    )
  })

  it('finds one-time-code inputs in open shadow roots', async () => {
    await page.goto(`${origin}/otp-shadow`)
    await page.locator('#otp-host input').waitFor()
    await page.bringToFront()

    await sendToActiveTab(serviceWorker, {
      action: 'fill_otp',
      from: 'chrome_smoke_test',
      data: {id: 'entry-1', username: 'alice@example.com', otp: '112233', expectedOrigin: origin},
    })

    assert.equal(await page.locator('#otp-host input').inputValue(), '112233')
  })

  it('rejects fill messages captured for another origin', async () => {
    await page.goto(`${origin}/login`)
    await page.bringToFront()

    await sendToActiveTab(serviceWorker, {
      action: 'fill_form',
      from: 'chrome_smoke_test',
      data: {
        id: 'entry-1',
        username: 'mallory@example.com',
        password: 'must-not-fill',
        expectedOrigin: 'https://other.example',
      },
    })

    assert.equal(await page.locator('#username').inputValue(), '')
    assert.equal(await page.locator('#password').inputValue(), '')
  })

  it('boots and settles the packaged popup without runtime errors', async (testContext) => {
    const popup = await browserContext.newPage()
    const pageErrors = []
    popup.on('pageerror', (error) => pageErrors.push(error.message))

    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await popup.locator('app-root .title').waitFor({timeout: 10_000})
    assert.equal(await popup.locator('app-root .title').textContent(), 'ChromVoid')
    await popup.waitForFunction(
      () => {
        const root = document.querySelector('app-root')?.shadowRoot
        return Boolean(root && !root.querySelector('.loading'))
      },
      undefined,
      {timeout: 15_000},
    )

    const runtimeState = await popup.evaluate(() => {
      const root = document.querySelector('app-root')?.shadowRoot
      if (!root) {
        return {mode: 'missing-root', text: ''}
      }
      if (root.querySelector('credential-row')) {
        return {mode: 'records', text: root.querySelector('.list')?.textContent?.trim() ?? ''}
      }
      if (root.querySelector('ext-pairing-form')) {
        return {mode: 'pairing', text: root.querySelector('.pairing')?.textContent?.trim() ?? ''}
      }
      if (root.querySelector('recovery-state')) {
        const recovery = root.querySelector('recovery-state')?.shadowRoot
        return {mode: 'recovery', text: recovery?.textContent?.trim() ?? ''}
      }
      if (root.querySelector('.empty')) {
        return {mode: 'empty', text: root.querySelector('.empty')?.textContent?.trim() ?? ''}
      }
      return {mode: 'unknown', text: root.textContent?.trim() ?? ''}
    })

    assert.ok(['records', 'pairing', 'recovery', 'empty'].includes(runtimeState.mode))
    assert.deepEqual(pageErrors, [])
    testContext.diagnostic(
      `popup state: ${runtimeState.mode}${runtimeState.text ? ` (${runtimeState.text})` : ''}`,
    )

    await popup.close()
  })
})
