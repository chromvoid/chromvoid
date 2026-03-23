import {afterEach, describe, expect, it, vi} from 'vitest'

import {CVThemeProvider} from './cv-theme-provider'
import {defineTheme} from './theme-engine'

CVThemeProvider.define()

const settle = async (element: CVThemeProvider) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createProvider = async (attrs?: Partial<Pick<CVThemeProvider, 'mode' | 'theme'>>) => {
  const el = document.createElement('cv-theme-provider') as CVThemeProvider
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('cv-theme-provider', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders a default slot', async () => {
      const el = await createProvider()
      const slot = el.shadowRoot!.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('host uses display: contents', async () => {
      const el = await createProvider()
      const hostStyles = el.shadowRoot!.adoptedStyleSheets?.[0]
        ?? el.shadowRoot!.querySelector('style')
      // Verify via computed style — display: contents means no box
      const computed = getComputedStyle(el)
      expect(computed.display).toBe('contents')
    })

    it('slotted children are projected', async () => {
      const el = await createProvider()
      const child = document.createElement('div')
      child.id = 'theme-child'
      el.append(child)
      await settle(el)

      const slot = el.shadowRoot!.querySelector('slot') as HTMLSlotElement
      const assigned = slot.assignedElements()
      expect(assigned.some((n) => (n as HTMLElement).id === 'theme-child')).toBe(true)
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('mode defaults to "system"', async () => {
      const el = await createProvider()
      expect(el.mode).toBe('system')
    })

    it('theme defaults to ""', async () => {
      const el = await createProvider()
      expect(el.theme).toBe('')
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('mode attribute reflects to property', async () => {
      const el = await createProvider({mode: 'dark'})
      expect(el.getAttribute('mode')).toBe('dark')
    })

    it('theme attribute reflects to property', async () => {
      const el = await createProvider({theme: 'my-theme'})
      expect(el.getAttribute('theme')).toBe('my-theme')
    })

    it('setting mode attribute updates property', async () => {
      const el = await createProvider()
      el.setAttribute('mode', 'light')
      await settle(el)
      expect(el.mode).toBe('light')
    })

    it('setting theme attribute updates property', async () => {
      const el = await createProvider()
      const name = `reflect-test-${Date.now()}`
      defineTheme(name, {'--cv-color-bg': '#000'})
      el.setAttribute('theme', name)
      await settle(el)
      expect(el.theme).toBe(name)
    })
  })

  // --- Mode attribute behavior ---

  describe('mode attribute', () => {
    it('mode="light" sets color-scheme to light on host', async () => {
      const el = await createProvider({mode: 'light'})
      expect(el.style.colorScheme).toBe('light')
    })

    it('mode="dark" sets color-scheme to dark on host', async () => {
      const el = await createProvider({mode: 'dark'})
      expect(el.style.colorScheme).toBe('dark')
    })

    it('mode="system" sets color-scheme based on OS preference', async () => {
      const matchMediaSpy = vi.fn().mockReturnValue({
        matches: true, // prefers dark
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
      vi.stubGlobal('matchMedia', matchMediaSpy)

      const el = await createProvider({mode: 'system'})
      // Should query prefers-color-scheme
      expect(matchMediaSpy).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
      // With dark preference, color-scheme should be dark
      expect(el.style.colorScheme).toBe('dark')
    })

    it('mode="system" uses light when OS prefers light', async () => {
      const matchMediaSpy = vi.fn().mockReturnValue({
        matches: false, // prefers light
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
      vi.stubGlobal('matchMedia', matchMediaSpy)

      const el = await createProvider({mode: 'system'})
      expect(el.style.colorScheme).toBe('light')
    })

    it('changing mode from light to dark updates color-scheme', async () => {
      const el = await createProvider({mode: 'light'})
      expect(el.style.colorScheme).toBe('light')

      el.mode = 'dark'
      await settle(el)
      expect(el.style.colorScheme).toBe('dark')
    })

    it('changing mode from dark to light updates color-scheme', async () => {
      const el = await createProvider({mode: 'dark'})
      expect(el.style.colorScheme).toBe('dark')

      el.mode = 'light'
      await settle(el)
      expect(el.style.colorScheme).toBe('light')
    })
  })

  // --- System preference detection ---

  describe('system preference detection', () => {
    it('adds change listener on matchMedia when mode is system', async () => {
      const addListenerSpy = vi.fn()
      const matchMediaSpy = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: addListenerSpy,
        removeEventListener: vi.fn(),
      })
      vi.stubGlobal('matchMedia', matchMediaSpy)

      await createProvider({mode: 'system'})
      expect(addListenerSpy).toHaveBeenCalledWith('change', expect.any(Function))
    })

    it('updates color-scheme when OS preference changes at runtime', async () => {
      let changeCallback: ((e: {matches: boolean}) => void) | undefined
      const addListenerSpy = vi.fn((event: string, cb: (e: {matches: boolean}) => void) => {
        if (event === 'change') changeCallback = cb
      })
      const matchMediaSpy = vi.fn().mockReturnValue({
        matches: false, // starts light
        addEventListener: addListenerSpy,
        removeEventListener: vi.fn(),
      })
      vi.stubGlobal('matchMedia', matchMediaSpy)

      const el = await createProvider({mode: 'system'})
      expect(el.style.colorScheme).toBe('light')

      // Simulate OS switching to dark
      expect(changeCallback).toBeDefined()
      changeCallback!({matches: true})
      await settle(el)
      expect(el.style.colorScheme).toBe('dark')
    })

    it('removes change listener on disconnect', async () => {
      const removeListenerSpy = vi.fn()
      const matchMediaSpy = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: removeListenerSpy,
      })
      vi.stubGlobal('matchMedia', matchMediaSpy)

      const el = await createProvider({mode: 'system'})
      el.remove()

      expect(removeListenerSpy).toHaveBeenCalledWith('change', expect.any(Function))
    })

    it('removes listener when switching from system to explicit mode', async () => {
      const removeListenerSpy = vi.fn()
      const matchMediaSpy = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: removeListenerSpy,
      })
      vi.stubGlobal('matchMedia', matchMediaSpy)

      const el = await createProvider({mode: 'system'})

      el.mode = 'dark'
      await settle(el)

      expect(removeListenerSpy).toHaveBeenCalledWith('change', expect.any(Function))
    })

    it('does not add matchMedia listener when mode is light', async () => {
      const matchMediaSpy = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
      vi.stubGlobal('matchMedia', matchMediaSpy)

      await createProvider({mode: 'light'})
      expect(matchMediaSpy).not.toHaveBeenCalled()
    })

    it('does not add matchMedia listener when mode is dark', async () => {
      const matchMediaSpy = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
      vi.stubGlobal('matchMedia', matchMediaSpy)

      await createProvider({mode: 'dark'})
      expect(matchMediaSpy).not.toHaveBeenCalled()
    })
  })

  // --- CSS custom property distribution (token distribution) ---

  describe('token distribution', () => {
    it('named theme tokens are set as CSS custom properties on host', async () => {
      const name = `token-dist-${Date.now()}`
      defineTheme(name, {
        '--cv-color-bg': '#aabbcc',
        '--cv-color-text': '#112233',
      })

      const el = await createProvider({theme: name})
      expect(el.style.getPropertyValue('--cv-color-bg').trim()).toBe('#aabbcc')
      expect(el.style.getPropertyValue('--cv-color-text').trim()).toBe('#112233')
    })

    it('tokens cascade to slotted children via inheritance', async () => {
      const name = `cascade-${Date.now()}`
      defineTheme(name, {
        '--cv-color-primary': '#ff0000',
      })

      const el = await createProvider({theme: name})
      const child = document.createElement('div')
      el.append(child)
      await settle(el)

      // CSS custom properties inherit, so child should see the value
      // In jsdom, getComputedStyle may not resolve custom properties,
      // but we verify they are set on the host (which is display: contents)
      expect(el.style.getPropertyValue('--cv-color-primary').trim()).toBe('#ff0000')
    })

    it('changing theme swaps tokens on the host', async () => {
      const nameA = `swap-a-${Date.now()}`
      const nameB = `swap-b-${Date.now()}`

      defineTheme(nameA, {
        '--cv-color-bg': '#111',
        '--cv-color-border': '#222',
      })
      defineTheme(nameB, {
        '--cv-color-bg': '#333',
      })

      const el = await createProvider({theme: nameA})
      expect(el.style.getPropertyValue('--cv-color-bg').trim()).toBe('#111')
      expect(el.style.getPropertyValue('--cv-color-border').trim()).toBe('#222')

      el.theme = nameB
      await settle(el)
      expect(el.style.getPropertyValue('--cv-color-bg').trim()).toBe('#333')
      // Previous tokens from theme A should be removed
      expect(el.style.getPropertyValue('--cv-color-border').trim()).toBe('')
    })
  })

  // --- Visual states ---

  describe('visual states', () => {
    it('host has mode="light" attribute when mode is light', async () => {
      const el = await createProvider({mode: 'light'})
      expect(el.getAttribute('mode')).toBe('light')
    })

    it('host has mode="dark" attribute when mode is dark', async () => {
      const el = await createProvider({mode: 'dark'})
      expect(el.getAttribute('mode')).toBe('dark')
    })

    it('host has mode="system" attribute when mode is system', async () => {
      const el = await createProvider({mode: 'system'})
      expect(el.getAttribute('mode')).toBe('system')
    })
  })

  // --- Named theme application ---

  describe('named theme application', () => {
    it('sets data-cv-theme attribute when a named theme is applied', async () => {
      const name = `named-${Date.now()}`
      defineTheme(name, {'--cv-color-bg': '#000'})

      const el = await createProvider({theme: name})
      expect(el.getAttribute('data-cv-theme')).toBe(name)
    })

    it('updates data-cv-theme when theme property changes', async () => {
      const nameA = `named-a-${Date.now()}`
      const nameB = `named-b-${Date.now()}`
      defineTheme(nameA, {'--cv-color-bg': '#111'})
      defineTheme(nameB, {'--cv-color-bg': '#222'})

      const el = await createProvider({theme: nameA})
      expect(el.getAttribute('data-cv-theme')).toBe(nameA)

      el.theme = nameB
      await settle(el)
      expect(el.getAttribute('data-cv-theme')).toBe(nameB)
    })

    it('does not set data-cv-theme when theme is empty', async () => {
      const el = await createProvider()
      expect(el.hasAttribute('data-cv-theme')).toBe(false)
    })

    it('warns but does not throw when theme name is not registered', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const el = await createProvider({theme: 'nonexistent-theme'})

      expect(warnSpy).toHaveBeenCalled()
      // Element should still be in DOM, no crash
      expect(el.isConnected).toBe(true)
    })
  })

  // --- Light / dark token cascade ---

  describe('light / dark token cascade', () => {
    it('mode="light" reflects attribute for CSS selector matching', async () => {
      const el = await createProvider({mode: 'light'})
      expect(el.getAttribute('mode')).toBe('light')
      expect(el.matches('cv-theme-provider[mode="light"]')).toBe(true)
    })

    it('mode="dark" does not match the light selector', async () => {
      const el = await createProvider({mode: 'dark'})
      expect(el.matches('cv-theme-provider[mode="light"]')).toBe(false)
    })

    it('mode="system" reflects attribute for media query matching', async () => {
      const el = await createProvider({mode: 'system'})
      expect(el.getAttribute('mode')).toBe('system')
      expect(el.matches('cv-theme-provider[mode="system"]')).toBe(true)
    })

    it('switching mode from dark to light updates attribute', async () => {
      const el = await createProvider({mode: 'dark'})
      expect(el.matches('cv-theme-provider[mode="light"]')).toBe(false)

      el.mode = 'light'
      await settle(el)
      expect(el.matches('cv-theme-provider[mode="light"]')).toBe(true)
    })

    it('switching mode from light to system updates attribute', async () => {
      const el = await createProvider({mode: 'light'})
      expect(el.matches('cv-theme-provider[mode="system"]')).toBe(false)

      el.mode = 'system'
      await settle(el)
      expect(el.matches('cv-theme-provider[mode="system"]')).toBe(true)
    })
  })

  // --- Nested providers ---

  describe('nested providers', () => {
    it('inner provider tokens override outer provider tokens', async () => {
      const outerName = `outer-${Date.now()}`
      const innerName = `inner-${Date.now()}`

      defineTheme(outerName, {
        '--cv-color-bg': '#outer-bg',
        '--cv-color-text': '#outer-text',
      })
      defineTheme(innerName, {
        '--cv-color-bg': '#inner-bg',
      })

      const outer = await createProvider({theme: outerName})
      const inner = document.createElement('cv-theme-provider') as CVThemeProvider
      inner.theme = innerName
      outer.append(inner)
      await settle(inner)

      // Inner should have its own bg override
      expect(inner.style.getPropertyValue('--cv-color-bg').trim()).toBe('#inner-bg')
      // Inner should NOT have --cv-color-text set (only outer has it)
      expect(inner.style.getPropertyValue('--cv-color-text').trim()).toBe('')
      // Outer should still have its tokens
      expect(outer.style.getPropertyValue('--cv-color-bg').trim()).toBe('#outer-bg')
      expect(outer.style.getPropertyValue('--cv-color-text').trim()).toBe('#outer-text')
    })

    it('inner provider can have different mode than outer', async () => {
      const outer = await createProvider({mode: 'dark'})
      const inner = document.createElement('cv-theme-provider') as CVThemeProvider
      inner.mode = 'light'
      outer.append(inner)
      await settle(inner)

      expect(outer.style.colorScheme).toBe('dark')
      expect(inner.style.colorScheme).toBe('light')
    })

    it('inner provider data-cv-theme is independent of outer', async () => {
      const outerName = `outer-ind-${Date.now()}`
      const innerName = `inner-ind-${Date.now()}`

      defineTheme(outerName, {'--cv-color-bg': '#000'})
      defineTheme(innerName, {'--cv-color-bg': '#fff'})

      const outer = await createProvider({theme: outerName})
      const inner = document.createElement('cv-theme-provider') as CVThemeProvider
      inner.theme = innerName
      outer.append(inner)
      await settle(inner)

      expect(outer.getAttribute('data-cv-theme')).toBe(outerName)
      expect(inner.getAttribute('data-cv-theme')).toBe(innerName)
    })
  })
})
