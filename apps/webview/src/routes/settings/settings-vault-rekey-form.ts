import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {routeCalloutStyles} from 'root/shared/ui/route-callout.styles'
import {settingsPageModel} from './settings.model'

export class SettingsVaultRekeyForm extends ReatomLitElement {
  static elementName = 'settings-vault-rekey-form'
  static properties = {
    showTitle: {type: Boolean, attribute: 'show-title'},
  }

  declare showTitle: boolean

  private readonly model = settingsPageModel.vaultRekey

  constructor() {
    super()
    this.showTitle = true
  }

  static styles = [
    routeCalloutStyles,
    css`
      :host {
        display: grid;
        gap: var(--app-spacing-4);
        min-inline-size: 0;
      }

      h2,
      p {
        margin: 0;
      }

      .heading,
      form,
      .fields,
      .field,
      .progress,
      .success {
        display: grid;
        min-inline-size: 0;
      }

      .heading,
      .field,
      .progress {
        gap: var(--app-spacing-1);
      }

      form,
      .fields,
      .success {
        gap: var(--app-spacing-3);
      }

      h2 {
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-base);
        font-weight: var(--cv-font-weight-semibold);
        line-height: 1.25;
      }

      .description,
      .progress-label {
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-xs);
        line-height: 1.45;
        overflow-wrap: anywhere;
      }

      label span {
        color: var(--cv-color-text);
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-medium);
      }

      input {
        box-sizing: border-box;
        inline-size: 100%;
        min-block-size: var(--app-touch-target-min);
        padding: var(--app-spacing-2) var(--app-spacing-3);
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-2);
        color: var(--cv-color-text);
        background: var(--cv-color-surface);
        font: inherit;
      }

      input:focus-visible {
        outline: 2px solid var(--cv-color-focus-ring, var(--cv-color-info));
        outline-offset: 2px;
      }

      input[aria-invalid='true'] {
        border-color: var(--cv-color-danger);
      }

      .field-error {
        color: var(--cv-color-danger);
        font-size: var(--cv-font-size-xs);
        line-height: 1.35;
      }

      .progress-label,
      .actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--app-spacing-2);
      }

      progress {
        inline-size: 100%;
        block-size: 8px;
        accent-color: var(--cv-color-brand);
      }

      .success {
        padding: var(--app-spacing-3);
        border: 1px solid var(--cv-color-success-border);
        border-radius: var(--cv-radius-2);
        background: var(--cv-color-success-surface);
      }

      .actions {
        justify-content: flex-start;
        flex-wrap: wrap;
      }

      @media (min-width: 860px) {
        .fields {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @media (max-width: 719px) {
        .actions {
          align-items: stretch;
        }

        .actions cv-button {
          inline-size: 100%;
        }
      }
    `,
  ]

  static define(): void {
    if (!customElements.get(this.elementName)) customElements.define(this.elementName, this)
  }

  private handleCurrentPasswordInput(event: Event): void {
    this.model.setCurrentPassword((event.target as HTMLInputElement).value)
  }

  private handleNewPasswordInput(event: Event): void {
    this.model.setNewPassword((event.target as HTMLInputElement).value)
  }

  private handleConfirmPasswordInput(event: Event): void {
    this.model.setConfirmPassword((event.target as HTMLInputElement).value)
  }

  private async handleSubmit(event: Event): Promise<void> {
    event.preventDefault()
    if (await this.model.submit()) return
    const field = this.model.validationField()
    if (!field) return
    await this.updateComplete
    this.shadowRoot?.querySelector<HTMLInputElement>(`#settings-vault-password-${field}`)?.focus()
  }

  private handleCancel(): void {
    void this.model.cancel()
  }

  private handleOpenBackup(): void {
    this.model.openBackupSurface()
  }

  protected render() {
    const validationField = this.model.validationField()
    const validationMessage = validationField ? this.model.error() : ''
    const feedbackMessage = validationField ? '' : this.model.error()

    return html`
      <div class="heading">
        ${this.showTitle ? html`<h2>${i18n('settings:vault-password-title')}</h2>` : nothing}
        <p class="description">${i18n('settings:vault-password-description')}</p>
      </div>

      <form class="vault-rekey-form" @submit=${this.handleSubmit}>
        <div class="fields">
          <label class="field" for="settings-vault-password-current">
            <span>${i18n('settings:vault-password-current')}</span>
            <input
              id="settings-vault-password-current"
              class="vault-password-input"
              type="password"
              autocomplete="current-password"
              .value=${this.model.currentPassword()}
              ?disabled=${this.model.busy()}
              aria-required="true"
              aria-invalid=${validationField === 'current' ? 'true' : 'false'}
              aria-describedby=${validationField === 'current' ? 'settings-vault-password-current-error' : nothing}
              @input=${this.handleCurrentPasswordInput}
            />
            ${validationField === 'current'
              ? html`<span id="settings-vault-password-current-error" class="field-error">${validationMessage}</span>`
              : nothing}
          </label>
          <label class="field" for="settings-vault-password-new">
            <span>${i18n('settings:vault-password-new')}</span>
            <input
              id="settings-vault-password-new"
              class="vault-password-input"
              type="password"
              autocomplete="new-password"
              .value=${this.model.newPassword()}
              ?disabled=${this.model.busy()}
              aria-required="true"
              aria-invalid=${validationField === 'new' ? 'true' : 'false'}
              aria-describedby=${validationField === 'new' ? 'settings-vault-password-new-error' : nothing}
              @input=${this.handleNewPasswordInput}
            />
            ${validationField === 'new'
              ? html`<span id="settings-vault-password-new-error" class="field-error">${validationMessage}</span>`
              : nothing}
          </label>
          <label class="field" for="settings-vault-password-confirm">
            <span>${i18n('settings:vault-password-confirm')}</span>
            <input
              id="settings-vault-password-confirm"
              class="vault-password-input"
              type="password"
              autocomplete="new-password"
              .value=${this.model.confirmPassword()}
              ?disabled=${this.model.busy()}
              aria-required="true"
              aria-invalid=${validationField === 'confirm' ? 'true' : 'false'}
              aria-describedby=${validationField === 'confirm' ? 'settings-vault-password-confirm-error' : nothing}
              @input=${this.handleConfirmPasswordInput}
            />
            ${validationField === 'confirm'
              ? html`<span id="settings-vault-password-confirm-error" class="field-error">${validationMessage}</span>`
              : nothing}
          </label>
        </div>

        ${feedbackMessage
          ? html`<cv-callout class="route-callout" variant="danger" density="dense" role="alert"
              >${feedbackMessage}</cv-callout
            >`
          : nothing}
        ${this.model.busy()
          ? html`
              <div class="progress" role="status" aria-live="polite">
                <div class="progress-label">
                  <span>${this.model.progressPhaseLabel()}</span>
                  <span>${this.model.progressSummary()}</span>
                </div>
                <progress max="100" .value=${this.model.progressPercent()}></progress>
              </div>
            `
          : nothing}
        ${this.model.successVisible()
          ? html`
              <div class="success" role="status">
                <h2>${i18n('settings:vault-password-success-title')}</h2>
                <p class="description">${i18n('settings:vault-password-success-description')}</p>
                ${this.model.backupRecommendationVisible()
                  ? html`
                      <div class="actions">
                        <cv-button variant="primary" type="button" @click=${this.handleOpenBackup}>
                          <cv-icon slot="prefix" name="archive"></cv-icon>
                          ${i18n('settings:vault-password-backup-action')}
                        </cv-button>
                      </div>
                      <p class="description">${i18n('settings:vault-password-backup-recommendation')}</p>
                    `
                  : nothing}
              </div>
            `
          : nothing}

        <div class="actions">
          <cv-button
            variant="primary"
            type="submit"
            .loading=${this.model.busy()}
            ?disabled=${this.model.busy()}
          >
            <cv-icon slot="prefix" name="key-round"></cv-icon>
            ${i18n('settings:vault-password-submit')}
          </cv-button>
          ${this.model.busy()
            ? html`
                <cv-button
                  variant="secondary"
                  type="button"
                  .loading=${this.model.isCancelling()}
                  ?disabled=${!this.model.canCancel()}
                  @click=${this.handleCancel}
                >
                  ${i18n('button:cancel')}
                </cv-button>
              `
            : nothing}
        </div>
      </form>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-vault-rekey-form': SettingsVaultRekeyForm
  }
}
