import {render, type TemplateResult} from 'lit'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {moduleAccessModel, type ModuleAccessGate} from '../../src/core/modules/module-access.model'
import {setLang} from '../../src/i18n'
import {ChromVoidApp} from '../../src/routes/app.route.impl'

type ModuleAccessRenderer = {
  renderModuleAccessGate: (gate: Exclude<ModuleAccessGate, {kind: 'open'}>) => TemplateResult
}

function renderGate(gate: Exclude<ModuleAccessGate, {kind: 'open'}>): HTMLElement {
  const app = new ChromVoidApp()
  const container = document.createElement('div')
  document.body.append(container)
  render((app as unknown as ModuleAccessRenderer).renderModuleAccessGate(gate), container, {host: app})
  return container
}

afterEach(() => {
  document.body.replaceChildren()
  moduleAccessModel.reset()
  setLang('en')
  vi.restoreAllMocks()
})

describe('ChromVoidApp module access states', () => {
  it('presents the availability check as a neutral live status', () => {
    const container = renderGate({kind: 'checking'})

    expect(container.querySelector('[role="status"]')?.textContent).toContain('Checking availability')
    expect(container.querySelector('button')).toBeNull()
  })

  it('offers a retry when availability could not be checked', () => {
    const refresh = vi.spyOn(moduleAccessModel, 'refresh').mockResolvedValue()
    const container = renderGate({kind: 'check-failed'})

    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('Could not check availability')
    expect(alert?.textContent).toContain('could not confirm whether this feature is available')

    const buttons = Array.from(container.querySelectorAll('button'))
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['Try again'])
    buttons[0]?.click()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('explains a module the release has disabled without offering any action', () => {
    const container = renderGate({
      kind: 'unavailable',
      access: {feature_key: 'remote', status: 'disabled_by_rollout', denial_code: 'FEATURE_DISABLED_BY_ROLLOUT'},
    })

    expect(container.textContent).toContain('This feature is currently disabled')
    expect(container.querySelector('button')).toBeNull()
  })

  it('explains a module the platform cannot run', () => {
    const container = renderGate({
      kind: 'unavailable',
      access: {feature_key: 'remote', status: 'unsupported', denial_code: 'FEATURE_UNSUPPORTED_ON_PLATFORM'},
    })

    expect(container.textContent).toContain('This feature is not available on this platform')
    expect(container.querySelector('button')).toBeNull()
  })
})
