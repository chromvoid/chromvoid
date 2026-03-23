import {css} from 'lit'

export const pmEntryCardStyles = css`
  :host {
    container-type: inline-size;
  }

  cv-input{
    width: 100%;
  }
  .title {
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--cv-space-2);
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-base);
    font-weight: var(--cv-font-weight-semibold);

    cv-icon {
      color: var(--cv-color-primary);
      font-size: var(--cv-font-size-base);
    }

    .text {
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .title-avatar {
      inline-size: 24px;
      block-size: 24px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: var(--cv-font-size-sm);
      font-weight: var(--cv-font-weight-semibold);
      color: white;
      background: var(--entry-avatar-bg, color-mix(in oklch, var(--cv-color-primary), black 10%));
      box-shadow: var(--cv-shadow-sm);
    }

    &:has(.hidden) {
      .hidden {
        display: none;
      }
    }
  }

  .form-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--cv-space-2);
    padding: var(--cv-space-2) var(--cv-space-3);
    background: color-mix(in oklch, var(--cv-color-surface-2) 85%, var(--cv-color-primary) 5%);
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-2);
    position: sticky;
    inset-block-start: 0;
    z-index: 10;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 2px 8px color-mix(in oklch, black 10%, transparent);

    .title {
      flex: 1 1 auto;
      min-inline-size: 0;
    }

    .header-actions {
      flex: 0 0 auto;
      display: flex;
      gap: calc(var(--cv-space-2) * 0.75);
      position: static;
      inset-block-start: unset;
      background: transparent;
      border: none;
      padding: 0;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  .entry-header {
    display: grid;
    grid-template-columns: max-content auto;
    align-items: center;
    gap: var(--cv-space-2);
  }

  .title-main {
    display: inline-flex;
    align-items: center;
    gap: var(--cv-space-2);
    min-width: 0;
  }

  .entry-meta-badges {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--cv-space-2) * 0.75);
  }

  .entry-quick-actions {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--cv-space-2) * 0.75);
  }

  .actions-footer {
    position: sticky;
    bottom: 0;
    background: var(--cv-color-surface);
    border-top: 1px solid var(--cv-color-border);
    padding: var(--cv-space-2) var(--cv-space-3);
  }

  .wrapper,
  form {
    display: grid;
    gap: var(--cv-space-4);
  }

  label {
    display: block;
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-medium);
    margin-bottom: var(--cv-space-2);
  }

  strong {
    font-weight: normal;
  }

  .edit-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--cv-space-4);

    sl-button::part(base) {
      font-weight: var(--cv-font-weight-semibold);
    }
  }

  .actions {
    display: flex;
    gap: var(--cv-space-2);
    flex-wrap: wrap;

    sl-button {
      flex: 0 0 auto;
    }
  }

  @container (width < 370px) {
    .title {
      font-size: var(--cv-font-size-base);
    }

    .entry-header {
      grid-template-columns: 1fr auto;

      .title-avatar {
        display: none;
      }
    }

    .actions {
      display: grid;
      justify-content: stretch;
      gap: var(--cv-space-2);
    }

    .edit-actions {
      gap: var(--cv-space-2);
    }

    .header-actions {
      flex-direction: column;
      align-items: stretch;
      gap: calc(var(--cv-space-2) * 0.75);
      padding: calc(var(--cv-space-2) * 0.75) var(--cv-space-2);
      margin: calc(var(--cv-space-2) * 0.75) 0;

      cv-button {
        width: 100%;
        min-height: 36px;
        padding: calc(var(--cv-space-2) * 0.75) var(--cv-space-2);
      }
    }
  }

  .error-text {
    color: var(--cv-color-danger);
    font-weight: var(--cv-font-weight-medium);
    font-size: var(--cv-font-size-sm);
  }

  cv-input[data-has-error] {
    &::part(input),
    &::part(base) {
      border-color: var(--cv-color-danger);
      box-shadow: inset 0 0 0 1px var(--cv-color-danger);
    }

    &:focus-within {
      &::part(input),
      &::part(base) {
        border-color: var(--cv-color-danger);
        box-shadow: inset 0 0 0 2px color-mix(in oklch, var(--cv-color-danger) 50%, transparent);
      }
    }
  }
`
