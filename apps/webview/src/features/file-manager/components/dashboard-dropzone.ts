import { html, ReatomLitElement } from "@chromvoid/uikit/reatom-lit";
import { CVDropzone } from "@chromvoid/uikit/components/cv-dropzone";

import { css } from "lit";

import { i18n } from "root/i18n";
import { sharedStyles } from "root/shared/ui/shared-styles";

export class DashboardDropzone extends ReatomLitElement {
  static define() {
    CVDropzone.define();
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
      }

      cv-dropzone::part(base),
      cv-dropzone::part(content) {
        block-size: 100%;
        display: flex;
        flex-direction: column;
      }

      cv-dropzone::part(overlay) {
        z-index: 1000;
        font-size: 1.2em;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }

      cv-dropzone::part(loading-overlay) {
        z-index: 999;
      }

      /* dropZonePulse: removed — infinite animation hurt responsiveness */

      /*Touch devices - improved visualization*/
      @media (hover: none) and (pointer: coarse) {
        cv-dropzone::part(overlay) {
          border-width: 4px;
          font-size: 1.4em;
          padding-block: var(--app-spacing-4);
        }
      }

      /*Responsive sizes for overlay*/
      @media (max-width: 768px) {
        cv-dropzone::part(overlay) {
          font-size: 1.1em;
          padding: var(--app-spacing-3);
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
        <slot></slot>
      </cv-dropzone>
    `;
  }
}
