import {css} from 'lit'

export const scrollEdgeAffordanceStyles = css`
  .scroll-edge-frame {
    --cv-scroll-edge-block-size: var(--cv-scroll-edge-default-block-size);
    --cv-scroll-edge-inline-start: var(--cv-scroll-edge-default-inline-start);
    --cv-scroll-edge-inline-end: var(--cv-scroll-edge-default-inline-end);
    --cv-scroll-edge-surface: var(--cv-scroll-edge-default-surface);
    --cv-scroll-edge-surface-fade: var(--cv-scroll-edge-default-surface-fade);
    --cv-scroll-edge-mask-block-size: var(--cv-scroll-edge-block-size);
    --cv-scroll-edge-mask-soft-stop: calc(var(--cv-scroll-edge-mask-block-size) * 0.55);
    --cv-scroll-edge-mask-subtle-stop: calc(var(--cv-scroll-edge-mask-block-size) * 0.25);

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

  @supports ((mask-image: var(--cv-gradient-scroll-edge-mask-block-end)) or (-webkit-mask-image: var(--cv-gradient-scroll-edge-mask-block-end))) {
    .scroll-edge-frame:has(> .scroll-edge-scroller)::before,
    .scroll-edge-frame:has(> .scroll-edge-scroller)::after {
      display: none;
    }

    .scroll-edge-frame > .scroll-edge-scroller {
      --cv-scroll-edge-mask: none;
      -webkit-mask-image: var(--cv-scroll-edge-mask);
      mask-image: var(--cv-scroll-edge-mask);
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-size: 100% 100%;
      mask-size: 100% 100%;
      -webkit-mask-mode: alpha;
      mask-mode: alpha;
    }

    .scroll-edge-frame[data-scroll-block-start='false'][data-scroll-block-end='true'] > .scroll-edge-scroller {
      --cv-scroll-edge-mask: var(--cv-gradient-scroll-edge-mask-block-end);
    }

    .scroll-edge-frame[data-scroll-block-start='true'][data-scroll-block-end='false'] > .scroll-edge-scroller {
      --cv-scroll-edge-mask: var(--cv-gradient-scroll-edge-mask-block-start);
    }

    .scroll-edge-frame[data-scroll-block-start='true'][data-scroll-block-end='true'] > .scroll-edge-scroller {
      --cv-scroll-edge-mask: var(--cv-gradient-scroll-edge-mask-block-both);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scroll-edge-frame::before,
    .scroll-edge-frame::after {
      transition: none;
    }
  }
`
