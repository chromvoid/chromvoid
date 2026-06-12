import {atom, computed, peek} from '@reatom/core'

import {i18n} from '@project/passmanager/i18n'
import {getPassmanagerRoot} from '../../../models/pm-root.adapter'
import type {PMWorkspaceContextItem} from '../../card/pm-workspace-header'
import {passmanagerNavigationController} from '../../../passmanager-navigation.controller'

export const GROUP_CREATE_NAME_MAX_LENGTH = 40
export const GROUP_CREATE_DESCRIPTION_MAX_LENGTH = 120

export class PMGroupCreateModel {
  readonly name = atom('')
  readonly description = atom('')
  readonly iconRef = atom<string | undefined>(undefined)
  readonly targetGroupPath = atom<string | undefined>(
    passmanagerNavigationController.getCreateGroupTargetGroupPath(),
  )
  readonly isSubmitting = atom(false)
  readonly nameError = atom('')
  readonly trimmedName = computed(() => this.name().trim())
  readonly nameLength = computed(() => this.name().length)
  readonly descriptionLength = computed(() => this.description().length)
  readonly nameCounterLabel = computed(() => `${this.nameLength()}/${GROUP_CREATE_NAME_MAX_LENGTH}`)
  readonly descriptionCounterLabel = computed(
    () => `${this.descriptionLength()}/${GROUP_CREATE_DESCRIPTION_MAX_LENGTH}`,
  )
  readonly canSubmit = computed(() => this.trimmedName().length > 0 && !this.isSubmitting())

  setName(name: string): void {
    this.name.set(name.slice(0, GROUP_CREATE_NAME_MAX_LENGTH))
    this.nameError.set('')
  }

  setDescription(description: string): void {
    this.description.set(description.slice(0, GROUP_CREATE_DESCRIPTION_MAX_LENGTH))
  }

  setIconRef(iconRef: string | undefined): void {
    this.iconRef.set(iconRef)
  }

  getContextItems(): PMWorkspaceContextItem[] {
    const targetGroupPath = peek(this.targetGroupPath)
    const segments = targetGroupPath?.split('/').filter(Boolean) ?? []
    return [
      {label: i18n('root:title-short'), value: ''},
      ...segments.map((segment, index) => ({
        label: segment,
        value: segments.slice(0, index + 1).join('/'),
      })),
    ]
  }

  navigateToPath(path: string): void {
    passmanagerNavigationController.applyRoute(path ? {kind: 'group', groupPath: path} : {kind: 'root'})
  }

  async submit(): Promise<boolean> {
    const passmanager = getPassmanagerRoot()
    if (!passmanager || !peek(this.canSubmit)) {
      return false
    }

    const targetGroupPath = peek(this.targetGroupPath)
    const groupName = peek(this.trimmedName)
    const fullName = targetGroupPath ? `${targetGroupPath}/${groupName}` : groupName

    if (this.groupPathExists(passmanager, fullName)) {
      this.nameError.set(i18n('tags:error_exists' as never))
      return false
    }

    this.isSubmitting.set(true)
    try {
      await Promise.resolve(
        passmanager.createGroup({
          name: fullName,
          description: peek(this.description),
          iconRef: peek(this.iconRef),
          entries: [],
        }),
      )
      return true
    } finally {
      this.isSubmitting.set(false)
    }
  }

  private groupPathExists(passmanager: unknown, fullName: string): boolean {
    if (!passmanager || typeof passmanager !== 'object') return false

    const root = passmanager as {
      entriesList?: () => unknown[]
      entries?: unknown[]
      getGroup?: (id: string) => unknown
    }
    const entries = typeof root.entriesList === 'function' ? root.entriesList() : root.entries
    if (Array.isArray(entries)) {
      return entries.some((item) => {
        return Boolean(item && typeof item === 'object' && (item as {name?: unknown}).name === fullName)
      })
    }

    return Boolean(root.getGroup?.(fullName))
  }
}
