import {expect, test} from 'vitest'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

const BASE_URL = 'http://localhost:4400/index.html?layout=desktop'

function getPage(): import('playwright').Page | undefined {
  return globalThis.__E2E_PAGE__
}

async function enablePasswordManager(page: import('playwright').Page): Promise<void> {
  await page.goto(BASE_URL)
  await page.evaluate(() => {
    localStorage.setItem('persist-local-storage-password-manager-mode', JSON.stringify({value: true}))
  })
  await page.reload()
  const deadline = Date.now() + 15_000
  let ready = false
  while (Date.now() < deadline) {
    ready = await page.evaluate(() => {
      const pm = (window as any).passmanager
      return Boolean(pm && typeof pm.load === 'function')
    })
    if (ready) break
    await page.waitForTimeout(150)
  }
  if (!ready) {
    throw new Error('passmanager not ready after 15000ms')
  }
  await page.waitForTimeout(300)
}

async function createEntryWithOtp(
  page: import('playwright').Page,
  params: {entryTitle: string; otpLabel: string; period: number},
): Promise<void> {
  const testStartTime = Date.now()
  await page.evaluate(
    async ({entryTitle, otpLabel, period, testStartTime}) => {
      const pm = (window as any).passmanager
      if (!pm) throw new Error('passmanager is not initialized')

      // Generate unique IDs for this test run
      const entryId = `entry-${testStartTime}-${Math.random().toString(36).slice(2, 9)}`
      const otpId = `otp-${testStartTime}-${Math.random().toString(36).slice(2, 9)}`

      const entry = pm.createEntry({id: entryId, title: entryTitle, username: 'otp-user', urls: []}, '', '', {
        id: otpId,
        label: otpLabel,
        algorithm: 'SHA1',
        digits: 6,
        period,
        encoding: 'base32',
        type: 'TOTP',
        secret: 'JBSWY3DPEHPK3PXP',
      })

      if (entry?.flushPendingPersistence) {
        await entry.flushPendingPersistence()
      }
      await pm.save()

      // Wait for save to propagate and reload
      await new Promise((r) => setTimeout(r, 300))
      await pm.load()

      // Retry finding the entry with OTP
      let target = null
      let attempts = 0
      const maxAttempts = 5

      while (attempts < maxAttempts) {
        target = (pm.allEntries ?? []).find((item: any) => item?.title === entryTitle)
        if (target) {
          const otps = target.otps?.() ?? []
          if (otps.length > 0) {
            break
          }
        }
        attempts++
        await new Promise((r) => setTimeout(r, 200))
        await pm.load()
      }

      if (!target) throw new Error('failed to resolve target entry after load')
      const otps = target.otps?.() ?? []
      if (!otps.length) throw new Error('target entry has no OTP after ' + maxAttempts + ' attempts')

      // Ensure OTP secret is present in backend using domain-ID-only contract.
      const otp = otps[0]
      const saver = pm.managerSaver as any
      const gateway = saver?.secrets as any
      const catalog = gateway?.catalog as any
      const transport = catalog?.transport as any
      if (!transport?.sendCatalog) {
        throw new Error('failed to access OTP transport for setSecret')
      }
      const setRes = await transport.sendCatalog('passmanager:otp:setSecret', {
        otp_id: otp.id,
        secret: 'JBSWY3DPEHPK3PXP',
      })
      if (!setRes?.ok) {
        throw new Error(`passmanager:otp:setSecret failed: ${String(setRes?.error ?? 'unknown')}`)
      }

      pm.showElement.set(target)
    },
    {...params, testStartTime},
  )
}

async function waitForOtpItem(page: import('playwright').Page): Promise<void> {
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
      return Boolean(deepFind(document, 'pm-entry-totp-item'))
    },
    undefined,
    {timeout: 15_000},
  )
}

async function installOtpCapture(page: import('playwright').Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as any
    const pm = win.passmanager
    const saver = pm?.managerSaver as any
    const gateway = saver?.secrets as any
    const catalog = gateway?.catalog as any
    const transport = catalog?.transport as any
    if (!transport || typeof transport.sendCatalog !== 'function') {
      throw new Error('failed to patch OTP transport')
    }

    win.__sendCatalogCalls = []
    win.__otpGenerateCalls = []
    win.__passmanagerEntryListCalls = []
    win.__catalogShardListCalls = []
    win.__otpGenerateOriginalSendCatalog = transport.sendCatalog.bind(transport)
    transport.sendCatalog = async (command: string, data: Record<string, unknown>) => {
      const result = await win.__otpGenerateOriginalSendCatalog(command, data)
      win.__sendCatalogCalls.push({command, data, at: Date.now(), result})
      if (command === 'passmanager:otp:generate') {
        win.__otpGenerateCalls.push({command, data, at: Date.now(), result})
      } else if (command === 'passmanager:entry:list') {
        win.__passmanagerEntryListCalls.push({command, data, at: Date.now(), result})
      } else if (command === 'catalog:shard:list') {
        win.__catalogShardListCalls.push({command, data, at: Date.now(), result})
      }
      return result
    }
  })
}

async function restoreOtpCapture(page: import('playwright').Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as any
    const pm = win.passmanager
    const saver = pm?.managerSaver as any
    const gateway = saver?.secrets as any
    const catalog = gateway?.catalog as any
    const transport = catalog?.transport as any

    if (transport && typeof win.__otpGenerateOriginalSendCatalog === 'function') {
      transport.sendCatalog = win.__otpGenerateOriginalSendCatalog
    }
    delete win.__otpGenerateOriginalSendCatalog
    delete win.__sendCatalogCalls
    delete win.__otpGenerateCalls
    delete win.__passmanagerEntryListCalls
    delete win.__catalogShardListCalls
  })
}

async function clearCapturedCalls(page: import('playwright').Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as any
    win.__sendCatalogCalls = []
    win.__otpGenerateCalls = []
    win.__passmanagerEntryListCalls = []
    win.__catalogShardListCalls = []
  })
}

async function emitCatalogMirrorNoise(page: import('playwright').Page, repeats: number): Promise<void> {
  await page.evaluate((count) => {
    const mirror = (window as any).catalog?.catalog
    if (!mirror || typeof mirror.applyEvent !== 'function') {
      throw new Error('catalog mirror is not available')
    }
    const rootNode = typeof mirror.findByPath === 'function' ? mirror.findByPath('/') : undefined
    const nodeId = Number(rootNode?.nodeId ?? 0)
    for (let i = 0; i < count; i++) {
      mirror.applyEvent({
        type: 'node_updated',
        nodeId,
        timestamp: Date.now() + i,
        version: i + 1,
        metadata: {},
      })
    }
  }, repeats)
}

async function clickReveal(page: import('playwright').Page): Promise<boolean> {
  return page.evaluate(() => {
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

    const item = deepFind(document, 'pm-entry-totp-item') as HTMLElement | null
    const toggle = item?.shadowRoot?.querySelector('.totp-actions cv-button') as HTMLElement | null
    toggle?.click()
    return Boolean(toggle)
  })
}

test('S23: OTP reveal uses passmanager:otp:generate with otp_id and renders code', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }
  await enablePasswordManager(page)

  const suffix = Date.now()
  const entryTitle = `e2e-otp-entry-${suffix}`
  const otpLabel = `Primary OTP ${suffix}`

  await createEntryWithOtp(page, {entryTitle, otpLabel, period: 30})
  await waitForOtpItem(page)
  await installOtpCapture(page)

  const clicked = await clickReveal(page)
  expect(clicked).toBe(true)

  await page.waitForTimeout(700)

  const result = await page.evaluate(() => {
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

    const win = window as any
    const item = deepFind(document, 'pm-entry-totp-item') as HTMLElement | null
    const codeEl = item?.shadowRoot?.querySelector('.totp-code') as HTMLElement | null
    const rawText = (codeEl?.textContent ?? '').trim()
    const digitsOnly = rawText.replace(/\D+/g, '')
    const calls = Array.isArray(win.__otpGenerateCalls) ? win.__otpGenerateCalls : []
    const lastCall = calls.length > 0 ? calls[calls.length - 1] : null
    return {
      rawText,
      digitsOnly,
      generateCalls: calls.length,
      lastCall,
    }
  })

  await restoreOtpCapture(page)

  expect(result.generateCalls).toBeGreaterThan(0)
  expect(result.lastCall?.command).toBe('passmanager:otp:generate')
  expect(result.lastCall?.result?.ok).toBe(true)
  expect(typeof result.lastCall?.data?.otp_id).toBe('string')
  expect(typeof result.lastCall?.data?.entry_id).toBe('string')
  // Domain-ID contract: node_id and label must NOT be sent in passmanager OTP calls
  expect(result.lastCall?.data).not.toHaveProperty('node_id')
  expect(result.lastCall?.data).not.toHaveProperty('label')
  expect(result.rawText).not.toBe('••••••')
  expect(result.digitsOnly).toMatch(/^\d{6}$/)
})

test('S23: OTP reveal does not request backend every second inside one time slot', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }
  await enablePasswordManager(page)

  const suffix = Date.now()
  const entryTitle = `e2e-otp-refresh-${suffix}`
  const otpLabel = `Slot OTP ${suffix}`

  await createEntryWithOtp(page, {entryTitle, otpLabel, period: 600})
  await waitForOtpItem(page)
  await installOtpCapture(page)

  const clicked = await clickReveal(page)
  expect(clicked).toBe(true)

  await page.waitForTimeout(3200)

  const stats = await page.evaluate(() => {
    const win = window as any
    const calls = Array.isArray(win.__otpGenerateCalls) ? win.__otpGenerateCalls : []
    return {
      callCount: calls.length,
      calls,
    }
  })

  await restoreOtpCapture(page)

  expect(stats.callCount).toBe(1)
  expect(stats.calls[0]?.command).toBe('passmanager:otp:generate')
})

test('S23: Entry view ignores catalog mirror noise and avoids passmanager:entry:list storms', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }
  await enablePasswordManager(page)

  const suffix = Date.now()
  const entryTitle = `e2e-otp-noise-${suffix}`
  const otpLabel = `Noise OTP ${suffix}`

  await createEntryWithOtp(page, {entryTitle, otpLabel, period: 600})
  await waitForOtpItem(page)
  await installOtpCapture(page)

  const clicked = await clickReveal(page)
  expect(clicked).toBe(true)

  await page.waitForTimeout(700)
  await clearCapturedCalls(page)

  await emitCatalogMirrorNoise(page, 8)
  await page.waitForTimeout(900)

  const stats = await page.evaluate(() => {
    const win = window as any
    const otpCalls = Array.isArray(win.__otpGenerateCalls) ? win.__otpGenerateCalls.length : 0
    const listCalls = Array.isArray(win.__passmanagerEntryListCalls)
      ? win.__passmanagerEntryListCalls.length
      : 0
    const shardCalls = Array.isArray(win.__catalogShardListCalls) ? win.__catalogShardListCalls.length : 0
    return {otpCalls, listCalls, shardCalls}
  })

  await restoreOtpCapture(page)

  expect(stats.otpCalls).toBe(0)
  expect(stats.listCalls).toBe(0)
  expect(stats.shardCalls).toBe(0)
})

test('S23: Remove OTP from entry uses passmanager:otp:removeSecret with otp_id only', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }
  await enablePasswordManager(page)

  const suffix = Date.now()
  const entryTitle = `e2e-otp-remove-${suffix}`
  const otpLabel = `Remove OTP ${suffix}`

  await createEntryWithOtp(page, {entryTitle, otpLabel, period: 30})
  await waitForOtpItem(page)
  await installOtpCapture(page)

  // Remove OTP via the gateway (domain-ID contract)
  const removeResult = await page.evaluate(async (title: string) => {
    const win = window as any
    const pm = win.passmanager
    if (!pm) throw new Error('passmanager is not initialized')

    const target = (pm.allEntries ?? []).find((item: any) => item?.title === title)
    if (!target) throw new Error('failed to find target entry')
    const otps = target.otps?.() ?? []
    if (!otps.length) throw new Error('target entry has no OTP to remove')

    const otp = otps[0]
    const saver = pm.managerSaver as any
    const gateway = saver?.secrets as any
    const catalog = gateway?.catalog as any
    const transport = catalog?.transport as any
    if (!transport?.sendCatalog) {
      throw new Error('failed to access OTP transport for removeSecret')
    }

    const res = await transport.sendCatalog('passmanager:otp:removeSecret', {
      otp_id: otp.id,
    })

    // Collect captured calls for removeSecret
    const calls = Array.isArray(win.__sendCatalogCalls) ? win.__sendCatalogCalls : []
    const removeCalls = calls.filter((c: any) => c.command === 'passmanager:otp:removeSecret')
    const lastRemove = removeCalls.length > 0 ? removeCalls[removeCalls.length - 1] : null

    return {
      ok: res?.ok,
      otpId: otp.id,
      removeCalls: removeCalls.length,
      lastRemoveData: lastRemove?.data,
    }
  }, entryTitle)

  await restoreOtpCapture(page)

  expect(removeResult.ok).toBe(true)
  expect(removeResult.removeCalls).toBeGreaterThan(0)
  expect(typeof removeResult.lastRemoveData?.otp_id).toBe('string')
  expect(removeResult.lastRemoveData?.otp_id).toBe(removeResult.otpId)
  // Domain-ID contract: only otp_id, no legacy fields
  expect(removeResult.lastRemoveData).not.toHaveProperty('node_id')
  expect(removeResult.lastRemoveData).not.toHaveProperty('label')
  expect(removeResult.lastRemoveData).not.toHaveProperty('entry_id')
})

test('S23: Add OTP to existing entry uses passmanager:otp:setSecret with otp_id and secret only', async (ctx) => {
  const page = getPage()
  if (!page) {
    return ctx.skip()
  }
  await enablePasswordManager(page)

  const suffix = Date.now()
  const entryTitle = `e2e-otp-add-${suffix}`
  const otpId = `test-otp-${suffix}`
  const otpLabel = `Added OTP ${suffix}`

  await installOtpCapture(page)

  // Create entry without OTP, then add OTP metadata via entry:save, then setSecret
  const addResult = await page.evaluate(
    async (params: {title: string; otpId: string; otpLabel: string}) => {
      const win = window as any
      const pm = win.passmanager
      if (!pm) throw new Error('passmanager is not initialized')

      // Step 1: Create entry WITHOUT OTP
      const entry = pm.createEntry({title: params.title, username: 'otp-add-user', urls: []}, '', '')

      if (entry?.flushPendingPersistence) {
        await entry.flushPendingPersistence()
      }
      await pm.save()
      await pm.load()

      const target = (pm.allEntries ?? []).find((item: any) => item?.title === params.title)
      if (!target) throw new Error('failed to find target entry after creation')
      const entryId = target.id

      // Step 2: Update entry with OTP metadata using passmanager:entry:save
      // This makes the OTP resolvable by the backend
      const saver = pm.managerSaver as any
      const gateway = saver?.secrets as any
      const catalog = gateway?.catalog as any
      const transport = catalog?.transport as any
      if (!transport?.sendCatalog) {
        throw new Error('failed to access transport for entry:save')
      }

      // First, update entry metadata with OTP config so resolver can find it
      const saveRes = await transport.sendCatalog('passmanager:entry:save', {
        entry_id: entryId,
        title: params.title,
        username: 'otp-add-user',
        urls: [],
        otps: [
          {
            id: params.otpId,
            label: params.otpLabel,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            encoding: 'base32',
            type: 'TOTP',
          },
        ],
      })

      if (!saveRes?.ok) {
        throw new Error(`passmanager:entry:save failed: ${String(saveRes?.error ?? 'unknown')}`)
      }

      // Step 3: Now setSecret will succeed because OTP metadata exists
      const setRes = await transport.sendCatalog('passmanager:otp:setSecret', {
        otp_id: params.otpId,
        entry_id: entryId,
        secret: 'JBSWY3DPEHPK3PXP',
      })

      // Collect captured calls for setSecret
      const calls = Array.isArray(win.__sendCatalogCalls) ? win.__sendCatalogCalls : []
      const setCalls = calls.filter((c: any) => c.command === 'passmanager:otp:setSecret')
      const lastSet = setCalls.length > 0 ? setCalls[setCalls.length - 1] : null

      return {
        saveOk: saveRes?.ok,
        setOk: setRes?.ok,
        otpId: params.otpId,
        entryId,
        setCalls: setCalls.length,
        lastSetData: lastSet?.data,
      }
    },
    {title: entryTitle, otpId, otpLabel},
  )

  await restoreOtpCapture(page)

  expect(addResult.saveOk).toBe(true)
  expect(addResult.setOk).toBe(true)
  expect(addResult.setCalls).toBeGreaterThan(0)
  expect(typeof addResult.lastSetData?.otp_id).toBe('string')
  expect(addResult.lastSetData?.otp_id).toBe(addResult.otpId)
  expect(typeof addResult.lastSetData?.secret).toBe('string')
  // Domain-ID contract: otp_id + entry_id + secret, no legacy fields
  expect(addResult.lastSetData).toHaveProperty('entry_id')
  expect(addResult.lastSetData).not.toHaveProperty('node_id')
  expect(addResult.lastSetData).not.toHaveProperty('label')
})
