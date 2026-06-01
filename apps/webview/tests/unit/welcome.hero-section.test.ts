import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {atom} from '@reatom/core'

import {i18n} from '../../src/i18n'
import {WelcomeHeroSection} from '../../src/routes/welcome/sections/hero'
import {WelcomeSetupModel} from '../../src/routes/welcome/welcome.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

function initWelcomeContext(needUserInitialization: boolean) {
  initAppContext(
    createMockAppContext({
      store: {
        remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
      } as never,
      state: {
        data: () => ({
          NeedUserInitialization: needUserInitialization,
          StorageOpened: false,
        }),
      } as never,
    }),
  )
}

async function mountHero(model: WelcomeSetupModel) {
  const section = document.createElement('welcome-hero-section') as WelcomeHeroSection
  section.model = model
  section.layout = 'desktop'
  document.body.append(section)
  await section.updateComplete
  await Promise.resolve()
  return section
}

describe('welcome hero section', () => {
  beforeEach(() => {
    WelcomeHeroSection.define()
    initWelcomeContext(true)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
  })

  it('renders hero copy from the setup model state', async () => {
    const model = new WelcomeSetupModel()

    const cases = [
      {
        step: 'mode-select' as const,
        title: i18n('onboard:hero:create'),
        description: i18n('welcome:choose-storage-desc'),
        eyebrow: i18n('welcome:eyebrow-setup-path'),
        proof: i18n('welcome:proof-default'),
      },
      {
        step: 'create-master' as const,
        title: i18n('welcome:create-local-storage-title'),
        description: i18n('welcome:create-master-desc'),
        eyebrow: i18n('welcome:eyebrow-first-run'),
        proof: i18n('welcome:proof-create-master'),
      },
      {
        step: 'remote-connect' as const,
        title: i18n('welcome:remote-vault-title'),
        description: i18n('welcome:remote-vault-desc'),
        eyebrow: i18n('welcome:eyebrow-remote-host'),
        proof: i18n('welcome:proof-remote-connect'),
      },
      {
        step: 'remote-pair' as const,
        title: i18n('welcome:pair-iphone-hero-title'),
        description: i18n('welcome:pair-iphone-hero-desc'),
        eyebrow: i18n('welcome:eyebrow-remote-host'),
        proof: i18n('welcome:proof-remote-pair'),
      },
      {
        step: 'remote-wait' as const,
        title: i18n('welcome:wait-iphone-title'),
        description: i18n('welcome:wait-iphone-desc'),
        eyebrow: i18n('welcome:eyebrow-remote-host'),
        proof: i18n('welcome:proof-remote-wait'),
      },
    ]

    for (const testCase of cases) {
      model.setupStep.set(testCase.step)
      const section = await mountHero(model)

      expect(section.shadowRoot?.querySelector('.hero-title')?.textContent).toContain(testCase.title)
      expect(section.shadowRoot?.querySelector('.hero-desc')?.textContent).toContain(testCase.description)
      expect(section.shadowRoot?.querySelector('.hero-kicker')?.textContent).toContain(testCase.eyebrow)
      expect(section.shadowRoot?.querySelector('.hero-proof')?.textContent).toContain(testCase.proof)

      section.remove()
    }
  })
})
