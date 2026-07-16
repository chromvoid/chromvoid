import {css} from 'lit'

export const scrollEdgeAffordanceStyles = css`
  .scroll-edge-frame {
    --app-scroll-edge-mask-block-size: var(
      --app-scroll-edge-block-size,
      var(--app-scroll-edge-default-block-size)
    );
    --app-scroll-edge-mask-soft-stop: calc(var(--app-scroll-edge-mask-block-size) * 0.55);
    --app-scroll-edge-mask-subtle-stop: calc(var(--app-scroll-edge-mask-block-size) * 0.25);

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
    inset-inline-start: var(--app-scroll-edge-inline-start, var(--app-scroll-edge-default-inline-start));
    inset-inline-end: var(--app-scroll-edge-inline-end, var(--app-scroll-edge-default-inline-end));
    block-size: var(--app-scroll-edge-block-size, var(--app-scroll-edge-default-block-size));
    opacity: 0;
    transition: opacity var(--cv-duration-fast) var(--cv-easing-standard);
  }

  .scroll-edge-frame::before {
    inset-block-start: 0;
    background: linear-gradient(
      to bottom,
      var(--app-scroll-edge-surface, var(--app-scroll-edge-default-surface)),
      var(--app-scroll-edge-surface-fade, var(--app-scroll-edge-default-surface-fade)) 42%,
      transparent
    );
  }

  .scroll-edge-frame::after {
    inset-block-end: 0;
    background: linear-gradient(
      to bottom,
      transparent,
      var(--app-scroll-edge-surface-fade, var(--app-scroll-edge-default-surface-fade)) 58%,
      var(--app-scroll-edge-surface, var(--app-scroll-edge-default-surface))
    );
  }

  .scroll-edge-frame[data-scroll-block-start='true']::before {
    opacity: 1;
  }

  .scroll-edge-frame[data-scroll-block-end='true']::after {
    opacity: 1;
  }

  @supports ((mask-image: var(--app-scroll-edge-mask-gradient-block-end)) or (-webkit-mask-image: var(--app-scroll-edge-mask-gradient-block-end))) {
    .scroll-edge-frame[data-scroll-edge-treatment='mask']:has(> .scroll-edge-scroller)::before,
    .scroll-edge-frame[data-scroll-edge-treatment='mask']:has(> .scroll-edge-scroller)::after {
      display: none;
    }

    .scroll-edge-frame[data-scroll-edge-treatment='mask'] > .scroll-edge-scroller {
      -webkit-mask-image: none;
      mask-image: none;
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-size: 100% 100%;
      mask-size: 100% 100%;
      -webkit-mask-mode: alpha;
      mask-mode: alpha;
    }

    .scroll-edge-frame[data-scroll-edge-treatment='mask'][data-scroll-block-start='false'][data-scroll-block-end='true']
      > .scroll-edge-scroller {
      -webkit-mask-image: var(--app-scroll-edge-mask-gradient-block-end);
      mask-image: var(--app-scroll-edge-mask-gradient-block-end);
    }

    .scroll-edge-frame[data-scroll-edge-treatment='mask'][data-scroll-block-start='true'][data-scroll-block-end='false']
      > .scroll-edge-scroller {
      -webkit-mask-image: var(--app-scroll-edge-mask-gradient-block-start);
      mask-image: var(--app-scroll-edge-mask-gradient-block-start);
    }

    .scroll-edge-frame[data-scroll-edge-treatment='mask'][data-scroll-block-start='true'][data-scroll-block-end='true']
      > .scroll-edge-scroller {
      -webkit-mask-image: var(--app-scroll-edge-mask-gradient-block-both);
      mask-image: var(--app-scroll-edge-mask-gradient-block-both);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scroll-edge-frame::before,
    .scroll-edge-frame::after {
      transition: none;
    }
  }
`
