import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  CVIcon,
  getIconBasePath,
  registerIconCollection,
  setIconBasePath,
  unregisterIconCollection,
} from './cv-icon'

CVIcon.define()

const settle = async (element: CVIcon) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createIcon = async (attrs?: Partial<CVIcon>) => {
  const el = document.createElement('cv-icon') as CVIcon
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
  setIconBasePath('/assets/icons/lucide')
  unregisterIconCollection('brand')
  ;(CVIcon as any).svgCache.clear()
  ;(CVIcon as any).inFlight.clear()
  vi.unstubAllGlobals()
})

describe('cv-icon', () => {
  it('maps legacy bootstrap icon names to lucide assets', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '<svg viewBox="0 0 24 24"></svg>',
    }))
    vi.stubGlobal('fetch', fetchMock)

    await createIcon({name: 'folder-fill'})

    expect(fetchMock).toHaveBeenCalledWith('/assets/icons/lucide/folder.svg')
  })

  it('uses the configured base path when loading icons by name', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '<svg viewBox="0 0 24 24"></svg>',
    }))
    vi.stubGlobal('fetch', fetchMock)
    setIconBasePath('/custom/icons/')

    await createIcon({name: 'search'})

    expect(getIconBasePath()).toBe('/custom/icons')
    expect(fetchMock).toHaveBeenCalledWith('/custom/icons/search.svg')
  })

  it('loads a direct src URL without name mapping', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '<svg viewBox="0 0 24 24"></svg>',
    }))
    vi.stubGlobal('fetch', fetchMock)

    await createIcon({src: '/icons/raw.svg'})

    expect(fetchMock).toHaveBeenCalledWith('/icons/raw.svg')
  })

  it('loads namespaced icons from a registered collection', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '<svg viewBox="0 0 24 24"></svg>',
    }))
    vi.stubGlobal('fetch', fetchMock)
    registerIconCollection('brand', '/assets/icons/brand/')

    await createIcon({name: 'brand:transport'})

    expect(fetchMock).toHaveBeenCalledWith('/assets/icons/brand/transport.svg')
  })

  it('falls back to the default collection when a namespaced icon is missing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<svg viewBox="0 0 24 24"></svg>',
      })
    vi.stubGlobal('fetch', fetchMock)
    registerIconCollection('brand', '/assets/icons/brand/')

    await createIcon({name: 'brand:search'})

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/assets/icons/brand/search.svg')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/assets/icons/lucide/search.svg')
  })

  it('renders accessible label metadata when label is provided', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '<svg viewBox="0 0 24 24"></svg>',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const el = await createIcon({name: 'search', label: 'Search'})
    const wrapper = el.shadowRoot!.querySelector('.icon') as HTMLElement

    expect(wrapper.getAttribute('aria-hidden')).toBe('false')
    expect(wrapper.getAttribute('aria-label')).toBe('Search')
  })

  it('caches fetched SVG markup per URL', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '<svg viewBox="0 0 24 24"></svg>',
    }))
    vi.stubGlobal('fetch', fetchMock)

    await createIcon({name: 'search'})
    await createIcon({name: 'search'})

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
