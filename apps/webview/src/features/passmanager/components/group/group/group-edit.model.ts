import {action, atom, computed, withAsync, wrap} from '@reatom/core'

import {Group, type ManagerRoot} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {dialogService} from 'root/shared/services/dialog-service'
import type {ConfirmDialogOptions} from 'root/shared/services/dialog-types'
import {getPassmanagerRoot, isPassmanagerReadOnly} from '../../../models/pm-root.adapter'
import {GROUP_DESCRIPTION_MAX_LENGTH, GROUP_NAME_MAX_LENGTH} from '../group-form.constants'
import {getGroupParentPath} from './group-view-helpers'

type PMGroupEditModelDependencies = {
  getRoot: () => ManagerRoot | undefined
  isReadOnly: () => boolean
  confirmDiscard: (options: ConfirmDialogOptions) => Promise<boolean>
}

const defaultDependencies: PMGroupEditModelDependencies = {
  getRoot: getPassmanagerRoot,
  isReadOnly: isPassmanagerReadOnly,
  confirmDiscard: (options) => dialogService.showConfirmDialog(options),
}

function getGroupLeafName(group: Group): string {
  const separator = group.name.lastIndexOf('/')
  return separator >= 0 ? group.name.slice(separator + 1) : group.name
}

export class PMGroupEditModel {
  private readonly dependencies: PMGroupEditModelDependencies
  private readonly targetGroup = atom<Group | null>(null, 'passmanager.groupEdit.targetGroup')
  private readonly baselineName = atom('', 'passmanager.groupEdit.baselineName')
  private readonly baselineDescription = atom('', 'passmanager.groupEdit.baselineDescription')
  private readonly baselineIconRef = atom<string | undefined>(
    undefined,
    'passmanager.groupEdit.baselineIconRef',
  )
  private readonly domainNameError = atom<'conflict' | 'invalid' | null>(
    null,
    'passmanager.groupEdit.domainNameError',
  )
  private discardPromptOpen = false

  readonly active = atom(false, 'passmanager.groupEdit.active')
  readonly name = atom('', 'passmanager.groupEdit.name')
  readonly description = atom('', 'passmanager.groupEdit.description')
  readonly iconRef = atom<string | undefined>(undefined, 'passmanager.groupEdit.iconRef')
  readonly submitAttempted = atom(false, 'passmanager.groupEdit.submitAttempted')
  readonly submitError = atom('', 'passmanager.groupEdit.submitError')
  readonly isReadOnly = computed(
    () => this.dependencies.isReadOnly(),
    'passmanager.groupEdit.isReadOnly',
  )
  readonly dirty = computed(
    () =>
      this.active() &&
      (this.name() !== this.baselineName() ||
        this.description() !== this.baselineDescription() ||
        this.iconRef() !== this.baselineIconRef()),
    'passmanager.groupEdit.dirty',
  )
  readonly nameCounterLabel = computed(
    () => `${this.name().length}/${GROUP_NAME_MAX_LENGTH}`,
    'passmanager.groupEdit.nameCounterLabel',
  )
  readonly descriptionCounterLabel = computed(
    () => `${this.description().length}/${GROUP_DESCRIPTION_MAX_LENGTH}`,
    'passmanager.groupEdit.descriptionCounterLabel',
  )
  readonly nameLegacyLimitHint = computed(
    () =>
      this.baselineName().length > GROUP_NAME_MAX_LENGTH && this.name() === this.baselineName()
        ? i18n('group:edit:legacy-limit-hint', {max: String(GROUP_NAME_MAX_LENGTH)})
        : '',
    'passmanager.groupEdit.nameLegacyLimitHint',
  )
  readonly descriptionLegacyLimitHint = computed(
    () =>
      this.baselineDescription().length > GROUP_DESCRIPTION_MAX_LENGTH &&
      this.description() === this.baselineDescription()
        ? i18n('group:edit:legacy-limit-hint', {max: String(GROUP_DESCRIPTION_MAX_LENGTH)})
        : '',
    'passmanager.groupEdit.descriptionLegacyLimitHint',
  )
  readonly nameError = computed(
    () => this.getNameValidationError(),
    'passmanager.groupEdit.nameError',
  )
  readonly descriptionError = computed(
    () => this.getDescriptionValidationError(),
    'passmanager.groupEdit.descriptionError',
  )
  readonly locationSegments = computed(() => {
    const target = this.targetGroup()
    if (!target) return [i18n('root:title-short')]
    const parent = getGroupParentPath(target)
    return [
      i18n('root:title-short'),
      ...(parent?.split('/').filter(Boolean) ?? []),
      this.name().trim() || this.baselineName(),
    ]
  }, 'passmanager.groupEdit.locationSegments')

  constructor(dependencies: Partial<PMGroupEditModelDependencies> = {}) {
    this.dependencies = {...defaultDependencies, ...dependencies}
  }

  enter(group: Group): void {
    if (this.submit.pending()) return
    const name = getGroupLeafName(group)
    const description = group.description ?? ''
    this.targetGroup.set(group)
    this.baselineName.set(name)
    this.baselineDescription.set(description)
    this.baselineIconRef.set(group.iconRef)
    this.name.set(name)
    this.description.set(description)
    this.iconRef.set(group.iconRef)
    this.submitAttempted.set(false)
    this.submitError.set('')
    this.domainNameError.set(null)
    this.active.set(true)
  }

  setName(value: string): void {
    this.name.set(value)
    this.domainNameError.set(null)
    this.submitError.set('')
  }

  setDescription(value: string): void {
    this.description.set(value)
    this.submitError.set('')
  }

  setIconRef(value: string | undefined): void {
    this.iconRef.set(value)
    this.submitError.set('')
  }

  discard(): void {
    if (this.submit.pending()) return
    this.reset()
  }

  readonly requestClose = action(async (): Promise<boolean> => {
    if (!this.active() || this.submit.pending()) return false
    if (!this.dirty()) {
      this.reset()
      return true
    }
    if (this.discardPromptOpen) return false

    this.discardPromptOpen = true
    let confirmed = false
    try {
      confirmed = await wrap(
        this.dependencies.confirmDiscard({
          title: i18n('group:edit:discard-title'),
          message: i18n('group:edit:discard-message'),
          confirmText: i18n('button:discard'),
          cancelText: i18n('button:cancel'),
          confirmVariant: 'danger',
          variant: 'warning',
        }),
      )
    } catch {
      confirmed = false
    } finally {
      this.discardPromptOpen = false
    }
    if (!confirmed) return false

    this.reset()
    return true
  }, 'passmanager.groupEdit.requestClose')

  readonly submit = action(async (): Promise<boolean> => {
    if (!this.active() || this.submit.pending() || this.isReadOnly()) return false

    this.submitAttempted.set(true)
    this.submitError.set('')
    this.domainNameError.set(null)
    if (this.nameError() || this.descriptionError()) return false

    const target = this.targetGroup()
    const root = this.dependencies.getRoot()
    if (!target || !root || root.getCardByID(target.id) !== target) {
      this.submitError.set(i18n('group:edit:error'))
      return false
    }
    if (!this.dirty()) {
      this.reset()
      return true
    }

    const parentPath = getGroupParentPath(target)
    const leafName = this.name().trim()
    const result = await wrap(
      target.saveChanges({
        name: parentPath ? `${parentPath}/${leafName}` : leafName,
        description: this.description(),
        iconRef: this.iconRef(),
      }),
    )

    if (result.status === 'saved' || result.status === 'unchanged') {
      this.reset()
      return true
    }
    if (result.status === 'name-conflict') {
      this.domainNameError.set('conflict')
      return false
    }
    if (result.status === 'invalid-name') {
      this.domainNameError.set('invalid')
      return false
    }

    this.submitError.set(i18n('group:edit:error'))
    return false
  }, 'passmanager.groupEdit.submit').extend(withAsync())

  private reset(): void {
    this.active.set(false)
    this.targetGroup.set(null)
    this.baselineName.set('')
    this.baselineDescription.set('')
    this.baselineIconRef.set(undefined)
    this.name.set('')
    this.description.set('')
    this.iconRef.set(undefined)
    this.submitAttempted.set(false)
    this.submitError.set('')
    this.domainNameError.set(null)
  }

  private getNameValidationError(): string {
    if (!this.submitAttempted()) return ''

    const rawName = this.name()
    const trimmedName = rawName.trim()
    if (!trimmedName) return i18n('error:group_name_required')
    if (/[\\/]/.test(rawName)) return i18n('error:group_name_invalid_chars')
    if (rawName !== this.baselineName() && rawName.length > GROUP_NAME_MAX_LENGTH) {
      return i18n('group:edit:name-too-long', {max: String(GROUP_NAME_MAX_LENGTH)})
    }
    if (this.domainNameError() === 'invalid') return i18n('error:group_name_invalid_chars')
    if (this.domainNameError() === 'conflict' || this.groupPathExists(trimmedName)) {
      const target = this.targetGroup()
      const parentPath = target ? getGroupParentPath(target) : null
      return i18n('group:create:duplicate', {
        name: trimmedName,
        parent: parentPath || i18n('root:title-short'),
      })
    }
    return ''
  }

  private getDescriptionValidationError(): string {
    if (!this.submitAttempted()) return ''
    const description = this.description()
    if (
      description !== this.baselineDescription() &&
      description.length > GROUP_DESCRIPTION_MAX_LENGTH
    ) {
      return i18n('group:edit:description-too-long', {
        max: String(GROUP_DESCRIPTION_MAX_LENGTH),
      })
    }
    return ''
  }

  private groupPathExists(leafName: string): boolean {
    const target = this.targetGroup()
    const root = this.dependencies.getRoot()
    if (!target || !root) return false

    const parentPath = getGroupParentPath(target)
    const fullPath = parentPath ? `${parentPath}/${leafName}` : leafName
    const comparisonPath = fullPath.trim().toLowerCase()
    const sourcePath = target.name
    return root.entriesList().some(
      (item) =>
        item instanceof Group &&
        item.name !== sourcePath &&
        !item.name.startsWith(`${sourcePath}/`) &&
        item.name.trim().toLowerCase() === comparisonPath,
    )
  }
}

export const pmGroupEditModel = new PMGroupEditModel()
