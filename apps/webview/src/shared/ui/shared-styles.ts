import {type CSSResult, css} from 'lit'

import {sharedStyles as baseSharedStyles} from './base-shared-styles'

// Local extensions to basic styles @chromvoid/ui. Remove duplication of basic normalize/utility,
// We leave only additional optimizations and utilities specific to the application.
export const sharedStyles: CSSResult[] = [
  ...baseSharedStyles,
  css`
    :host {
      --app-spacing: var(--app-spacing-4);
    }

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
      padding: var(--app-spacing);
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
    cv-button:focus-within,
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

export const pageFadeInStyles: CSSResult = css`
  @keyframes page-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`

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

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(var(--motion-fade-up-distance, 12px));
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* pulse: removed — infinite animation hurt responsiveness */

  @keyframes reveal {
    from {
      opacity: var(--motion-reveal-start-opacity, 0);
      transform: var(--motion-reveal-start-transform, none);
    }
    to {
      opacity: var(--motion-reveal-end-opacity, 1);
      transform: var(--motion-reveal-end-transform, none);
    }
  }

  /* floatY, shimmer, progressShimmer: removed — infinite animations hurt responsiveness */

  :host {
    --motion-reveal-start-opacity: 0;
    --motion-reveal-end-opacity: 1;
    --motion-spin-duration: 1s;
    --motion-spin-easing: linear;
    --motion-reveal-animation: reveal 0.4s var(--motion-reveal-easing, var(--cv-easing-standard, ease-in-out)) both;
    --motion-reveal-easing: var(--cv-easing-standard, ease-in-out);
    --motion-fade-up-animation: fadeInUp 0.35s var(--motion-fade-up-easing, var(--cv-easing-standard, ease-in-out)) both;
    --motion-fade-up-easing: var(--cv-easing-standard, ease-in-out);
    --motion-fade-animation: fadeIn 0.2s ease-out;
    --motion-zoom-animation: zoomIn 0.2s ease-out;
    --motion-float-animation: none;
    --motion-page-reveal-animation: reveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
`

export const animationStyles: CSSResult = motionPrimitiveStyles

export const functionalMotionStyles: CSSResult = css`
  @keyframes motion-text-swap-in {
    from {
      opacity: 0;
      transform: translateY(var(--motion-text-swap-distance, 6px));
      filter: blur(var(--motion-text-swap-blur, 2px));
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
      transform: translateY(var(--motion-number-pop-distance, 4px)) scale(var(--motion-number-pop-scale, 0.92));
      filter: blur(var(--motion-number-pop-blur, 2px));
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
      transform: scale(var(--motion-icon-swap-scale, 0.78));
      filter: blur(var(--motion-icon-swap-blur, 2px));
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
    transform: translateY(var(--motion-panel-reveal-distance, -8px));
    filter: blur(var(--motion-panel-reveal-blur, 2px));
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

export const pageTransitionStyles: CSSResult = css`
  :host {
    animation: page-fade-in var(--cv-duration-normal, 200ms) var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1)) both;
  }

  @media (prefers-reduced-motion: reduce) {
    :host {
      animation: none;
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
  :host {
    --file-manager-section-accent: var(--gradient-primary);
    --file-manager-section-title-bg: linear-gradient(
      135deg,
      var(--cv-color-surface) 0%,
      var(--cv-color-surface-2) 100%
    );
  }

  :host::before {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: 0;
    block-size: 3px;
    background: var(--file-manager-section-accent);
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
    background: var(--file-manager-section-title-bg);

    &::before {
      content: '';
      inline-size: 4px;
      block-size: 16px;
      background: var(--file-manager-section-accent);
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
    animation: spin var(--motion-spin-duration, 1s) var(--motion-spin-easing, linear) infinite;
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
