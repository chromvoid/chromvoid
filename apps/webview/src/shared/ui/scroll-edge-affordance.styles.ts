import {css} from 'lit'

export const scrollEdgeAffordanceStyles = css`
  .scroll-edge-frame {
    --cv-scroll-edge-block-size: var(--cv-scroll-edge-default-block-size);
    --cv-scroll-edge-inline-start: var(--cv-scroll-edge-default-inline-start);
    --cv-scroll-edge-inline-end: var(--cv-scroll-edge-default-inline-end);
    --cv-scroll-edge-surface: var(--cv-scroll-edge-default-surface);
    --cv-scroll-edge-surface-fade: var(--cv-scroll-edge-default-surface-fade);

    position: relative;
    min-block-size: 0;
    min-inline-size: 0;
    overflow: hidden;
    isolation: isolate;
  }

  .scroll-edge-frame::before,
  .scroll-edge-frame::after {
    content: '';
    position: absolute;
    z-index: 3;
    pointer-events: none;
    inset-inline-start: var(--cv-scroll-edge-inline-start);
    inset-inline-end: var(--cv-scroll-edge-inline-end);
    block-size: var(--cv-scroll-edge-block-size);
    opacity: 0;
    transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .scroll-edge-frame::before {
    inset-block-start: 0;
    background: linear-gradient(
      to bottom,
      var(--cv-scroll-edge-surface),
      var(--cv-scroll-edge-surface-fade) 42%,
      transparent
    );
  }

  .scroll-edge-frame::after {
    inset-block-end: 0;
    background: linear-gradient(
      to bottom,
      transparent,
      var(--cv-scroll-edge-surface-fade) 58%,
      var(--cv-scroll-edge-surface)
    );
  }

  .scroll-edge-frame[data-scroll-block-start='true']::before {
    opacity: 1;
  }

  .scroll-edge-frame[data-scroll-block-end='true']::after {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .scroll-edge-frame::before,
    .scroll-edge-frame::after {
      transition: none;
    }
  }
`
