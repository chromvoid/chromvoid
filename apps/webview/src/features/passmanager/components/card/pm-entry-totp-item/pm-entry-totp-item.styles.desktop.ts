import {css} from 'lit'

export const pmEntryTOTPItemDesktopStyles = css`
  @container (width < 400px) {
    .totp-content {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .totp-digit {
      min-width: 24px;
      height: 28px;
      font-size: calc(var(--cv-font-size-base) * 0.95);
    }

    .totp-arc-timer {
      display: none;
    }

    .totp-actions {
      flex-direction: row;
      justify-content: flex-end;

      cv-button::part(base) {
        block-size: 28px;
        inline-size: 28px;
        min-inline-size: 28px;
      }

      cv-copy-button {
        --cv-copy-button-size: 28px;
      }
    }
  }
`
