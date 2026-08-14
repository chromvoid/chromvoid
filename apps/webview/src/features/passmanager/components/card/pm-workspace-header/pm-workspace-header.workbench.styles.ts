import {css} from 'lit'

export const pmWorkspaceHeaderWorkbenchStyles = css`
  .workspace-header[data-density='workbench'] {
    gap: 4px;
    padding-block: 0;
  }

  .workspace-header[data-density='workbench'] .workspace-context-band {
    gap: var(--cv-space-2);
    min-block-size: 20px;
    font-size: 9px;
    letter-spacing: 0.1em;
  }

  .workspace-header[data-density='workbench'] .workspace-context-kicker cv-breadcrumb {
    --cv-breadcrumb-gap: 2px;
  }

  .workspace-header[data-density='workbench'] .workspace-context-kicker cv-breadcrumb-item {
    --cv-breadcrumb-item-font-size: 9px;
    --cv-breadcrumb-item-gap: 4px;
    --cv-breadcrumb-item-link-min-block-size: 20px;
    --cv-breadcrumb-item-link-padding-block: 0;
    --cv-breadcrumb-item-link-padding-inline: 4px;
  }

  .workspace-header[data-density='workbench'] .workspace-head {
    gap: var(--cv-space-3);
    align-items: center;
  }

  .workspace-header[data-density='workbench'] .workspace-title-block {
    gap: var(--cv-space-2);
    min-block-size: 44px;
    padding-block: 4px;
  }

  .workspace-header[data-density='workbench'] .title-avatar-icon,
  .workspace-header[data-density='workbench'] .title-avatar-picker {
    inline-size: 36px;
    block-size: 36px;
    flex-basis: 36px;
    --pm-avatar-icon-size: 16px;
  }

  .workspace-header[data-density='workbench'] .title-avatar-picker {
    --pm-icon-picker-trigger-size: 36px;
  }

  .workspace-header[data-density='workbench'] .title-content {
    gap: 2px;
  }

  .workspace-header[data-density='workbench'] .title-row {
    align-items: center;
    gap: var(--cv-space-2);
  }

  .workspace-header[data-density='workbench'] .title-text,
  .workspace-header[data-density='workbench'] .title-input,
  .workspace-header[data-density='workbench'] .title-input::part(input) {
    font-size: 1.125rem;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }

  .workspace-header[data-density='workbench'] .title-summary {
    max-inline-size: min(64ch, 100%);
    overflow: hidden;
    font-size: 12px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workspace-header[data-density='workbench'] .workspace-head-actions {
    align-self: center;
    padding-block-start: 0;
  }

  .workspace-header[data-density='workbench'].has-inline-support .workspace-title-block {
    align-items: flex-start;
    padding-block: var(--cv-space-2);
  }

  .workspace-header[data-density='workbench'].has-inline-support .title-content {
    gap: var(--cv-space-2);
    padding-block-start: 0;
  }
`
