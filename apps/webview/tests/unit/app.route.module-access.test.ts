import {render, type TemplateResult} from 'lit'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {moduleAccessModel, type ModuleAccessState} from '../../src/core/pro/module-access.model'
import {setLang} from '../../src/i18n'
import {ChromVoidApp} from '../../src/routes/app.route.impl'

type ModuleAccessRenderer = {
  renderModuleAccessChecking: () => TemplateResult
  renderModuleAccessState: (surface: 'remote', access: ModuleAccessState) => TemplateResult
}

function createRenderer(): {app: ChromVoidApp; renderer: ModuleAccessRenderer; container: HTMLElement} {
  const app = new ChromVoidApp()
  const container = document.createElement('div')
  document.body.append(container)
  return {app, renderer: app as unknown as ModuleAccessRenderer, container}
}

afterEach(() => {
  document.body.replaceChildren()
  moduleAccessModel.reset()
  setLang('en')
  vi.restoreAllMocks()
})

describe('ChromVoidApp module access states', () => {
  it('presents active Core resolution as a neutral live status', () => {
    const {app, renderer, container} = createRenderer()

    render(renderer.renderModuleAccessChecking(), container, {host: app})

    const state = container.querySelector<HTMLElement>('.pro-access-state')
    expect(state?.getAttribute('role')).toBe('status')
    expect(container.textContent).toContain('Checking license')
    expect(container.textContent).toContain('Reading the license state from the active Core')
    expect(container.textContent).not.toContain('Pro license required')
    expect(container.querySelector('button')).toBeNull()
  })

  it('offers retry diagnostics without presenting an upgrade prompt when entitlement is unavailable', () => {
    const refresh = vi.spyOn(moduleAccessModel, 'refresh').mockResolvedValue()
    const {app, renderer, container} = createRenderer()

    render(
      renderer.renderModuleAccessState('remote', {
        feature_key: 'remote',
        status: 'entitlement_unavailable',
        denial_code: 'ENTITLEMENT_UNAVAILABLE',
      }),
      container,
      {host: app},
    )

    expect(container.querySelector('.pro-access-state')?.getAttribute('role')).toBe('alert')
    expect(container.textContent).toContain('License status unavailable')
    expect(container.textContent).toContain('Try again')
    expect(container.textContent).not.toContain('Pro license required')
    expect(container.textContent).not.toContain('Settings')

    container.querySelector<HTMLButtonElement>('.pro-access-state__button')?.click()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps Settings as the action for a resolved Pro lock', () => {
    const {app, renderer, container} = createRenderer()

    render(
      renderer.renderModuleAccessState('remote', {
        feature_key: 'remote',
        status: 'locked_pro',
        denial_code: 'PRO_REQUIRED',
      }),
      container,
      {host: app},
    )

    expect(container.textContent).toContain('Pro license required')
    expect(container.textContent).toContain('Settings')
    expect(container.textContent).not.toContain('Try again')
  })
})
