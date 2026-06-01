import {afterEach, describe, expect, it, vi} from 'vitest'

import {atom} from '@reatom/core'
import {Group} from '@project/passmanager'
import {PMGroup} from '../../src/features/passmanager/components/group/group'
import {passmanagerNavigationController} from '../../src/features/passmanager/passmanager-navigation.controller'

type PassmanagerMock = {
  id: string
  showElement: ReturnType<typeof atom<any>>
  isReadOnly: () => boolean
  setShowElement: ReturnType<typeof vi.fn>
  entriesList: () => Array<Group>
}

let defined = false
let originalPassmanager: unknown

function ensureDefined() {
  if (defined) return
  PMGroup.define()
  defined = true
}

async function settle(element: PMGroup) {
  await element.updateComplete
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await element.updateComplete
  await Promise.resolve()
}

function createNestedGroup(id: string, name: string) {
  return new Group({
    id,
    name,
    entries: [],
    createdTs: Date.now(),
    updatedTs: Date.now(),
  })
}

function createPassmanagerMock(current: Group, groups: Group[]): PassmanagerMock {
  return {
    id: 'pm-id',
    showElement: atom<any>(current),
    isReadOnly: () => false,
    setShowElement: vi.fn(),
    entriesList: () => groups,
  }
}

describe('PMGroup breadcrumb navigation', () => {
  afterEach(() => {
    document.querySelectorAll('pm-group').forEach((el) => el.remove())
    ;(window as any).passmanager = originalPassmanager
    vi.restoreAllMocks()
  })

  it('navigates to the clicked parent group breadcrumb', async () => {
    ensureDefined()
    const parent = createNestedGroup('group-work-security', 'Work/Security')
    const current = createNestedGroup('group-secrets', 'Work/Security/Secrets')
    const passmanager = createPassmanagerMock(current, [parent, current])
    const applyRouteSpy = vi.spyOn(passmanagerNavigationController, 'applyRoute').mockReturnValue(true)

    originalPassmanager = (window as any).passmanager
    ;(window as any).passmanager = passmanager

    const element = document.createElement('pm-group') as PMGroup
    document.body.append(element)
    await settle(element)

    const header = element.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement | null
    const securityItem = header?.shadowRoot?.querySelectorAll('cv-breadcrumb-item')[2] as HTMLElement | undefined
    const securityLink = securityItem?.shadowRoot?.querySelector('[part="link"]') as HTMLAnchorElement | null

    securityLink?.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, composed: true}))

    expect(applyRouteSpy).toHaveBeenCalledWith({kind: 'group', groupPath: 'Work/Security'})
  })

  it('navigates to root when the root breadcrumb is clicked', async () => {
    ensureDefined()
    const parent = createNestedGroup('group-work-security', 'Work/Security')
    const current = createNestedGroup('group-secrets', 'Work/Security/Secrets')
    const passmanager = createPassmanagerMock(current, [parent, current])
    const applyRouteSpy = vi.spyOn(passmanagerNavigationController, 'applyRoute').mockReturnValue(true)

    originalPassmanager = (window as any).passmanager
    ;(window as any).passmanager = passmanager

    const element = document.createElement('pm-group') as PMGroup
    document.body.append(element)
    await settle(element)

    const header = element.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement | null
    const rootItem = header?.shadowRoot?.querySelectorAll('cv-breadcrumb-item')[0] as HTMLElement | undefined
    const rootLink = rootItem?.shadowRoot?.querySelector('[part="link"]') as HTMLAnchorElement | null

    rootLink?.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, composed: true}))

    expect(applyRouteSpy).toHaveBeenCalledWith({kind: 'root'})
  })
})
