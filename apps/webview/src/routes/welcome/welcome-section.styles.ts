import {css} from 'lit'

export const welcomeSectionHostStyles = css`
  :host {
    display: block;
  }
`

export const welcomeSectionCalloutStyles = css`
  cv-callout {
    font-size: 0.875rem;
    line-height: 1.4;
  }
`

export const welcomeSectionMobileButtonStyles = css`
  :host([layout='mobile']) .welcome-actions cv-button::part(base),
  :host([layout='mobile']) .remote-actions cv-button::part(base),
  :host([layout='mobile']) .setup-card cv-button::part(base),
  :host([layout='mobile']) .step cv-button::part(base),
  :host([layout='mobile']) .mobile-panel-body cv-button::part(base),
  :host([layout='mobile']) .tool-actions cv-button::part(base) {
    min-block-size: 52px;
    justify-content: center;
  }
`
