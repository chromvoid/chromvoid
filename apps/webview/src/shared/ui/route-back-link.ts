import {html, nothing, type TemplateResult} from 'lit'

export type RouteBackLinkOptions = {
  hidden?: boolean
  label: string
  onBack: (event: Event) => void
}

export function renderRouteBackLink({
  hidden = false,
  label,
  onBack,
}: RouteBackLinkOptions): TemplateResult | typeof nothing {
  if (hidden) {
    return nothing
  }

  return html`
    <cv-button unstyled class="back-link" @click=${onBack}>
      <cv-icon slot="prefix" name="arrow-left"></cv-icon>
      ${label}
    </cv-button>
  `
}
