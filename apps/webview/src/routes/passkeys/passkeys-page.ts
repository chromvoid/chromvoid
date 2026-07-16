import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {css, nothing} from 'lit'

import {i18n} from 'root/i18n'
import {renderGuidanceInline} from 'root/features/guidance/render-guidance-inline'
import {CvEmptyState} from 'root/shared/ui/empty-state'
import {
  hostLayoutPaintContainStyles,
  pageFadeInStyles,
  pageTransitionStyles,
  routeHostStyles,
  routePageStyles,
  sharedStyles,
} from 'root/shared/ui/shared-styles'
import {routeCardStyles} from 'root/shared/ui/route-card.styles'
import {passkeysPageModel, type PasskeyGroup, type PasskeySummary} from './passkeys.model'

export class PasskeysPage extends ReatomLitElement {
  static elementName = 'passkeys-page'
  static define() {
    CvEmptyState.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  private readonly model = passkeysPageModel

  static styles = [
    sharedStyles,
    pageTransitionStyles,
    pageFadeInStyles,
    hostLayoutPaintContainStyles,
    routeHostStyles,
    routePageStyles,
    routeCardStyles,
    css`
      .page {
        box-sizing: border-box;
        inline-size: 100%;
        max-inline-size: 920px;
        padding-inline: var(--app-spacing-4);
        padding-block-end: var(--app-spacing-8);
      }

      :host {
        display: block;
        block-size: 100%;
        min-block-size: 0;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        --app-route-card-background: var(--app-editorial-surface-elevated, var(--cv-color-surface-elevated));
        --app-route-card-border-color: var(--app-editorial-border-subtle, var(--cv-alpha-white-8));
        --app-route-card-radius: var(--cv-radius-lg, 12px);
        --app-route-card-padding: var(--app-spacing-4);
      }

      @media (max-width: 767px) {
        .page {
          box-sizing: border-box;
          padding-block-start: var(--app-spacing-4);
          padding-block-end: calc(
            var(--app-spacing-8) + var(--app-mobile-shell-tab-bar-content-clearance, 64px)
          );
          padding-inline-start: max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-start, 0px));
          padding-inline-end: max(var(--app-spacing-4), var(--app-runtime-safe-area-inline-end, 0px));
        }
      }

      .passkey-explainer {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: start;
        gap: var(--app-spacing-3);
        padding: var(--app-spacing-3);
        border: 1px solid var(--cv-color-info-border);
        border-radius: var(--cv-radius-md, 8px);
        background: var(--cv-color-info-surface);
      }

      .passkey-explainer-icon {
        inline-size: 36px;
        block-size: 36px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--cv-radius-md, 8px);
        color: var(--cv-color-info);
        background: var(--cv-color-info-surface);

        cv-icon {
          font-size: 20px;
        }
      }

      .passkey-explainer-copy {
        display: grid;
        min-inline-size: 0;
        gap: var(--app-spacing-1);
      }

      .passkey-explainer-title {
        margin: 0;
        color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-semibold);
      }

      .passkey-explainer-description {
        margin: 0;
        color: var(--app-editorial-text-tertiary, var(--cv-alpha-white-50));
        font-size: var(--cv-font-size-xs);
        overflow-wrap: anywhere;
      }

      .card {
        display: grid;
        gap: var(--app-spacing-4);
      }

      .passkey-sections,
      .passkey-section {
        display: grid;
        gap: var(--app-spacing-4);
      }

      .section-heading {
        display: grid;
        gap: var(--app-spacing-1);
      }

      .section-title {
        margin: 0;
        color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
        font-size: var(--cv-font-size-base);
        font-weight: var(--cv-font-weight-semibold);
      }

      .section-description {
        margin: 0;
        color: var(--app-editorial-text-tertiary, var(--cv-alpha-white-50));
        font-size: var(--cv-font-size-xs);
      }

      .passkey-list {
        display: grid;
        gap: var(--app-spacing-3);
      }

      .passkey-group {
        display: grid;
        gap: var(--app-spacing-3);
        padding: var(--app-spacing-3);
        border: 1px solid var(--app-editorial-border-subtle, var(--cv-alpha-white-8));
        border-radius: var(--cv-radius-md, 8px);
        background: var(--app-editorial-surface-muted, var(--cv-color-surface-3));
      }

      .passkey-row,
      .passkey-duplicate-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
        gap: var(--app-spacing-3);
      }

      .passkey-duplicates {
        display: grid;
        gap: var(--app-spacing-2);
        padding-block-start: var(--app-spacing-3);
        border-block-start: 1px solid var(--app-editorial-border-subtle, var(--cv-alpha-white-8));
      }

      .passkey-primary {
        display: grid;
        min-inline-size: 0;
        gap: var(--app-spacing-1);
      }

      .passkey-title {
        color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-semibold);
        overflow-wrap: anywhere;
      }

      .passkey-title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--app-spacing-2);
      }

      .passkey-badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 2px var(--app-spacing-2);
        border: 1px solid var(--cv-color-warning-border);
        background: var(--cv-color-warning-surface);
        color: var(--app-editorial-text-primary, var(--cv-color-text-strongest));
        font-size: var(--cv-font-size-xs);
        font-weight: var(--cv-font-weight-medium, 500);
      }

      .passkey-badge--vault {
        border-color: var(--cv-color-success-border);
        background: var(--cv-color-success-surface);
      }

      .passkey-meta-grid {
        display: flex;
        flex-wrap: wrap;
        gap: var(--app-spacing-1) var(--app-spacing-3);
      }

      .passkey-meta,
      .description {
        color: var(--app-editorial-text-tertiary, var(--cv-alpha-white-50));
        font-size: var(--cv-font-size-xs);
        overflow-wrap: anywhere;
      }

      .passkey-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: var(--app-spacing-2);
      }

      @media (min-width: 768px) {
        .card {
          gap: var(--app-spacing-5);
        }

        .passkey-explainer,
        .passkey-group {
          padding: var(--app-spacing-4);
        }
      }

      @media (max-width: 560px) {
        .passkey-row,
        .passkey-duplicate-row {
          grid-template-columns: 1fr;
        }

        .passkey-actions {
          justify-content: flex-start;
        }
      }
    `,
  ]

  connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener('visibilitychange', this)
    window.addEventListener('focus', this)
    void this.model.load()
  }

  disconnectedCallback(): void {
    document.removeEventListener('visibilitychange', this)
    window.removeEventListener('focus', this)
    super.disconnectedCallback()
  }

  handleEvent(event: Event): void {
    if (event.type === 'focus') {
      void this.model.refreshPasskeys()
      return
    }

    if (event.type === 'visibilitychange' && document.visibilityState === 'visible') {
      void this.model.refreshPasskeys()
    }
  }

  private handleDeletePasskey(event: Event) {
    const data = (event.currentTarget as HTMLElement | null)?.dataset
    const credentialId = data?.['credentialId']
    if (credentialId) {
      void this.model.deletePasskey(credentialId)
    }
  }

  private handleTogglePasskeyGroup(event: Event) {
    const groupKey = (event.currentTarget as HTMLElement | null)?.dataset['groupKey']
    if (groupKey) {
      this.model.togglePasskeyGroup(groupKey)
    }
  }

  private renderPasskeySection(groups: PasskeyGroup[]) {
    if (groups.length === 0) {
      return nothing
    }

    return html`
      <section class="passkey-section">
        <div class="section-heading">
          <h2 class="section-title">${i18n('passkeys:vault-section-title')}</h2>
          <p class="section-description">${i18n('passkeys:vault-section-description')}</p>
        </div>
        <div class="passkey-list">${groups.map((group) => this.renderPasskeyGroup(group))}</div>
      </section>
    `
  }

  private renderPasskeyGroup(group: PasskeyGroup) {
    const primary = group.primary
    const primaryDeleting = this.model.passkeyIsDeleting(primary)
    const expanded = this.model.isPasskeyGroupExpanded(group.key)

    return html`
      <div class="passkey-group">
        <div class="passkey-row">
          <div class="passkey-primary">
            <div class="passkey-title-row">
              <span class="passkey-title">${group.accountLabel}</span>
              <span class="passkey-badge passkey-badge--vault"> ${this.model.passkeyStorageLabel()} </span>
              ${group.duplicates.length > 0
                ? html`
                    <span class="passkey-badge">
                      ${i18n('passkeys:duplicate-badge', {
                        count: String(group.duplicates.length),
                      })}
                    </span>
                  `
                : nothing}
            </div>
            <div class="passkey-meta-grid">
              <span class="passkey-meta">${group.rpId}</span>
              <span class="passkey-meta">
                ${i18n('passkeys:last-used', {
                  value: this.model.passkeyLastUsedLabel(primary),
                })}
              </span>
              <span class="passkey-meta">
                ${i18n('passkeys:created', {
                  value: this.model.passkeyCreatedLabel(primary),
                })}
              </span>
              <span class="passkey-meta">
                ${i18n('passkeys:sign-count', {
                  value: this.model.passkeySignCountLabel(primary),
                })}
              </span>
            </div>
          </div>
          <div class="passkey-actions">
            ${group.duplicates.length > 0
              ? html`
                  <cv-button
                    variant="default"
                    data-group-key=${group.key}
                    aria-expanded=${expanded ? 'true' : 'false'}
                    @click=${this.handleTogglePasskeyGroup}
                  >
                    ${expanded ? i18n('passkeys:hide-duplicates') : i18n('passkeys:show-duplicates')}
                  </cv-button>
                `
              : nothing}
            <cv-button
              variant="danger"
              data-credential-id=${primary.credentialIdB64Url}
              ?disabled=${primaryDeleting}
              .loading=${primaryDeleting}
              @click=${this.handleDeletePasskey}
            >
              ${this.model.passkeyDeleteActionLabel()}
            </cv-button>
          </div>
        </div>
        ${expanded
          ? html`
              <div class="passkey-duplicates">
                ${group.duplicates.map((duplicate) => this.renderPasskeyDuplicate(duplicate))}
              </div>
            `
          : nothing}
      </div>
    `
  }

  private renderPasskeyDuplicate(duplicate: PasskeySummary) {
    const duplicateDeleting = this.model.passkeyIsDeleting(duplicate)

    return html`
      <div class="passkey-duplicate-row">
        <div class="passkey-primary">
          <span class="passkey-title">
            ${i18n('passkeys:local-credential', {
              id: this.model.passkeyShortCredentialId(duplicate),
            })}
          </span>
          <div class="passkey-meta-grid">
            <span class="passkey-meta">
              ${i18n('passkeys:last-used', {
                value: this.model.passkeyLastUsedLabel(duplicate),
              })}
            </span>
            <span class="passkey-meta">
              ${i18n('passkeys:created', {
                value: this.model.passkeyCreatedLabel(duplicate),
              })}
            </span>
            <span class="passkey-meta">
              ${i18n('passkeys:sign-count', {
                value: this.model.passkeySignCountLabel(duplicate),
              })}
            </span>
          </div>
        </div>
        <div class="passkey-actions">
          <cv-button
            variant="danger"
            data-credential-id=${duplicate.credentialIdB64Url}
            ?disabled=${duplicateDeleting}
            .loading=${duplicateDeleting}
            @click=${this.handleDeletePasskey}
          >
            ${this.model.passkeyDeleteActionLabel()}
          </cv-button>
        </div>
      </div>
    `
  }

  protected render() {
    const passkeyGroups = this.model.passkeyGroups()
    const hasPasskeys = passkeyGroups.length > 0
    const passkeysLoading = this.model.passkeysLoading()
    const passkeysError = this.model.passkeysError()

    return html`
      <div class="page">
        <section class="card">
          <cv-guidance-anchor anchor-id="passkeys.manage" surface="passkeys" owner="passkeys">
            <div class="passkey-explainer">
              <span class="passkey-explainer-icon" aria-hidden="true">
                <cv-icon name="octicons:passkey-fill" fill></cv-icon>
              </span>
              <div class="passkey-explainer-copy">
                <h2 class="passkey-explainer-title">${i18n('passkeys:explainer-title')}</h2>
                <p class="passkey-explainer-description">${i18n('passkeys:explainer-description')}</p>
              </div>
            </div>
          </cv-guidance-anchor>

          ${this.model.isAvailable()
            ? html`
                ${passkeysError
                  ? html`<cv-callout class="passkeys-callout" variant="warning" density="dense" role="alert">
                      ${passkeysError}
                    </cv-callout>`
                  : nothing}
                ${passkeysLoading
                  ? html`<p class="description">${i18n('passkeys:loading')}</p>`
                  : !hasPasskeys
                    ? html`
                        <cv-empty-state
                          icon="octicons:passkey-fill"
                          icon-fill
                          headline=${i18n('passkeys:empty')}
                          description=${i18n('passkeys:empty-description')}
                        ></cv-empty-state>
                        ${renderGuidanceInline('passkeys.manage', 'passkeys')}
                      `
                    : html` <div class="passkey-sections">${this.renderPasskeySection(passkeyGroups)}</div> `}
                ${hasPasskeys ? html`<p class="description">${i18n('passkeys:delete-note')}</p>` : nothing}
              `
            : html`<p class="description">${i18n('passkeys:unsupported')}</p>`}
        </section>
      </div>
    `
  }
}
