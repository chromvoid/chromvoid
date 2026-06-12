import {html, nothing, type TemplateResult} from 'lit'

export type RouteCalloutVariant = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

export type RouteCalloutOptions = {
  className: string
  variant: RouteCalloutVariant
  titleClassName: string
  textClassName: string
  density?: 'compact' | 'comfortable'
  extra?: TemplateResult
  icon?: string
  iconClassName?: string
  role?: 'alert' | 'status'
  text?: unknown
  title?: unknown
}

function renderRouteCalloutIcon(
  icon: string | undefined,
  iconClassName: string | undefined,
): TemplateResult | typeof nothing {
  return icon ? html`<cv-icon name=${icon} class=${iconClassName ?? ''}></cv-icon>` : nothing
}

export function renderRouteCallout({
  className,
  variant,
  titleClassName,
  textClassName,
  density = 'compact',
  extra,
  icon,
  iconClassName,
  role,
  text,
  title,
}: RouteCalloutOptions): TemplateResult {
  const calloutClass = `route-callout ${className}`
  const titleClass = `route-callout-title ${titleClassName}`
  const textClass = `route-callout-text ${textClassName}`

  return html`
    <cv-callout class=${calloutClass} variant=${variant} density=${density} role=${role ?? nothing}>
      ${title
        ? html`
            <span class=${titleClass}>
              ${renderRouteCalloutIcon(icon, iconClassName)}
              ${title}
            </span>
          `
        : nothing}
      ${text === undefined || text === null ? nothing : html`<span class=${textClass}>${text}</span>`}
      ${extra ?? nothing}
    </cv-callout>
  `
}
