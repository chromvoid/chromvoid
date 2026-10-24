import {describe, expect, it} from 'vitest'

import en from '../../src/i18n/locales/en.json'
import ru from '../../src/i18n/locales/ru.json'
import {knownGuidanceAnchors} from '../../src/core/guidance/guidance.anchors'
import {guidanceDefinitions} from '../../src/core/guidance/guidance.registry'
import {validateGuidanceRegistry} from '../../src/core/guidance/guidance.validation'
import type {KnownGuidanceAnchor} from '../../src/core/guidance/guidance.anchors'
import type {GuidanceDefinition} from '../../src/core/guidance/guidance.types'

const anchors: KnownGuidanceAnchor[] = [
  {id: 'files.create-or-upload', surface: 'files', owner: 'file-manager'},
  {id: 'dynamic.item', surface: 'files', owner: 'file-manager', dynamic: true},
]

const definition: GuidanceDefinition = {
  id: 'files.empty-state',
  surface: 'files',
  anchorId: 'files.create-or-upload',
  trigger: 'empty_state',
  presentation: 'inline_hint',
  titleKey: 'guidance:files.empty-state:title',
  bodyKey: 'guidance:files.empty-state:body',
  completion: {kind: 'product_state', key: 'files.has_items'},
  priority: 20,
  owner: 'file-manager',
  version: 1,
}

const releaseMatrix = [
  {rank: 1, ids: ['welcome.master-password', 'welcome.backup-restore']},
  {rank: 2, ids: ['remote-storage.mount-warning']},
  {rank: 3, ids: ['welcome.local-vs-remote']},
  {rank: 5, ids: ['gateway.pair-extension']},
  {rank: 6, ids: ['remote.setup-network']},
  {rank: 8, ids: ['passwords.import-migration']},
  {rank: 9, ids: ['passkeys.empty-state']},
  {rank: 10, ids: ['files.empty-state', 'notes.empty-state', 'passwords.empty-state']},
  {rank: 11, ids: ['settings.ssh-agent']},
] as const

const lowRankedIds = new Set(
  releaseMatrix.flatMap((row) => (row.rank >= 6 ? [...row.ids] : [])),
)

describe('validateGuidanceRegistry', () => {
  it('validates the seeded guidance registry against anchors and i18n data', () => {
    const result = validateGuidanceRegistry({
      definitions: guidanceDefinitions,
      anchors: knownGuidanceAnchors,
      hasI18nKey: (key) => Object.prototype.hasOwnProperty.call(en, key),
    })

    expect(result).toEqual({ok: true, errors: []})
  })

  it('provides English and Russian copy for every seeded title, body, and action key', () => {
    const keys = new Set<string>()
    for (const item of guidanceDefinitions) {
      keys.add(item.titleKey)
      keys.add(item.bodyKey)
      if (item.primaryActionKey) keys.add(item.primaryActionKey)
      if (item.secondaryActionKey) keys.add(item.secondaryActionKey)
    }

    for (const key of keys) {
      const english = en[key as keyof typeof en]
      const russian = ru[key as keyof typeof ru]
      expect(english, `${key} English copy`).toBeTruthy()
      expect(russian, `${key} Russian copy`).toBeTruthy()
      expect(english).not.toBe(key)
      expect(russian).not.toBe(key)
    }
  })

  it('keeps automatic intrusive onboarding limited to the critical top-five topics', () => {
    const byId = new Map(guidanceDefinitions.map((item) => [item.id, item]))
    const intrusiveAutomaticIds = guidanceDefinitions
      .filter((item) => item.trigger !== 'blocked_action' && item.trigger !== 'manual_help')
      .filter((item) => item.presentation !== 'inline_hint')
      .map((item) => item.id)

    expect(intrusiveAutomaticIds).toEqual([
      'welcome.local-vs-remote',
      'welcome.master-password',
      'gateway.pair-extension',
    ])
    expect(byId.get('remote-storage.mount-warning')).toMatchObject({
      trigger: 'blocked_action',
      presentation: 'popover',
      priority: 110,
    })
    expect(byId.get('remote.setup-network')).toMatchObject({presentation: 'inline_hint'})
    expect(byId.get('files.empty-state')).toMatchObject({presentation: 'inline_hint', priority: 10})
    expect(byId.get('notes.empty-state')).toMatchObject({presentation: 'inline_hint', priority: 10})
    expect(byId.get('passwords.empty-state')).toMatchObject({presentation: 'inline_hint', priority: 10})
  })

  it('keeps an executable release matrix for all ranked ADR-037 topics', () => {
    const byId = new Map(guidanceDefinitions.map((item) => [item.id, item]))

    for (const row of releaseMatrix) {
      for (const id of row.ids) {
        expect(byId.has(id), `rank ${row.rank} guidance ${id}`).toBe(true)
      }
    }

    expect(byId.get('passwords.import-migration')).toMatchObject({
      surface: 'passwords',
      anchorId: 'passwords.import',
      trigger: 'manual_help',
      presentation: 'popover',
      completion: {kind: 'manual_ack'},
      priority: 30,
    })
  })

  it('does not seed bottom-sheet onboarding definitions', () => {
    expect(guidanceDefinitions.filter((item) => item.presentation === 'bottom_sheet')).toEqual([])
  })

  it('prevents rank 6-12 topics from becoming automatic intrusive onboarding', () => {
    for (const item of guidanceDefinitions) {
      if (!lowRankedIds.has(item.id as (typeof releaseMatrix)[number]['ids'][number])) continue

      const userIntentOnly = item.trigger === 'manual_help' || item.trigger === 'blocked_action'
      expect(
        item.presentation === 'inline_hint' || userIntentOnly,
        `${item.id} must stay lightweight or user-intent-only`,
      ).toBe(true)
    }
  })

  it('locks security-sensitive release copy wording', () => {
    expect(en['guidance:welcome.master-password:body']).toContain('recovery')
    expect(en['guidance:remote-storage.mount-warning:body']).toContain('operating system')
    expect(en['guidance:gateway.pair-extension:body']).toContain('approve the extension')
    expect(en['guidance:passwords.import-migration:body']).toContain('Preview')
    expect(en['guidance:passwords.import-migration:body']).toContain('conflicts')
  })

  it('accepts valid definitions with known anchors and i18n keys', () => {
    const result = validateGuidanceRegistry({
      definitions: [definition],
      anchors,
      hasI18nKey: () => true,
    })

    expect(result).toEqual({ok: true, errors: []})
  })

  it('reports stale registry and architecture contract violations', () => {
    const result = validateGuidanceRegistry({
      definitions: [
        definition,
        {
          ...definition,
          id: 'broken',
          surface: 'missing',
          anchorId: '.selector',
          capabilityGate: {'missing-capability': true},
          moduleAccessGate: {
            feature: 'missing-feature',
            statuses: ['missing-status'],
          },
          completion: {kind: 'manual_ack'},
          owner: '',
          version: 0,
          titleKey: 'missing:title',
        } as unknown as GuidanceDefinition,
      ],
      anchors,
      hasI18nKey: (key) => !key.startsWith('missing:'),
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('Unknown guidance surface for broken: missing')
    expect(result.errors).toContain('Selector-like anchor id is not allowed for broken: .selector')
    expect(result.errors).toContain('Unknown runtime capability for broken: missing-capability')
    expect(result.errors).toContain('Unknown module for broken: missing-feature')
    expect(result.errors).toContain('Unknown module access status for broken: missing-status')
    expect(result.errors).toContain('Missing owner for broken')
    expect(result.errors).toContain('Invalid version for broken')
    expect(result.errors).toContain('Missing i18n key for broken: missing:title')
  })

  it('reports unknown non-dynamic anchors directly', () => {
    const result = validateGuidanceRegistry({
      definitions: [
        {
          ...definition,
          id: 'unknown-anchor',
          anchorId: 'files.missing-action',
        },
      ],
      anchors,
    })

    expect(result.errors).toContain('Unknown guidance anchor for unknown-anchor: files:files.missing-action')
  })

  it.each(['.foo', '#foo', '[data-x]', 'body > main', '/html/body'])(
    'rejects selector-like anchor id %s',
    (anchorId) => {
      const result = validateGuidanceRegistry({
        definitions: [
          {
            ...definition,
            id: `selector-${anchorId}`,
            anchorId,
          },
        ],
        anchors,
      })

      expect(result.errors).toContain(`Selector-like anchor id is not allowed for selector-${anchorId}: ${anchorId}`)
    },
  )

  it('reports non-manual definitions missing required ownership and completion metadata', () => {
    const result = validateGuidanceRegistry({
      definitions: [
        {
          ...definition,
          id: 'incomplete-automatic',
          owner: '',
          priority: Number.NaN,
          version: 0,
          completion: undefined,
        } as unknown as GuidanceDefinition,
      ],
      anchors,
    })

    expect(result.errors).toContain('Missing owner for incomplete-automatic')
    expect(result.errors).toContain('Missing priority for incomplete-automatic')
    expect(result.errors).toContain('Invalid version for incomplete-automatic')
    expect(result.errors).toContain('Missing completion for incomplete-automatic')
  })

  it('allows blocked-action guidance to use manual acknowledgement', () => {
    const result = validateGuidanceRegistry({
      definitions: [
        {
          ...definition,
          id: 'remote-storage.mount-warning',
          trigger: 'blocked_action',
          completion: {kind: 'manual_ack'},
        },
      ],
      anchors,
    })

    expect(result.errors).not.toContain(
      'Automatic guidance must not use manual_ack completion: remote-storage.mount-warning',
    )
  })
})
