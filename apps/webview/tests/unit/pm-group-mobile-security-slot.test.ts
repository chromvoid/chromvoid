import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {Group} from '@project/passmanager'

import {PMGroupListItemMobile} from '../../src/features/passmanager/components/group/group/group-list-item-mobile'

describe('PMGroupListItemMobile security indicator slot', () => {
  beforeEach(() => {
    PMGroupListItemMobile.define()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('keeps one stable slot when a risk indicator appears', async () => {
    const now = Date.now()
    const group = new Group({
      id: 'group-security-slot',
      name: 'Security',
      entries: [],
      createdTs: now,
      updatedTs: now,
    })
    const element = document.createElement('pm-group-list-item-mobile') as PMGroupListItemMobile
    element.group = group
    element.presentation = {
      displayName: 'Security',
      description: '',
      entryCount: 1,
      riskIndicator: null,
    }
    document.body.append(element)
    await element.updateComplete

    const slot = element.shadowRoot?.querySelector('.group-risk-slot')
    expect(slot?.getAttribute('aria-hidden')).toBe('true')

    element.presentation = {
      ...element.presentation,
      riskIndicator: {
        severity: 'critical',
        label: '1 weak password',
        count: 1,
      },
    }
    await element.updateComplete

    expect(element.shadowRoot?.querySelector('.group-risk-slot')).toBe(slot)
    expect(slot?.hasAttribute('aria-hidden')).toBe(false)
    expect(slot?.querySelector('.group-risk-dot[data-severity="critical"]')).not.toBeNull()
  })
})
