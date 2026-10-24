import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'
import {walletPageModel} from './wallet-page.model'
import type {
  WalletEncoding,
  WalletImportNetwork,
  WalletRecoveryProfile,
} from './wallet-setup.model'

export type WalletSetupMode = 'create' | 'import' | 'restore'

export function renderWalletSetup(mode: WalletSetupMode): TemplateResult {
  if (mode === 'restore') return renderRestoreForm()
  if (mode === 'import') return renderImportForm()
  return renderCreateForm()
}

/**
 * A rotated Telegram Wallet phrase (24 words) is two independent halves: words 1–12 restore the
 * wallet everywhere, words 13–24 matter to Telegram Wallet only. Pass the standard so the
 * recovery views can label the halves; the create preview and BIP39 phrases render as one grid.
 */
export function renderWalletMnemonic(words: string[], standard?: string | null): TemplateResult {
  if (standard === 'rotation' && words.length === 24) {
    return html`
      <p class="field-hint">${i18n('wallet:recovery:anchor-words')}</p>
      ${renderWordGrid(words.slice(0, 12), 0)}
      <p class="field-hint">${i18n('wallet:recovery:signing-words')}</p>
      ${renderWordGrid(words.slice(12), 12)}
      <p class="field-hint">${i18n('wallet:recovery:rotation-hint')}</p>
    `
  }
  return html`
    ${renderWordGrid(words, 0)}
    ${standard === 'rotation' ? html`<p class="field-hint">${i18n('wallet:recovery:single-phrase-hint')}</p>` : nothing}
  `
}

function renderWordGrid(words: string[], offset: number): TemplateResult {
  return html`
    <div class="mnemonic-grid" dir="ltr" aria-label=${i18n('wallet:field:mnemonic')}>
      ${words.map(
        (word, index) => html`
          <span class="mnemonic-word">
            <span class="meta">${offset + index + 1}</span>
            <span>${word}</span>
          </span>
        `,
      )}
    </div>
  `
}

function renderCreateForm(): TemplateResult {
  const setup = walletPageModel.setup
  const busy = setup.hdWalletLoading() || setup.mnemonicLoading()
  return html`
    <div class="form">
      <p class="setup-note">
        <cv-icon name="network"></cv-icon>
        <span>
          <strong>${i18n('wallet:create:networks-auto:title')}</strong>
          ${i18n('wallet:create:networks-auto:body')}
        </span>
      </p>
      <label>
        ${i18n('wallet:field:label')}
        <input dir="auto" .value=${setup.createLabel()} @input=${handleCreateLabelInput} autocomplete="off" />
      </label>
      <p class="field-hint">${i18n('wallet:create:export-hint')}</p>
      <details class="setup-advanced">
        <summary>${i18n('wallet:create:advanced')}</summary>
        ${renderPassphraseControls()}
        <p class="field-hint">${i18n('wallet:create:passphrase-hint')}</p>
      </details>
      <div class="actions">
        <button
          class="primary"
          @click=${handleCreateGenerated}
          ?disabled=${!setup.canCreateGeneratedWallet()}
          aria-busy=${busy ? 'true' : 'false'}
        >
          <cv-icon class=${busy ? 'loading-spinner' : ''} name=${busy ? 'loader-circle' : 'wallet'}></cv-icon>
          ${busy ? i18n('wallet:action:creating') : i18n('wallet:action:create')}
        </button>
      </div>
    </div>
  `
}

function renderRestoreForm(): TemplateResult {
  const setup = walletPageModel.setup
  return html`
    <div class="form">
      ${renderRecoveryProfileSelector()} ${renderRestoreNetworkSelector()}
      <label>
        ${i18n('wallet:field:label')}
        <input dir="auto" .value=${setup.restoreLabel()} @input=${handleRestoreLabelInput} autocomplete="off" />
      </label>
      <label>
        ${i18n('wallet:field:mnemonic')}
        <textarea
          dir="ltr"
          .value=${setup.restoreMnemonicText()}
          @input=${handleRestoreMnemonicInput}
          autocomplete="off"
        ></textarea>
      </label>
      <p class="field-hint">
        ${setup.restoreProfile() === 'ton_only'
          ? i18n('wallet:profile:ton-only:restore-hint')
          : setup.restoreProfile() === 'ton_legacy'
            ? i18n('wallet:profile:ton-legacy:restore-hint')
            : setup.restoreProfile() === 'telegram_multichain'
              ? i18n('wallet:profile:telegram-multichain:restore-hint')
              : i18n('wallet:profile:multichain:restore-hint')}
      </p>
      ${setup.restoreProfile() === 'multichain' || setup.restoreProfile() === 'telegram_multichain'
        ? renderPassphraseControls()
        : nothing}
      <button class="primary" @click=${handleRestore} ?disabled=${!setup.canRestoreHdWallet()}>
        <cv-icon name="rotate-ccw"></cv-icon>
        ${i18n('wallet:action:import-phrase')}
      </button>
    </div>
  `
}

function renderImportForm(): TemplateResult {
  const setup = walletPageModel.setup
  return html`
    <div class="form">
      <fieldset class="setup-fieldset">
        <legend>${i18n('wallet:field:network')}</legend>
        <div class="network-options import-network-options">
          ${setup.multichainNetworkStatuses().map(
            (status) => html`
              <label class="choice-option compact">
                <input
                  type="radio"
                  name="wallet-import-network"
                  value=${status.network}
                  .checked=${setup.importNetwork() === status.network}
                  ?disabled=${!status.enabled}
                  @change=${handleImportNetworkChange}
                />
                <span class="choice-copy">
                  <span>${networkLabel(status.network)}</span>
                  ${status.enabled
                    ? nothing
                    : html`<span class="meta"
                        >${status.disabled_reason ?? i18n('wallet:network:disabled')}</span
                      >`}
                </span>
              </label>
            `,
          )}
        </div>
      </fieldset>
      <label>
        ${i18n('wallet:field:label')}
        <input dir="auto" .value=${setup.importLabel()} @input=${handleImportLabelInput} autocomplete="off" />
      </label>
      <label>
        ${i18n('wallet:field:encoding')}
        <select .value=${setup.importEncoding()} @change=${handleImportEncodingChange}>
          ${setup
            .importEncodings()
            .map((encoding) => html`<option value=${encoding}>${encodingLabel(encoding)}</option>`)}
        </select>
      </label>
      <label>
        ${i18n('wallet:field:private-key')}
        <textarea
          dir="ltr"
          .value=${setup.importPrivateKey()}
          @input=${handleImportPrivateKeyInput}
          autocomplete="off"
        ></textarea>
      </label>
      <button class="primary" @click=${handleImport} ?disabled=${!setup.importPrivateKey().trim()}>
        <cv-icon name="key-round"></cv-icon>
        ${i18n('wallet:action:import')}
      </button>
    </div>
  `
}

function renderRecoveryProfileSelector(): TemplateResult {
  const profile = walletPageModel.setup.restoreProfile()
  return html`
    <fieldset class="setup-fieldset profile-fieldset">
      <legend>${i18n('wallet:field:recovery-format')}</legend>
      <div class="profile-options">
        ${renderProfileOption(
          'multichain',
          i18n('wallet:profile:multichain:title'),
          i18n('wallet:profile:multichain:body'),
          i18n('wallet:profile:multichain:meta'),
          profile,
        )}
        ${renderProfileOption(
          'telegram_multichain',
          i18n('wallet:profile:telegram-multichain:title'),
          i18n('wallet:profile:telegram-multichain:body'),
          i18n('wallet:profile:telegram-multichain:meta'),
          profile,
        )}
        ${renderProfileOption(
          'ton_only',
          i18n('wallet:profile:ton-only:title'),
          i18n('wallet:profile:ton-only:body'),
          i18n('wallet:profile:ton-only:meta'),
          profile,
        )}
        ${renderProfileOption(
          'ton_legacy',
          i18n('wallet:profile:ton-legacy:title'),
          i18n('wallet:profile:ton-legacy:body'),
          i18n('wallet:profile:ton-legacy:meta'),
          profile,
        )}
      </div>
    </fieldset>
  `
}

function renderProfileOption(
  value: WalletRecoveryProfile,
  title: string,
  body: string,
  meta: string,
  current: WalletRecoveryProfile,
): TemplateResult {
  return html`
    <label class="choice-option profile-option">
      <input
        type="radio"
        name="wallet-setup-profile"
        value=${value}
        .checked=${current === value}
        @change=${handleSetupProfileChange}
      />
      <span class="choice-copy">
        <strong>${title}</strong>
        <span>${body}</span>
        <span class="meta">${meta}</span>
      </span>
    </label>
  `
}

function renderRestoreNetworkSelector(): TemplateResult {
  const setup = walletPageModel.setup
  if (setup.restoreProfile() === 'ton_only' || setup.restoreProfile() === 'ton_legacy') {
    const key = setup.restoreProfile() === 'ton_only' ? 'ton-only' : 'ton-legacy'
    return html`<p class="profile-summary">
      <strong>${i18n(`wallet:profile:${key}:title`)}</strong>
      <span>${i18n(`wallet:profile:${key}:network`)}</span>
    </p>`
  }
  return html`<p class="setup-note">
    <cv-icon name="network"></cv-icon>
    <span>
      <strong>${i18n('wallet:create:networks-auto:title')}</strong>
      ${i18n('wallet:restore:networks-auto:body')}
    </span>
  </p>`
}

function renderPassphraseControls(): TemplateResult {
  const setup = walletPageModel.setup
  return html`
    <label class="check-row">
      <input
        type="checkbox"
        .checked=${setup.useBip39Passphrase()}
        @change=${handleUsePassphraseChange}
      />
      <span>${i18n('wallet:field:passphrase-toggle')}</span>
    </label>
    ${setup.useBip39Passphrase()
      ? html`
          <label>
            ${i18n('wallet:field:passphrase')}
            <input
              dir="ltr"
              .value=${setup.bip39Passphrase()}
              @input=${handlePassphraseInput}
              type="password"
              autocomplete="off"
            />
          </label>
        `
      : nothing}
  `
}

function networkLabel(network: WalletImportNetwork): string {
  switch (network) {
    case 'bitcoin':
      return i18n('wallet:network:bitcoin')
    case 'ethereum':
      return i18n('wallet:network:ethereum')
    case 'solana':
      return i18n('wallet:network:solana')
    case 'ton':
      return i18n('wallet:network:ton')
  }
}

function encodingLabel(encoding: WalletEncoding): string {
  switch (encoding) {
    case 'base58_keypair':
      return 'Base58 keypair'
    case 'base64':
      return 'Base64'
    case 'hex':
      return 'Hex'
    case 'wif':
      return 'WIF'
  }
}

function handleSetupProfileChange(event: Event): void {
  walletPageModel.setup.setRestoreProfile((event.target as HTMLInputElement).value as WalletRecoveryProfile)
}

function handleCreateLabelInput(event: Event): void {
  walletPageModel.setup.setCreateLabel((event.target as HTMLInputElement).value)
}



function handleCreateGenerated(): void {
  void walletPageModel.createGeneratedWallet()
}

function handleRestoreLabelInput(event: Event): void {
  walletPageModel.setup.setRestoreLabel((event.target as HTMLInputElement).value)
}

function handleRestoreMnemonicInput(event: Event): void {
  walletPageModel.setup.setRestoreMnemonicText((event.target as HTMLTextAreaElement).value)
}

function handleRestore(): void {
  void walletPageModel.restoreHdWallet()
}

function handleUsePassphraseChange(event: Event): void {
  walletPageModel.setup.setUseBip39Passphrase((event.target as HTMLInputElement).checked)
}

function handlePassphraseInput(event: Event): void {
  walletPageModel.setup.setBip39Passphrase((event.target as HTMLInputElement).value)
}

function handleImportNetworkChange(event: Event): void {
  walletPageModel.setup.setImportNetwork((event.target as HTMLInputElement).value as WalletImportNetwork)
}

function handleImportLabelInput(event: Event): void {
  walletPageModel.setup.setImportLabel((event.target as HTMLInputElement).value)
}

function handleImportEncodingChange(event: Event): void {
  walletPageModel.setup.setImportEncoding((event.target as HTMLSelectElement).value as WalletEncoding)
}

function handleImportPrivateKeyInput(event: Event): void {
  walletPageModel.setup.setImportPrivateKey((event.target as HTMLTextAreaElement).value)
}

function handleImport(): void {
  void walletPageModel.importWallet()
}
