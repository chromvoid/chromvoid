import {afterEach, describe, expect, it} from 'vitest'

import {BreadcrumbsNav} from '../../src/features/file-manager/components/breadcrumbs-nav'

const settle = async (element: BreadcrumbsNav) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('breadcrumbs-nav', () => {
  it('renders cv breadcrumb items with path-based value and href', async () => {
    BreadcrumbsNav.define()

    const element = document.createElement('breadcrumbs-nav') as BreadcrumbsNav
    element.currentPath = '/docs/api'
    document.body.append(element)
    await settle(element)

    const breadcrumb = element.shadowRoot?.querySelector('cv-breadcrumb')
    const items = Array.from(element.shadowRoot?.querySelectorAll('cv-breadcrumb-item') ?? [])

    expect(breadcrumb).toBeTruthy()
    expect(items).toHaveLength(3)
    expect(items[0]?.getAttribute('value')).toBe('/')
    expect(items[0]?.getAttribute('href')).toBe('/')
    expect(items[0]?.querySelector('cv-icon[slot="prefix"][name="house"]')).toBeTruthy()
    expect(items[1]?.getAttribute('value')).toBe('/docs')
    expect(items[1]?.getAttribute('href')).toBe('/docs')
    expect(items[2]?.getAttribute('value')).toBe('/docs/api')
    expect(items[2]?.getAttribute('href')).toBe('/docs/api')
  })

  it('dispatches navigate and prevents default for non-current item clicks', async () => {
    BreadcrumbsNav.define()

    const element = document.createElement('breadcrumbs-nav') as BreadcrumbsNav
    element.currentPath = '/docs/api'
    document.body.append(element)
    await settle(element)

    let navigatedPath = ''
    element.addEventListener('navigate', (event) => {
      navigatedPath = (event as CustomEvent<{path: string}>).detail.path
    })

    const docsItem = element.shadowRoot?.querySelectorAll('cv-breadcrumb-item')[1] as HTMLElement | undefined
    const docsLink = docsItem?.shadowRoot?.querySelector('[part="link"]') as HTMLAnchorElement | null
    const clickEvent = new MouseEvent('click', {bubbles: true, cancelable: true, composed: true})

    docsLink?.dispatchEvent(clickEvent)

    expect(clickEvent.defaultPrevented).toBe(true)
    expect(navigatedPath).toBe('/docs')
  })

  it('prevents default but does not navigate for the current breadcrumb item', async () => {
    BreadcrumbsNav.define()

    const element = document.createElement('breadcrumbs-nav') as BreadcrumbsNav
    element.currentPath = '/docs/api'
    document.body.append(element)
    await settle(element)

    let navigateCount = 0
    element.addEventListener('navigate', () => {
      navigateCount += 1
    })

    const currentItem = element.shadowRoot?.querySelectorAll('cv-breadcrumb-item')[2] as HTMLElement | undefined
    const currentLink = currentItem?.shadowRoot?.querySelector('[part="link"]') as HTMLAnchorElement | null
    const clickEvent = new MouseEvent('click', {bubbles: true, cancelable: true, composed: true})

    currentLink?.dispatchEvent(clickEvent)

    expect(clickEvent.defaultPrevented).toBe(true)
    expect(navigateCount).toBe(0)
  })
})
