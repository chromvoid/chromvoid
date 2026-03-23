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
`
