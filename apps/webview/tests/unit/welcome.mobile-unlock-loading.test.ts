import {atom} from '@reatom/core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {i18n} from '../../src/i18n'
import {WelcomePageMobileLayout} from '../../src/routes/welcome/welcome-mobile'
import type {WelcomeModel} from '../../src/routes/welcome/welcome.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

type UpdateCompleteElement = Element & {updateComplete?: Promise<unknown>}

async function waitForElementUpdate(element: Element | null | undefined): Promise<void> {
  const updateComplete = (element as UpdateCompleteElement | null | undefined)?.updateComplete
  if (updateComplete && typeof updateComplete.then === 'function') {
    await updateComplete
  }
}

describe('mobile welcome vault unlock loading', () => {
  beforeEach(() => {
    WelcomePageMobileLayout.define()
    initAppContext(
      createMockAppContext({
        store: {
          remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
        } as never,
        state: {
          data: () => ({
            NeedUserInitialization: false,
            StorageOpened: false,
          }),
        } as never,
      }),
    )
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
  })

  it('dims the locked screen while keeping the active icon and button loading contract', async () => {
    const page = document.createElement('welcome-page-mobile-layout') as WelcomePageMobileLayout
    const model = (page as unknown as {model: WelcomeModel}).model
    document.body.append(page)
    await page.updateComplete

    expect(page.shadowRoot?.querySelector('.unlock-loading-scrim')).toBeNull()
    expect(page.shadowRoot?.querySelector('.locked-vault')?.hasAttribute('aria-busy')).toBe(false)

    model.setup.setupInProgress.set(true)
    model.setup.icon.active()

    await vi.waitFor(async () => {
      await page.updateComplete
      const hero = page.shadowRoot?.querySelector('welcome-hero-section')
      const setup = page.shadowRoot?.querySelector('welcome-setup-section')
      await Promise.all([waitForElementUpdate(hero), waitForElementUpdate(setup)])

      expect(page.shadowRoot?.querySelector('.locked-vault')?.getAttribute('aria-busy')).toBe('true')
      expect(page.shadowRoot?.querySelector('.unlock-loading-scrim')?.getAttribute('role')).toBe('status')
      expect(page.shadowRoot?.querySelector('.unlock-loading-scrim')?.textContent).toContain(
        i18n('status:unlocking'),
      )
      expect(hero?.shadowRoot?.querySelector('.hero.unlocking')).not.toBeNull()

      const unlockButton = setup?.shadowRoot?.querySelector<HTMLElement & {updateComplete: Promise<unknown>}>(
        '.lockscreen-unlock-action',
      )
      await unlockButton?.updateComplete
      expect(unlockButton?.hasAttribute('loading')).toBe(true)
      expect(unlockButton?.shadowRoot?.querySelector('[part="spinner"]')).not.toBeNull()
      expect(setup?.shadowRoot?.querySelector('.unlock-arrow')).toBeNull()
    })

    model.setup.setupInProgress.set(false)
    model.setup.icon.idle()

    await vi.waitFor(async () => {
      await page.updateComplete
      const setup = page.shadowRoot?.querySelector('welcome-setup-section')
      await waitForElementUpdate(setup)

      expect(page.shadowRoot?.querySelector('.unlock-loading-scrim')).toBeNull()
      expect(page.shadowRoot?.querySelector('.locked-vault')?.hasAttribute('aria-busy')).toBe(false)
      expect(setup?.shadowRoot?.querySelector('.lockscreen-unlock-action')?.hasAttribute('loading')).toBe(false)
      expect(setup?.shadowRoot?.querySelector('.unlock-arrow')).not.toBeNull()
    })
  })
})
