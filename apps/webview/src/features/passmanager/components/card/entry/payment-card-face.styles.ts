import {css} from 'lit'

export const paymentCardFaceStyles = css`
  .payment-card-surface {
    gap: var(--cv-space-4);
  }

  .payment-card-form-stack {
    display: grid;
    gap: var(--cv-space-3);
  }

  .payment-card-face {
    position: relative;
    display: grid;
    gap: clamp(0.75rem, 2.2vw, 1rem);
    min-block-size: 13.5rem;
    padding: clamp(1rem, 2.8vw, 1.35rem);
    border-radius: 1.5rem;
    overflow: hidden;
    background: var(--cv-gradient-card-face);
    border: 1px solid var(--cv-color-border-glass);
    box-shadow:
      0 12px 28px var(--cv-alpha-black-20),
      inset 0 1px 0 var(--cv-alpha-white-15);
    color: var(--cv-color-text-strongest);
    aspect-ratio: 1.586;
  }

  .payment-card-face::before,
  .payment-card-face::after {
    content: '';
    position: absolute;
    border-radius: 999px;
    pointer-events: none;
    opacity: 0.8;
  }

  .payment-card-face::before {
    inset-inline-start: 68%;
    inset-block-start: -22%;
    inline-size: 11rem;
    block-size: 11rem;
    background: var(--cv-gradient-card-orb-primary);
  }

  .payment-card-face::after {
    inset-inline-end: -10%;
    inset-block-end: -26%;
    inline-size: 10rem;
    block-size: 10rem;
    background: var(--cv-gradient-card-orb-secondary);
  }

  .payment-card-face > * {
    position: relative;
    z-index: 1;
  }

  .payment-card-face-top,
  .payment-card-chip-row,
  .payment-card-face-bottom {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--cv-space-3);
  }

  .payment-card-issuer-block,
  .payment-card-meta-block {
    display: grid;
    gap: 0.35rem;
    min-inline-size: 0;
  }

  .payment-card-brand-cluster {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    min-inline-size: 0;
  }

  .payment-card-meta-block-compact {
    text-align: right;
    justify-items: end;
  }

  .payment-card-caption {
    font-size: 0.61rem;
    line-height: 1;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--cv-color-text-muted);
  }

  .payment-card-issuer,
  .payment-card-brand,
  .payment-card-meta-value,
  .payment-card-number,
  .payment-card-cvv-value,
  .payment-card-inline-input {
    text-shadow: 0 1px 2px var(--cv-alpha-black-20);
  }

  .payment-card-issuer {
    display: block;
    max-inline-size: 100%;
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .payment-card-inline-input {
    inline-size: 100%;
    min-inline-size: 0;
    box-sizing: border-box;
    padding: 0.12rem 0.2rem;
    border: none;
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font: inherit;
    outline: none;
    caret-color: var(--cv-color-primary);
    transition:
      background 160ms var(--cv-easing-standard),
      box-shadow 160ms var(--cv-easing-standard);
  }

  .payment-card-inline-input::placeholder {
    color: var(--cv-alpha-white-50);
  }

  .payment-card-inline-input:focus-visible {
    outline: none;
    background: var(--cv-color-surface-glass-subtle);
    box-shadow: inset 0 0 0 1px var(--cv-color-primary);
  }

  .payment-card-inline-input.is-invalid {
    background: var(--cv-color-danger-surface);
    box-shadow: inset 0 0 0 1px var(--cv-color-danger);
  }

  .payment-card-inline-input.is-invalid:focus-visible {
    box-shadow:
      inset 0 0 0 1px var(--cv-color-danger),
      0 0 0 3px var(--cv-color-danger-ring);
  }

  .payment-card-inline-input[type='password'] {
    letter-spacing: 0.32em;
  }

  .payment-card-brand {
    display: inline-flex;
    align-items: center;
    justify-content: end;
    min-inline-size: 0;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--cv-color-text-strongest);
  }

  .payment-card-inline-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 1.8rem;
    block-size: 1.8rem;
    padding: 0;
    border: 1px solid var(--cv-color-border-glass);
    border-radius: var(--cv-radius-pill);
    background: var(--cv-color-surface-glass-subtle);
    color: var(--cv-color-text-strongest);
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      transform 0.2s ease;
  }

  .payment-card-inline-action cv-icon {
    font-size: 0.88rem;
  }

  .payment-card-inline-copy {
    --cv-copy-button-size: 1.8rem;
    --cv-copy-button-border-radius: var(--cv-radius-pill);
    --cv-copy-button-color: var(--cv-color-text-strongest);
    --cv-copy-button-plain-hover-background: var(--cv-color-surface-glass);
    --cv-copy-button-plain-hover-color: var(--cv-color-text-strongest);
    flex: 0 0 auto;
  }

  .payment-card-inline-action:hover {
    background: var(--cv-color-surface-glass);
    border-color: var(--cv-color-border-soft);
  }

  .payment-card-inline-action:active {
    transform: scale(0.96);
  }

  .payment-card-inline-action:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: 2px;
  }

  .payment-card-chip {
    display: grid;
    gap: 0.22rem;
    inline-size: 3.2rem;
    block-size: 2.45rem;
    padding: 0.45rem;
    border-radius: 0.7rem;
    background: var(--cv-gradient-card-chip-soft);
    box-shadow:
      inset 0 1px 0 var(--cv-alpha-white-15),
      0 4px 12px var(--cv-alpha-black-14);
  }

  .payment-card-chip-line {
    block-size: 0.26rem;
    border-radius: 999px;
    background: var(--cv-alpha-black-35);
  }

  .payment-card-chip-line.short {
    inline-size: 68%;
  }

  .payment-card-cvv-badge {
    display: grid;
    gap: 0.25rem;
    padding: 0.5rem 0.7rem;
    border-radius: 0.95rem;
    background: var(--cv-color-surface-glass);
    border: 1px solid var(--cv-color-border-glass);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: inset 0 1px 0 var(--cv-alpha-white-10);
  }

  .payment-card-cvv-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
  }

  .payment-card-cvv-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .payment-card-cvv-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 1.55rem;
    block-size: 1.55rem;
    padding: 0;
    border: 1px solid var(--cv-color-border-glass);
    border-radius: var(--cv-radius-pill);
    background: var(--cv-color-surface-glass-subtle);
    color: var(--cv-color-text-strongest);
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      transform 0.2s ease;
  }

  .payment-card-cvv-toggle cv-icon {
    font-size: 0.82rem;
  }

  .payment-card-cvv-toggle:hover {
    background: var(--cv-color-surface-glass);
    border-color: var(--cv-color-border-soft);
  }

  .payment-card-cvv-toggle[aria-pressed='true'] {
    background: var(--cv-color-surface-secondary-glass);
    border-color: var(--cv-color-border-soft);
  }

  .payment-card-cvv-toggle:active {
    transform: scale(0.96);
  }

  .payment-card-cvv-toggle:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: 2px;
  }

  .payment-card-number-block {
    display: grid;
    gap: 0.55rem;
    margin-block: auto 0;
  }

  .payment-card-number-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cv-space-3);
  }

  .payment-card-number {
    display: block;
    font-family: var(--cv-font-family-code);
    font-size: clamp(1.05rem, 2.8vw, 1.38rem);
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: 0.18em;
    word-spacing: 0.1em;
  }

  .payment-card-inline-input-number {
    padding-block: 0.1rem;
  }

  .payment-card-meta-value {
    font-family: var(--cv-font-family-code);
    font-size: clamp(0.84rem, 2vw, 0.96rem);
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .payment-card-expiry-inputs {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.42rem;
  }

  .payment-card-inline-input-expiry {
    inline-size: 3.7ch;
    padding-inline: 0.28rem;
    text-align: center;
  }

  .payment-card-inline-input-expiry[name='payment-card-exp-year'] {
    inline-size: 5.45ch;
  }

  .payment-card-expiry-separator {
    font-family: var(--cv-font-family-code);
    font-size: clamp(0.84rem, 2vw, 0.96rem);
    font-weight: 600;
    line-height: 1;
    opacity: 0.92;
  }

  .payment-card-cvv-value {
    font-family: var(--cv-font-family-code);
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    justify-self: end;
  }

  .payment-card-inline-input-cvv {
    inline-size: 4.4ch;
    padding-inline: 0.24rem;
  }

  .payment-card-cvv-value.is-masked {
    letter-spacing: 0.32em;
  }

  .payment-card-number.is-placeholder,
  .payment-card-cvv-value.is-placeholder {
    color: var(--cv-alpha-white-50);
  }

  .payment-card-number.is-loading,
  .payment-card-cvv-value.is-loading {
    display: block;
    border-radius: 999px;
    background: var(--cv-gradient-card-shimmer);
    background-size: 200% 100%;
  }

  .payment-card-number.is-loading {
    inline-size: min(20rem, 100%);
    block-size: 1.45rem;
  }

  .payment-card-cvv-value.is-loading {
    inline-size: 2.9rem;
    block-size: 0.95rem;
  }
`

export const paymentCardFaceMobileStyles = css`
  @container (width < 440px) {
    .payment-card-face {
      min-block-size: 12.5rem;
      padding: 0.95rem 1rem 1rem;
      gap: 0.72rem;
      aspect-ratio: 1.42;
    }

    .payment-card-face::before {
      inline-size: 8.75rem;
      block-size: 8.75rem;
      inset-inline-start: 72%;
      inset-block-start: -18%;
    }

    .payment-card-face::after {
      inline-size: 8.1rem;
      block-size: 8.1rem;
      inset-inline-end: -8%;
      inset-block-end: -18%;
    }

    .payment-card-face-top,
    .payment-card-chip-row,
    .payment-card-face-bottom {
      gap: var(--cv-space-2);
    }

    .payment-card-brand-cluster {
      gap: 0.35rem;
    }

    .payment-card-caption {
      font-size: 0.54rem;
      letter-spacing: 0.14em;
    }

    .payment-card-issuer {
      font-size: 0.82rem;
    }

    .payment-card-brand {
      font-size: 0.92rem;
      letter-spacing: 0.08em;
    }

    .payment-card-inline-action {
      inline-size: 1.65rem;
      block-size: 1.65rem;
    }

    .payment-card-inline-copy {
      --cv-copy-button-size: 1.65rem;
    }

    .payment-card-inline-action cv-icon {
      font-size: 0.8rem;
    }

    .payment-card-chip {
      inline-size: 2.9rem;
      block-size: 2.2rem;
      padding: 0.4rem;
      border-radius: 0.64rem;
    }

    .payment-card-cvv-badge {
      padding: 0.42rem 0.56rem;
    }

    .payment-card-cvv-actions {
      gap: 0.2rem;
    }

    .payment-card-cvv-toggle {
      inline-size: 1.4rem;
      block-size: 1.4rem;
    }

    .payment-card-cvv-toggle cv-icon {
      font-size: 0.76rem;
    }

    .payment-card-number-block {
      gap: 0.46rem;
    }

    .payment-card-number-head {
      gap: var(--cv-space-2);
    }

    .payment-card-number {
      font-size: 1.02rem;
      letter-spacing: 0.13em;
      word-spacing: 0.02em;
    }

    .payment-card-meta-value,
    .payment-card-expiry-separator {
      font-size: 0.78rem;
    }

    .payment-card-cvv-value {
      font-size: 0.82rem;
      letter-spacing: 0.16em;
    }

    .payment-card-cvv-value.is-masked {
      letter-spacing: 0.24em;
    }
  }

  @container (width < 360px) {
    .payment-card-face {
      min-block-size: 12.75rem;
      padding: 0.82rem 0.86rem 0.9rem;
      gap: 0.62rem;
      aspect-ratio: 1.28;
      border-radius: 1.25rem;
    }

    .payment-card-face::before {
      inline-size: 7rem;
      block-size: 7rem;
    }

    .payment-card-face::after {
      inline-size: 6.6rem;
      block-size: 6.6rem;
      inset-block-end: -14%;
    }

    .payment-card-caption {
      font-size: 0.5rem;
      letter-spacing: 0.12em;
    }

    .payment-card-issuer {
      font-size: 0.76rem;
    }

    .payment-card-brand {
      font-size: 0.84rem;
      letter-spacing: 0.07em;
    }

    .payment-card-inline-action {
      inline-size: 1.55rem;
      block-size: 1.55rem;
    }

    .payment-card-inline-copy {
      --cv-copy-button-size: 1.55rem;
    }

    .payment-card-chip {
      inline-size: 2.65rem;
      block-size: 2rem;
      padding: 0.34rem;
      border-radius: 0.58rem;
    }

    .payment-card-number {
      font-size: 0.92rem;
      letter-spacing: 0.08em;
      word-spacing: 0;
    }

    .payment-card-meta-value,
    .payment-card-expiry-separator {
      font-size: 0.72rem;
    }

    .payment-card-cvv-value {
      font-size: 0.76rem;
      letter-spacing: 0.14em;
    }

    .payment-card-cvv-value.is-masked {
      letter-spacing: 0.2em;
    }
  }
`
