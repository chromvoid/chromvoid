import {css} from 'lit'

export const appGuidanceHostStyles = css`
  :host {
    display: contents;
    --app-guidance-z-index: calc(var(--cv-z-overlay, 1000) + 24);
    --app-guidance-overlay-color: var(--cv-color-overlay);
  }

  cv-popover {
    --cv-popover-z-index: var(--app-guidance-z-index, 80);
    --cv-popover-padding: 0;
    --cv-popover-min-inline-size: min(320px, calc(100vw - 40px));
    --cv-popover-max-inline-size: min(360px, calc(100vw - 40px));
    --cv-popover-border-radius: 14px;
  }

  cv-popover cv-guidance-panel {
    inline-size: min(340px, calc(100vw - 40px));
    --cv-guidance-panel-padding-inline: 22px;
    --cv-guidance-panel-padding-block: 20px;
    --cv-guidance-panel-gap: 16px;
    --cv-guidance-panel-border-radius: 14px;
    --cv-guidance-panel-border-color: var(--cv-color-info-border-strong);
    --cv-guidance-panel-background: var(--cv-color-surface-elevated);
    --cv-guidance-panel-shadow:
      var(--cv-shadow-xl),
      inset 0 1px 0 var(--cv-alpha-white-6);
    --cv-guidance-panel-title-font-size: 17px;
    --cv-guidance-panel-title-line-height: 1.22;
    --cv-guidance-panel-body-line-height: 1.55;
    --cv-guidance-panel-body-color: var(--cv-color-text-muted);
  }

  cv-guidance-panel button[data-guidance-action] {
    min-block-size: 34px;
    padding: 0 14px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: var(--cv-color-text);
    font: inherit;
    font-size: 13px;
    font-weight: 650;
    line-height: 1;
    cursor: pointer;
  }

  cv-guidance-panel button[data-guidance-action]:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: 2px;
  }

  cv-guidance-panel button[data-guidance-action='primary'] {
    background: var(--cv-color-primary);
    color: var(--cv-color-on-primary);
    box-shadow: 0 0 0 1px var(--cv-color-primary-border-strong);
  }

  cv-guidance-panel button[data-guidance-action='primary']:hover {
    background: var(--cv-color-primary-dark);
  }

  cv-guidance-panel button[data-guidance-action='secondary'] {
    border-color: var(--cv-color-border);
    background: var(--cv-color-surface-highlight);
  }

  cv-guidance-panel button[data-guidance-action='secondary']:hover {
    background: var(--cv-color-hover);
  }

  cv-guidance-panel button[data-guidance-action='close'] {
    min-inline-size: 30px;
    min-block-size: 30px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--cv-color-text-muted);
  }

  cv-guidance-panel button[data-guidance-action='close']:hover {
    background: var(--cv-color-hover);
    color: var(--cv-color-text);
  }

  cv-guidance-panel button[data-guidance-action='close'] cv-icon {
    inline-size: 16px;
    block-size: 16px;
  }

  .guidance-backdrop {
    position: fixed;
    inset: 0;
    z-index: calc(var(--app-guidance-z-index, 1024) - 1);
    padding: 0;
    border: 0;
    background: var(--app-guidance-overlay-color);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
  }

  .guidance-backdrop:focus-visible {
    outline: 2px solid var(--cv-color-primary);
    outline-offset: -4px;
  }

  cv-bottom-sheet cv-guidance-panel {
    --cv-guidance-panel-border-radius: 0;
    --cv-guidance-panel-border-color: transparent;
  }

  [part='fallback-focus'] {
    position: fixed;
    inline-size: 1px;
    block-size: 1px;
    inset-inline-start: 0;
    inset-block-start: 0;
    opacity: 0;
    pointer-events: none;
  }
`
