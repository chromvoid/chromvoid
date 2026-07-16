import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing, type TemplateResult} from 'lit'

import {envRuntimeI18n as t} from './env-runtime.i18n'
import {envRuntimeModel} from './env-runtime.model'
import {EnvRuntimePageSections} from './env-runtime-page.sections'

export abstract class EnvRuntimePageDialogs extends EnvRuntimePageSections {
  protected renderSecretDialog(): TemplateResult {
    const mode = envRuntimeModel.secretDialog()
    const isReveal = mode === 'reveal'
    const isEdit = mode === 'edit'
    const title = isReveal ? t('secretReveal') : isEdit ? t('secretEdit') : t('secretCreate')
    return html`
      <cv-dialog
        class="env-dialog"
        .open=${mode !== 'closed'}
        .initialFocusId=${isReveal ? 'env-secret-master-password' : 'env-secret-label'}
        @cv-change=${this.handleSecretDialogChange}
      >
        <span slot="title">${title}</span>
        ${isReveal ? this.renderRevealForm() : this.renderSecretForm(isEdit)}
      </cv-dialog>
    `
  }

  protected renderSecretForm(isEdit: boolean): TemplateResult {
    const labelError = envRuntimeModel.secretFieldError('label')
    const valueError = envRuntimeModel.secretFieldError('value')
    const submitError = envRuntimeModel.secretSubmitError()
    return html`
      <form @submit=${this.handleSecretSubmit} novalidate>
        <cv-field required ?invalid=${Boolean(labelError)}>
          <span slot="label">${t('secretLabel')}</span>
          <cv-input
            id="env-secret-label"
            dir="auto"
            .value=${envRuntimeModel.secretForm.fields.label()}
            .placeholder=${t('secretLabelPlaceholder')}
            ?invalid=${Boolean(labelError)}
            @cv-input=${this.handleSecretLabelInput}
          ></cv-input>
          ${labelError ? html`<span slot="error">${labelError}</span>` : nothing}
        </cv-field>
        <cv-field ?required=${!isEdit} ?invalid=${Boolean(valueError)}>
          <span slot="label">${t('secretValue')}</span>
          <cv-input
            id="env-secret-value"
            dir="ltr"
            type="password"
            autocomplete="new-password"
            .passwordToggle=${true}
            .value=${envRuntimeModel.secretForm.fields.value()}
            .placeholder=${t('secretValuePlaceholder')}
            ?invalid=${Boolean(valueError)}
            @cv-input=${this.handleSecretValueInput}
          ></cv-input>
          ${isEdit ? html`<span slot="description">${t('secretValueKeep')}</span>` : nothing}
          ${valueError ? html`<span slot="error">${valueError}</span>` : nothing}
        </cv-field>
        ${submitError ? html`<p class="form-error" role="alert">${submitError}</p>` : nothing}
        <div class="dialog-actions">
          <cv-button @click=${this.handleCloseSecretDialog}>${t('cancel')}</cv-button>
          <cv-button
            type="submit"
            variant="primary"
            .loading=${!envRuntimeModel.secretForm.submit.ready()}
            ?disabled=${!envRuntimeModel.secretForm.submit.ready()}
            >${t('save')}</cv-button
          >
        </div>
      </form>
    `
  }

  protected renderRevealForm(): TemplateResult {
    const error = envRuntimeModel.revealFieldError()
    const submitError = envRuntimeModel.revealSubmitError()
    return html`
      <form @submit=${this.handleRevealSubmit} novalidate>
        <p class="helper">${t('secretMasterPasswordHint')}</p>
        <cv-field required ?invalid=${Boolean(error)}>
          <span slot="label">${t('secretMasterPassword')}</span>
          <cv-input
            id="env-secret-master-password"
            dir="ltr"
            type="password"
            autocomplete="current-password"
            .value=${envRuntimeModel.revealForm.fields.masterPassword()}
            ?invalid=${Boolean(error)}
            @cv-input=${this.handleMasterPasswordInput}
          ></cv-input>
          ${error ? html`<span slot="error">${error}</span>` : nothing}
        </cv-field>
        ${submitError ? html`<p class="form-error" role="alert">${submitError}</p>` : nothing}
        <div class="dialog-actions">
          <cv-button @click=${this.handleCloseSecretDialog}>${t('cancel')}</cv-button>
          <cv-button
            type="submit"
            variant="primary"
            .loading=${!envRuntimeModel.revealForm.submit.ready()}
            ?disabled=${!envRuntimeModel.revealForm.submit.ready()}
            >${t('secretRevealAction')}</cv-button
          >
        </div>
      </form>
    `
  }

  protected renderProfileDialog(): TemplateResult {
    const target = envRuntimeModel.profileTarget()
    const variables = envRuntimeModel.profileForm.fields.variables()
    const rowErrors = envRuntimeModel.profileRowErrors()
    const variablesError = envRuntimeModel.profileFieldError('variables')
    return html`
      <cv-dialog
        class="env-dialog wide"
        .open=${envRuntimeModel.profileDialogOpen()}
        initial-focus-id="profile-slug"
        @cv-change=${this.handleProfileDialogChange}
      >
        <span slot="title">${target ? t('profileEdit') : t('profileCreate')}</span>
        <form @submit=${this.handleProfileSubmit} novalidate>
          <div class="form-grid">
            ${this.renderProfileTextField('slug', t('profileSlug'), t('profileSlugPlaceholder'), true)}
            ${this.renderProfileTextField('label', t('profileLabel'), t('profileLabelPlaceholder'), true)}
            <cv-field class="span-all" ?invalid=${Boolean(envRuntimeModel.profileFieldError('description'))}>
              <span slot="label">${t('profileDescription')}</span>
              <cv-textarea
                id="profile-description"
                dir="auto"
                .value=${envRuntimeModel.profileForm.fields.description()}
                .placeholder=${t('profileDescriptionPlaceholder')}
                ?invalid=${Boolean(envRuntimeModel.profileFieldError('description'))}
                @cv-input=${this.handleProfileDescriptionInput}
              ></cv-textarea>
              ${envRuntimeModel.profileFieldError('description')
                ? html`<span slot="error">${envRuntimeModel.profileFieldError('description')}</span>`
                : nothing}
            </cv-field>
          </div>

          <section class="subsection" aria-labelledby="profile-variables-title">
            <div class="subsection-head">
              <div>
                <h3 id="profile-variables-title" class="subsection-title">${t('profileVariables')}</h3>
                <p class="helper">${t('profilesDescription')}</p>
              </div>
              <cv-button
                id="profile-add-variable"
                size="small"
                aria-describedby=${variables.length === 0 && variablesError
                  ? 'profile-variables-error'
                  : nothing}
                @click=${this.handleAddProfileVariable}
              >
                <cv-icon slot="prefix" name="plus" aria-hidden="true"></cv-icon>
                ${t('profileAddVariable')}
              </cv-button>
            </div>
            <div id="profile-variables" class="mapping-list">
              ${variables.map(
                (variable, index) => html`
                  <div class="mapping-row">
                    <cv-field ?invalid=${Boolean(rowErrors[index]?.name)}>
                      <span slot="label">${t('profileVariableName')}</span>
                      <cv-input
                        id=${`profile-variable-name-${index}`}
                        required
                        dir="ltr"
                        data-index=${index}
                        data-profile-variable-field="name"
                        .value=${variable.name}
                        .placeholder=${index === 0 ? 'API_TOKEN' : 'DATABASE_URL'}
                        ?invalid=${Boolean(rowErrors[index]?.name)}
                        aria-describedby=${rowErrors[index]?.name
                          ? `profile-variable-name-${index}-error`
                          : nothing}
                        @cv-input=${this.handleProfileVariableInput}
                      ></cv-input>
                      ${rowErrors[index]?.name
                        ? html`<span id=${`profile-variable-name-${index}-error`} slot="error"
                            >${rowErrors[index]?.name}</span
                          >`
                        : nothing}
                    </cv-field>
                    <cv-field ?invalid=${Boolean(rowErrors[index]?.secret)}>
                      <span slot="label">${t('profileVariableSecret')}</span>
                      <cv-select
                        id=${`profile-variable-secret-${index}`}
                        required
                        data-index=${index}
                        .value=${variable.secret_id ?? ''}
                        .placeholder=${envRuntimeModel.secrets().length
                          ? t('profileNoSecret')
                          : t('profileCreateSecret')}
                        ?disabled=${envRuntimeModel.secrets().length === 0}
                        ?invalid=${Boolean(rowErrors[index]?.secret)}
                        aria-describedby=${rowErrors[index]?.secret
                          ? `profile-variable-secret-${index}-error`
                          : nothing}
                        @cv-change=${this.handleProfileVariableSecretChange}
                      >
                        ${envRuntimeModel
                          .secrets()
                          .map(
                            (secret) => html`
                              <cv-select-option .value=${secret.id}>${secret.label}</cv-select-option>
                            `,
                          )}
                      </cv-select>
                      ${rowErrors[index]?.secret
                        ? html`<span id=${`profile-variable-secret-${index}-error`} slot="error"
                            >${rowErrors[index]?.secret}</span
                          >`
                        : nothing}
                      ${envRuntimeModel.secrets().length === 0
                        ? html`
                            <div slot="description" class="inline-actions">
                              <cv-button
                                id=${`profile-create-secret-${index}`}
                                size="small"
                                data-index=${index}
                                aria-invalid=${rowErrors[index]?.secret ? 'true' : nothing}
                                aria-describedby=${rowErrors[index]?.secret
                                  ? `profile-variable-secret-${index}-error`
                                  : nothing}
                                @click=${this.handleCreateSecretForProfile}
                              >
                                ${t('profileCreateSecret')}
                              </cv-button>
                            </div>
                          `
                        : nothing}
                    </cv-field>
                    <cv-button
                      size="small"
                      variant="ghost"
                      aria-label=${t('remove')}
                      data-index=${index}
                      @click=${this.handleRemoveProfileVariable}
                    >
                      <cv-icon name="trash" aria-hidden="true"></cv-icon>
                    </cv-button>
                  </div>
                `,
              )}
            </div>
            ${variablesError && rowErrors.every((error) => !error.name && !error.secret)
              ? html`<p id="profile-variables-error" class="field-error" role="alert">
                  ${variablesError}
                </p>`
              : nothing}
          </section>

          ${envRuntimeModel.profileSubmitError()
            ? html`<p class="form-error" role="alert">${envRuntimeModel.profileSubmitError()}</p>`
            : nothing}
          <div class="dialog-actions">
            <cv-button @click=${this.handleCloseProfileDialog}>${t('cancel')}</cv-button>
            <cv-button
              type="submit"
              variant="primary"
              .loading=${!envRuntimeModel.profileForm.submit.ready()}
              ?disabled=${!envRuntimeModel.profileForm.submit.ready()}
              >${t('save')}</cv-button
            >
          </div>
        </form>
      </cv-dialog>
    `
  }

  protected renderProfileTextField(
    field: 'slug' | 'label',
    label: string,
    placeholder: string,
    required: boolean,
  ): TemplateResult {
    const error = envRuntimeModel.profileFieldError(field)
    return html`
      <cv-field ?required=${required} ?invalid=${Boolean(error)}>
        <span slot="label">${label}</span>
        <cv-input
          id=${`profile-${field}`}
          dir=${field === 'slug' ? 'ltr' : 'auto'}
          data-profile-field=${field}
          .value=${envRuntimeModel.profileForm.fields[field]()}
          .placeholder=${placeholder}
          ?invalid=${Boolean(error)}
          @cv-input=${this.handleProfileTextInput}
        ></cv-input>
        ${error ? html`<span slot="error">${error}</span>` : nothing}
      </cv-field>
    `
  }

  protected renderPresetDialog(): TemplateResult {
    const target = envRuntimeModel.presetTarget()
    const args = envRuntimeModel.presetForm.fields.args()
    const passthrough = envRuntimeModel.presetForm.fields.passthroughEnv()
    const argRowErrors = envRuntimeModel.presetArgRowErrors()
    const passthroughRowErrors = envRuntimeModel.presetPassthroughRowErrors()
    const argGroupError = envRuntimeModel.presetFieldError('args')
    const passthroughGroupError = envRuntimeModel.presetFieldError('passthroughEnv')
    return html`
      <cv-dialog
        class="env-dialog wide"
        .open=${envRuntimeModel.presetDialogOpen()}
        initial-focus-id="preset-slug"
        @cv-change=${this.handlePresetDialogChange}
      >
        <span slot="title">${target ? t('presetEdit') : t('presetCreate')}</span>
        <form @submit=${this.handlePresetSubmit} novalidate>
          <div class="form-grid">
            <cv-field required ?invalid=${Boolean(envRuntimeModel.presetFieldError('profileId'))}>
              <span slot="label">${t('presetProfile')}</span>
              <cv-select
                id="preset-profileId"
                .value=${envRuntimeModel.presetForm.fields.profileId()}
                .placeholder=${t('errorProfileRequired')}
                ?invalid=${Boolean(envRuntimeModel.presetFieldError('profileId'))}
                @cv-change=${this.handlePresetProfileChange}
              >
                ${envRuntimeModel
                  .profiles()
                  .map(
                    (profile) => html`
                      <cv-select-option .value=${profile.id}>${profile.label}</cv-select-option>
                    `,
                  )}
              </cv-select>
              ${envRuntimeModel.presetFieldError('profileId')
                ? html`<span slot="error">${envRuntimeModel.presetFieldError('profileId')}</span>`
                : nothing}
            </cv-field>
            ${this.renderPresetTextField('slug', t('presetSlug'), t('presetSlugPlaceholder'))}
            ${this.renderPresetTextField('label', t('presetLabel'), t('presetLabelPlaceholder'))}
            ${this.renderPresetTextField(
              'workspaceRoot',
              t('presetWorkspace'),
              t('presetWorkspacePlaceholder'),
            )}
            ${this.renderPresetTextField('cwd', t('presetCwd'), t('presetCwdPlaceholder'))}
            ${this.renderPresetTextField(
              'executable',
              t('presetExecutable'),
              t('presetExecutablePlaceholder'),
            )}
          </div>

          <section class="subsection" aria-labelledby="preset-args-title">
            <div class="subsection-head">
              <div>
                <h3 id="preset-args-title" class="subsection-title">${t('presetArgs')}</h3>
                <p class="helper">${t('presetArgsHint')}</p>
              </div>
              <cv-button id="preset-add-arg" size="small" @click=${this.handleAddPresetArg}>
                <cv-icon slot="prefix" name="plus" aria-hidden="true"></cv-icon>${t('add')}
              </cv-button>
            </div>
            <div class="value-list">
              ${args.map(
                (arg, index) => html`
                  <div class="value-row">
                    <cv-field ?invalid=${Boolean(argRowErrors[index])}>
                      <span slot="label">${t('presetArgs')} ${index + 1}</span>
                      <cv-input
                        id=${`preset-arg-${index}`}
                        dir="ltr"
                        data-index=${index}
                        .value=${arg}
                        ?invalid=${Boolean(argRowErrors[index])}
                        aria-describedby=${argRowErrors[index]
                          ? `preset-arg-${index}-error`
                          : nothing}
                        @cv-input=${this.handlePresetArgInput}
                      ></cv-input>
                      ${argRowErrors[index]
                        ? html`<span id=${`preset-arg-${index}-error`} slot="error"
                            >${argRowErrors[index]}</span
                          >`
                        : nothing}
                    </cv-field>
                    <cv-button
                      size="small"
                      variant="ghost"
                      aria-label=${t('remove')}
                      data-index=${index}
                      @click=${this.handleRemovePresetArg}
                      ><cv-icon name="trash" aria-hidden="true"></cv-icon
                    ></cv-button>
                  </div>
                `,
              )}
            </div>
            ${argGroupError && argRowErrors.every((error) => !error)
              ? html`<p id="preset-args-error" class="field-error" role="alert" tabindex="-1">
                  ${argGroupError}
                </p>`
              : nothing}
          </section>

          <section class="subsection" aria-labelledby="preset-passthrough-title">
            <div class="subsection-head">
              <div>
                <h3 id="preset-passthrough-title" class="subsection-title">${t('presetPassthrough')}</h3>
                <p class="helper">${t('presetPassthroughHint')}</p>
              </div>
              <cv-button id="preset-add-passthrough" size="small" @click=${this.handleAddPresetPassthrough}>
                <cv-icon slot="prefix" name="plus" aria-hidden="true"></cv-icon>${t('add')}
              </cv-button>
            </div>
            <div class="value-list">
              ${passthrough.map(
                (name, index) => html`
                  <div class="value-row">
                    <cv-field ?invalid=${Boolean(passthroughRowErrors[index])}>
                      <span slot="label">${t('presetPassthrough')} ${index + 1}</span>
                      <cv-input
                        id=${`preset-passthrough-${index}`}
                        dir="ltr"
                        data-index=${index}
                        .value=${name}
                        ?invalid=${Boolean(passthroughRowErrors[index])}
                        aria-describedby=${passthroughRowErrors[index]
                          ? `preset-passthrough-${index}-error`
                          : nothing}
                        @cv-input=${this.handlePresetPassthroughInput}
                      ></cv-input>
                      ${passthroughRowErrors[index]
                        ? html`<span id=${`preset-passthrough-${index}-error`} slot="error"
                            >${passthroughRowErrors[index]}</span
                          >`
                        : nothing}
                    </cv-field>
                    <cv-button
                      size="small"
                      variant="ghost"
                      aria-label=${t('remove')}
                      data-index=${index}
                      @click=${this.handleRemovePresetPassthrough}
                      ><cv-icon name="trash" aria-hidden="true"></cv-icon
                    ></cv-button>
                  </div>
                `,
              )}
            </div>
            ${passthroughGroupError && passthroughRowErrors.every((error) => !error)
              ? html`<p id="preset-passthrough-error" class="field-error" role="alert" tabindex="-1">
                  ${passthroughGroupError}
                </p>`
              : nothing}
          </section>

          ${envRuntimeModel.presetSubmitError()
            ? html`<p class="form-error" role="alert">${envRuntimeModel.presetSubmitError()}</p>`
            : nothing}
          <div class="dialog-actions">
            <cv-button @click=${this.handleClosePresetDialog}>${t('cancel')}</cv-button>
            <cv-button
              type="submit"
              variant="primary"
              .loading=${!envRuntimeModel.presetForm.submit.ready()}
              ?disabled=${!envRuntimeModel.presetForm.submit.ready()}
              >${t('save')}</cv-button
            >
          </div>
        </form>
      </cv-dialog>
    `
  }

  protected renderPresetTextField(
    field: 'slug' | 'label' | 'workspaceRoot' | 'cwd' | 'executable',
    label: string,
    placeholder: string,
  ): TemplateResult {
    const error = envRuntimeModel.presetFieldError(field)
    return html`
      <cv-field required ?invalid=${Boolean(error)}>
        <span slot="label">${label}</span>
        <cv-input
          id=${`preset-${field}`}
          dir=${field === 'label' ? 'auto' : 'ltr'}
          data-preset-field=${field}
          .value=${envRuntimeModel.presetForm.fields[field]()}
          .placeholder=${placeholder}
          ?invalid=${Boolean(error)}
          @cv-input=${this.handlePresetTextInput}
        ></cv-input>
        ${error ? html`<span slot="error">${error}</span>` : nothing}
      </cv-field>
    `
  }
}
