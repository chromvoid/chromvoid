import {atom} from '@reatom/core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  isStartupContentReady,
  STARTUP_CONTENT_READY_EVENT,
} from '../../src/app/bootstrap/startup-readiness'
import {WelcomePageMobileLayout} from '../../src/routes/welcome/welcome-mobile'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

const originalRequestAnimationFrame = window.requestAnimationFrame
type UpdateCompleteElement = Element & {updateComplete?: Promise<unknown>}

function installDeterministicAnimationFrame(): void {
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16),
  })
}

function initWelcomeContext() {
  initAppContext(
    createMockAppContext({
      store: {
        remoteSessionState: atom('inactive'),
        statusMessage: atom({
          type: 'error',
          message: 'Selected folder is not a ChromVoid backup',
          timestamp: Date.now(),
        }),
      } as never,
      state: {
        data: () => ({
          NeedUserInitialization: true,
          StorageOpened: false,
          StorePath: '/vault/storage',
        }),
      } as never,
    }),
  )
}

function mockVisibleRect(element: Element): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        bottom: 120,
        height: 120,
        left: 0,
        right: 120,
        top: 0,
        width: 120,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  })
}

async function waitForElementUpdate(element: Element | null | undefined): Promise<void> {
  const updateComplete = (element as UpdateCompleteElement | null | undefined)?.updateComplete
  if (updateComplete && typeof updateComplete.then === 'function') {
    await updateComplete
  }
}

async function flushWelcomeStartupReadiness(page: WelcomePageMobileLayout): Promise<void> {
  const hero = page.shadowRoot?.querySelector('welcome-hero-section')
  const setup = page.shadowRoot?.querySelector('welcome-setup-section')
  expect(hero).toBeTruthy()
  expect(setup).toBeTruthy()
  await Promise.all([waitForElementUpdate(hero), waitForElementUpdate(setup)])

  const heroTitle = hero!.shadowRoot?.querySelector('.hero-title')
  const setupContent = setup!.shadowRoot?.querySelector(
    '.welcome-actions, .mode-cards, .setup-card, .remote-actions, .remote-form-grid, .remote-presence-panel',
  )
  expect(heroTitle).toBeTruthy()
  expect(setupContent).toBeTruthy()

  mockVisibleRect(heroTitle!)
  mockVisibleRect(setupContent!)

  for (let frame = 0; frame < 6; frame += 1) {
    await vi.advanceTimersByTimeAsync(16)
    await Promise.resolve()
  }
}

describe('welcome status messages', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    installDeterministicAnimationFrame()
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: originalRequestAnimationFrame,
    })
    delete document.documentElement.dataset['startupContentReady']
    document.body.innerHTML = ''
    clearAppContext()
  })

  it('does not render store status messages on the welcome route', async () => {
    WelcomePageMobileLayout.define()
    initWelcomeContext()

    const page = document.createElement('welcome-page-mobile-layout') as WelcomePageMobileLayout
    document.body.append(page)
    await page.updateComplete

    expect(page.shadowRoot?.textContent).not.toContain('Selected folder is not a ChromVoid backup')
    await flushWelcomeStartupReadiness(page)
  })

  it('emits startup readiness after welcome critical sections are rendered', async () => {
    WelcomePageMobileLayout.define()
    initWelcomeContext()

    const startupReadyEvents: Event[] = []
    document.addEventListener(STARTUP_CONTENT_READY_EVENT, (event) => startupReadyEvents.push(event), {once: true})

    const page = document.createElement('welcome-page-mobile-layout') as WelcomePageMobileLayout
    document.body.append(page)
    await page.updateComplete

    await flushWelcomeStartupReadiness(page)

    expect(isStartupContentReady()).toBe(true)
    expect(startupReadyEvents).toHaveLength(1)
  })

})
