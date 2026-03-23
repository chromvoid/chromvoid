import {css} from 'lit'

/**
 * Стили для секции метаданных (создано/изменено)
 */
export const metadataSectionCSS = css`
  .metadata-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--cv-space-3);
    padding: var(--cv-space-3);
    background: var(--cv-color-surface-2);
    border: 1px solid var(--cv-color-border);
    border-radius: var(--cv-radius-2);
  }

  .metadata-section > div {
    display: flex;
    flex-direction: column;
    gap: calc(var(--cv-space-2) * 0.75);
  }

  .metadata-section label {
    font-size: var(--cv-font-size-xs);
    font-weight: var(--cv-font-weight-semibold);
    color: var(--cv-color-text);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.7;
  }

  .metadata-section strong {
    font-size: var(--cv-font-size-sm);
    font-weight: var(--cv-font-weight-medium);
    color: var(--cv-color-text);
  }

  @container (width < 480px) {
    .metadata-section {
      grid-template-columns: 1fr;
    }
  }
`

export default metadataSectionCSS
