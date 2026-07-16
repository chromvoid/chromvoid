import {afterEach, describe, expect, it} from 'vitest'

import {FileManagerStatusBar} from '../../src/features/file-manager/components/file-manager-status-bar'

FileManagerStatusBar.define()

describe('file-manager-status-bar', () => {
  afterEach(() => {
    document.querySelectorAll(FileManagerStatusBar.elementName).forEach((element) => element.remove())
  })

  it('renders the visible count, sort summary, and vault path', async () => {
    const element = document.createElement(FileManagerStatusBar.elementName) as FileManagerStatusBar
    element.visibleCount = 4
    element.totalCount = 9
    element.currentPath = '/Projects/ChromVoid'
    element.sortBy = 'date'
    element.sortDirection = 'desc'
    document.body.appendChild(element)
    await element.updateComplete

    expect(element.shadowRoot?.querySelector('.count')?.textContent).toContain('4')
    expect(element.shadowRoot?.querySelector('.count')?.textContent).toContain('9')
    expect(element.shadowRoot?.querySelector('.sort')?.textContent).toBeTruthy()
    expect(element.shadowRoot?.querySelector('.path')?.textContent).toBe('vault:/Projects/ChromVoid')
    expect(element.shadowRoot?.querySelector('.path')?.getAttribute('dir')).toBe('ltr')
  })

  it('uses the root vault path and exposes loading state', async () => {
    const element = document.createElement(FileManagerStatusBar.elementName) as FileManagerStatusBar
    element.currentPath = '/'
    element.loading = true
    document.body.appendChild(element)
    await element.updateComplete

    expect(element.shadowRoot?.querySelector('.path')?.textContent).toBe('vault://root')
    expect(element.shadowRoot?.querySelector('.loading')).not.toBeNull()
  })
})
