import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing} from 'lit'
import {i18n} from 'root/i18n'
import {
  WelcomeMasterRekeyDialogModel,
  type WelcomeMasterRekeyDialogResult,
} from './welcome-master-rekey-dialog.model'

export class WelcomeMasterRekeyForm extends ReatomLitElement {
  static styles = [
    css`
      :host {
        display: block;
      }

      .master-rekey-form {
        display: grid;
        gap: var(--app-spacing-4);
        padding: var(--app-spacing-5);
      }

      .master-rekey-note {
        color: var(--cv-color-text-subtle);
        font-size: var(--cv-font-size-sm, 0.875rem);
        line-height: 1.5;
        margin: 0;
      }

      .master-rekey-error {
        color: var(--cv-color-danger);
        background: var(--cv-color-danger-surface);
        border: 1px solid var(--cv-color-danger-border);
        border-radius: var(--cv-radius-1, 4px);
        padding: var(--app-spacing-2) var(--app-spacing-3);
        font-size: var(--cv-font-size-sm, 0.875rem);
        line-height: 1.4;
      }

      .master-rekey-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--app-spacing-3);
        padding-top: var(--app-spacing-2);
      }

      @media (max-width: 640px) {
        .master-rekey-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
      }
    `,
  ]

  private readonly dialogModel = new WelcomeMasterRekeyDialogModel()

  static define() {
    if (!customElements.get('welcome-master-rekey-form')) {
      customElements.define('welcome-master-rekey-form', this)
    }
  }

  focusCurrent(): void {
    const input = this.renderRoot.querySelector<HTMLElement>('.current-password-input')
    input?.focus()
  }

  private handleCurrentInput(event: Event): void {
    this.dialogModel.setCurrentPassword(resolveInputValue(event))
  }

  private handleNewPasswordInput(event: Event): void {
    this.dialogModel.setNewMasterPassword(resolveInputValue(event))
  }

  private handleConfirmInput(event: Event): void {
    this.dialogModel.setConfirmPassword(resolveInputValue(event))
  }

  private handleSubmit(event: Event): void {
    event.preventDefault()
    const result = this.dialogModel.submit()
    if (!result) return
    this.dispatchEvent(
      new CustomEvent<WelcomeMasterRekeyDialogResult>('welcome-master-rekey-submit', {
        detail: result,
        bubbles: true,
        composed: true,
      }),
    )
  }

  private handleCancel(): void {
    this.dispatchEvent(
      new CustomEvent('welcome-master-rekey-cancel', {
        bubbles: true,
        composed: true,
      }),
    )
  }

  protected render() {
    const state = this.dialogModel.state()

    return html`
      <form class="master-rekey-form" @submit=${this.handleSubmit}>
        <p class="master-rekey-note">${i18n('changepwd:backup-note')}</p>

        <cv-field>
          <span slot="label">${i18n('changepwd:old:title')}</span>
          <cv-input
            class="current-password-input"
            type="password"
            password-toggle
            autocomplete="current-password"
            .value=${state.currentPassword}
            @cv-input=${this.handleCurrentInput}
          ></cv-input>
        </cv-field>

        <cv-field>
          <span slot="label">${i18n('changepwd:new:title')}</span>
          <cv-input
            type="password"
            password-toggle
            autocomplete="new-password"
            .value=${state.newMasterPassword}
            @cv-input=${this.handleNewPasswordInput}
          ></cv-input>
        </cv-field>

        <cv-field>
          <span slot="label">${i18n('changepwd:confirm:title')}</span>
          <cv-input
            type="password"
            password-toggle
            autocomplete="new-password"
            enterkeyhint="done"
            .value=${state.confirmPassword}
            @cv-input=${this.handleConfirmInput}
          ></cv-input>
        </cv-field>

        ${state.error ? html`<div class="master-rekey-error">${state.error}</div>` : nothing}

        <div class="master-rekey-actions">
          <cv-button variant="default" type="button" @click=${this.handleCancel}>
            ${i18n('button:cancel')}
          </cv-button>
          <cv-button variant="primary" type="submit">${i18n('button:changepwd')}</cv-button>
        </div>
      </form>
    `
  }
}

function resolveInputValue(event: Event): string {
  const customEvent = event as CustomEvent<{value?: string}>
  const target = event.target as {value?: string} | null
  return customEvent.detail?.value ?? target?.value ?? ''
}
