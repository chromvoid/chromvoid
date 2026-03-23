import {describe, expect, it} from 'vitest'
import {createBreadcrumb, normalizeBreadcrumbItems} from './index'

describe('createBreadcrumb', () => {
  const sampleItems = [
    {id: 'home', label: 'Home', href: '/'},
    {id: 'docs', label: 'Docs', href: '/docs'},
    {id: 'api', label: 'API', href: '/docs/api'},
  ] as const

  it('renders a list of breadcrumb items via state.items()', () => {
    const model = createBreadcrumb({items: sampleItems})

    const items = model.state.items()
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.id)).toEqual(['home', 'docs', 'api'])
    expect(items.map((i) => i.label)).toEqual(['Home', 'Docs', 'API'])
  })

  it('normalizes current item to the last item by default', () => {
    const items = normalizeBreadcrumbItems(sampleItems)

    expect(items.map((item) => item.isCurrent)).toEqual([false, false, true])
  })

  it('keeps exactly one current item when multiple items are marked current', () => {
    const model = createBreadcrumb({
      items: [
        {id: 'home', label: 'Home', href: '/', isCurrent: true},
        {id: 'docs', label: 'Docs', href: '/docs', isCurrent: true},
      ],
    })

    expect(
      model.state
        .items()
        .filter((item) => item.isCurrent)
        .map((item) => item.id),
    ).toEqual(['docs'])
    expect(model.state.currentId()).toBe('docs')
  })

  it('returns aria-label="Breadcrumb" on the root by default', () => {
    const model = createBreadcrumb({items: sampleItems})

    const rootProps = model.contracts.getRootProps()
    expect(rootProps.role).toBe('navigation')
    expect(rootProps['aria-label']).toBe('Breadcrumb')
  })

  it('uses custom aria-label when provided', () => {
    const model = createBreadcrumb({items: sampleItems, ariaLabel: 'You are here'})

    expect(model.contracts.getRootProps()['aria-label']).toBe('You are here')
  })

  it('uses aria-labelledby and omits aria-label when ariaLabelledBy is provided', () => {
    const model = createBreadcrumb({items: sampleItems, ariaLabelledBy: 'heading-1'})

    const rootProps = model.contracts.getRootProps()
    expect(rootProps['aria-labelledby']).toBe('heading-1')
    expect(rootProps['aria-label']).toBeUndefined()
  })

  it('sets aria-current="page" only on the current item link', () => {
    const model = createBreadcrumb({
      items: [
        {id: 'home', label: 'Home', href: '/'},
        {id: 'docs', label: 'Docs', href: '/docs', isCurrent: true},
      ],
    })

    expect(model.contracts.getLinkProps('docs')['aria-current']).toBe('page')
  })

  it('does not set aria-current on non-current item links', () => {
    const model = createBreadcrumb({
      items: [
        {id: 'home', label: 'Home', href: '/'},
        {id: 'docs', label: 'Docs', href: '/docs'},
        {id: 'api', label: 'API', href: '/docs/api', isCurrent: true},
      ],
    })

    expect(model.contracts.getLinkProps('home')['aria-current']).toBeUndefined()
    expect(model.contracts.getLinkProps('docs')['aria-current']).toBeUndefined()
    expect(model.contracts.getLinkProps('api')['aria-current']).toBe('page')
  })

  it('maps correct href for each link', () => {
    const model = createBreadcrumb({items: sampleItems})

    expect(model.contracts.getLinkProps('home').href).toBe('/')
    expect(model.contracts.getLinkProps('docs').href).toBe('/docs')
    expect(model.contracts.getLinkProps('api').href).toBe('/docs/api')
  })

  it('returns aria-hidden="true" on separators', () => {
    const model = createBreadcrumb({
      items: [
        {id: 'home', label: 'Home', href: '/'},
        {id: 'docs', label: 'Docs', href: '/docs', isCurrent: true},
      ],
    })

    expect(model.contracts.getSeparatorProps('home')).toEqual({
      'aria-hidden': 'true',
    })
  })

  it('throws for unknown item id in getItemProps', () => {
    const model = createBreadcrumb({items: sampleItems})

    expect(() => model.contracts.getItemProps('unknown')).toThrow('Unknown breadcrumb item id')
  })

  it('throws for unknown item id in getLinkProps', () => {
    const model = createBreadcrumb({items: sampleItems})

    expect(() => model.contracts.getLinkProps('unknown')).toThrow('Unknown breadcrumb item id for link')
  })

  it('throws for unknown item id in getSeparatorProps', () => {
    const model = createBreadcrumb({items: sampleItems})

    expect(() => model.contracts.getSeparatorProps('unknown')).toThrow('Unknown breadcrumb item id for separator')
  })

  it('does not expose actions on the model (spec: actions: none)', () => {
    const model = createBreadcrumb({items: sampleItems})

    expect(model).not.toHaveProperty('actions')
  })

  it('returns empty props from getListProps (list role: none)', () => {
    const model = createBreadcrumb({items: sampleItems})

    const listProps = model.contracts.getListProps()
    expect(listProps).toEqual({})
  })

  it('handles empty items array', () => {
    const model = createBreadcrumb({items: []})

    expect(model.state.items()).toEqual([])
    expect(model.state.currentId()).toBeNull()
  })

  it('tracks currentId via computed for explicitly marked current', () => {
    const model = createBreadcrumb({
      items: [
        {id: 'home', label: 'Home', href: '/'},
        {id: 'docs', label: 'Docs', href: '/docs', isCurrent: true},
        {id: 'api', label: 'API', href: '/docs/api'},
      ],
    })

    expect(model.state.currentId()).toBe('docs')
  })

  it('defaults currentId to last item when none marked current', () => {
    const model = createBreadcrumb({items: sampleItems})

    expect(model.state.currentId()).toBe('api')
  })

  it('returns data-current on getItemProps matching isCurrent state', () => {
    const model = createBreadcrumb({items: sampleItems})

    expect(model.contracts.getItemProps('home')['data-current']).toBe('false')
    expect(model.contracts.getItemProps('docs')['data-current']).toBe('false')
    expect(model.contracts.getItemProps('api')['data-current']).toBe('true')
  })
})
