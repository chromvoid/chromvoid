import {CVField} from '@chromvoid/uikit/components/cv-field'
import {CVSlider, type CVSliderEventDetail} from '@chromvoid/uikit/components/cv-slider'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'
import {formatWalletAmount, shortenAddress} from './wallet-format'
import {walletPageModel} from './wallet-page.model'
import type {WalletPrepareResponse} from './wallet-page.types'

export class WalletSendForm extends ReatomLitElement {
  static elementName = 'wallet-send-form'
  static properties = {presentation: {type: String, reflect: true}}
  static styles = [
    css`
      :host {
        display: grid;
        min-inline-size: 0;
        color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
        contain: content;
      }

      h2,
      h3,
      p,
      dl,
      dd {
        margin: 0;
      }

      button,
      input,
      textarea,
      select {
        box-sizing: border-box;
        font: inherit;
      }

      button {
        display: inline-flex;
        min-block-size: 40px;
        align-items: center;
        justify-content: center;
        gap: var(--app-spacing-2);
        border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
        border-radius: var(--cv-radius-md);
        padding-inline: var(--app-spacing-3);
        color: inherit;
        background: var(--app-editorial-surface-muted, var(--cv-color-surface-3));
        cursor: pointer;
      }

      button:focus-visible,
      input:focus-visible,
      textarea:focus-visible,
      select:focus-visible {
        outline: 2px solid var(--cv-color-accent);
        outline-offset: 2px;
      }

      button:disabled {
        cursor: default;
        opacity: 0.55;
      }

      .primary {
        border-color: var(--cv-color-accent-border-strong, var(--cv-color-accent));
        color: var(--cv-color-accent-contrast, var(--cv-color-bg));
        background: var(--cv-color-accent);
      }

      .ghost {
        background: transparent;
      }

      .danger {
        color: var(--cv-color-danger, var(--cv-color-text-danger));
      }

      .send-flow,
      .send-form,
      .recipient-card,
      .picker,
      .picker-group,
      .editor,
      .confirmation,
      .quote-status {
        display: grid;
        min-inline-size: 0;
        gap: var(--app-spacing-3);
      }

      .context {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--app-spacing-2);
        padding: var(--app-spacing-3);
        border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
        border-radius: var(--cv-radius-md);
        background: var(--app-editorial-surface-muted, var(--cv-color-surface-2));
      }

      .context div,
      .quote-metrics div,
      .preview-list div {
        display: grid;
        min-inline-size: 0;
        gap: var(--app-spacing-1);
      }

      dt,
      .meta,
      .hint {
        color: var(--app-editorial-text-tertiary, var(--cv-color-text-muted));
        font-size: var(--cv-font-size-xs);
      }

      dd,
      strong,
      code {
        min-inline-size: 0;
        overflow-wrap: anywhere;
      }

      input,
      textarea,
      select {
        inline-size: 100%;
        min-block-size: 42px;
        border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
        border-radius: var(--cv-radius-md);
        padding: var(--app-spacing-2) var(--app-spacing-3);
        color: inherit;
        background: var(--cv-color-surface);
      }

      textarea {
        min-block-size: 88px;
        resize: vertical;
      }

      [aria-invalid='true'] {
        border-color: var(--cv-color-danger, var(--cv-color-border-danger));
      }

      .recipient-card {
        padding: var(--app-spacing-3);
        border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
        border-radius: var(--cv-radius-md);
      }

      .recipient-heading,
      .field-action-row,
      .amount-heading,
      .range-heading,
      .actions,
      .picker-heading,
      .picker-row,
      .contact-actions {
        display: flex;
        min-inline-size: 0;
        align-items: center;
        justify-content: space-between;
        gap: var(--app-spacing-2);
      }

      .field-action-row input {
        flex: 1 1 auto;
        min-inline-size: 0;
      }

      .field-action-row button,
      .amount-heading button {
        flex: 0 0 auto;
      }

      cv-slider {
        display: block;
        inline-size: 100%;
      }

      .quote-metrics,
      .preview-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--app-spacing-2);
      }

      .quote-metrics div,
      .preview-list div {
        padding: var(--app-spacing-3);
        border-radius: var(--cv-radius-md);
        background: var(--app-editorial-surface-muted, var(--cv-color-surface-2));
      }

      .feedback {
        display: grid;
        gap: var(--app-spacing-2);
        padding: var(--app-spacing-3);
        border: 1px solid var(--cv-color-danger-border, var(--cv-color-border-danger));
        border-radius: var(--cv-radius-md);
        color: var(--cv-color-danger, var(--cv-color-text-danger));
        background: var(--cv-color-danger-surface, var(--cv-color-surface));
        overflow-wrap: anywhere;
      }

      .loading {
        color: var(--app-editorial-text-tertiary, var(--cv-color-text-muted));
        font-size: var(--cv-font-size-sm);
      }

      .picker-list {
        display: grid;
        gap: var(--app-spacing-2);
      }

      .picker-row {
        padding: var(--app-spacing-2);
        border: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
        border-radius: var(--cv-radius-md);
      }

      .picker-choice {
        flex: 1 1 auto;
        min-inline-size: 0;
        justify-content: flex-start;
        border: 0;
        padding: var(--app-spacing-2);
        text-align: start;
        background: transparent;
      }

      .picker-choice span {
        display: grid;
        min-inline-size: 0;
        gap: var(--app-spacing-1);
      }

      .picker-choice code {
        color: var(--app-editorial-text-tertiary, var(--cv-color-text-muted));
        font-size: var(--cv-font-size-xs);
      }

      .icon-action {
        min-inline-size: 40px;
        padding-inline: var(--app-spacing-2);
      }

      .confirmation {
        padding-block-start: var(--app-spacing-4);
        border-block-start: 1px solid var(--app-editorial-border-subtle, var(--cv-color-border-soft));
      }

      .warning {
        display: flex;
        gap: var(--app-spacing-2);
        align-items: flex-start;
      }

      :host([presentation='mobile']) .context {
        grid-template-columns: 1fr;
      }

      :host([presentation='mobile']) .quote-metrics,
      :host([presentation='mobile']) .preview-list {
        grid-template-columns: 1fr;
      }

      @media (max-width: 560px) {
        .context,
        .quote-metrics,
        .preview-list {
          grid-template-columns: 1fr;
        }
      }
    `,
  ]

  declare presentation: 'desktop' | 'mobile'
  protected readonly model = walletPageModel

  constructor() {
    super()
    this.presentation = 'desktop'
  }

  static define(): void {
    CVField.define()
    CVSlider.define()
    if (!customElements.get(this.elementName)) customElements.define(this.elementName, this)
  }

  protected render(): TemplateResult {
    if (this.model.send.step() === 'recipients') return this.renderRecipientPicker()
    if (this.model.send.step() === 'address-book-editor') return this.renderAddressBookEditor()
    return this.renderForm()
  }

  private renderForm(): TemplateResult {
    const account = this.model.selectedAccount()
    const wallet = this.model.selectedWallet()
    const profile = this.model.selectedNetworkProfile()
    if (!account || !wallet || !profile || profile.network === 'solana') {
      return html`<p class="feedback" role="alert">${i18n('wallet:send:unsupported')}</p>`
    }
    const available = this.model.send.availableBaseUnits()
    const preview = this.model.send.currentPreview()
    const feePreview = preview ?? (this.model.send.quoteFresh() ? this.model.send.quote()?.max_preview : null)

    return html`
      <div class="send-flow">
        <dl class="context">
          <div>
            <dt>${i18n('wallet:field:wallet')}</dt>
            <dd><bdi dir="auto">${wallet.label}</bdi></dd>
          </div>
          <div>
            <dt>${i18n('wallet:field:account')}</dt>
            <dd><bdi dir="auto">${account.label ?? profile.label}</bdi></dd>
          </div>
          <div>
            <dt>${i18n('wallet:send:available')}</dt>
            <dd>
              ${available === null
                ? `— ${profile.symbol}`
                : formatWalletAmount(available, profile.amountUnit, profile.network)}
            </dd>
          </div>
        </dl>

        <div class="send-form">
          ${this.model.send
            .recipients()
            .map((recipient, index) =>
              this.renderRecipient(recipient.id, recipient.address, recipient.amount, index),
            )}
          ${profile.multipleOutputs
            ? html`<button class="ghost" @click=${this.handleAddRecipient}>
                <cv-icon name="plus"></cv-icon>${i18n('wallet:action:add-recipient')}
              </button>`
            : nothing}

          <div class="range-heading">
            <span class="hint">${this.model.send.rangePercent()}% ${i18n('wallet:send:percent')}</span>
          </div>
          <cv-slider
            .value=${this.model.send.rangePercent()}
            min="0"
            max="100"
            step="1"
            .disabled=${!this.model.send.quoteFresh()}
            .ariaLabel=${i18n('wallet:send:percent')}
            @cv-input=${this.handleRangeInput}
            @cv-change=${this.handleRangeInput}
          ></cv-slider>

          <cv-field>
            <span slot="label">${i18n('wallet:field:fee-tier')}</span>
            <select .value=${this.model.sendFeeTier()} @change=${this.handleFeeTierChange}>
              <option value="slow">${i18n('wallet:fee:slow')}</option>
              <option value="standard">${i18n('wallet:fee:standard')}</option>
              <option value="fast">${i18n('wallet:fee:fast')}</option>
            </select>
          </cv-field>

          <dl class="quote-metrics">
            <div>
              <dt>${i18n('wallet:preview:fee')}</dt>
              <dd>
                ${feePreview
                  ? formatWalletAmount(feePreview.estimated_fee, feePreview.amount_unit, profile.network)
                  : `— ${profile.symbol}`}
              </dd>
            </div>
            <div>
              <dt>${i18n('wallet:preview:total')}</dt>
              <dd>
                ${preview
                  ? formatWalletAmount(preview.total_debit, preview.amount_unit, profile.network)
                  : `— ${profile.symbol}`}
              </dd>
            </div>
          </dl>

          ${profile.supportsComment
            ? html`<cv-field .invalid=${Boolean(this.model.send.fieldErrors()['comment'])}>
                <span slot="label">${i18n('wallet:field:comment')}</span>
                <textarea
                  id="wallet-send-comment"
                  dir="auto"
                  .value=${this.model.sendComment()}
                  maxlength="120"
                  @input=${this.handleCommentInput}
                ></textarea>
                <span slot="description">${i18n('wallet:field:comment:hint')}</span>
                ${this.model.send.fieldErrors()['comment']
                  ? html`<span slot="error">${this.model.send.fieldErrors()['comment']}</span>`
                  : nothing}
              </cv-field>`
            : nothing}
          ${this.model.send.quoteLoading()
            ? html`<p class="loading" role="status">${i18n('wallet:send:quote-loading')}</p>`
            : nothing}
          ${this.model.send.quoteExpired() && !this.model.send.quoteError()
            ? html`<p class="feedback" role="status">${i18n('wallet:send:quote-stale')}</p>`
            : nothing}
          ${this.model.send.quoteError()
            ? html`<div class="feedback" role="alert">
                <span>${this.model.send.quoteError()}</span>
                <button class="ghost" @click=${this.handleRetryQuote}>
                  ${i18n('wallet:send:retry-quote')}
                </button>
              </div>`
            : nothing}
          ${this.model.send.submitError()
            ? html`<p class="feedback" role="alert">${this.model.send.submitError()}</p>`
            : nothing}

          <div class="actions">
            <button
              id="wallet-send-prepare"
              class="primary"
              @click=${this.handlePrepare}
              ?disabled=${this.model.preparing() || !this.model.selectedTransactionReady()}
              aria-busy=${this.model.preparing() ? 'true' : 'false'}
            >
              <cv-icon name=${this.model.preparing() ? 'loader-circle' : 'shield-check'}></cv-icon>
              ${i18n('wallet:action:prepare')}
            </button>
            ${this.model.prepared()
              ? html`<button class="ghost" @click=${this.handleCancelPrepared}>
                  ${i18n('wallet:action:cancel')}
                </button>`
              : nothing}
          </div>
        </div>
        ${this.model.prepared() ? this.renderPrepared(this.model.prepared()!) : nothing}
      </div>
    `
  }

  private renderRecipient(id: string, address: string, amount: string, index: number): TemplateResult {
    const profile = this.model.selectedNetworkProfile()!
    const addressError = this.model.send.fieldError(id, 'address')
    const amountError = this.model.send.fieldError(id, 'amount')
    const active = this.model.send.activeRecipientId() === id
    return html`
      <section class="recipient-card" aria-current=${active ? 'true' : 'false'}>
        <div class="recipient-heading">
          <strong>${i18n('wallet:send:recipient')} ${index + 1}</strong>
          ${index > 0
            ? html`<button class="ghost danger" data-recipient-id=${id} @click=${this.handleRemoveRecipient}>
                ${i18n('button:remove')}
              </button>`
            : nothing}
        </div>
        <cv-field .invalid=${Boolean(addressError)} required>
          <span slot="label">${i18n('wallet:field:destination')}</span>
          <div class="field-action-row">
            <input
              id=${`wallet-send-${id}-address`}
              dir="ltr"
              data-recipient-id=${id}
              .value=${address}
              @focus=${this.handleRecipientFocus}
              @input=${this.handleAddressInput}
              autocomplete="off"
              aria-invalid=${addressError ? 'true' : 'false'}
            />
            <button data-recipient-id=${id} @click=${this.handleOpenPicker}>
              ${i18n('wallet:send:choose-recipient')}
            </button>
          </div>
          ${addressError ? html`<span slot="error">${addressError}</span>` : nothing}
        </cv-field>
        <cv-field .invalid=${Boolean(amountError)} required>
          <span slot="label">${i18n('wallet:field:amount')} (${profile.symbol})</span>
          <div class="field-action-row">
            <input
              id=${`wallet-send-${id}-amount`}
              dir="ltr"
              data-recipient-id=${id}
              .value=${amount}
              @focus=${this.handleRecipientFocus}
              @input=${this.handleAmountInput}
              inputmode="decimal"
              autocomplete="off"
              aria-invalid=${amountError ? 'true' : 'false'}
            />
            <button
              data-recipient-id=${id}
              @click=${this.handleMax}
              ?disabled=${!this.model.send.quoteFresh()}
              aria-pressed=${this.model.send.amountMode() === 'max' && active}
            >
              ${i18n('wallet:send:max')}
            </button>
          </div>
          ${amountError ? html`<span slot="error">${amountError}</span>` : nothing}
        </cv-field>
      </section>
    `
  }

  private renderRecipientPicker(): TemplateResult {
    const own = this.model.ownRecipients()
    const entries = this.model.addressBook.networkEntries()
    return html`
      <section class="picker">
        <div class="picker-heading">
          <h2>${i18n('wallet:send:select-title')}</h2>
          <button id="wallet-send-picker-back" class="ghost" @click=${this.handleBackToForm}>
            ${i18n('button:back')}
          </button>
        </div>
        <div class="picker-group">
          <h3>${i18n('wallet:send:own-wallets')}</h3>
          <div class="picker-list">
            ${own.map(
              (recipient) =>
                html`<div class="picker-row">
                  <button
                    class="picker-choice"
                    data-address=${recipient.address}
                    @click=${this.handleChooseAddress}
                  >
                    <span
                      ><strong><bdi dir="auto">${recipient.label}</bdi></strong
                      ><code dir="ltr">${recipient.address}</code></span
                    >
                  </button>
                </div>`,
            )}
          </div>
        </div>
        <div class="picker-group">
          <div class="picker-heading">
            <h3>${i18n('wallet:send:address-book')}</h3>
            <button class="ghost" @click=${this.handleCreateContact}>
              <cv-icon name="plus"></cv-icon>${i18n('wallet:send:add-contact')}
            </button>
          </div>
          ${this.model.addressBook.loading()
            ? html`<p class="loading" role="status">${i18n('wallet:loading')}</p>`
            : nothing}
          ${this.model.addressBook.error()
            ? html`<p class="feedback" role="alert">${this.model.addressBook.error()}</p>`
            : nothing}
          <div class="picker-list">
            ${entries.map(
              (entry) =>
                html`<div class="picker-row">
                  <button
                    class="picker-choice"
                    data-address=${entry.address}
                    @click=${this.handleChooseAddress}
                  >
                    <span
                      ><strong><bdi dir="auto">${entry.label}</bdi></strong
                      ><code dir="ltr">${shortenAddress(entry.address)}</code></span
                    >
                  </button>
                  <button
                    class="icon-action ghost"
                    data-entry-id=${entry.entry_id}
                    @click=${this.handleEditContact}
                    aria-label=${i18n('wallet:send:edit-contact')}
                  >
                    <cv-icon name="pencil"></cv-icon>
                  </button>
                </div>`,
            )}
          </div>
          ${own.length === 0 && entries.length === 0
            ? html`<p class="hint">${i18n('wallet:send:no-recipients')}</p>`
            : nothing}
        </div>
      </section>
    `
  }

  private renderAddressBookEditor(): TemplateResult {
    const book = this.model.addressBook
    const editing = Boolean(book.editorEntryId())
    return html`
      <section class="editor">
        <div class="picker-heading">
          <h2>${editing ? i18n('wallet:send:edit-contact') : i18n('wallet:send:add-contact')}</h2>
          <button class="ghost" @click=${this.handleBackToPicker}>${i18n('button:back')}</button>
        </div>
        <cv-field .invalid=${Boolean(book.editorLabelError())} required>
          <span slot="label">${i18n('wallet:send:contact-label')}</span>
          <input
            id="wallet-contact-label"
            dir="auto"
            .value=${book.editorLabel()}
            maxlength="80"
            @input=${this.handleContactLabelInput}
          />
          ${book.editorLabelError() ? html`<span slot="error">${book.editorLabelError()}</span>` : nothing}
        </cv-field>
        <cv-field .invalid=${Boolean(book.editorAddressError())} required>
          <span slot="label">${i18n('wallet:field:destination')}</span>
          <input
            id="wallet-contact-address"
            dir="ltr"
            .value=${book.editorAddress()}
            autocomplete="off"
            @input=${this.handleContactAddressInput}
          />
          ${book.editorAddressError()
            ? html`<span slot="error">${book.editorAddressError()}</span>`
            : nothing}
        </cv-field>
        ${book.error() ? html`<p class="feedback" role="alert">${book.error()}</p>` : nothing}
        <div class="contact-actions">
          <button class="primary" @click=${this.handleSaveContact} ?disabled=${book.saving()}>
            ${i18n('wallet:send:save-contact')}
          </button>
          ${editing
            ? html`<button class="ghost danger" @click=${this.handleDeleteContact} ?disabled=${book.saving()}>
                ${i18n('wallet:send:delete-contact')}
              </button>`
            : nothing}
        </div>
      </section>
    `
  }

  private renderPrepared(prepared: WalletPrepareResponse): TemplateResult {
    const preview = prepared.preview
    const amount = preview.outputs.reduce((sum, output) => sum + BigInt(output.amount), 0n).toString()
    return html`
      <section class="confirmation">
        <h3>${i18n('wallet:preview:confirm-title')}</h3>
        <dl class="preview-list">
          <div>
            <dt>${i18n('wallet:preview:amount')}</dt>
            <dd>${formatWalletAmount(amount, preview.amount_unit, prepared.network)}</dd>
          </div>
          <div>
            <dt>${i18n('wallet:preview:fee')}</dt>
            <dd>${formatWalletAmount(preview.estimated_fee, preview.amount_unit, prepared.network)}</dd>
          </div>
          <div>
            <dt>${i18n('wallet:preview:total')}</dt>
            <dd>${formatWalletAmount(preview.total_debit, preview.amount_unit, prepared.network)}</dd>
          </div>
          ${preview.ton
            ? html`
                <div>
                  <dt>${i18n('wallet:preview:wallet-contract')}</dt>
                  <dd dir="ltr">${preview.ton.wallet_contract}</dd>
                </div>
                <div>
                  <dt>${i18n('wallet:preview:seqno')}</dt>
                  <dd>${preview.ton.seqno}</dd>
                </div>
                <div>
                  <dt>${i18n('wallet:preview:account-state')}</dt>
                  <dd dir="ltr">${preview.ton.account_state}</dd>
                </div>
              `
            : nothing}
          ${preview.ethereum
            ? html`
                <div>
                  <dt>${i18n('wallet:preview:network')}</dt>
                  <dd>Chain ${preview.ethereum.chain_id}</dd>
                </div>
                <div>
                  <dt>${i18n('wallet:preview:nonce')}</dt>
                  <dd>${preview.ethereum.nonce}</dd>
                </div>
                <div>
                  <dt>${i18n('wallet:preview:gas-limit')}</dt>
                  <dd>${preview.ethereum.gas_limit}</dd>
                </div>
              `
            : nothing}
        </dl>
        ${this.model.preparedAmountBelowFee()
          ? html`<p class="feedback" role="alert">${i18n('wallet:preview:amount-below-fee')}</p>`
          : nothing}
        ${preview.warnings.map(
          (warning) =>
            html`<label class="warning">
              <input
                type="checkbox"
                data-warning-code=${warning.code}
                .checked=${this.model.acceptedWarnings().has(warning.code)}
                @change=${this.handleWarningToggle}
              />
              <span>${warning.message}</span>
            </label>`,
        )}
        <cv-field required>
          <span slot="label">${i18n('wallet:field:master-password')}</span>
          <input
            dir="ltr"
            .value=${this.model.sendMasterPassword()}
            @input=${this.handleMasterPasswordInput}
            type="password"
            autocomplete="off"
          />
        </cv-field>
        <div class="actions">
          <button
            class="primary"
            @click=${this.handleConfirm}
            ?disabled=${!this.model.canConfirmPrepared() || this.model.confirming()}
          >
            ${i18n('wallet:action:confirm')}
          </button>
          <button class="ghost" @click=${this.handleCancelPrepared}>${i18n('wallet:action:cancel')}</button>
        </div>
      </section>
    `
  }

  private handleRecipientFocus(event: Event): void {
    const id = (event.currentTarget as HTMLElement).dataset['recipientId']
    if (id) this.model.send.activateRecipient(id)
  }

  private handleAddressInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    const id = input.dataset['recipientId']
    if (id) this.model.send.setRecipientAddress(id, input.value)
  }

  private handleAmountInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    const id = input.dataset['recipientId']
    if (id) this.model.send.setRecipientAmount(id, input.value)
  }

  private async handleOpenPicker(event: Event): Promise<void> {
    const id = (event.currentTarget as HTMLElement).dataset['recipientId']
    if (id) this.model.send.activateRecipient(id)
    this.model.send.setStep('recipients')
    void this.model.addressBook.load()
    await this.updateComplete
    this.renderRoot.querySelector<HTMLElement>('#wallet-send-picker-back')?.focus()
  }

  private handleAddRecipient(): void {
    this.model.send.addRecipient()
  }

  private handleRemoveRecipient(event: Event): void {
    const id = (event.currentTarget as HTMLElement).dataset['recipientId']
    if (id) this.model.send.removeRecipient(id)
  }

  private handleMax(event: Event): void {
    const id = (event.currentTarget as HTMLElement).dataset['recipientId']
    if (id) this.model.send.activateRecipient(id)
    this.model.send.applyMax()
  }

  private handleRangeInput(event: CustomEvent<CVSliderEventDetail>): void {
    this.model.send.setRangePercent(event.detail.value)
  }

  private handleFeeTierChange(event: Event): void {
    this.model.setSendFeeTier(
      (event.currentTarget as HTMLSelectElement).value as 'slow' | 'standard' | 'fast',
    )
  }

  private handleCommentInput(event: Event): void {
    this.model.setSendComment((event.currentTarget as HTMLTextAreaElement).value)
  }

  private handleRetryQuote(): void {
    this.model.send.retryQuote()
  }

  private async handlePrepare(): Promise<void> {
    const field = await this.model.prepareSend()
    if (!field || field === 'form') return
    await this.updateComplete
    this.renderRoot.querySelector<HTMLElement>(`#wallet-send-${field}`)?.focus()
  }

  private handleCancelPrepared(): void {
    void this.model.cancelPrepared()
  }

  private handleWarningToggle(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    const code = input.dataset['warningCode']
    if (code) this.model.toggleWarning(code, input.checked)
  }

  private handleMasterPasswordInput(event: Event): void {
    this.model.setSendMasterPassword((event.currentTarget as HTMLInputElement).value)
  }

  private handleConfirm(): void {
    void this.model.confirmSend()
  }

  private async handleBackToForm(): Promise<void> {
    this.model.send.setStep('form')
    await this.updateComplete
    this.renderRoot
      .querySelector<HTMLElement>(`#wallet-send-${this.model.send.activeRecipientId()}-address`)
      ?.focus()
  }

  private handleBackToPicker(): void {
    this.model.send.setStep('recipients')
  }

  private handleChooseAddress(event: Event): void {
    const address = (event.currentTarget as HTMLElement).dataset['address']
    if (address) this.model.send.chooseRecipient(address)
  }

  private async handleCreateContact(): Promise<void> {
    this.model.addressBook.beginCreate(this.model.send.activeRecipient().address)
    this.model.send.setStep('address-book-editor')
    await this.updateComplete
    this.renderRoot.querySelector<HTMLElement>('#wallet-contact-label')?.focus()
  }

  private async handleEditContact(event: Event): Promise<void> {
    const entryId = (event.currentTarget as HTMLElement).dataset['entryId']
    const entry = this.model.addressBook.entries().find((item) => item.entry_id === entryId)
    if (!entry) return
    this.model.addressBook.beginEdit(entry)
    this.model.send.setStep('address-book-editor')
    await this.updateComplete
    this.renderRoot.querySelector<HTMLElement>('#wallet-contact-label')?.focus()
  }

  private handleContactLabelInput(event: Event): void {
    this.model.addressBook.setEditorLabel((event.currentTarget as HTMLInputElement).value)
  }

  private handleContactAddressInput(event: Event): void {
    this.model.addressBook.setEditorAddress((event.currentTarget as HTMLInputElement).value)
  }

  private async handleSaveContact(): Promise<void> {
    const saved = await this.model.addressBook.save()
    if (saved) this.model.send.setStep('recipients')
  }

  private async handleDeleteContact(): Promise<void> {
    const entryId = this.model.addressBook.editorEntryId()
    if (!entryId) return
    await this.model.addressBook.delete(entryId)
    this.model.send.setStep('recipients')
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wallet-send-form': WalletSendForm
  }
}
