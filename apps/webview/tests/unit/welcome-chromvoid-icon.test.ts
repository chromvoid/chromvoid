import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  WelcomeChromvoidIcon,
  type WelcomeChromvoidIconAnimationModel,
} from '../../src/shared/ui/welcome-chromvoid-icon'

function createIcon() {
  WelcomeChromvoidIcon.define()
  const icon = document.createElement('welcome-chromvoid-icon') as WelcomeChromvoidIcon
  document.body.appendChild(icon)
  return icon
}

describe('WelcomeChromvoidIcon', () => {
  afterEach(() => {
    document.querySelectorAll('welcome-chromvoid-icon').forEach((element) => element.remove())
  })

  it('renders a static idle icon without an animation model', async () => {
    const icon = createIcon()

    await icon.updateComplete

    const renderedIcon = icon.shadowRoot?.querySelector<HTMLElement>('.welcome-icon')
    expect(renderedIcon?.getAttribute('data-icon-state')).toBe('idle')
    expect(icon.shadowRoot?.querySelector('svg')).not.toBeNull()
  })

  it('mounts the animation model only when animation is enabled', async () => {
    const model: WelcomeChromvoidIconAnimationModel = {
      state: vi.fn(() => 'active'),
      mount: vi.fn(),
      unmount: vi.fn(),
    }
    const icon = createIcon()

    icon.model = model
    await icon.updateComplete

    expect(model.mount).not.toHaveBeenCalled()
    expect(icon.shadowRoot?.querySelector('.welcome-icon')?.getAttribute('data-icon-state')).toBe('idle')

    icon.animated = true
    await icon.updateComplete

    expect(model.mount).toHaveBeenCalledWith(icon.renderRoot)
    expect(icon.shadowRoot?.querySelector('.welcome-icon')?.getAttribute('data-icon-state')).toBe('active')

    icon.animated = false
    await icon.updateComplete

    expect(model.unmount).toHaveBeenCalledOnce()

    icon.remove()

    expect(model.unmount).toHaveBeenCalledOnce()
  })
})
