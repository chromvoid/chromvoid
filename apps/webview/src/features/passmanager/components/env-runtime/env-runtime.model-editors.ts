import {wrap} from '@reatom/core'

import {envRuntimeI18n as t} from './env-runtime.i18n'
import {EnvRuntimeModelCore} from './env-runtime.model-core'
import {errorMessage, validateArgs, validateVariables} from './env-runtime.model.support'
import type {AgentPresetDraft, AgentVariableMapping} from './env-runtime.types'

export abstract class EnvRuntimeModelEditors extends EnvRuntimeModelCore {
  openCreateProfile(): void {
    if (this.reportReadinessDenial(this.privilegedReadiness())) return
    this.profileSecretReturnIndex.set(null)
    this.profileTarget.set(null)
    this.profileAttempted.set(false)
    this.resetProfileForm({
      slug: '',
      label: '',
      description: '',
      variables: [{name: '', secret_id: null}],
    })
    this.profileDialogOpen.set(true)
  }

  openEditProfile(id: string): void {
    if (this.reportReadinessDenial(this.privilegedReadiness())) return
    const profile = this.profiles().find((item) => item.id === id)
    if (!profile) return
    this.profileSecretReturnIndex.set(null)
    this.profileTarget.set(profile)
    this.profileAttempted.set(false)
    this.resetProfileForm({
      slug: profile.slug,
      label: profile.label,
      description: profile.description ?? '',
      variables: profile.variables.map((variable) => ({...variable})),
    })
    this.profileDialogOpen.set(true)
  }

  closeProfileDialog(): void {
    this.profileDialogOpen.set(false)
    this.profileTarget.set(null)
    this.profileSecretReturnIndex.set(null)
    this.profileAttempted.set(false)
    this.resetProfileForm({slug: '', label: '', description: '', variables: []})
  }

  setProfileField(field: 'slug' | 'label' | 'description', value: string): void {
    this.profileForm.fields[field].change(value)
  }

  addProfileVariable(): void {
    this.profileForm.fields.variables.change([
      ...this.profileForm.fields.variables(),
      {name: '', secret_id: null},
    ])
  }

  removeProfileVariable(index: number): void {
    this.profileForm.fields.variables.change(
      this.profileForm.fields.variables().filter((_, itemIndex) => itemIndex !== index),
    )
  }

  updateProfileVariable(index: number, field: 'name' | 'secret_id', value: string): void {
    if (field === 'secret_id') {
      this.selectProfileVariableSecret(index, value)
      return
    }
    this.profileForm.fields.variables.change(
      this.profileForm.fields
        .variables()
        .map((variable, itemIndex) => (itemIndex === index ? {...variable, name: value} : variable)),
    )
  }

  profileFieldError(field: 'slug' | 'label' | 'description' | 'variables'): string {
    if (!this.profileAttempted()) return ''
    if (field === 'variables') {
      return (
        validateVariables(this.profileForm.fields.variables()) ??
        this.profileForm.fields.variables.validation().error ??
        ''
      )
    }
    return this.profileForm.fields[field].validation().error ?? ''
  }

  async submitProfile(): Promise<string | null> {
    if (this.reportReadinessDenial(this.privilegedReadiness())) return null
    this.profileAttempted.set(true)
    if (this.profileForm.fields.variables().length === 0) return 'profile-add-variable'
    try {
      await wrap(this.profileForm.submit())
      this.closeProfileDialog()
      return null
    } catch {
      for (const field of ['slug', 'label', 'description'] as const) {
        if (this.profileForm.fields[field].validation().error) return `profile-${field}`
      }
      const rowErrors = this.profileRowErrors()
      const rowIndex = rowErrors.findIndex((row) => row.name || row.secret)
      if (rowIndex >= 0) {
        if (rowErrors[rowIndex]?.name) return `profile-variable-name-${rowIndex}`
        return this.secrets().length
          ? `profile-variable-secret-${rowIndex}`
          : `profile-create-secret-${rowIndex}`
      }
      return this.profileForm.fields.variables.validation().error ? 'profile-add-variable' : null
    }
  }

  async deleteProfile(id: string): Promise<void> {
    if (this.reportReadinessDenial(this.privilegedReadiness())) return
    const profile = this.profiles().find((item) => item.id === id)
    if (!profile) return
    const confirmed = await wrap(
      this.dependencies.confirm({
        title: t('profileDeleteTitle'),
        message: t('profileDeleteMessage', {label: profile.label}),
        confirmText: t('delete'),
        cancelText: t('cancel'),
        confirmVariant: 'danger',
        variant: 'warning',
      }),
    )
    if (!confirmed) return
    try {
      await wrap(
        this.dependencies.invoke('env_runtime_profile_delete', {
          id: profile.id,
          baseRevision: profile.revision,
        }),
      )
      await wrap(this.refresh())
    } catch (error) {
      this.error.set(errorMessage(error))
    }
  }

  openCreatePreset(): void {
    if (this.reportReadinessDenial(this.devicePresetReadiness())) return
    this.presetTarget.set(null)
    this.presetAttempted.set(false)
    this.resetPresetForm({
      profileId: this.profiles()[0]?.id ?? '',
      slug: '',
      label: '',
      workspaceRoot: '',
      cwd: '',
      executable: '',
      args: [],
      passthroughEnv: [],
    })
    this.presetDialogOpen.set(true)
  }

  openEditPreset(id: string): void {
    if (this.reportReadinessDenial(this.devicePresetReadiness())) return
    const preset = this.presets().find((item) => item.id === id)
    if (!preset) return
    this.presetTarget.set(preset)
    this.presetAttempted.set(false)
    this.resetPresetForm({
      profileId: preset.profile_id,
      slug: preset.slug,
      label: preset.label,
      workspaceRoot: preset.workspace_root,
      cwd: preset.cwd,
      executable: preset.executable,
      args: [...preset.args],
      passthroughEnv: [...preset.passthrough_env],
    })
    this.presetDialogOpen.set(true)
  }

  closePresetDialog(): void {
    this.presetDialogOpen.set(false)
    this.presetTarget.set(null)
    this.presetAttempted.set(false)
    this.resetPresetForm({
      profileId: '',
      slug: '',
      label: '',
      workspaceRoot: '',
      cwd: '',
      executable: '',
      args: [],
      passthroughEnv: [],
    })
  }

  setPresetField(
    field: 'profileId' | 'slug' | 'label' | 'workspaceRoot' | 'cwd' | 'executable',
    value: string,
  ): void {
    this.presetForm.fields[field].change(value)
  }

  addPresetArg(): void {
    this.presetForm.fields.args.change([...this.presetForm.fields.args(), ''])
  }

  updatePresetArg(index: number, value: string): void {
    this.presetForm.fields.args.change(
      this.presetForm.fields.args().map((arg, itemIndex) => (itemIndex === index ? value : arg)),
    )
  }

  removePresetArg(index: number): void {
    this.presetForm.fields.args.change(
      this.presetForm.fields.args().filter((_, itemIndex) => itemIndex !== index),
    )
  }

  addPresetPassthrough(): void {
    this.presetForm.fields.passthroughEnv.change([...this.presetForm.fields.passthroughEnv(), ''])
  }

  updatePresetPassthrough(index: number, value: string): void {
    this.presetForm.fields.passthroughEnv.change(
      this.presetForm.fields.passthroughEnv().map((name, itemIndex) => (itemIndex === index ? value : name)),
    )
  }

  removePresetPassthrough(index: number): void {
    this.presetForm.fields.passthroughEnv.change(
      this.presetForm.fields.passthroughEnv().filter((_, itemIndex) => itemIndex !== index),
    )
  }

  presetFieldError(
    field:
      | 'profileId'
      | 'slug'
      | 'label'
      | 'workspaceRoot'
      | 'cwd'
      | 'executable'
      | 'args'
      | 'passthroughEnv',
  ): string {
    if (!this.presetAttempted()) return ''
    if (field === 'args') {
      return (
        validateArgs(this.presetForm.fields.args()) ??
        this.presetForm.fields.args.validation().error ??
        ''
      )
    }
    return this.presetForm.fields[field].validation().error ?? ''
  }

  async submitPreset(): Promise<string | null> {
    if (this.reportReadinessDenial(this.devicePresetReadiness())) return null
    this.presetAttempted.set(true)

    for (const field of ['profileId', 'slug', 'label', 'workspaceRoot', 'cwd', 'executable'] as const) {
      if (this.presetForm.fields[field].validation().error) return `preset-${field}`
    }
    const argIndex = this.presetArgRowErrors().findIndex(Boolean)
    if (argIndex >= 0) return `preset-arg-${argIndex}`
    if (validateArgs(this.presetForm.fields.args())) return 'preset-args-error'
    const passthroughIndex = this.presetPassthroughRowErrors().findIndex(Boolean)
    if (passthroughIndex >= 0) return `preset-passthrough-${passthroughIndex}`

    try {
      await wrap(this.presetForm.submit())
      this.closePresetDialog()
      return null
    } catch {
      return null
    }
  }

  profileSubmitError(): string {
    if (this.profileForm.validation().errors.length > 0) return ''
    return this.profileForm.submit.error()?.message ?? ''
  }

  presetSubmitError(): string {
    if (this.presetForm.validation().errors.length > 0) return ''
    return this.presetForm.submit.error()?.message ?? ''
  }

  async deletePreset(id: string): Promise<void> {
    if (this.reportReadinessDenial(this.devicePresetReadiness())) return
    const preset = this.presets().find((item) => item.id === id)
    if (!preset) return
    const confirmed = await wrap(
      this.dependencies.confirm({
        title: t('presetDeleteTitle'),
        message: t('presetDeleteMessage', {label: preset.label}),
        confirmText: t('delete'),
        cancelText: t('cancel'),
        confirmVariant: 'danger',
        variant: 'warning',
      }),
    )
    if (!confirmed) return
    try {
      await wrap(
        this.dependencies.invoke('env_runtime_preset_delete', {
          id: preset.id,
          baseRevision: preset.revision,
        }),
      )
      await wrap(this.refresh())
    } catch (error) {
      this.error.set(errorMessage(error))
    }
  }

  protected resetProfileForm(values: {
    slug: string
    label: string
    description: string
    variables: AgentVariableMapping[]
  }): void {
    this.profileForm.fields.slug.reset(values.slug)
    this.profileForm.fields.label.reset(values.label)
    this.profileForm.fields.description.reset(values.description)
    this.profileForm.fields.variables.reset(values.variables)
    this.profileForm.submitted.set(false)
    this.profileForm.submit.error.set(undefined)
    this.profileForm.submit.data.set(undefined)
  }

  protected resetPresetForm(values: {
    profileId: string
    slug: string
    label: string
    workspaceRoot: string
    cwd: string
    executable: string
    args: string[]
    passthroughEnv: string[]
  }): void {
    this.presetForm.fields.profileId.reset(values.profileId)
    this.presetForm.fields.slug.reset(values.slug)
    this.presetForm.fields.label.reset(values.label)
    this.presetForm.fields.workspaceRoot.reset(values.workspaceRoot)
    this.presetForm.fields.cwd.reset(values.cwd)
    this.presetForm.fields.executable.reset(values.executable)
    this.presetForm.fields.args.reset(values.args)
    this.presetForm.fields.passthroughEnv.reset(values.passthroughEnv)
    this.presetForm.submitted.set(false)
    this.presetForm.submit.error.set(undefined)
    this.presetForm.submit.data.set(undefined)
  }

  protected override async persistProfile(values: {
    slug: string
    label: string
    description: string
    variables: AgentVariableMapping[]
  }): Promise<void> {
    const variables = values.variables.map((variable) => ({
      name: variable.name.trim(),
      secret_id: variable.secret_id!,
    }))
    const draft = {
      slug: values.slug,
      label: values.label.trim(),
      description: values.description.trim() || null,
      variables,
    }
    const target = this.profileTarget()
    if (target) {
      await wrap(
        this.dependencies.rpc('env_runtime:profile:update', {
          target: target.id,
          base_revision: target.revision,
          draft,
        }),
      )
    } else {
      await wrap(this.dependencies.rpc('env_runtime:profile:create', draft))
    }
    await wrap(this.refresh())
  }

  protected override async persistPreset(values: {
    profileId: string
    slug: string
    label: string
    workspaceRoot: string
    cwd: string
    executable: string
    args: string[]
    passthroughEnv: string[]
  }): Promise<void> {
    const target = this.presetTarget()
    const draft: AgentPresetDraft = {
      profile_id: values.profileId,
      slug: values.slug,
      label: values.label.trim(),
      workspace_root: values.workspaceRoot,
      cwd: values.cwd,
      executable: values.executable,
      args: values.args,
      passthrough_env: values.passthroughEnv.map((name) => name.trim()),
    }
    await wrap(
      this.dependencies.invoke('env_runtime_preset_save', {
        id: target?.id ?? null,
        baseRevision: target?.revision ?? null,
        draft,
      }),
    )
    await wrap(this.refresh())
  }
}
