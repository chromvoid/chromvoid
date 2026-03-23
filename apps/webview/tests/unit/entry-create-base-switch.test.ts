import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {CVInput, CVSwitch, CVTextarea} from '@chromvoid/uikit'
import {PMEntryCreateBase} from '../../src/features/passmanager/components/card/entry-create/entry-create-base'

class TestEntryCreate extends PMEntryCreateBase {
  static define() {
    if (!customElements.get('test-entry-create-switch')) {
      customElements.define('test-entry-create-switch', this)
    }
  }
}

const settle = async (component: TestEntryCreate, sw?: CVSwitch) => {
  await component.updateComplete
  if (sw) {
    await sw.updateComplete
  }
  await Promise.resolve()
  await component.updateComplete
  if (sw) {
    await sw.updateComplete
  }
}

const getSwitches = (component: TestEntryCreate) =>
  Array.from(component.shadowRoot?.querySelectorAll('cv-switch') ?? []) as CVSwitch[]

const clickSwitch = async (component: TestEntryCreate, sw: CVSwitch) => {
  const control = sw.shadowRoot?.querySelector('[part="control"]') as HTMLElement | null

  expect(control).not.toBeNull()
  control?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
  await settle(component, sw)
}

describe('PMEntryCreateBase switch integration', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    previousPassmanager = window.passmanager
    window.passmanager = {
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager

    CVInput.define()
    CVSwitch.define()
    CVTextarea.define()
    TestEntryCreate.define()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    window.passmanager = previousPassmanager
  })

  it('renders OTP and SSH toggles as small cv-switch components', async () => {
    const component = document.createElement('test-entry-create-switch') as TestEntryCreate
    document.body.append(component)
    await settle(component)

    const switches = getSwitches(component)

    expect(switches).toHaveLength(2)
    expect(switches.map((sw) => sw.getAttribute('size'))).toEqual(['small', 'small'])
  })

  it('shows OTP form after toggling the cv-switch', async () => {
    const component = document.createElement('test-entry-create-switch') as TestEntryCreate
    document.body.append(component)
    await settle(component)

    const switches = getSwitches(component)
    expect(switches).toHaveLength(2)
    const otpSwitch = switches[0]!

    expect(component.shadowRoot?.querySelector('pm-entry-otp-create')).toBeNull()

    await clickSwitch(component, otpSwitch)

    expect(component.shadowRoot?.querySelector('pm-entry-otp-create')).not.toBeNull()
  })

  it('shows SSH generator after toggling the cv-switch', async () => {
    const component = document.createElement('test-entry-create-switch') as TestEntryCreate
    document.body.append(component)
    await settle(component)

    const switches = getSwitches(component)
    expect(switches).toHaveLength(2)
    const sshSwitch = switches[1]!

    expect(component.shadowRoot?.querySelector('pm-entry-ssh-generator')).toBeNull()

    await clickSwitch(component, sshSwitch)

    expect(component.shadowRoot?.querySelector('pm-entry-ssh-generator')).not.toBeNull()
  })
})
