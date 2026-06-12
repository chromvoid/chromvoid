import {describe, expect, it, vi} from 'vitest'

import {GuidanceModel} from '../../src/core/guidance/guidance.model'
import {guidanceDefinitions} from '../../src/core/guidance/guidance.registry'
import type {GuidanceDefinition, GuidanceProgress} from '../../src/core/guidance/guidance.types'
import type {GuidanceProgressStore} from '../../src/core/guidance/guidance.progress-store'
import type {ModuleAccessStatus} from '../../src/core/pro/module-access.model'
import type {RuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'

const BASE_CAPABILITIES: RuntimeCapabilities = {
  platform: 'web',
  desktop: true,
  mobile: false,
  supports_native_path_io: false,
  supports_open_external: false,
  supports_native_share: false,
  supports_volume: false,
  supports_gateway: false,
  supports_network_remote: true,
  supports_biometric: false,
  supports_autofill: false,
  supports_media_stream_protocol: false,
  supports_native_audio_playback: false,
  supports_native_video_playback: false,
  supports_native_file_upload: false,
  supports_share_import: false,
  supports_native_otp_qr_scan: false,
  supports_mobile_backup_restore: false,
  supports_photo_library_save: false,
  supports_credential_provider_passkeys_lite: false,
  supports_android_native_video: false,
  android_native_audio_playback_rollout_enabled: false,
  supports_android_native_upload: false,
  supports_android_share_import: false,
  supports_android_native_otp_qr_scan: false,
  supports_storage_root_selection: false,
  supports_android_saf_backup_restore: false,
}

function createStore(initial: GuidanceProgress[] = []): GuidanceProgressStore & {saved: GuidanceProgress[][]} {
  const saved: GuidanceProgress[][] = []
  let records = initial
  return {
    saved,
    load: () => records,
    save: (progress) => {
      records = [...progress]
      saved.push([...progress])
    },
    clear: () => {
      records = []
    },
  }
}

function definition(input: Partial<GuidanceDefinition> = {}): GuidanceDefinition {
  return {
    id: 'files.discovery',
    surface: 'files',
    anchorId: 'files.create-or-upload',
    trigger: 'feature_discovery',
    presentation: 'popover',
    titleKey: 'guidance:files.empty-state:title',
    bodyKey: 'guidance:files.empty-state:body',
    completion: {kind: 'product_state', key: 'files.has_items'},
    priority: 10,
    owner: 'test',
    version: 1,
    ...input,
  }
}

function createModel(options: {
  definitions?: GuidanceDefinition[]
  capabilities?: Partial<RuntimeCapabilities>
  layoutMode?: 'desktop' | 'mobile'
  accessStatus?: ModuleAccessStatus
  store?: GuidanceProgressStore
  now?: () => number
} = {}) {
  return new GuidanceModel({
    definitions: options.definitions ?? [definition()],
    progressStore: options.store ?? createStore(),
    now: options.now ?? (() => 100),
    readDashboardSurface: () => 'files',
    readLayoutMode: () => options.layoutMode ?? 'desktop',
    readRuntimeCapabilities: () => ({...BASE_CAPABILITIES, ...options.capabilities}),
    readModuleAccessStatus: () => options.accessStatus ?? 'enabled',
  })
}

describe('GuidanceModel', () => {
  it('prioritizes welcome master-password guidance before local-vs-remote', () => {
    const model = createModel({definitions: [...guidanceDefinitions]})
    model.setRoute('welcome')

    expect(model.activeGuidance()).toMatchObject({definition: {id: 'welcome.master-password'}})

    model.completeProductState('vault.created')
    expect(model.activeGuidance()).toMatchObject({definition: {id: 'welcome.local-vs-remote'}})

    model.completeProductState('vault.opened')
    expect(model.activeGuidance().kind).toBe('hidden')
  })

  it('selects the highest-priority eligible intrusive guidance', () => {
    const model = createModel({
      definitions: [
        definition({id: 'low', priority: 1}),
        definition({id: 'high', priority: 50, anchorId: 'files.primary'}),
      ],
    })
    model.setRoute('dashboard')

    const active = model.activeGuidance()
    expect(active.kind).toBe('waiting_for_anchor')
    expect(active.kind !== 'hidden' && active.definition.id).toBe('high')
  })

  it('gates by platform, capability, and module access status', () => {
    const model = createModel({
      definitions: [
        definition({
          id: 'remote.network',
          platforms: ['desktop'],
          capabilityGate: {supports_network_remote: true},
          moduleAccessGate: {feature: 'remote', statuses: ['enabled']},
        }),
      ],
      capabilities: {supports_network_remote: false},
      accessStatus: 'enabled',
    })
    model.setRoute('dashboard')
    expect(model.activeGuidance().kind).toBe('hidden')

    const enabled = createModel({
      definitions: [
        definition({
          id: 'remote.network',
          platforms: ['desktop'],
          capabilityGate: {supports_network_remote: true},
          moduleAccessGate: {feature: 'remote', statuses: ['enabled']},
        }),
      ],
      capabilities: {supports_network_remote: true},
      accessStatus: 'enabled',
    })
    enabled.setRoute('dashboard')
    expect(enabled.activeGuidance().kind).toBe('waiting_for_anchor')
  })

  it('returns waiting_for_anchor until a connected real element is registered', () => {
    const model = createModel()
    model.setRoute('dashboard')
    expect(model.activeGuidance().kind).toBe('waiting_for_anchor')

    const element = document.createElement('button')
    document.body.append(element)
    model.registerAnchor({
      surface: 'files',
      anchorId: 'files.create-or-upload',
      owner: 'test',
      element,
    })

    const active = model.activeGuidance()
    expect(active.kind).toBe('anchored')
    expect(active.kind === 'anchored' && active.anchor.element).toBe(element)
    element.remove()
    model.unregisterAnchor('files.create-or-upload', element)
    expect(model.activeGuidance().kind).toBe('waiting_for_anchor')
  })

  it('keeps anchored intrusive guidance anchored on mobile', () => {
    const model = createModel({layoutMode: 'mobile'})
    const element = document.createElement('button')
    document.body.append(element)
    model.setRoute('dashboard')
    model.registerAnchor({
      surface: 'files',
      anchorId: 'files.create-or-upload',
      owner: 'test',
      element,
    })

    expect(model.activeGuidance().kind).toBe('anchored')
    element.remove()
  })

  it('uses bottom sheets only for explicit bottom_sheet guidance', () => {
    const model = createModel({
      layoutMode: 'mobile',
      definitions: [definition({presentation: 'bottom_sheet'})],
    })
    model.setRoute('dashboard')

    expect(model.activeGuidance().kind).toBe('bottom_sheet')
  })

  it('suppresses automatic display after dismiss or snooze but still allows manual help', () => {
    const store = createStore()
    const now = vi.fn(() => 100)
    const model = createModel({
      store,
      now,
      definitions: [
        definition({id: 'auto'}),
        definition({
          id: 'manual',
          trigger: 'manual_help',
          completion: {kind: 'manual_ack'},
          priority: 100,
        }),
      ],
    })
    model.setRoute('dashboard')

    model.dismiss('auto')
    expect(model.activeGuidance().kind).toBe('hidden')

    model.openManualHelp('files')
    expect(model.activeGuidance()).toMatchObject({kind: 'waiting_for_anchor', definition: {id: 'manual'}})

    model.acknowledgeManual('manual')
    expect(store.saved.at(-1)?.find((entry) => entry.id === 'manual')?.completedAt).toBe(100)
  })

  it('keeps inline hints out of the active intrusive selection', () => {
    const model = createModel({
      definitions: [
        definition({id: 'inline-high', presentation: 'inline_hint', priority: 1000}),
        definition({id: 'intrusive-low', presentation: 'popover', priority: 1}),
      ],
    })
    model.setRoute('dashboard')

    expect(model.activeGuidance()).toMatchObject({definition: {id: 'intrusive-low'}})
    expect(model.inlineHints().map((item) => (item.kind === 'inline' ? item.definition.id : null))).toContain('inline-high')
  })

  it('opens password import migration help only from a manual help request', () => {
    const model = createModel({
      definitions: [...guidanceDefinitions],
      store: createStore(),
    })
    model.setRoute('dashboard')

    expect(model.inlineHints().some((item) => item.kind === 'inline' && item.definition.id === 'passwords.import-migration')).toBe(false)

    model.openManualHelp('passwords', 'passwords.import')

    expect(model.activeGuidance()).toMatchObject({
      kind: 'waiting_for_anchor',
      definition: {id: 'passwords.import-migration'},
    })

    const element = document.createElement('button')
    document.body.append(element)
    model.registerAnchor({
      surface: 'passwords',
      anchorId: 'passwords.import',
      owner: 'passmanager',
      element,
    })

    expect(model.activeGuidance()).toMatchObject({
      kind: 'anchored',
      definition: {id: 'passwords.import-migration'},
    })

    model.acknowledgeManual('passwords.import-migration')
    expect(model.inlineHints().some((item) => item.kind === 'inline' && item.definition.id === 'passwords.import-migration')).toBe(false)

    model.openManualHelp('passwords', 'passwords.import')
    expect(model.activeGuidance()).toMatchObject({
      kind: 'anchored',
      definition: {id: 'passwords.import-migration'},
    })
    element.remove()
  })

  it('completes guidance from product state, domain events, and manual acknowledgement', () => {
    const model = createModel({
      definitions: [
        definition({id: 'product', completion: {kind: 'product_state', key: 'files.has_items'}}),
        definition({
          id: 'event',
          priority: 20,
          completion: {kind: 'domain_event', event: 'volume_mount.started'},
        }),
        definition({
          id: 'manual',
          trigger: 'manual_help',
          priority: 30,
          completion: {kind: 'manual_ack'},
        }),
      ],
    })
    model.setRoute('dashboard')
    expect(model.activeGuidance()).toMatchObject({definition: {id: 'event'}})

    model.emitDomainEvent('volume_mount.started')
    expect(model.activeGuidance()).toMatchObject({definition: {id: 'product'}})

    model.completeProductState('files.has_items')
    expect(model.activeGuidance().kind).toBe('hidden')

    model.openManualHelp('files')
    expect(model.activeGuidance()).toMatchObject({definition: {id: 'manual'}})
    model.acknowledgeManual('manual')
    expect(model.activeGuidance().kind).toBe('hidden')
  })

  it('loads progress on connect and avoids duplicate same-anchor registration churn', () => {
    const store = createStore([{id: 'files.discovery', version: 1, state: 'dismissed', dismissedAt: 1}])
    const model = createModel({store})
    model.connect()
    model.setRoute('dashboard')

    expect(model.activeGuidance().kind).toBe('hidden')
    expect(model.hasProgressForDefinition('files.discovery')).toBe(true)
    expect(model.hasProgressForDefinition('missing.definition')).toBe(false)

    const element = document.createElement('button')
    document.body.append(element)
    model.registerAnchor({surface: 'files', anchorId: 'files.create-or-upload', owner: 'test', element})
    const first = model.anchors()
    model.registerAnchor({surface: 'files', anchorId: 'files.create-or-upload', owner: 'test', element})

    expect(model.anchors()).toBe(first)
    element.remove()
  })

  it('prioritizes blocked-action guidance by requested feature and denial reason', () => {
    const model = createModel({
      definitions: [
        definition({
          id: 'remote.blocked',
          trigger: 'blocked_action',
          surface: 'files',
          moduleAccessGate: {feature: 'remote', statuses: ['locked_pro']},
          completion: {kind: 'manual_ack'},
        }),
      ],
      accessStatus: 'locked_pro',
    })
    model.setRoute('dashboard')
    model.openBlockedAction({surface: 'files', feature: 'remote', reason: 'locked_pro'})

    expect(model.activeGuidance()).toMatchObject({definition: {id: 'remote.blocked'}})
  })

  it('resolves blocked-action body copy from the requested denial reason', () => {
    const blocked = definition({
      id: 'remote.blocked',
      trigger: 'blocked_action',
      surface: 'files',
      bodyKey: 'guidance:pro.remote.blocked:body',
      bodyKeyByModuleAccessStatus: {
        locked_pro: 'guidance:pro.blocked.locked-pro:body',
        entitlement_unavailable: 'guidance:pro.blocked.entitlement-unavailable:body',
      },
      moduleAccessGate: {feature: 'remote', statuses: ['locked_pro', 'entitlement_unavailable']},
      completion: {kind: 'manual_ack'},
    })
    const model = createModel({definitions: [blocked], accessStatus: 'locked_pro'})
    model.setRoute('dashboard')

    model.openBlockedAction({surface: 'files', feature: 'remote', reason: 'locked_pro'})
    expect(model.resolveBodyKey(blocked)).toBe('guidance:pro.blocked.locked-pro:body')

    model.openBlockedAction({surface: 'files', feature: 'remote', reason: 'entitlement_unavailable'})
    expect(model.resolveBodyKey(blocked)).toBe('guidance:pro.blocked.entitlement-unavailable:body')
  })
})
