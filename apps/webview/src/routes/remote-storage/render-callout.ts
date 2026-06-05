import {html, nothing, type TemplateResult} from 'lit'

type RemoteStorageCalloutVariant = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

type RemoteStorageCalloutOptions = {
  variant?: RemoteStorageCalloutVariant
  icon?: string
  iconClass?: string
  title?: unknown
  text?: unknown
}

function renderCalloutIcon(icon: string | undefined, iconClass: string | undefined): TemplateResult | typeof nothing {
  return icon ? html`<cv-icon name=${icon} class=${iconClass ?? ''}></cv-icon>` : nothing
}

export function renderRemoteStorageCallout({
  variant = 'warning',
  icon,
  iconClass,
  title,
  text,
}: RemoteStorageCalloutOptions): TemplateResult {
  return html`
    <cv-callout class="remote-storage-callout" variant=${variant} density="compact">
      ${title
        ? html`
            <span class="remote-storage-callout-title">
              ${renderCalloutIcon(icon, iconClass)}
              ${title}
            </span>
          `
        : nothing}
      ${text ? html`<span class="remote-storage-callout-text">${text}</span>` : nothing}
    </cv-callout>
  `
}
