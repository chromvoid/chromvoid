import { html, ReatomLitElement } from "@chromvoid/uikit/reatom-lit";
import { CVDropzone } from "@chromvoid/uikit/components/cv-dropzone";
import { CVIcon } from "@chromvoid/uikit/components/cv-icon";

import { css } from "lit";

import { i18n } from "root/i18n";
import { sharedStyles } from "root/shared/ui/shared-styles";

export class DashboardDropzone extends ReatomLitElement {
  static define() {
    CVDropzone.define();
    CVIcon.define();
    if (!customElements.get("dashboard-dropzone")) {
      customElements.define("dashboard-dropzone", this);
    }
  }

  static get properties() {
    return {
      active: { type: Boolean },
      message: { type: String },
      loading: { type: Boolean },
    };
  }

  declare active: boolean;
  declare message: string;
  declare loading: boolean;

  constructor() {
    super();
    this.active = false;
    this.message = "";
    this.loading = false;
  }

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        position: relative;
        block-size: 100%;
        flex: 1;
        min-block-size: 0;
      }

      cv-dropzone {
        block-size: 100%;
        display: flex;
        flex-direction: column;
        --cv-dropzone-overlay-padding: var(--app-spacing-4);
        --cv-dropzone-overlay-border: 2px dashed var(--cv-color-primary-border);
        --cv-dropzone-overlay-radius: var(--cv-radius-4);
        --cv-dropzone-overlay-background: color-mix(
          in oklab,
          var(--cv-color-primary-surface) 82%,
          var(--app-editorial-surface-base, var(--cv-color-bg))
        );
        --cv-dropzone-overlay-color: var(--cv-color-primary);
      }

      cv-dropzone::part(base),
      cv-dropzone::part(content) {
        block-size: 100%;
        display: flex;
        flex-direction: column;
      }

      cv-dropzone::part(overlay) {
        inset: var(--app-spacing-2);
        z-index: 2;
        font-size: var(--cv-font-size-sm);
        box-shadow: inset 0 0 0 1px var(--cv-color-primary-ring);
      }

      cv-dropzone[active]::part(content) {
        opacity: 1;
      }

      cv-dropzone::part(loading-overlay) {
        z-index: 1;
      }

      .drop-message {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--app-spacing-2);
        color: inherit;
        font-weight: var(--cv-font-weight-semibold);

        cv-icon {
          font-size: 32px;
        }
      }

      /*Responsive sizes for overlay*/
      @media (max-width: 768px) {
        cv-dropzone::part(overlay) {
          font-size: 1.1em;
          padding: var(--app-spacing-3);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        cv-dropzone::part(content),
        cv-dropzone::part(overlay) {
          transition-duration: var(--cv-duration-instant, 0ms);
        }
      }
    `,
  ];

  render() {
    const message = this.message || i18n("file-manager:drop-files-here" as any);
    const loadingLabel = i18n("loading" as any);

    return html`
      <cv-dropzone
        .active=${this.active}
        .loading=${this.loading}
        .message=${message}
        .loadingLabel=${loadingLabel}
      >
        <div slot="message" class="drop-message">
          <cv-icon name="upload" aria-hidden="true"></cv-icon>
          <span>${message}</span>
        </div>
        <slot></slot>
      </cv-dropzone>
    `;
  }
}
