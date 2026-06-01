import {runtimeCapabilitiesAtom} from 'root/core/runtime/runtime-capabilities'
import {tryGetAppContext} from 'root/shared/services/app-context'

import {keyboardShortcutRegistry} from './shortcut-registry'
import type {
  KeyboardShortcutBinding,
  KeyboardShortcutContext,
  KeyboardShortcutEvent,
  KeyboardShortcutId,
  KeyboardShortcutPlatform,
} from './shortcut.types'

const MOBILE_PLATFORMS = new Set<KeyboardShortcutPlatform>(['android', 'ios'])
const KEY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  Delete: ['Delete', 'Del'],
}

function normalizeRawPlatform(platform: unknown): KeyboardShortcutPlatform {
  if (typeof platform !== 'string') return 'unknown'

  switch (platform.toLowerCase()) {
    case 'macos':
    case 'darwin':
    case 'mac':
      return 'macos'
    case 'windows':
    case 'win32':
    case 'win':
      return 'windows'
    case 'linux':
      return 'linux'
    case 'android':
      return 'android'
    case 'ios':
      return 'ios'
    case 'web':
      return 'web'
    default:
      return 'unknown'
  }
}

function readLayoutMode(): 'desktop' | 'mobile' | undefined {
  const layoutMode = tryGetAppContext()?.store?.layoutMode
  if (typeof layoutMode !== 'function') return undefined

  const value = layoutMode()
  return value === 'desktop' || value === 'mobile' ? value : undefined
}

function sameKey(expected: string, actual: string): boolean {
  const aliases = KEY_ALIASES[expected] ?? [expected]
  return aliases.some((candidate) =>
    candidate.length === 1 ? candidate.toLowerCase() === actual.toLowerCase() : candidate === actual,
  )
}

function bindingMatches(binding: KeyboardShortcutBinding, event: KeyboardShortcutEvent): boolean {
  if (Boolean(event.metaKey) !== Boolean(binding.meta)) return false
  if (Boolean(event.ctrlKey) !== Boolean(binding.ctrl)) return false
  if (Boolean(event.shiftKey) !== Boolean(binding.shift)) return false
  if (Boolean(event.altKey) !== Boolean(binding.alt)) return false

  if (binding.code && event.code === binding.code) return true
  return sameKey(binding.key, event.key)
}

export class KeyboardShortcutsModel {
  normalizePlatform(): KeyboardShortcutPlatform {
    return normalizeRawPlatform(runtimeCapabilitiesAtom().platform)
  }

  label(id: KeyboardShortcutId, context: KeyboardShortcutContext = {}): string | undefined {
    return this.resolveBindings(id, context)[0]?.label
  }

  hasBinding(id: KeyboardShortcutId, context: KeyboardShortcutContext = {}): boolean {
    return this.resolveBindings(id, context).length > 0
  }

  matches(
    id: KeyboardShortcutId,
    event: KeyboardShortcutEvent,
    context: KeyboardShortcutContext = {},
  ): boolean {
    return this.resolveBindings(id, context).some((binding) => bindingMatches(binding, event))
  }

  private resolveBindings(
    id: KeyboardShortcutId,
    context: KeyboardShortcutContext,
  ): readonly KeyboardShortcutBinding[] {
    if (context.enabled === false) return []

    const definition = keyboardShortcutRegistry[id]
    const platform = context.platform ?? this.normalizePlatform()
    if (MOBILE_PLATFORMS.has(platform) || platform === 'unknown') return []

    if (platform === 'macos' || platform === 'windows' || platform === 'linux') {
      return definition.bindings[platform] ?? []
    }

    if (platform !== 'web') return []

    const capabilities = runtimeCapabilitiesAtom()
    const layoutMode = context.layoutMode ?? readLayoutMode()
    const desktopWeb = layoutMode === 'desktop' || (layoutMode === undefined && capabilities.desktop && !capabilities.mobile)
    return desktopWeb ? (definition.bindings.web ?? []) : []
  }
}

export const keyboardShortcutsModel = new KeyboardShortcutsModel()
