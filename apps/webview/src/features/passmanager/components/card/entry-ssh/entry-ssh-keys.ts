import {XLitElement} from '@statx/lit'
import {html, nothing} from 'lit'
import {defaultLogger} from 'root/core/logger'

import {i18n} from '@project/passmanager'
import type {SshKeyEntry} from '@project/passmanager'
import type {CVIcon} from '@chromvoid/uikit'

import {PMEntrySshKey} from './entry-ssh-key'
import {entrySshKeysCardStyles} from './entry-ssh.styles'

export class PMEntrySshKeys extends XLitElement {
  static properties = {
    keys: {attribute: false},
    publicKeys: {attribute: false},
  }

  static styles = [entrySshKeysCardStyles]

  private readonly logger = defaultLogger

  declare keys: SshKeyEntry[]
  declare publicKeys: Record<string, string>

  constructor() {
    super()
    this.keys = []
    this.publicKeys = {}
  }

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties)
    if (!changedProperties.has('keys') && !changedProperties.has('publicKeys')) return
    if (this.keys.length === 0) return

    try {
      this.logger.debug('[PassManager][EntrySSH] list component update', {
        keyIds: this.keys.map((key) => key.id),
        publicKeyMapKeys: Object.keys(this.publicKeys),
        resolvedKeyIds: this.keys.filter((key) => Boolean(this.publicKeys[key.id])).map((key) => key.id),
        missingKeyIds: this.keys.filter((key) => !this.publicKeys[key.id]).map((key) => key.id),
      })
    } catch {}
  }

  static define() {
    PMEntrySshKey.define()

    if (!customElements.get('pm-entry-ssh-keys')) {
      customElements.define('pm-entry-ssh-keys', this)
    }
  }

  private renderKeyItem(key: SshKeyEntry) {
    return html`
      <pm-entry-ssh-key
        .mode=${'view'}
        .keyId=${key.id}
        .keyType=${key.type}
        .fingerprint=${key.fingerprint}
        .comment=${key.comment}
        .publicKey=${this.publicKeys[key.id] ?? ''}
      ></pm-entry-ssh-key>
    `
  }

  protected render() {
    if (this.keys.length === 0) {
      return nothing
    }

    return html`
      <div class="entry-ssh-keys-card">
        <div class="entry-ssh-keys-head">
          <div class="entry-ssh-keys-title">
            <cv-icon name="key"></cv-icon>
            ${i18n('ssh:title')}
            <cv-badge size="small" variant="warning">${this.keys.length}</cv-badge>
          </div>
        </div>

        <div class="entry-ssh-keys-content">${this.keys.map((key) => this.renderKeyItem(key))}</div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pm-entry-ssh-keys': PMEntrySshKeys
    'pm-entry-ssh-key': PMEntrySshKey
    'cv-icon': CVIcon
  }
}
