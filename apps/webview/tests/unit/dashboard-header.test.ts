import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'

import {DashboardHeader} from '../../src/features/shell/components/dashboard-header'
import {DesktopShellToolbar} from '../../src/features/shell/components/desktop-shell-toolbar'

let dashboardHeaderDefined = false

function ensureDashboardHeaderDefined() {
  if (dashboardHeaderDefined) return
  DashboardHeader.define()
  dashboardHeaderDefined = true
}

async function flushHeader(header: DashboardHeader) {
  await Promise.resolve()
  await header.updateComplete
  const toolbar = header.shadowRoot?.querySelector(DesktopShellToolbar.elementName) as
    | DesktopShellToolbar
    | null
  await toolbar?.updateComplete
  await Promise.resolve()
  await header.updateComplete
  await toolbar?.updateComplete
}

function shadowPart(toolbar: DesktopShellToolbar, selector: string) {
  const part = toolbar.shadowRoot?.querySelector<HTMLElement>(selector)
  expect(part).toBeInstanceOf(HTMLElement)
  return part as HTMLElement
}

describe('DashboardHeader', () => {
  afterEach(() => {
    document.querySelectorAll(DashboardHeader.elementName).forEach((header) => header.remove())
  })

  it('forwards public slots into desktop-shell-toolbar without exposing empty groups', async () => {
    ensureDashboardHeaderDefined()
    const header = document.createElement(DashboardHeader.elementName) as DashboardHeader
    header.twoRow = true

    const leading = document.createElement('span')
    leading.slot = 'leading'
    leading.textContent = 'Files'
    const center = document.createElement('span')
    center.slot = 'center'
    center.textContent = 'Search'
    header.append(leading, center)

    document.body.append(header)
    await flushHeader(header)

    const toolbar = header.shadowRoot?.querySelector(DesktopShellToolbar.elementName) as
      | DesktopShellToolbar
      | null
    expect(toolbar).not.toBeNull()
    expect(toolbar?.hasAttribute('two-row')).toBe(true)
    expect(header.shadowRoot?.querySelector('[slot="leading"]')?.hasAttribute('hidden')).toBe(false)
    expect(header.shadowRoot?.querySelector('[slot="title"]')?.hasAttribute('hidden')).toBe(true)
    expect(shadowPart(toolbar!, '.leading').hidden).toBe(false)
    expect(shadowPart(toolbar!, '.center').hidden).toBe(false)
    expect(shadowPart(toolbar!, '.actions').hidden).toBe(true)
    expect(shadowPart(toolbar!, '.heading').hidden).toBe(true)
  })

  it('keeps file-manager domain imports out of the shared shell component', () => {
    const sourcePath = resolve(process.cwd(), 'src/features/shell/components/dashboard-header.ts')
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).not.toContain('features/file-manager')
    expect(source).not.toContain('file-manager')
    expect(source).not.toContain('passmanager')
    expect(source).not.toContain('notes-quick-view')
  })
})
