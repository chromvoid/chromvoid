import {css} from 'lit'

export const pmEntryOtpCreateStyles = css`
  @supports (-webkit-touch-callout: none) {
    @media (hover: none) and (pointer: coarse) {
      cv-input::part(input),
      cv-number::part(input),
      cv-select::part(trigger) {
        font-size: 16px;
      }
    }
  }

  :host([short]) .short-hide {
    display: none;
  }

  .otp-create {
    display: grid;
    gap: 0.625rem;
    padding: 0.625rem;
    margin: 0;
    background: color-mix(in oklch, var(--cv-color-surface-2) 92%, var(--cv-color-primary) 8%);
    border: 1px solid color-mix(in oklch, var(--cv-color-border) 80%, var(--cv-color-primary) 20%);
    border-radius: var(--cv-radius-2);
  }

  .select-field {
    display: grid;
    gap: 0.25rem;
  }

  .select-field > h4 {
    padding-bottom: 0;
  }

  h4 {
    margin: 0;
    padding: 0 0 4px 0;
    font-size: 0.75rem;
    font-weight: var(--cv-font-weight-semibold);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--cv-color-text-muted);
  }

  h3 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--cv-color-text);
  }

  cv-input::part(base),
  cv-number::part(base),
  cv-select::part(trigger) {
    border-color: color-mix(in oklch, var(--cv-color-border) 82%, transparent);
    background: color-mix(in oklch, var(--cv-color-surface) 92%, black 8%);
  }

  cv-select {
    --cv-select-inline-size: 100%;
  }

  [slot='help-text'] {
    font-size: 0.6875rem;
    color: var(--cv-color-danger);
  }

  sl-details::part(content) {
    padding-block-start: 5px;
  }
`
