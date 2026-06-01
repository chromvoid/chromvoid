import {expect, test} from 'vitest'
import {waitForAuthenticated, waitForWSConnected} from './utils'

declare global {
  var __E2E_PAGE__: import('playwright').Page | undefined
}

test('app bootstrap reaches connected opened state', async () => {
  const page = globalThis.__E2E_PAGE__!

  await page.goto('http://localhost:4400/index.html')
  await waitForWSConnected(page)
  await waitForAuthenticated(page)

  const ready = await page.evaluate(() => {
    return (
      !document.documentElement.hasAttribute('loading') &&
      !document.body.hasAttribute('loading') &&
      !document.querySelector('no-connection')
    )
  })

  expect(ready).toBe(true)
})
