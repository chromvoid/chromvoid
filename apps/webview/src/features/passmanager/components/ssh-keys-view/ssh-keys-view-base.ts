import {nothing} from 'lit'
import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import type {PMSummaryRailItem} from '../summary-rail'
import type {PMEntrySshCreate} from '../card/entry-ssh/entry-ssh-create'
import {sshKeysHeaderControlsModel} from './ssh-keys-header-controls'
import type {PMSshKeyRow} from './ssh-keys-view.model'
import {pmSshKeysViewModel} from './ssh-keys-view.model'

type SshKeyRemoveEvent = CustomEvent<{keyId: string}>

export abstract class PMSshKeysViewBase extends ReatomLitElement {
  protected readonly model = pmSshKeysViewModel

  protected handleClearFilters() {
    this.model.clearFilters()
  }

  protected handleCloseCreate() {
    this.model.closeCreate()
  }

  protected async handleGenerate() {
    const generated = await this.model.generate()
    if (generated || !this.model.createForm.nameError()) return

    await this.updateComplete
    this.shadowRoot?.querySelector<PMEntrySshCreate>('pm-entry-ssh-create')?.focusNameInput()
  }

  protected handleRemove(event: SshKeyRemoveEvent) {
    void this.model.remove(event.detail.keyId)
  }

  protected handleOpenSource(event: Event) {
    const target = event.currentTarget as HTMLButtonElement
    this.model.openSourceEntry(target.value)
  }

  protected renderControls(slot?: string) {
    return html`
      <workspace-dashboard-header
        slot=${slot ?? nothing}
        class="ssh-view__controls"
        surface="passwords"
        embedded
        .controlsModel=${sshKeysHeaderControlsModel}
      ></workspace-dashboard-header>
    `
  }

  protected renderSummaryRail(slot?: string) {
    const summary = this.model.summary()

    return html`
      <pm-summary-rail
        slot=${slot ?? nothing}
        class="ssh-view__summary-rail"
        .items=${this.getSummaryItems(summary)}
        .label=${i18n('ssh:keys_view:summary' as never)}
      ></pm-summary-rail>
    `
  }

  protected renderHeader() {
    return html`
      <header class="ssh-view__header">
        <div class="ssh-view__identity">
          <span class="ssh-view__identity-icon" aria-hidden="true">
            <cv-icon name="key"></cv-icon>
          </span>
          <div class="ssh-view__identity-copy">
            <h1>${i18n('ssh:keys_view:title' as never)}</h1>
            <p>${i18n('ssh:keys_view:subtitle' as never)}</p>
          </div>
        </div>
      </header>
    `
  }

  private getSummaryItems(summary: {total: number; visible: number; ed25519: number; other: number}): PMSummaryRailItem[] {
    return [
      {id: 'total', label: i18n('ssh:keys_view:summary:total' as never), value: summary.total},
      {id: 'visible', label: i18n('ssh:keys_view:summary:visible' as never), value: summary.visible},
      {id: 'ed25519', label: i18n('ssh:key_type:ed25519'), value: summary.ed25519, tone: 'primary'},
      {
        id: 'other',
        label: i18n('ssh:keys_view:summary:other' as never),
        value: summary.other,
        tone: summary.other > 0 ? 'neutral' : 'muted',
      },
    ]
  }

  protected renderCreate() {
    if (!this.model.createOpen()) return nothing
    const resultReady = Boolean(this.model.createForm.result() && !this.model.createForm.result()?.pending)

    return html`
      <section class="ssh-view__create" aria-label=${i18n('ssh:add')}>
        <div class="ssh-view__create-head">
          <div>
            <h2 class="ssh-view__create-title">${i18n('ssh:add')}</h2>
            <p class="ssh-view__create-description">${i18n('ssh:description')}</p>
          </div>
          <cv-button
            class="ssh-view__create-close"
            unstyled
            type="button"
            aria-label=${i18n('button:cancel')}
            @click=${this.handleCloseCreate}
          >
            <cv-icon name="x"></cv-icon>
          </cv-button>
        </div>
        <pm-entry-ssh-create layout="card" .model=${this.model.createForm}></pm-entry-ssh-create>
        <div class="ssh-view__create-actions">
          <cv-button type="button" @click=${this.handleCloseCreate}>
            ${resultReady ? i18n('button:done') : i18n('button:cancel')}
          </cv-button>
          ${resultReady
            ? nothing
            : html`
                <cv-button
                  type="button"
                  variant="primary"
                  .loading=${this.model.generate.pending() > 0}
                  ?disabled=${this.model.generate.pending() > 0}
                  @click=${this.handleGenerate}
                >
                  ${i18n('ssh:generate')}
                </cv-button>
              `}
        </div>
      </section>
    `
  }

  protected renderContent() {
    const content = !this.model.hasRoot()
      ? this.renderEmpty('unavailable')
      : this.model.rows().length === 0
        ? this.renderEmpty('empty')
        : this.model.visibleRows().length === 0
          ? this.renderEmpty('filtered')
          : html`
              <div class="ssh-view__rows" role="list">
                ${this.model.visibleRows().map((row) => this.renderRow(row))}
              </div>
            `

    return html`
      <section class="ssh-view__inventory" aria-label=${i18n('ssh:keys_view:inventory' as never)}>
        ${content}
      </section>
    `
  }

  protected renderRow(row: PMSshKeyRow) {
    return html`
      <article class="ssh-row" role="listitem" data-key-id=${row.id}>
        <pm-entry-ssh-key
          layout="inventory"
          .keyId=${row.id}
          .keyType=${row.type}
          .fingerprint=${row.fingerprint}
          .name=${row.name}
          .comment=${row.comment}
          .publicKeyProvider=${() => this.model.readPublicKey(row.id)}
          .removable=${!this.model.isReadOnly()}
          @pm-entry-ssh-key-remove=${this.handleRemove}
        ></pm-entry-ssh-key>
        ${row.sourceEntryTitle
          ? html`
              <div class="ssh-row__source">
                <span>${i18n('ssh:keys_view:source' as never)}</span>
                <button type="button" value=${row.id} @click=${this.handleOpenSource}>
                  ${row.sourceEntryPath ?? row.sourceEntryTitle}
                </button>
                <cv-icon name="box-arrow-up-right" aria-hidden="true"></cv-icon>
              </div>
            `
          : nothing}
      </article>
    `
  }

  private renderEmpty(kind: 'unavailable' | 'empty' | 'filtered') {
    const title =
      kind === 'filtered'
        ? i18n('ssh:keys_view:empty_filtered:title' as never)
        : kind === 'unavailable'
          ? i18n('ssh:keys_view:unavailable:title' as never)
          : i18n('ssh:keys_view:empty:title' as never)
    const description =
      kind === 'filtered'
        ? i18n('ssh:keys_view:empty_filtered:description' as never)
        : kind === 'unavailable'
          ? i18n('ssh:keys_view:unavailable:description' as never)
          : i18n('ssh:keys_view:empty:description' as never)

    return html`
      <cv-empty-state icon="key" headline=${title} description=${description}>
        ${kind === 'filtered'
          ? html`
              <button slot="actions" class="clear-filters" type="button" @click=${this.handleClearFilters}>
                <cv-icon name="x" aria-hidden="true"></cv-icon>
                ${i18n('ssh:keys_view:clear_filters' as never)}
              </button>
            `
          : nothing}
      </cv-empty-state>
    `
  }
}
