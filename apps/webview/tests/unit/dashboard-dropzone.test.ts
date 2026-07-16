import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {DashboardDropzone} from '../../src/features/file-manager/components/dashboard-dropzone'

describe('dashboard-dropzone', () => {
  beforeEach(() => {
    DashboardDropzone.define()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('forwards drag state and renders the upload message affordance', async () => {
    const element = document.createElement('dashboard-dropzone') as DashboardDropzone
    element.active = true
    element.loading = true
    element.message = 'Drop into Projects'
    document.body.appendChild(element)
    await element.updateComplete

    const dropzone = element.shadowRoot?.querySelector<HTMLElement & {active: boolean; loading: boolean}>(
      'cv-dropzone',
    )
    const message = element.shadowRoot?.querySelector<HTMLElement>('[slot="message"]')

    expect(dropzone?.active).toBe(true)
    expect(dropzone?.loading).toBe(true)
    expect(message?.textContent).toContain('Drop into Projects')
    expect(message?.querySelector('cv-icon')?.getAttribute('name')).toBe('upload')
  })
})
