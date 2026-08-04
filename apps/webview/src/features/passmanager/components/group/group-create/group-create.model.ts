import {atom, computed, peek} from '@reatom/core'

import {i18n} from '@project/passmanager/i18n'
import {getPassmanagerRoot, isPassmanagerReadOnly} from '../../../models/pm-root.adapter'
import type {PMWorkspaceContextItem} from '../../card/pm-workspace-header'
import {passmanagerNavigationController} from '../../../passmanager-navigation.controller'
import {
  groupPresetIconService,
  type GroupIconColorName,
  type GroupIconPresetName,
  type GroupIconPresetSelection,
} from './group-icon-presets'
import {GROUP_DESCRIPTION_MAX_LENGTH, GROUP_NAME_MAX_LENGTH} from '../group-form.constants'

type PMGroupCreateModelOptions = {
  defaultPreset?: GroupIconPresetSelection
}

export class PMGroupCreateModel {
  readonly name = atom('')
  readonly description = atom('')
  readonly iconRef = atom<string | undefined>(undefined)
  readonly presetIcon = atom<GroupIconPresetName | undefined>(undefined)
  readonly presetColor = atom<GroupIconColorName | undefined>(undefined)
  readonly targetGroupPath = atom<string | undefined>(
    passmanagerNavigationController.getCreateGroupTargetGroupPath(),
  )
  readonly isSubmitting = atom(false)
  readonly submitAttempted = atom(false, 'passmanager.groupCreate.submitAttempted')
  readonly submitError = atom('')
  readonly trimmedName = computed(() => this.name().trim())
  readonly nameLength = computed(() => this.name().length)
  readonly descriptionLength = computed(() => this.description().length)
  readonly isReadOnly = computed(() => isPassmanagerReadOnly())
  readonly presetSelection = computed<GroupIconPresetSelection | undefined>(() => {
    const icon = this.presetIcon()
    const color = this.presetColor()
    return icon && color ? {icon, color} : undefined
  })
  readonly nameError = computed(() => this.getNameValidationError())
  readonly nameCounterLabel = computed(() => `${this.nameLength()}/${GROUP_NAME_MAX_LENGTH}`)
  readonly descriptionCounterLabel = computed(
    () => `${this.descriptionLength()}/${GROUP_DESCRIPTION_MAX_LENGTH}`,
  )
  readonly canSubmit = computed(
    () => this.trimmedName().length > 0 && !this.nameError() && !this.isReadOnly() && !this.isSubmitting(),
  )

  constructor(options: PMGroupCreateModelOptions = {}) {
    this.presetIcon.set(options.defaultPreset?.icon)
    this.presetColor.set(options.defaultPreset?.color)
  }

  setName(name: string): void {
    this.name.set(name.slice(0, GROUP_NAME_MAX_LENGTH))
    this.submitError.set('')
  }

  setDescription(description: string): void {
    this.description.set(description.slice(0, GROUP_DESCRIPTION_MAX_LENGTH))
  }

  setIconRef(iconRef: string | undefined): void {
    this.iconRef.set(iconRef)
  }

  setPresetIcon(icon: GroupIconPresetName): void {
    this.presetIcon.set(icon)
    this.submitError.set('')
  }

  setPresetColor(color: GroupIconColorName): void {
    this.presetColor.set(color)
    this.submitError.set('')
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
    this.submitAttempted.set(true)
    const passmanager = getPassmanagerRoot()
    if (
      !passmanager ||
      this.isReadOnly() ||
      this.isSubmitting() ||
      !this.trimmedName() ||
      this.nameError()
    ) {
      return false
    }

    const targetGroupPath = peek(this.targetGroupPath)
    const groupName = peek(this.trimmedName)
    const fullName = targetGroupPath ? `${targetGroupPath}/${groupName}` : groupName

    this.isSubmitting.set(true)
    this.submitError.set('')
    try {
      const presetSelection = peek(this.presetSelection)
      const iconRef = presetSelection
        ? await groupPresetIconService.upload(presetSelection)
        : peek(this.iconRef)
      const group = await Promise.resolve(
        passmanager.createGroup(
          {
            name: fullName,
            description: peek(this.description),
            iconRef,
            entries: [],
          },
          {presentation: 'defer'},
        ),
      )
      if (group && getPassmanagerRoot() === passmanager) {
        passmanagerNavigationController.presentCreatedGroup(group)
      }
      return true
    } catch {
      this.submitError.set(i18n('group:create:error' as never))
      return false
    } finally {
      this.isSubmitting.set(false)
    }
  }

  private getNameValidationError(): string {
    const rawName = this.name()
    if (/[\\/]/.test(rawName)) {
      return i18n('error:group_name_invalid_chars')
    }

    const trimmedName = rawName.trim()
    if (!trimmedName) {
      return this.submitAttempted() ? i18n('error:group_name_required') : ''
    }

    const targetGroupPath = this.targetGroupPath()
    const fullName = targetGroupPath ? `${targetGroupPath}/${trimmedName}` : trimmedName
    return this.groupPathExists(getPassmanagerRoot(), fullName)
      ? i18n('group:create:duplicate' as never, {
          name: trimmedName,
          parent: targetGroupPath || i18n('root:title-short'),
        })
      : ''
  }

  private groupPathExists(passmanager: unknown, fullName: string): boolean {
    if (!passmanager || typeof passmanager !== 'object') return false

    const normalizedFullName = fullName.trim().toLocaleLowerCase()

    const root = passmanager as {
      entriesList?: () => unknown[]
      entries?: unknown[]
      getGroup?: (id: string) => unknown
    }
    const entries = typeof root.entriesList === 'function' ? root.entriesList() : root.entries
    if (Array.isArray(entries)) {
      return entries.some((item) => {
        const name = item && typeof item === 'object' ? (item as {name?: unknown}).name : undefined
        return typeof name === 'string' && name.trim().toLocaleLowerCase() === normalizedFullName
      })
    }

    return Boolean(root.getGroup?.(fullName))
  }
}
