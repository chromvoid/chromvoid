import {css} from 'lit'

export const routeCalloutStyles = css`
  cv-callout.route-callout {
    text-align: var(--app-route-callout-text-align);
  }

  cv-callout.route-callout::part(base) {
    justify-content: var(--app-route-callout-base-justify-content);
    line-height: var(--app-route-callout-base-line-height);
  }

  cv-callout.route-callout::part(message) {
    display: grid;
    gap: var(--app-spacing-2);
    min-inline-size: 0;
    overflow-wrap: var(--app-route-callout-message-overflow-wrap);
  }

  .route-callout-title {
    display: var(--app-route-callout-title-display);
    align-items: var(--app-route-callout-title-align-items);
    gap: var(--app-route-callout-title-gap);
    color: var(--app-route-callout-title-color, var(--cv-color-text));
    font-weight: var(--cv-font-weight-semibold);
  }

  .route-callout-title cv-icon {
    flex-shrink: 0;
  }

  .route-callout-text {
    color: var(--cv-color-text-muted);
    line-height: var(--app-route-callout-text-line-height, 1.5);
  }
`
