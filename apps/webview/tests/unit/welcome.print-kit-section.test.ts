import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {atom} from '@reatom/core'

import {i18n} from '../../src/i18n'
import {WelcomePrintKitSection} from '../../src/routes/welcome/sections/tools'
import {WelcomeSharedModel, WelcomeToolsModel} from '../../src/routes/welcome/welcome.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

describe('welcome print kit section', () => {
  beforeEach(() => {
    WelcomePrintKitSection.define()
    initAppContext(
      createMockAppContext({
        store: {
          remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
        } as never,
        state: {
          data: () => ({
            NeedUserInitialization: false,
            StorageOpened: true,
            StorePath: '/vault/printable-location',
          }),
        } as never,
      }),
    )
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
  })

  it('renders printable emergency kit content from the tools model', async () => {
    const section = document.createElement('welcome-print-kit-section') as WelcomePrintKitSection
    section.model = new WelcomeToolsModel(new WelcomeSharedModel())
    document.body.append(section)
    await section.updateComplete
    await Promise.resolve()

    expect(section.shadowRoot?.querySelector('.kit-title')?.textContent).toContain(i18n('welcome:emergency-kit-title'))
    expect(section.shadowRoot?.querySelector('.kit-box.filled')?.textContent).toContain('/vault/printable-location')
  })
})
