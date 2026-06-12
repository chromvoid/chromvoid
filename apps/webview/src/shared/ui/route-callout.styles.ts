import {css} from 'lit'

export const routeCalloutStyles = css`
  cv-callout.route-callout {
    text-align: var(--route-callout-text-align);
  }

  cv-callout.route-callout::part(base) {
    justify-content: var(--route-callout-base-justify-content);
    line-height: var(--route-callout-base-line-height);
  }

  cv-callout.route-callout::part(message) {
    display: grid;
    gap: var(--route-callout-message-gap, var(--app-spacing-2));
    min-inline-size: 0;
    overflow-wrap: var(--route-callout-message-overflow-wrap);
  }

  .route-callout-title {
    display: var(--route-callout-title-display);
    align-items: var(--route-callout-title-align-items);
    gap: var(--route-callout-title-gap);
    color: var(--route-callout-title-color, var(--cv-color-text));
    font-weight: var(--cv-font-weight-semibold);
  }

  .route-callout-title cv-icon {
    flex-shrink: 0;
  }

  .route-callout-text {
    color: var(--cv-color-text-muted);
    line-height: var(--route-callout-text-line-height, 1.5);
  }
`
