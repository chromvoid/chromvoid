import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {markStartupSplashActive, markStartupSplashReleased} from '../../src/app/bootstrap/startup-splash'
import {WelcomeIconModel} from '../../src/routes/welcome/welcome-icon.model'

function installIconDom(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = `
    <div class="welcome-icon">
      <svg>
        <g id="spiralStage"></g>
        <path id="spiralTrace"></path>
        <path id="spiralFill"></path>
        <feGaussianBlur id="spiralRimBlur"></feGaussianBlur>
        <feFlood id="spiralRimFlood"></feFlood>
        <circle id="coreAura"></circle>
        <g id="coreStage"></g>
        <circle id="coreRing"></circle>
        <g id="ripplePulseStage">
          <circle class="ripplePulse"></circle>
          <circle class="ripplePulse"></circle>
          <circle class="ripplePulse"></circle>
        </g>
      </svg>
    </div>
  `
  document.body.append(root)
  const trace = root.querySelector<SVGPathElement>('#spiralTrace')!
  Object.defineProperty(trace, 'getTotalLength', {
    configurable: true,
    value: () => 240,
  })
  return root
}

describe('WelcomeIconModel', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('loading', '')
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.documentElement.removeAttribute('loading')
    delete document.documentElement.dataset['startupSplashActive']
    delete document.documentElement.dataset['startupSplashReleased']
    delete document.documentElement.dataset['startupSplashSurface']
    document.body.innerHTML = ''
  })

  it('switches between idle and active animation states', () => {
    const model = new WelcomeIconModel()

    expect(model.state()).toBe('idle')

    model.active()
    expect(model.state()).toBe('active')

    model.idle()
    expect(model.state()).toBe('idle')
  })

  it('skips the web intro after Android native splash release', () => {
    const root = installIconDom()
    const model = new WelcomeIconModel()
    markStartupSplashActive('native-bridge')

    model.mount(root)

    const trace = root.querySelector<SVGPathElement>('#spiralTrace')!
    expect(trace.getAttribute('stroke-width')).toBe('0')

    markStartupSplashReleased()

    expect(trace.getAttribute('stroke-dasharray')).toBe('240')
    expect(trace.getAttribute('stroke-dashoffset')).toBe('0')
    expect(trace.getAttribute('stroke-width')).toBe('72')
    expect(root.querySelector<SVGGElement>('#coreStage')!.style.opacity).toBe('1')
    expect(root.querySelector<SVGCircleElement>('#coreRing')!.style.opacity).toBe('0.58')
  })
})
