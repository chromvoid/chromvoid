import {atom} from '@reatom/core'

import {getFileManagerModel} from 'root/features/file-manager/file-manager.model'
import {notesQuickViewModel} from 'root/features/file-manager/components/notes-quick-view/notes-quick-view.model'
import {passmanagerRoot} from 'root/features/passmanager/models/pm-root.adapter'
import {passkeysPageModel} from 'root/routes/passkeys/passkeys.model'
import {settingsPageModel} from 'root/routes/settings/settings.model'
import {tryGetAppContext} from 'root/shared/services/app-context'
import {
  subscribeAfterInitial,
  subscribeCallbackAfterInitial,
  type SubscribedSignal,
  type Unsubscribe,
} from 'root/shared/services/subscribed-signal'

import {guidanceModel} from './guidance.model'

type SignalLike<T> = SubscribedSignal<T>

export type GuidanceProductStateBinding = {
  key: string
  read: () => boolean
  subscribe: (listener: () => void) => Unsubscribe
  latch?: boolean
}

type GuidanceCompletionBridgeTarget = Pick<
  typeof guidanceModel,
  'completeProductState' | 'clearProductState'
>

type GuidanceCompletionBridgeOptions = {
  guidance?: GuidanceCompletionBridgeTarget
  productStateBindings?: (bridge: GuidanceCompletionBridge) => GuidanceProductStateBinding[]
}

const noop = () => {}

function signalBinding<T>(
  key: string,
  signal: SignalLike<T>,
  isComplete: (value: T) => boolean,
  latch = false,
): GuidanceProductStateBinding {
  return {
    key,
    latch,
    read: () => isComplete(signal()),
    subscribe: (listener) =>
      typeof signal.subscribe === 'function' ? signal.subscribe(listener) : noop,
  }
}

function optionalBinding(
  key: string,
  getBinding: () => GuidanceProductStateBinding | null,
  fallbackRead = false,
): GuidanceProductStateBinding {
  return {
    key,
    read: () => getBinding()?.read() ?? fallbackRead,
    subscribe: (listener) => getBinding()?.subscribe(listener) ?? noop,
  }
}

function readVaultOpened(): boolean {
  return tryGetAppContext()?.router?.route?.() === 'dashboard'
}

function subscribeVaultOpened(listener: () => void): Unsubscribe {
  return tryGetAppContext()?.router?.route?.subscribe?.(listener) ?? noop
}

function readFileManagerHasItems(): boolean {
  const context = tryGetAppContext()
  return context ? getFileManagerModel(context).totalCount() > 0 : false
}

function subscribeFileManagerItems(listener: () => void): Unsubscribe {
  const context = tryGetAppContext()
  return context ? getFileManagerModel(context).totalCount.subscribe?.(listener) ?? noop : noop
}

function readPasswordEntryCount(): number {
  return passmanagerRoot()?.allEntries.length ?? 0
}

function subscribePasswordEntryCount(listener: () => void): Unsubscribe {
  let rootUnsubscribers: Unsubscribe[] = []

  const disposeRoot = () => {
    for (const unsubscribe of rootUnsubscribers) unsubscribe()
    rootUnsubscribers = []
  }

  const bindRoot = () => {
    disposeRoot()
    const root = passmanagerRoot()
    if (root?.entries?.subscribe) rootUnsubscribers.push(subscribeAfterInitial(root.entries, listener))
    if (root?.updatedTs?.subscribe) rootUnsubscribers.push(subscribeAfterInitial(root.updatedTs, listener))
    listener()
  }

  bindRoot()
  const unsubscribeRoot = subscribeAfterInitial(passmanagerRoot, bindRoot)

  return () => {
    unsubscribeRoot()
    disposeRoot()
  }
}

export class GuidanceCompletionBridge {
  readonly vaultCreated = atom(false, 'guidance.completion.vaultCreated')

  private readonly guidance: GuidanceCompletionBridgeTarget
  private readonly productStateBindings: (bridge: GuidanceCompletionBridge) => GuidanceProductStateBinding[]
  private connected = false
  private unsubscribers: Unsubscribe[] = []
  private scopedUnsubscribers = new Map<string, Unsubscribe>()

  constructor(options: GuidanceCompletionBridgeOptions = {}) {
    this.guidance = options.guidance ?? guidanceModel
    this.productStateBindings = options.productStateBindings ?? createDefaultProductStateBindings
  }

  connect(): void {
    if (this.connected) return
    this.connected = true
    for (const binding of this.productStateBindings(this)) {
      this.bindProductState(binding)
    }
  }

  disconnect(): void {
    const unsubscribers = [...this.unsubscribers]
    this.unsubscribers = []
    for (const unsubscribe of unsubscribers) unsubscribe()
    const scopedUnsubscribers = [...this.scopedUnsubscribers.values()]
    for (const unsubscribe of scopedUnsubscribers) unsubscribe()
    this.scopedUnsubscribers.clear()
    this.connected = false
  }

  markVaultCreated(): void {
    this.vaultCreated.set(true)
  }

  bindRemotePairedDevices(source: SignalLike<readonly unknown[]>): Unsubscribe {
    return this.bindScopedCollection('remote.has_paired_device', source)
  }

  bindGatewayPairedExtensions(source: SignalLike<readonly unknown[]>): Unsubscribe {
    return this.bindScopedCollection('gateway.has_paired_extension', source)
  }

  private bindScopedCollection(key: string, source: SignalLike<readonly unknown[]>): Unsubscribe {
    this.scopedUnsubscribers.get(key)?.()
    const unsubscribe = this.bindProductState(
      signalBinding(key, source, (items) => items.length > 0),
      false,
    )
    this.scopedUnsubscribers.set(key, unsubscribe)
    return () => {
      const current = this.scopedUnsubscribers.get(key)
      if (current !== unsubscribe) return
      unsubscribe()
      this.scopedUnsubscribers.delete(key)
    }
  }

  private bindProductState(binding: GuidanceProductStateBinding, track = true): Unsubscribe {
    let latched = false
    let previous: boolean | null = null

    const sync = () => {
      const active = binding.read()
      if (active && binding.latch) latched = true
      const complete = active || (binding.latch === true && latched)
      if (complete === previous) return
      previous = complete
      if (complete) {
        this.guidance.completeProductState(binding.key)
      } else {
        this.guidance.clearProductState(binding.key)
      }
    }

    sync()
    const unsubscribe = subscribeCallbackAfterInitial((listener) => binding.subscribe(listener), sync)
    if (track) this.unsubscribers.push(unsubscribe)

    return () => {
      const index = this.unsubscribers.indexOf(unsubscribe)
      if (index !== -1) this.unsubscribers.splice(index, 1)
      unsubscribe()
    }
  }
}

function createDefaultProductStateBindings(
  bridge: GuidanceCompletionBridge,
): GuidanceProductStateBinding[] {
  return [
    signalBinding('vault.created', bridge.vaultCreated, Boolean, true),
    {
      key: 'vault.opened',
      latch: true,
      read: readVaultOpened,
      subscribe: subscribeVaultOpened,
    },
    optionalBinding('files.has_items', () => ({
      key: 'files.has_items',
      read: readFileManagerHasItems,
      subscribe: subscribeFileManagerItems,
    })),
    signalBinding('notes.has_notes', notesQuickViewModel.rows, (rows) => rows.length > 0),
    {
      key: 'passwords.has_entries',
      read: () => readPasswordEntryCount() > 0,
      subscribe: subscribePasswordEntryCount,
    },
    signalBinding('passkeys.has_credentials', passkeysPageModel.androidPasskeys, (items) => items.length > 0),
    signalBinding(
      'ssh_agent.started',
      settingsPageModel.sshAgentStatus,
      (status) => status?.running === true,
    ),
    signalBinding(
      'credential_provider.enabled',
      settingsPageModel.androidAutofillProviderSelected,
      (selected) => selected === true,
    ),
  ]
}

export const guidanceCompletionBridge = new GuidanceCompletionBridge()
