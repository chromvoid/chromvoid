import {css} from 'lit'

import {hostContainStyles} from 'root/shared/ui/shared-styles'
import {pmSharedStyles} from '../../../styles/shared'

const pmCardHeaderCommonStyles = css`
  .content {
    flex: 1;
    min-inline-size: 0;
    display: flex;
    flex-direction: column;
  }

  .actions {
    display: flex;
    flex-shrink: 0;
  }
`

export const pmCardHeaderBaseStyles = [hostContainStyles, pmCardHeaderCommonStyles]

export const pmCardHeaderDesktopStyles = [
  ...pmSharedStyles,
  ...pmCardHeaderBaseStyles,
  css`
    .header {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      align-items: start;
      gap: var(--cv-space-3);
      padding: var(--cv-space-3) var(--cv-space-4);
      background: var(--cv-gradient-surface);
      border: 1px solid var(--cv-color-border);
      border-radius: var(--cv-radius-3);
      box-shadow: var(--cv-shadow-2);
      position: relative;
      overflow: hidden;

      &::before {
        content: '';
        position: absolute;
        inset-block-start: 0;
        inset-inline: 0;
        block-size: 3px;
        background: var(--cv-header-accent, var(--cv-color-primary));
      }
    }

    .avatar {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      flex-shrink: 0;
      inline-size: 48px;
      block-size: 48px;
      ::slotted(*) {
        inline-size: 100%;
        block-size: 100%;
        border-radius: var(--cv-radius-2);
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        overflow: hidden;
      }

      ::slotted(pm-avatar-icon) {
        --pm-avatar-radius: inherit;
        --pm-avatar-image-fit: contain;
        --pm-avatar-image-padding: clamp(4px, 12%, 8px);
        --pm-avatar-contrast: var(--pm-avatar-contrast-base);
        --pm-avatar-shadow-opacity: 36%;
        --pm-avatar-letter-size: var(--cv-font-size-lg);
      }
    }

    .content {
      gap: calc(var(--cv-space-2) * 0.75);
    }

    .actions {
      align-items: flex-start;
      gap: calc(var(--cv-space-2) * 0.75);
    }

    @container (width < 480px) {
      .header {
        grid-template-columns: auto auto 1fr auto;
        gap: var(--cv-space-2);
        padding: 10px 12px;
        border-radius: var(--cv-radius-2);
        box-shadow: var(--cv-shadow-1);

        &::before {
          block-size: 2px;
        }
      }

      .avatar {
        inline-size: 36px;
        block-size: 36px;
      }

      .avatar ::slotted(*) {
        border-radius: var(--cv-radius-1);
      }

      .avatar ::slotted(pm-avatar-icon) {
        --pm-avatar-letter-size: var(--cv-font-size-base);
      }

      .actions {
        gap: 4px;
      }
    }

    @container (width >= 600px) {
      .header {
        padding: var(--cv-space-4);
      }

      .avatar {
        inline-size: 56px;
        block-size: 56px;
      }

      .avatar ::slotted(pm-avatar-icon) {
        --pm-avatar-letter-size: 1.5rem;
      }
    }

    @container (width >= 1000px) {
      .header {
        padding: var(--cv-space-6);
      }

      .avatar {
        inline-size: 64px;
        block-size: 64px;
      }

      .avatar ::slotted(pm-avatar-icon) {
        --pm-avatar-letter-size: 1.75rem;
      }
    }
  `,
]

export const pmCardHeaderMobileStyles = [
  ...pmCardHeaderBaseStyles,
  css`
    .header {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      background: color-mix(
        in oklch,
        var(--cv-color-surface-2) 92%,
        var(--cv-header-accent, var(--cv-color-primary)) 8%
      );
      border: 1px solid color-mix(in oklch, var(--cv-color-border) 78%, transparent);
      border-radius: var(--cv-radius-2);
      box-shadow: var(--cv-shadow-1);
    }

    .header::before {
      content: '';
      position: absolute;
      inset-inline-start: 0;
      inset-block-start: 8px;
      inset-block-end: 8px;
      inline-size: 3px;
      border-radius: 0 999px 999px 0;
      background: var(--cv-header-accent, var(--cv-color-primary));
      opacity: 0.7;
    }

    .content {
      gap: 4px;
      padding-inline-start: 8px;
    }

    .actions {
      align-items: center;
      gap: 4px;
      padding-block-start: 2px;
    }
  `,
]
