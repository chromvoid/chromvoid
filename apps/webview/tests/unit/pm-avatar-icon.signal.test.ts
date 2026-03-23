import {state} from '@statx/core'
import {describe, expect, it, vi} from 'vitest'

import {Group} from '@project/passmanager'
import {PMAvatarIcon} from '../../src/features/passmanager/components/pm-avatar-icon'
import {pmIconStore} from '../../src/features/passmanager/models/pm-icon-store'

type PMAvatarIconProbe = PMAvatarIcon & {
  resolveIconRefSource(): string | undefined
  resolveIconRef(): string | undefined
}

function createProbe(): PMAvatarIconProbe {
  PMAvatarIcon.define()
  return document.createElement(PMAvatarIcon.elementName) as PMAvatarIconProbe
}

describe('PMAvatarIcon iconRef source resolution', () => {
  it('reads iconRef from signal source', () => {
    const probe = createProbe()
    const iconRefSignal = state<string | undefined>('alpha')
    probe.iconRef = iconRefSignal

    expect(probe.resolveIconRefSource()).toBe('alpha')
    expect(probe.resolveIconRef()).toBe('alpha')

    iconRefSignal.set('beta')

    expect(probe.resolveIconRefSource()).toBe('beta')
    expect(probe.resolveIconRef()).toBe('beta')
  })

  it('keeps string iconRef behavior', () => {
    const probe = createProbe()
    probe.iconRef = '  gamma  '

    expect(probe.resolveIconRefSource()).toBe('gamma')
    expect(probe.resolveIconRef()).toBe('gamma')
  })

  it('loads and renders custom icon from group iconRef', async () => {
    PMAvatarIcon.define()
    const element = document.createElement(PMAvatarIcon.elementName) as PMAvatarIcon
    const group = Group.create({
      name: 'Team',
      icon: 'folder',
      iconRef: 'group-icon-ref',
      entries: [],
    })

    let cached = ''
    let notify: (() => void) | undefined

    const subscribeSpy = vi.spyOn(pmIconStore, 'subscribe').mockImplementation((listener) => {
      notify = listener
      return () => {
        notify = undefined
      }
    })

    const getCachedUrlSpy = vi.spyOn(pmIconStore, 'getCachedUrl').mockImplementation((iconRef) => {
      if (iconRef !== 'group-icon-ref') return undefined
      return cached || undefined
    })

    const loadIconUrlSpy = vi.spyOn(pmIconStore, 'loadIconUrl').mockImplementation(async (iconRef) => {
      if (iconRef !== 'group-icon-ref') return undefined
      cached = 'blob:group-icon'
      notify?.()
      return cached
    })

    try {
      element.item = group
      document.body.appendChild(element)
      await element.updateComplete

      expect(loadIconUrlSpy).toHaveBeenCalledWith('group-icon-ref')

      await Promise.resolve()
      await element.updateComplete

      const image = element.shadowRoot?.querySelector('img')
      expect(image).not.toBeNull()
      expect(image?.getAttribute('src')).toBe('blob:group-icon')
    } finally {
      element.remove()
      subscribeSpy.mockRestore()
      getCachedUrlSpy.mockRestore()
      loadIconUrlSpy.mockRestore()
    }
  })
})
