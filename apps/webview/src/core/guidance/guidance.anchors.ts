import type {GuidanceSurfaceId} from './guidance.types'

export type KnownGuidanceAnchor = {
  id: string
  surface: GuidanceSurfaceId
  owner: string
  dynamic?: boolean
}

export const knownGuidanceAnchors: readonly KnownGuidanceAnchor[] = [
  {id: 'welcome.vault-mode', surface: 'welcome', owner: 'welcome'},
  {id: 'welcome.master-password', surface: 'welcome', owner: 'welcome'},
  {id: 'welcome.backup-tools', surface: 'welcome', owner: 'welcome'},
  {id: 'welcome.erase-device', surface: 'welcome', owner: 'welcome'},
  {id: 'files.create-or-upload', surface: 'files', owner: 'file-manager'},
  {id: 'notes.create-note', surface: 'notes', owner: 'notes'},
  {id: 'passwords.create-entry', surface: 'passwords', owner: 'passmanager'},
  {id: 'passwords.import', surface: 'passwords', owner: 'passmanager'},
  {id: 'passkeys.manage', surface: 'passkeys', owner: 'passkeys'},
  {id: 'remote.pair-device', surface: 'remote', owner: 'remote'},
  {id: 'gateway.start-pairing', surface: 'gateway', owner: 'gateway'},
  {id: 'pro.access-state', surface: 'remote', owner: 'module-access'},
  {id: 'pro.access-state', surface: 'gateway', owner: 'module-access'},
  {id: 'pro.access-state', surface: 'remote-storage', owner: 'module-access'},
  {id: 'remote-storage.mount', surface: 'remote-storage', owner: 'remote-storage'},
  {id: 'settings.ssh-agent', surface: 'settings', owner: 'settings'},
  {id: 'settings.mobile-autofill', surface: 'settings', owner: 'settings'},
  {id: 'shell.command-palette', surface: 'files', owner: 'shell'},
  {id: 'shell.command-palette', surface: 'passwords', owner: 'shell'},
  {id: 'shell.command-palette', surface: 'notes', owner: 'shell'},
]

export function getGuidanceAnchorKey(surface: GuidanceSurfaceId, anchorId: string): string {
  return `${surface}:${anchorId}`
}
