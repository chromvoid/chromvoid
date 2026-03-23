import {css} from 'lit'

export const pmEntryTOTPItemMobileStyles = css`
  .totp-card {
    padding: var(--cv-space-2);
    gap: var(--cv-space-2);
  }

  .totp-content {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'digits digits'
      'timer actions';
    align-items: center;
    gap: var(--cv-space-2);
  }

  .totp-digits {
    grid-area: digits;
    justify-content: space-between;
    gap: 5px;
    padding-inline: 0;
  }

  .totp-digit-group {
    gap: 4px;
  }

  .totp-digit {
    min-width: 24px;
    height: 30px;
    font-size: calc(var(--cv-font-size-base) * 1);
  }

  .totp-arc-timer {
    grid-area: timer;
    width: 30px;
    height: 30px;
  }

  .totp-arc-timer .arc-value {
    font-size: 9px;
  }

  .totp-actions {
    grid-area: actions;
    flex-direction: row;
    justify-content: flex-end;
    justify-self: end;

    cv-button::part(base) {
      block-size: 32px;
      inline-size: 32px;
      min-inline-size: 32px;
    }

    cv-copy-button {
      --cv-copy-button-size: 32px;
    }
  }
`
