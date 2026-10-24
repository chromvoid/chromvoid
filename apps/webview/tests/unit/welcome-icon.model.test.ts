import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {markStartupSplashActive, markStartupSplashReleased} from '../../src/app/bootstrap/startup-splash'
import type {WelcomeIconModel as WelcomeIconModelType} from '../../src/routes/welcome/welcome-icon.model'

const brandMark = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock('@project/brand-mark', () => ({
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

function installIconDom(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = '<div class="welcome-icon"><svg></svg></div>'
  document.body.append(root)
  return root
}

describe('WelcomeIconModel', () => {
  let WelcomeIconModel: typeof WelcomeIconModelType
  let controller: ReturnType<typeof createController>
  const models: Array<InstanceType<typeof WelcomeIconModel>> = []

  function createModel() {
    const model = new WelcomeIconModel()
    models.push(model)
    return model
  }

  beforeEach(async () => {
    vi.resetModules()
    document.body.innerHTML = ''
    markStartupSplashActive('web')
    controller = createController()
    brandMark.create.mockReset().mockReturnValue(controller)
    ;({WelcomeIconModel} = await import('../../src/routes/welcome/welcome-icon.model'))
  })

  afterEach(() => {
    for (const model of models.splice(0)) model.unmount()
    document.documentElement.removeAttribute('loading')
    delete document.documentElement.dataset['startupSplashActive']
    delete document.documentElement.dataset['startupSplashReleased']
    delete document.documentElement.dataset['startupSplashSurface']
    document.body.innerHTML = ''
  })

  it('tracks derivation, completion, opened, and idle in model state', async () => {
    const model = createModel()
    expect(model.state()).toBe('idle')

    model.active()
    expect(model.state()).toBe('active')

    await model.finishDerivation()
    expect(model.state()).toBe('finishing')

    model.opened()
    expect(model.state()).toBe('opened')

    model.idle()
    expect(model.state()).toBe('idle')
  })

  it('prepares once and starts appearance only after the startup splash is released', () => {
    const root = installIconDom()
    const model = createModel()
    model.mount(root)
    model.mount(root)

    expect(brandMark.create).toHaveBeenCalledWith(root.querySelector('svg'))
    expect(brandMark.create).toHaveBeenCalledTimes(1)
    expect(controller.prepareAppearance).toHaveBeenCalledTimes(1)
    expect(controller.appearance).not.toHaveBeenCalled()

    markStartupSplashReleased()
    model.mount(root)

    expect(controller.appearance).toHaveBeenCalledTimes(1)
    expect(controller.idle).not.toHaveBeenCalled()
    expect(controller.startDerivation).not.toHaveBeenCalled()
  })

  it('skips web appearance and preparation after a native splash', () => {
    markStartupSplashActive('native-bridge')
    const root = installIconDom()
    const model = createModel()
    model.mount(root)

    expect(controller.prepareAppearance).not.toHaveBeenCalled()
    expect(controller.appearance).not.toHaveBeenCalled()
    markStartupSplashReleased()
    model.mount(root)

    expect(controller.appearance).not.toHaveBeenCalled()
    expect(controller.returnToLock).not.toHaveBeenCalled()
    expect(model.state()).toBe('idle')
  })

  it('plays appearance once per process and returns to lock on later welcome mounts', () => {
    markStartupSplashReleased()
    const root = installIconDom()
    const first = createModel()
    first.mount(root)
    first.unmount()

    const returningController = createController()
    brandMark.create.mockReturnValue(returningController)
    const returning = createModel()
    returning.mount(installIconDom())

    expect(controller.appearance).toHaveBeenCalledTimes(1)
    expect(controller.destroy).toHaveBeenCalledTimes(1)
    expect(returningController.appearance).not.toHaveBeenCalled()
    expect(returningController.returnToLock).toHaveBeenCalledTimes(1)
  })

  it('returns the same route model to lock after it is remounted', () => {
    markStartupSplashReleased()
    const model = createModel()
    model.mount(installIconDom())
    model.unmount()
    model.mount(installIconDom())

    expect(controller.appearance).toHaveBeenCalledTimes(1)
    expect(controller.returnToLock).toHaveBeenCalledTimes(1)
  })

  it('starts pending derivation after splash release and does not restart on rerender', () => {
    const root = installIconDom()
    const model = createModel()
    model.mount(root)
    model.startDerivation()
    model.mount(root)

    expect(controller.startDerivation).not.toHaveBeenCalled()
    markStartupSplashReleased()
    model.mount(root)

    expect(controller.appearance).toHaveBeenCalledTimes(1)
    expect(controller.startDerivation).toHaveBeenCalledTimes(1)
    expect(controller.appearance.mock.invocationCallOrder[0]).toBeLessThan(
      controller.startDerivation.mock.invocationCallOrder[0]!,
    )
  })

  it('waits for the finishing signal and preserves opened across rerenders', async () => {
    markStartupSplashReleased()
    const root = installIconDom()
    const model = createModel()
    model.mount(root)
    model.startDerivation()
    let finishSignal: (() => void) | undefined
    controller.finishDerivation.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSignal = resolve
        }),
    )
    let complete = false
    const finishing = model.finishDerivation().then(() => {
      complete = true
    })
    model.mount(root)
    await Promise.resolve()
    expect(complete).toBe(false)
    expect(controller.finishDerivation).toHaveBeenCalledTimes(1)
    expect(controller.startDerivation).toHaveBeenCalledTimes(1)

    finishSignal?.()
    await finishing
    model.opened()
    model.mount(root)

    expect(complete).toBe(true)
    expect(controller.opened).toHaveBeenCalledTimes(1)
    expect(controller.idle).not.toHaveBeenCalled()
  })

  it('returns errors to static idle without restarting an appearance', () => {
    markStartupSplashReleased()
    const model = createModel()
    model.mount(installIconDom())
    model.startDerivation()
    model.idle()
    model.idle()

    expect(model.state()).toBe('idle')
    expect(controller.idle).toHaveBeenCalledTimes(1)
    expect(controller.appearance).toHaveBeenCalledTimes(1)
    expect(controller.opened).not.toHaveBeenCalled()
  })

  it('destroys the controller and removes splash listeners when unmounted', () => {
    const model = createModel()
    model.mount(installIconDom())
    model.unmount()
    model.unmount()
    markStartupSplashReleased()

    expect(controller.destroy).toHaveBeenCalledTimes(1)
    expect(controller.appearance).not.toHaveBeenCalled()

    createModel().mount(installIconDom())
    expect(controller.appearance).toHaveBeenCalledTimes(1)
    expect(controller.returnToLock).not.toHaveBeenCalled()
  })
})
