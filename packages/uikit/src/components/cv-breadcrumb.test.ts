import {afterEach, describe, expect, it} from 'vitest'

import {CVBreadcrumb} from './cv-breadcrumb'
import {CVBreadcrumbItem} from './cv-breadcrumb-item'

const settle = async (element: CVBreadcrumb) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createItem = (value: string, label: string, href: string, current = false) => {
  const item = document.createElement('cv-breadcrumb-item') as CVBreadcrumbItem
  item.value = value
  item.href = href
  item.current = current
  item.textContent = label
  return item
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-breadcrumb', () => {
  it('marks the last item as current by default', async () => {
    CVBreadcrumbItem.define()
    CVBreadcrumb.define()

    const breadcrumb = document.createElement('cv-breadcrumb') as CVBreadcrumb
    const home = createItem('home', 'Home', '/')
    const docs = createItem('docs', 'Docs', '/docs')
    const api = createItem('api', 'API', '/docs/api')

    breadcrumb.append(home, docs, api)
    document.body.append(breadcrumb)
    await settle(breadcrumb)

    expect(breadcrumb.value).toBe('api')
    expect(api.current).toBe(true)
    expect(docs.current).toBe(false)

    const apiLink = api.shadowRoot?.querySelector('[part="link"]') as HTMLAnchorElement
    expect(apiLink.getAttribute('aria-current')).toBe('page')
  })

  it('supports controlled current item via value', async () => {
    CVBreadcrumbItem.define()
    CVBreadcrumb.define()

    const breadcrumb = document.createElement('cv-breadcrumb') as CVBreadcrumb
    const home = createItem('home', 'Home', '/')
    const docs = createItem('docs', 'Docs', '/docs', true)
    const api = createItem('api', 'API', '/docs/api')

    breadcrumb.append(home, docs, api)
    document.body.append(breadcrumb)
    await settle(breadcrumb)

    expect(breadcrumb.value).toBe('docs')

    breadcrumb.value = 'home'
    await settle(breadcrumb)

    expect(home.current).toBe(true)
    expect(docs.current).toBe(false)
    expect(api.current).toBe(false)
  })

  it('maps root labeling contract', async () => {
    CVBreadcrumbItem.define()
    CVBreadcrumb.define()

    const breadcrumb = document.createElement('cv-breadcrumb') as CVBreadcrumb
    breadcrumb.ariaLabelledBy = 'crumb-heading'
    breadcrumb.append(createItem('home', 'Home', '/'), createItem('docs', 'Docs', '/docs'))

    document.body.append(breadcrumb)
    await settle(breadcrumb)

    const nav = breadcrumb.shadowRoot?.querySelector('[part="base"]') as HTMLElement
    expect(nav.getAttribute('role')).toBe('navigation')
    expect(nav.getAttribute('aria-label')).toBeNull()
    expect(nav.getAttribute('aria-labelledby')).toBe('crumb-heading')
  })

  it('preserves valid current item on slotchange rebuild', async () => {
    CVBreadcrumbItem.define()
    CVBreadcrumb.define()

    const breadcrumb = document.createElement('cv-breadcrumb') as CVBreadcrumb
    const home = createItem('home', 'Home', '/')
    const docs = createItem('docs', 'Docs', '/docs', true)
    const api = createItem('api', 'API', '/docs/api')

    breadcrumb.append(home, docs, api)
    document.body.append(breadcrumb)
    await settle(breadcrumb)

    expect(breadcrumb.value).toBe('docs')

    home.remove()
    await settle(breadcrumb)

    expect(breadcrumb.value).toBe('docs')
    expect(docs.current).toBe(true)
  })

  it('defaults aria-label to "Breadcrumb" on the nav element', async () => {
    CVBreadcrumbItem.define()
    CVBreadcrumb.define()

    const breadcrumb = document.createElement('cv-breadcrumb') as CVBreadcrumb
    breadcrumb.append(createItem('home', 'Home', '/'))
    document.body.append(breadcrumb)
    await settle(breadcrumb)

    const nav = breadcrumb.shadowRoot?.querySelector('[part="base"]') as HTMLElement
    expect(nav.getAttribute('aria-label')).toBe('Breadcrumb')
  })

  it('hides separator on the last item', async () => {
    CVBreadcrumbItem.define()
    CVBreadcrumb.define()

    const breadcrumb = document.createElement('cv-breadcrumb') as CVBreadcrumb
    const home = createItem('home', 'Home', '/')
    const docs = createItem('docs', 'Docs', '/docs')

    breadcrumb.append(home, docs)
    document.body.append(breadcrumb)
    await settle(breadcrumb)

    expect(home.showSeparator).toBe(true)
    expect(docs.showSeparator).toBe(false)

    const lastSep = docs.shadowRoot?.querySelector('[part="separator"]') as HTMLElement
    expect(lastSep.hidden).toBe(true)
  })

  it('exposes CSS parts on breadcrumb-item: link, prefix, suffix, separator', async () => {
    CVBreadcrumbItem.define()
    CVBreadcrumb.define()

    const breadcrumb = document.createElement('cv-breadcrumb') as CVBreadcrumb
    const home = createItem('home', 'Home', '/')
    breadcrumb.append(home)
    document.body.append(breadcrumb)
    await settle(breadcrumb)

    const link = home.shadowRoot?.querySelector('[part="link"]')
    const prefix = home.shadowRoot?.querySelector('[part="prefix"]')
    const suffix = home.shadowRoot?.querySelector('[part="suffix"]')
    const separator = home.shadowRoot?.querySelector('[part="separator"]')

    expect(link).toBeTruthy()
    expect(prefix).toBeTruthy()
    expect(suffix).toBeTruthy()
    expect(separator).toBeTruthy()
  })

  it('renders slotted prefix content in breadcrumb-item', async () => {
    CVBreadcrumbItem.define()
    CVBreadcrumb.define()

    const breadcrumb = document.createElement('cv-breadcrumb') as CVBreadcrumb
    const home = document.createElement('cv-breadcrumb-item') as CVBreadcrumbItem
    home.value = 'home'
    home.href = '/'

    const icon = document.createElement('span')
    icon.slot = 'prefix'
    icon.textContent = '🏠'
    home.append(icon, document.createTextNode('Home'))

    breadcrumb.append(home)
    document.body.append(breadcrumb)
    await settle(breadcrumb)

    const prefixSlot = home.shadowRoot?.querySelector('slot[name="prefix"]') as HTMLSlotElement
    expect(prefixSlot).toBeTruthy()
    expect(prefixSlot.assignedElements()).toHaveLength(1)
    expect(prefixSlot.assignedElements()[0]?.textContent).toBe('🏠')
  })

  it('renders slotted suffix content in breadcrumb-item', async () => {
    CVBreadcrumbItem.define()
    CVBreadcrumb.define()

    const breadcrumb = document.createElement('cv-breadcrumb') as CVBreadcrumb
    const home = document.createElement('cv-breadcrumb-item') as CVBreadcrumbItem
    home.value = 'home'
    home.href = '/'

    const badge = document.createElement('span')
    badge.slot = 'suffix'
    badge.textContent = '(3)'
    home.append(document.createTextNode('Home'), badge)

    breadcrumb.append(home)
    document.body.append(breadcrumb)
    await settle(breadcrumb)

    const suffixSlot = home.shadowRoot?.querySelector('slot[name="suffix"]') as HTMLSlotElement
    expect(suffixSlot).toBeTruthy()
    expect(suffixSlot.assignedElements()).toHaveLength(1)
    expect(suffixSlot.assignedElements()[0]?.textContent).toBe('(3)')
  })

  it('allows custom separator via slot', async () => {
    CVBreadcrumbItem.define()
    CVBreadcrumb.define()

    const breadcrumb = document.createElement('cv-breadcrumb') as CVBreadcrumb
    const home = document.createElement('cv-breadcrumb-item') as CVBreadcrumbItem
    home.value = 'home'
    home.href = '/'
    home.textContent = 'Home'

    const sep = document.createElement('span')
    sep.slot = 'separator'
    sep.textContent = '→'
    home.append(sep)

    const docs = createItem('docs', 'Docs', '/docs')

    breadcrumb.append(home, docs)
    document.body.append(breadcrumb)
    await settle(breadcrumb)

    const sepSlot = home.shadowRoot?.querySelector('slot[name="separator"]') as HTMLSlotElement
    expect(sepSlot).toBeTruthy()
    expect(sepSlot.assignedElements()).toHaveLength(1)
    expect(sepSlot.assignedElements()[0]?.textContent).toBe('→')
  })

  it('sets correct href on each item link', async () => {
    CVBreadcrumbItem.define()
    CVBreadcrumb.define()

    const breadcrumb = document.createElement('cv-breadcrumb') as CVBreadcrumb
    const home = createItem('home', 'Home', '/')
    const docs = createItem('docs', 'Docs', '/docs')

    breadcrumb.append(home, docs)
    document.body.append(breadcrumb)
    await settle(breadcrumb)

    const homeLink = home.shadowRoot?.querySelector('[part="link"]') as HTMLAnchorElement
    const docsLink = docs.shadowRoot?.querySelector('[part="link"]') as HTMLAnchorElement

    expect(homeLink.getAttribute('href')).toBe('/')
    expect(docsLink.getAttribute('href')).toBe('/docs')
  })

  it('marks separator as aria-hidden', async () => {
    CVBreadcrumbItem.define()
    CVBreadcrumb.define()

    const breadcrumb = document.createElement('cv-breadcrumb') as CVBreadcrumb
    const home = createItem('home', 'Home', '/')
    const docs = createItem('docs', 'Docs', '/docs')

    breadcrumb.append(home, docs)
    document.body.append(breadcrumb)
    await settle(breadcrumb)

    const sep = home.shadowRoot?.querySelector('[part="separator"]') as HTMLElement
    expect(sep.getAttribute('aria-hidden')).toBe('true')
  })
})
