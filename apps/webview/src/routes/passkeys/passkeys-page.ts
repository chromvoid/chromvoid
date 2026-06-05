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
import {
  passkeysPageModel,
  type AndroidPasskeyGroup,
  type AndroidPasskeySummary,
} from './passkeys.model'

export class PasskeysPage extends ReatomLitElement {
  static elementName = 'passkeys-page'
  static define() {
    CvEmptyState.define()
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this)
    }
  }

  static properties = {
    hideBackLink: {type: Boolean, attribute: 'hide-back-link'},
  }

  declare hideBackLink: boolean

  private readonly model = passkeysPageModel

  constructor() {
    super()
    this.hideBackLink = false
  }

  static styles = [
    sharedStyles,
    pageTransitionStyles,
    pageFadeInStyles,
    hostLayoutPaintContainStyles,
    routeHostStyles,
    routePageStyles,
    css`
      .page {
        max-inline-size: 720px;
      }

      :host {
        display: block;
        block-size: 100%;
        min-block-size: 0;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
      }

      @media (max-width: 767px) {
        .page {
          box-sizing: border-box;
          padding-block-start: var(--app-spacing-4);
          padding-block-end: calc(
            var(--app-spacing-8) + var(--mobile-tab-bar-content-clearance, 64px)
          );
          padding-inline-start: max(var(--app-spacing-4), env(safe-area-inset-left));
          padding-inline-end: max(var(--app-spacing-4), env(safe-area-inset-right));
        }
      }

      .header {
        display: grid;
        gap: var(--app-spacing-2);
      }

      .back-link {
        display: inline-flex;
        align-items: center;
        gap: var(--app-spacing-2);
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-sm);
        cursor: pointer;
        text-decoration: none;
        border: 0;
        background: transparent;
        padding: 0;

        cv-icon {
          font-size: 16px;
        }

        &:hover {
          color: var(--cv-color-brand);
        }

        &:focus-visible {
          outline: 2px solid var(--cv-color-focus-ring, var(--cv-color-info));
          outline-offset: 4px;
          border-radius: var(--cv-radius-1);
        }
      }

      .title {
        font-size: clamp(1.25rem, 2.4cqi + 0.6rem, 1.9rem);
        font-weight: var(--cv-font-weight-bold);
        margin: 0;
      }

      .subtitle {
        margin: 0;
        color: var(--cv-color-text-muted);
        font-size: var(--cv-font-size-sm);
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
        background: color-mix(in oklab, var(--cv-color-info) 14%, transparent);

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
        color: var(--text-primary, #fff);
        font-size: var(--cv-font-size-sm);
        font-weight: var(--cv-font-weight-semibold);
      }

      .passkey-explainer-description {
        margin: 0;
        color: var(--text-tertiary, var(--cv-alpha-white-50));
        font-size: var(--cv-font-size-xs);
        overflow-wrap: anywhere;
      }

      .card {
        display: grid;
        gap: var(--app-spacing-4);
        background: var(--surface-elevated, #1f1f1f);
        border: 1px solid var(--border-subtle, var(--cv-alpha-white-8));
        border-radius: var(--cv-radius-lg, 12px);
        padding: var(--app-spacing-4);
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
        color: var(--text-primary, #fff);
        font-size: var(--cv-font-size-base);
        font-weight: var(--cv-font-weight-semibold);
      }

      .section-description {
        margin: 0;
        color: var(--text-tertiary, var(--cv-alpha-white-50));
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
        border: 1px solid var(--border-subtle, var(--cv-alpha-white-8));
        border-radius: var(--cv-radius-md, 8px);
        background: var(--surface-muted, #1a1a1a);
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
        border-block-start: 1px solid var(--border-subtle, var(--cv-alpha-white-8));
      }

      .passkey-primary {
        display: grid;
        min-inline-size: 0;
        gap: var(--app-spacing-1);
      }

      .passkey-title {
        color: var(--text-primary, #fff);
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
        color: var(--text-primary, #fff);
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
        color: var(--text-tertiary, var(--cv-alpha-white-50));
        font-size: var(--cv-font-size-xs);
        overflow-wrap: anywhere;
      }

      .passkey-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: var(--app-spacing-2);
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
      void this.model.refreshAndroidPasskeys()
      return
    }

    if (event.type === 'visibilitychange' && document.visibilityState === 'visible') {
      void this.model.refreshAndroidPasskeys()
    }
  }

  private handleBack() {
    this.model.goBack()
  }

  private handleDeleteAndroidPasskey(event: Event) {
    const data = (event.currentTarget as HTMLElement | null)?.dataset
    const credentialId = data?.['credentialId']
    if (credentialId) {
      void this.model.deletePasskey(credentialId)
    }
  }

  private handleToggleAndroidPasskeyGroup(event: Event) {
    const groupKey = (event.currentTarget as HTMLElement | null)?.dataset['groupKey']
    if (groupKey) {
      this.model.toggleAndroidPasskeyGroup(groupKey)
    }
  }

  private renderAndroidPasskeySection(groups: AndroidPasskeyGroup[]) {
    if (groups.length === 0) {
      return nothing
    }

    return html`
      <section class="passkey-section">
        <div class="section-heading">
          <h2 class="section-title">${i18n('passkeys:vault-section-title')}</h2>
          <p class="section-description">${i18n('passkeys:vault-section-description')}</p>
        </div>
        <div class="passkey-list">
          ${groups.map((group) => this.renderAndroidPasskeyGroup(group))}
        </div>
      </section>
    `
  }

  private renderAndroidPasskeyGroup(group: AndroidPasskeyGroup) {
    const primary = group.primary
    const primaryDeleting = this.model.androidPasskeyIsDeleting(primary)
    const expanded = this.model.isAndroidPasskeyGroupExpanded(group.key)

    return html`
      <div class="passkey-group">
        <div class="passkey-row">
          <div class="passkey-primary">
            <div class="passkey-title-row">
              <span class="passkey-title">${group.accountLabel}</span>
              <span class="passkey-badge passkey-badge--vault">
                ${this.model.androidPasskeyStorageLabel()}
              </span>
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
                  value: this.model.androidPasskeyLastUsedLabel(primary),
                })}
              </span>
              <span class="passkey-meta">
                ${i18n('passkeys:created', {
                  value: this.model.androidPasskeyCreatedLabel(primary),
                })}
              </span>
              <span class="passkey-meta">
                ${i18n('passkeys:sign-count', {
                  value: this.model.androidPasskeySignCountLabel(primary),
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
                    @click=${this.handleToggleAndroidPasskeyGroup}
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
              @click=${this.handleDeleteAndroidPasskey}
            >
              ${this.model.androidPasskeyDeleteActionLabel()}
            </cv-button>
          </div>
        </div>
        ${expanded
          ? html`
              <div class="passkey-duplicates">
                ${group.duplicates.map((duplicate) => this.renderAndroidPasskeyDuplicate(duplicate))}
              </div>
            `
          : nothing}
      </div>
    `
  }

  private renderAndroidPasskeyDuplicate(duplicate: AndroidPasskeySummary) {
    const duplicateDeleting = this.model.androidPasskeyIsDeleting(duplicate)

    return html`
      <div class="passkey-duplicate-row">
        <div class="passkey-primary">
          <span class="passkey-title">
            ${i18n('passkeys:local-credential', {
              id: this.model.androidPasskeyShortCredentialId(duplicate),
            })}
          </span>
          <div class="passkey-meta-grid">
            <span class="passkey-meta">
              ${i18n('passkeys:last-used', {
                value: this.model.androidPasskeyLastUsedLabel(duplicate),
              })}
            </span>
            <span class="passkey-meta">
              ${i18n('passkeys:created', {
                value: this.model.androidPasskeyCreatedLabel(duplicate),
              })}
            </span>
            <span class="passkey-meta">
              ${i18n('passkeys:sign-count', {
                value: this.model.androidPasskeySignCountLabel(duplicate),
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
            @click=${this.handleDeleteAndroidPasskey}
          >
            ${this.model.androidPasskeyDeleteActionLabel()}
          </cv-button>
        </div>
      </div>
    `
  }

  protected render() {
    const androidPasskeyGroups = this.model.androidPasskeyGroups()
    const hasAndroidPasskeys = androidPasskeyGroups.length > 0
    const androidPasskeysLoading = this.model.androidPasskeysLoading()
    const androidPasskeysError = this.model.androidPasskeysError()

    return html`
      <div class="page">
        <div class="header">
          ${this.hideBackLink
            ? nothing
            : html`<cv-button unstyled class="back-link" @click=${this.handleBack}>
                <cv-icon slot="prefix" name="arrow-left"></cv-icon>
                ${i18n('nav:back')}
              </cv-button>`}
          <h1 class="title">${i18n('passkeys:title')}</h1>
          <p class="subtitle">${i18n('passkeys:description')}</p>
        </div>

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
                ${androidPasskeysError
                  ? html`<cv-callout class="passkeys-callout" variant="warning" density="dense" role="alert">
                      ${androidPasskeysError}
                    </cv-callout>`
                  : nothing}

                ${androidPasskeysLoading
                  ? html`<p class="description">${i18n('passkeys:loading')}</p>`
                  : !hasAndroidPasskeys
                    ? html`
                        <cv-empty-state
                          icon="octicons:passkey-fill"
                          icon-fill
                          headline=${i18n('passkeys:empty')}
                        >
                          ${renderGuidanceInline('passkeys.manage', 'passkeys')}
                        </cv-empty-state>
                      `
                    : html`
                        <div class="passkey-sections">
                          ${this.renderAndroidPasskeySection(androidPasskeyGroups)}
                        </div>
                      `}
                <p class="description">${i18n('passkeys:delete-note')}</p>
              `
            : html`<p class="description">${i18n('passkeys:unsupported')}</p>`}
        </section>
      </div>
    `
  }
}
