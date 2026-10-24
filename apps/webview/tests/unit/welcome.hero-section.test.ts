import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import type * as BrandMark from '@project/brand-mark'
import {atom} from '@reatom/core'

import {markStartupSplashActive, markStartupSplashReleased} from '../../src/app/bootstrap/startup-splash'
import {i18n} from '../../src/i18n'
import {WelcomeHeroSection} from '../../src/routes/welcome/sections/hero'
import type {WelcomeSectionLayout} from '../../src/routes/welcome/welcome-section-layout'
import {WelcomeSetupModel} from '../../src/routes/welcome/welcome.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import type {WelcomeChromvoidIcon} from '../../src/shared/ui/welcome-chromvoid-icon'

const brandMark = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock('@project/brand-mark', async (importOriginal) => ({
  ...(await importOriginal<typeof BrandMark>()),
  createBrandMarkController: brandMark.create,
}))

function createController() {
  return {
    prepareAppearance: vi.fn(),
    appearance: vi.fn(),
    startDerivation: vi.fn(),
    finishDerivation: vi.fn().mockResolvedValue(undefined),
    opened: vi.fn(),
    returnToLock: vi.fn(),
    hover: vi.fn(),
    idle: vi.fn(),
    destroy: vi.fn(),
  }
}

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

async function mountHero(model: WelcomeSetupModel, layout: WelcomeSectionLayout = 'desktop') {
  const section = document.createElement('welcome-hero-section') as WelcomeHeroSection
  section.model = model
  section.layout = layout
  document.body.append(section)
  await section.updateComplete
  await section.shadowRoot?.querySelector<WelcomeChromvoidIcon>('welcome-chromvoid-icon')?.updateComplete
  return section
}

describe('welcome hero section', () => {
  beforeEach(() => {
    brandMark.create.mockReset().mockReturnValue(createController())
    markStartupSplashActive('web')
    WelcomeHeroSection.define()
    initWelcomeContext(true)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    delete document.documentElement.dataset['startupSplashActive']
    delete document.documentElement.dataset['startupSplashReleased']
    delete document.documentElement.dataset['startupSplashSurface']
    clearAppContext()
  })

  it.each(['mode-select', 'create-master'] as const)(
    'does not mount a desktop icon or create its controller in %s',
    async (step) => {
      const model = new WelcomeSetupModel()
      model.setupStep.set(step)
      const section = await mountHero(model)

      expect(section.shadowRoot?.querySelector('.hero-icon-shell')).toBeNull()
      expect(section.shadowRoot?.querySelector('welcome-chromvoid-icon')).toBeNull()
      expect(brandMark.create).not.toHaveBeenCalled()

      markStartupSplashReleased()

      expect(section.shadowRoot?.querySelector('.hero-icon-shell')).toBeNull()
      expect(section.shadowRoot?.querySelector('welcome-chromvoid-icon')).toBeNull()
      expect(brandMark.create).not.toHaveBeenCalled()
    },
  )

  it('mounts the desktop locked-vault icon and creates its controller after splash release', async () => {
    initWelcomeContext(false)
    const model = new WelcomeSetupModel()
    markStartupSplashReleased()

    const section = await mountHero(model)
    const icon = section.shadowRoot?.querySelector('welcome-chromvoid-icon')

    expect(section.shadowRoot?.querySelector('.hero-icon-shell')).not.toBeNull()
    expect(icon).not.toBeNull()
    expect(brandMark.create).toHaveBeenCalledTimes(1)
    expect(brandMark.create).toHaveBeenCalledWith(icon?.shadowRoot?.querySelector('svg'))
  })

  it.each(['mode-select', 'create-master'] as const)(
    'keeps the mobile first-run icon and its controller in %s',
    async (step) => {
      const model = new WelcomeSetupModel()
      model.setupStep.set(step)
      markStartupSplashReleased()

      const section = await mountHero(model, 'mobile')
      const icon = section.shadowRoot?.querySelector('welcome-chromvoid-icon')

      expect(section.shadowRoot?.querySelector('.hero-icon-shell')).not.toBeNull()
      expect(icon).not.toBeNull()
      expect(brandMark.create).toHaveBeenCalledTimes(1)
      expect(brandMark.create).toHaveBeenCalledWith(icon?.shadowRoot?.querySelector('svg'))
    },
  )

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
