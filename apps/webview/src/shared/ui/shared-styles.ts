import {type CSSResult, css} from 'lit'

import {sharedStyles as baseSharedStyles} from './base-shared-styles'

// Local extensions to basic styles @chromvoid/ui. Remove duplication of basic normalize/utility,
// We leave only additional optimizations and utilities specific to the application.
export const sharedStyles: CSSResult[] = [
  ...baseSharedStyles,
  css`
    /* ========== CONTAINMENT RULES ========== */
    .header-container {
      contain: layout paint style;
    }
    .scrollable-container {
      contain: layout paint;
      will-change: scroll-position;
    }
    .card,
    .panel {
      contain: layout style;
    }

    .card {
      padding: var(--app-spacing-4);
    }

    .animate-spin {
      will-change: transform;
    }

    .visibility-hidden {
      visibility: hidden;
    }
    .visibility-visible {
      visibility: visible;
    }

    /* ========== REDUCED MOTION ========== */
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }


    /*============= FOCUS-VISIBLE states =========================================================================================================================================================================================================================================*/

    /*Basic focus-visible for interactive elements*/
    .focus-ring:focus-visible,
    button:focus-visible,
    [role='button']:focus-visible,
    a:focus-visible,
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible {
      outline: 2px solid var(--cv-color-focus-ring, var(--cv-color-accent));
      outline-offset: 2px;
      border-radius: var(--cv-radius-1, 4px);
    }



  `,
]

export const motionPrimitiveStyles: CSSResult = css`
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* statusPulse, activityPulse: removed — infinite animations hurt responsiveness */

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes zoomIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* pulse: removed — infinite animation hurt responsiveness */

  /* floatY, shimmer, progressShimmer: removed — infinite animations hurt responsiveness */

`

export const animationStyles: CSSResult = motionPrimitiveStyles

export const functionalMotionStyles: CSSResult = css`
  @keyframes motion-text-swap-in {
    from {
      opacity: 0;
      transform: translateY(6px);
      filter: blur(2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
      filter: blur(0);
    }
  }

  @keyframes motion-number-pop-in {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.92);
      filter: blur(2px);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: blur(0);
    }
  }

  @keyframes motion-icon-swap-in {
    from {
      opacity: 0;
      transform: scale(0.78);
      filter: blur(2px);
    }
    to {
      opacity: 1;
      transform: scale(1);
      filter: blur(0);
    }
  }

  @keyframes motion-success-check-in {
    from {
      opacity: 0;
      transform: rotate(-8deg) scale(0.86);
      filter: blur(2px);
    }
    to {
      opacity: 1;
      transform: rotate(0) scale(1);
      filter: blur(0);
    }
  }

  .motion-panel-reveal {
    display: grid;
    grid-template-rows: 1fr;
    opacity: 1;
    overflow: hidden;
    transform: translateY(0);
    filter: blur(0);
    transition:
      grid-template-rows var(--cv-duration-normal) var(--cv-easing-decelerate),
      opacity var(--cv-duration-normal) var(--cv-easing-standard),
      transform var(--cv-duration-normal) var(--cv-easing-decelerate),
      filter var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .motion-panel-reveal[data-expanded='false'] {
    grid-template-rows: 0fr;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-8px);
    filter: blur(2px);
  }

  .motion-panel-reveal__inner {
    min-block-size: 0;
    overflow: hidden;
  }

  .motion-text-swap {
    display: inline-block;
    animation: motion-text-swap-in var(--cv-duration-fast) var(--cv-easing-decelerate) both;
    will-change: opacity, transform, filter;
  }

  .motion-number-pop,
  .motion-number-pop__digit {
    animation: motion-number-pop-in var(--cv-duration-fast) var(--cv-easing-decelerate) both;
    will-change: opacity, transform, filter;
  }

  .motion-icon-swap {
    animation: motion-icon-swap-in var(--cv-duration-fast) var(--cv-easing-standard) both;
    will-change: opacity, transform, filter;
  }

  .motion-success-check {
    animation: motion-success-check-in var(--cv-duration-normal) var(--cv-easing-decelerate) both;
    will-change: opacity, transform, filter;
  }

  @media (prefers-reduced-motion: reduce) {
    .motion-panel-reveal {
      transform: none;
      filter: none;
      transition:
        grid-template-rows var(--cv-duration-fast) var(--cv-easing-standard),
        opacity var(--cv-duration-fast) var(--cv-easing-standard);
    }

    .motion-panel-reveal[data-expanded='false'] {
      transform: none;
      filter: none;
    }

    .motion-text-swap,
    .motion-number-pop,
    .motion-number-pop__digit,
    .motion-icon-swap,
    .motion-success-check {
      transform: none;
      filter: none;
      animation: none;
      will-change: auto;
    }
  }
`

export const routePageStyles: CSSResult = css`
  .page {
    margin-inline: auto;
    display: grid;
    gap: var(--app-spacing-4);
  }

  .header {
    display: grid;
    gap: var(--app-spacing-2);
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: var(--app-spacing-2);
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
    cursor: pointer;
    text-decoration: none;
    border: 0;
    background: transparent;
    padding: 0;

    cv-icon {
      font-size: 16px;
    }

    &:hover {
      color: var(--cv-color-brand);
    }

    &:focus-visible {
      outline: 2px solid var(--cv-color-focus-ring, var(--cv-color-info));
      outline-offset: 4px;
      border-radius: var(--cv-radius-1);
    }
  }

  .title {
    font-size: clamp(1.25rem, 2.4cqi + 0.6rem, 1.9rem);
    font-weight: var(--cv-font-weight-bold);
    margin: 0;
  }

  .subtitle {
    margin: 0;
    color: var(--cv-color-text-muted);
    font-size: var(--cv-font-size-sm);
  }
`

export const routeHostStyles: CSSResult = css`
  :host {
    min-height: 100%;
    box-sizing: border-box;
  }
`

export const surfacePrimitiveStyles: CSSResult = css`
  :host::before {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: 0;
    block-size: 3px;
    background: var(--cv-gradient-primary);
    opacity: 0.7;
  }

  .section-title {
    color: var(--cv-color-text);
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-semibold);
    letter-spacing: 0.02em;
    display: flex;
    align-items: center;
    gap: var(--app-spacing-2);
    background: var(--cv-gradient-surface);

    &::before {
      content: '';
      inline-size: 4px;
      block-size: 16px;
      background: var(--cv-gradient-primary);
      border-radius: var(--cv-radius-1);
    }
  }

  .section-title .cv-icon {
    flex-shrink: 0;
  }
`

export const skeletonShimmerStyles: CSSResult = css`
  .skeleton,
  .skeleton-icon,
  .skeleton-title,
  .skeleton-subtitle {
    background-size: 200% 100%;
  }
`


/* Infinite pulse animations removed for perf — status is conveyed via color alone */
export const statusIndicatorAnimationStyles: CSSResult = css``

/* Infinite pulse animation removed for perf — no visual animation needed */
export const pulseIndicatorStyles: CSSResult = css``

export const spinIndicatorStyles: CSSResult = css`
  .spinner,
  .loading-spinner {
    animation: spin var(--app-motion-spin-duration) linear infinite;
  }
`

export const hostContainStyles: CSSResult = css`
  :host {
    display: block;
    contain: layout style;
  }
`

export const hostLayoutPaintContainStyles: CSSResult = css`
  :host {
    contain: layout style paint;
  }
`

export const hostContentContainStyles: CSSResult = css`
  :host {
    display: block;
    contain: content;
  }
`

export const cardShellStyles: CSSResult = css`
  :host {
    display: block;
    background: var(--cv-color-surface);
    border-radius: var(--cv-radius-2);
    box-shadow: var(--cv-shadow-1);
    overflow: hidden;
    position: relative;
    margin-block: var(--app-spacing-3);
  }
`
