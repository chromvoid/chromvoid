import {css} from 'lit'

export const appGuidanceHostStyles = css`
  :host {
    display: contents;
    --app-guidance-z-index: calc(var(--cv-z-overlay, 1000) + 24);
    --app-guidance-overlay-color: color-mix(
      in oklab,
      var(--cv-color-overlay, rgba(0, 0, 0, 0.72)) 82%,
      transparent
    );
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
    --cv-guidance-panel-border-color: color-mix(
      in oklab,
      var(--cv-color-info, #65d7ff) 34%,
      var(--cv-color-border, #2a3245)
    );
    --cv-guidance-panel-background: color-mix(
      in oklab,
      var(--cv-color-surface-elevated, #1d2432) 92%,
      var(--cv-color-info, #65d7ff)
    );
    --cv-guidance-panel-shadow:
      0 20px 56px rgba(0, 0, 0, 0.42),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    --cv-guidance-panel-title-font-size: 17px;
    --cv-guidance-panel-title-line-height: 1.22;
    --cv-guidance-panel-body-line-height: 1.55;
    --cv-guidance-panel-body-color: color-mix(
      in oklab,
      var(--cv-color-text-muted, #bac4d8) 88%,
      var(--cv-color-text, #e8ecf6)
    );
  }

  cv-guidance-panel button[data-guidance-action] {
    min-block-size: 34px;
    padding: 0 14px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: var(--cv-color-text, #e8ecf6);
    font: inherit;
    font-size: 13px;
    font-weight: 650;
    line-height: 1;
    cursor: pointer;
  }

  cv-guidance-panel button[data-guidance-action]:focus-visible {
    outline: 2px solid var(--cv-color-primary, #65d7ff);
    outline-offset: 2px;
  }

  cv-guidance-panel button[data-guidance-action='primary'] {
    background: var(--cv-color-primary, #65d7ff);
    color: var(--cv-color-on-primary, #06131a);
    box-shadow: 0 0 0 1px color-mix(in oklab, var(--cv-color-primary, #65d7ff) 70%, transparent);
  }

  cv-guidance-panel button[data-guidance-action='primary']:hover {
    background: color-mix(in oklab, var(--cv-color-primary, #65d7ff) 86%, white);
  }

  cv-guidance-panel button[data-guidance-action='secondary'] {
    border-color: var(--cv-color-border, #2a3245);
    background: rgba(255, 255, 255, 0.04);
  }

  cv-guidance-panel button[data-guidance-action='secondary']:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  cv-guidance-panel button[data-guidance-action='close'] {
    min-inline-size: 30px;
    min-block-size: 30px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--cv-color-text-muted, #bac4d8);
  }

  cv-guidance-panel button[data-guidance-action='close']:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--cv-color-text, #e8ecf6);
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
