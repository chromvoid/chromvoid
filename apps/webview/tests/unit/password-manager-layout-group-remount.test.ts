import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {html} from '@chromvoid/uikit/reatom-lit'
import {Group, ManagerRoot} from '@project/passmanager/core'
import {keyed} from 'lit/directives/keyed.js'
import {PMLayoutBase} from '../../src/features/passmanager/components/password-manager-layout/password-manager-layout-base'

class TestPMGroupRemountLayout extends PMLayoutBase {
  static define() {
    if (!customElements.get('test-pm-group-remount-layout')) {
      customElements.define('test-pm-group-remount-layout', this)
    }
  }

  protected getSearchElement() {
    return null
  }

  protected override render() {
    return html`${keyed(this.model.getGroupViewKey(), html`<pm-group></pm-group>`)}`
  }
}

async function settle(element: HTMLElement & {updateComplete?: Promise<unknown>}): Promise<void> {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await Promise.resolve()
}

describe('Password manager layout group remount', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    TestPMGroupRemountLayout.define()
    previousPassmanager = window.passmanager
  })

  afterEach(() => {
    window.passmanager = previousPassmanager
    document.querySelectorAll('test-pm-group-remount-layout').forEach((element) => element.remove())
  })

  it('remounts pm-group when showElement changes from root to group', async () => {
    const root = new ManagerRoot({} as any)
    const group = new Group({
      id: 'group-a',
      name: 'Group A',
      entries: [],
      createdTs: Date.now(),
      updatedTs: Date.now(),
    } as any)

    root.entries.set([group])
    root.showElement.set(root)
    window.passmanager = root

    const layout = document.createElement(
      'test-pm-group-remount-layout',
    ) as TestPMGroupRemountLayout & {updateComplete: Promise<unknown>}
    document.body.appendChild(layout)
    await settle(layout)

    const rootGroupHost = layout.shadowRoot?.querySelector('pm-group')
    expect(rootGroupHost).not.toBeNull()

    root.showElement.set(group)
    await settle(layout)

    const groupHost = layout.shadowRoot?.querySelector('pm-group')
    expect(groupHost).not.toBeNull()
    expect(groupHost).not.toBe(rootGroupHost)
  })
})
