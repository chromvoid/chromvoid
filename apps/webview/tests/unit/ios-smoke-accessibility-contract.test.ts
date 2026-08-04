import {atom} from '@reatom/core'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {CVInput} from '@chromvoid/uikit'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {WelcomeSetupSection} from '../../src/routes/welcome/sections/steps'
import {WelcomeSetupModel} from '../../src/routes/welcome/welcome.model'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

async function settle(section: WelcomeSetupSection): Promise<void> {
  await Promise.resolve()
  await section.updateComplete
}

function expectSingle(root: ShadowRoot | null, selector: string): void {
  expect(root?.querySelectorAll(selector)).toHaveLength(1)
}

describe('iOS smoke accessibility contract', () => {
  const stateData = atom({
    NeedUserInitialization: true,
    StorageOpened: false,
  })

  beforeEach(() => {
    CVInput.define()
    WelcomeSetupSection.define()
    setRuntimeCapabilities({platform: 'ios', mobile: true})
    stateData.set({NeedUserInitialization: true, StorageOpened: false})
    initAppContext(
      createMockAppContext({
        store: {
          remoteSessionState: atom<'inactive' | 'waiting_host_unlock' | 'ready'>('inactive'),
        } as never,
        state: {
          data: stateData,
        } as never,
      }),
    )
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clearAppContext()
    resetRuntimeCapabilities()
  })

  it('exposes stable identifiers for first-run creation and locked-vault entry', async () => {
    const section = document.createElement('welcome-setup-section') as WelcomeSetupSection
    const model = new WelcomeSetupModel()
    section.layout = 'mobile'
    section.model = model
    document.body.append(section)
    await settle(section)

    const root = section.shadowRoot
    expectSingle(root, '#welcome\\.mode\\.local')
    expect(root?.querySelector('[control-id="welcome.master-password"]')).toBeNull()
    expect(root?.querySelector('#welcome\\.unlock')).toBeNull()

    model.setupStep.set('create-master')
    await settle(section)

    expectSingle(root, '#welcome\\.mode\\.local')
    expectSingle(root, '[control-id="welcome.master-password"]')
    expectSingle(root, '[control-id="welcome.master-password-confirm"]')
    expectSingle(root, '#welcome\\.create-storage')
    expectSingle(root, 'cv-bottom-sheet.create-storage-sheet')

    stateData.set({NeedUserInitialization: false, StorageOpened: false})
    model.setupStep.set(null)
    await settle(section)

    expect(root?.querySelector('#welcome\\.create-storage')).toBeNull()
    expect(root?.querySelector('[control-id="welcome.master-password"]')).toBeNull()
    expect(root?.querySelector('#welcome\\.unlock')).toBeNull()
    expect(root?.querySelector('cv-bottom-sheet.unlock-sheet')).toBeNull()
    expectSingle(root, '[control-id="welcome.unlock-password"]')
    expectSingle(root, '#welcome\\.unlock-submit')
    const unlockInput = root?.querySelector<CVInput>('[control-id="welcome.unlock-password"]')
    const nativeInput = unlockInput?.shadowRoot?.querySelector('input')
    const unlockSubmit = root?.querySelector<HTMLButtonElement>('#welcome\\.unlock-submit')
    expect(unlockSubmit).toBeInstanceOf(HTMLButtonElement)
    expect(unlockSubmit?.textContent).toContain('Unlock Vault')
    expect(unlockSubmit?.disabled).toBe(false)
    expect(unlockInput?.hasAttribute('autofocus')).toBe(false)
    expect(nativeInput?.hasAttribute('autofocus')).toBe(false)
    expect(unlockInput?.shadowRoot?.activeElement).not.toBe(nativeInput)
    expect(unlockInput?.hasAttribute('invalid')).toBe(false)
    expect(unlockInput?.hasAttribute('aria-required')).toBe(false)
    expect(unlockInput?.hasAttribute('aria-describedby')).toBe(false)
  })
})
