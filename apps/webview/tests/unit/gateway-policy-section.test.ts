import {render as renderTemplate} from 'lit'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {renderGatewayPolicySection} from '../../src/routes/gateway/components/gateway-policy-section'
import type {ActiveGrants, CapabilityPolicy} from '../../src/routes/gateway/gateway.model'

const POLICY: CapabilityPolicy = {
  extension_id: 'abcdefghijklmnopq',
  allowed_commands: {type: 'all'},
  require_action_grant: true,
  require_site_grant: false,
  site_allowlist: [],
}

const EMPTY_GRANTS: ActiveGrants = {
  action_grants: [],
  site_grants: [],
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('gateway policy section styling', () => {
  it('renders compact empty states without inline padding styles', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    renderTemplate(
      renderGatewayPolicySection({
        policy: POLICY,
        grants: EMPTY_GRANTS,
        onClosePolicy: vi.fn(),
        onToggleActionGrant: vi.fn(),
        onToggleSiteGrant: vi.fn(),
        onAddAllowlistOrigin: vi.fn(),
        onRemoveAllowlistOrigin: vi.fn(),
        onRevokeAllGrants: vi.fn(),
      }),
      container,
    )

    const emptyStates = Array.from(container.querySelectorAll<HTMLElement>('.empty-state'))
    expect(emptyStates).toHaveLength(2)
    expect(emptyStates.every((state) => state.classList.contains('empty-state-compact'))).toBe(true)
    expect(emptyStates.every((state) => !state.hasAttribute('style'))).toBe(true)
    expect(container.textContent).toContain('All origins are allowed')
    expect(container.textContent).toContain('No active grants')
  })
})
