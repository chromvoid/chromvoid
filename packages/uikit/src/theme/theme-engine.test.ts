import {afterEach, describe, expect, it} from 'vitest'

import {CVThemeProvider} from './cv-theme-provider'
import {applyTheme, defineTheme, getTheme} from './theme-engine'

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('theme engine', () => {
  it('registers and reads themes without leaking mutable references', () => {
    const name = `unit-theme-${Date.now()}-clone`

    defineTheme(name, {
      '--cv-color-bg': '#111111',
      '--cv-color-text': '#eeeeee',
    })

    const loaded = getTheme(name)
    expect(loaded?.tokens['--cv-color-bg']).toBe('#111111')

    if (!loaded) {
      throw new Error('Expected theme to be defined')
    }

    loaded.tokens['--cv-color-bg'] = '#222222'

    expect(getTheme(name)?.tokens['--cv-color-bg']).toBe('#111111')
  })

  it('applies a theme and removes previously applied tokens from the same target', () => {
    const themeOne = `unit-theme-${Date.now()}-one`
    const themeTwo = `unit-theme-${Date.now()}-two`

    defineTheme(themeOne, {
      '--cv-color-bg': '#111111',
      '--cv-color-border': '#444444',
    })

    defineTheme(themeTwo, {
      '--cv-color-bg': '#222222',
    })

    const target = document.createElement('div')

    applyTheme(target, themeOne)
    expect(target.style.getPropertyValue('--cv-color-bg').trim()).toBe('#111111')
    expect(target.style.getPropertyValue('--cv-color-border').trim()).toBe('#444444')

    applyTheme(target, themeTwo)
    expect(target.style.getPropertyValue('--cv-color-bg').trim()).toBe('#222222')
    expect(target.style.getPropertyValue('--cv-color-border').trim()).toBe('')
  })

  it('scopes theme vars through cv-theme-provider and updates on theme change', async () => {
    CVThemeProvider.define()

    const themeOne = `unit-theme-${Date.now()}-provider-one`
    const themeTwo = `unit-theme-${Date.now()}-provider-two`

    defineTheme(themeOne, {
      '--cv-color-primary': '#0099ff',
      '--cv-color-bg': '#121212',
    })

    defineTheme(themeTwo, {
      '--cv-color-primary': '#ff5500',
    })

    const provider = document.createElement('cv-theme-provider') as CVThemeProvider
    provider.theme = themeOne
    provider.innerHTML = '<div id="child">Child</div>'

    document.body.append(provider)
    await provider.updateComplete
    await flush()

    expect(provider.style.getPropertyValue('--cv-color-primary').trim()).toBe('#0099ff')
    expect(provider.style.getPropertyValue('--cv-color-bg').trim()).toBe('#121212')

    provider.theme = themeTwo
    await provider.updateComplete
    await flush()

    expect(provider.style.getPropertyValue('--cv-color-primary').trim()).toBe('#ff5500')
    expect(provider.style.getPropertyValue('--cv-color-bg').trim()).toBe('')
  })
})
