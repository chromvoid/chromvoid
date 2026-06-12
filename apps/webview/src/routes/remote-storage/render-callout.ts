import {type TemplateResult} from 'lit'
import {renderRouteCallout, type RouteCalloutVariant} from 'root/shared/ui/route-callout'

type RemoteStorageCalloutVariant = RouteCalloutVariant

type RemoteStorageCalloutOptions = {
  variant?: RemoteStorageCalloutVariant
  icon?: string
  iconClass?: string
  title?: unknown
  text?: unknown
}

export function renderRemoteStorageCallout({
  variant = 'warning',
  icon,
  iconClass,
  title,
  text,
}: RemoteStorageCalloutOptions): TemplateResult {
  return renderRouteCallout({
    className: 'remote-storage-callout',
    variant,
    titleClassName: 'remote-storage-callout-title',
    textClassName: 'remote-storage-callout-text',
    icon,
    iconClassName: iconClass,
    title,
    text,
  })
}
