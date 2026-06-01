import {css} from 'lit'

export const passwordManagerLayoutStyles = css`
  :host {
    font-size: var(--cv-font-size-lg);
    box-sizing: border-box;
    block-size: 100%;
    min-block-size: 0;
    container-type: inline-size;
  }

  .content {
    position: relative;
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    contain: layout style;
    overflow: hidden;
  }

  .pm-content {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
    min-inline-size: 0;
    contain: layout style;
    view-transition-name: pm-content;
    animation-duration: var(--cv-duration-normal);
    animation-timing-function: var(--cv-easing-standard);
    animation-fill-mode: both;
    will-change: transform, opacity;
  }

  .pm-content[data-motion-kind='none'] {
    animation: none;
    will-change: auto;
  }

  .pm-content[data-motion-direction='forward'] {
    animation-name: pm-content-forward;
  }

  .pm-content[data-motion-direction='back'] {
    animation-name: pm-content-back;
  }

  .pm-content[data-motion-direction='open'] {
    animation-name: pm-content-open;
    animation-timing-function: var(--cv-easing-decelerate);
  }

  .pm-content[data-motion-direction='close'] {
    animation-name: pm-content-close;
    animation-timing-function: var(--cv-easing-standard);
  }

  .pm-content[data-motion-direction='replace'] {
    animation-name: pm-content-replace;
  }

  @keyframes pm-content-forward {
    from {
      opacity: 0;
      transform: translateX(18px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes pm-content-back {
    from {
      opacity: 0;
      transform: translateX(-18px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes pm-content-open {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes pm-content-close {
    from {
      opacity: 0;
      transform: scale(1.01);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes pm-content-replace {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .card {
    flex: 1;
    min-block-size: 0;
    box-sizing: border-box;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .spinner-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    block-size: 100%;
  }

  .spinner {
    font-size: 4rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .pm-content {
      animation-duration: var(--cv-duration-fast);
      animation-timing-function: var(--cv-easing-standard);
    }

    .pm-content[data-motion-kind='surface-change'] {
      animation-name: pm-content-reduced-motion;
    }
  }

  @keyframes pm-content-reduced-motion {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`
