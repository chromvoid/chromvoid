import briefcaseSvg from 'root/assets/icons/lucide/briefcase.svg?raw'
import codeSvg from 'root/assets/icons/lucide/code.svg?raw'
import folderSvg from 'root/assets/icons/lucide/folder.svg?raw'
import globeSvg from 'root/assets/icons/lucide/globe.svg?raw'
import homeSvg from 'root/assets/icons/lucide/home.svg?raw'
import layersSvg from 'root/assets/icons/lucide/layers.svg?raw'
import shieldSvg from 'root/assets/icons/lucide/shield.svg?raw'
import starSvg from 'root/assets/icons/lucide/star.svg?raw'

import {pmIconStore} from '../../../models/pm-icon-store'

export const GROUP_ICON_PRESET_OPTIONS = [
  {id: 'folder', icon: 'folder', labelKey: 'group:icon:preset:folder'},
  {id: 'briefcase', icon: 'briefcase', labelKey: 'group:icon:preset:briefcase'},
  {id: 'home', icon: 'home', labelKey: 'group:icon:preset:home'},
  {id: 'shield', icon: 'shield', labelKey: 'group:icon:preset:shield'},
  {id: 'star', icon: 'star', labelKey: 'group:icon:preset:star'},
  {id: 'globe', icon: 'globe', labelKey: 'group:icon:preset:globe'},
  {id: 'code', icon: 'code', labelKey: 'group:icon:preset:code'},
  {id: 'layers', icon: 'layers', labelKey: 'group:icon:preset:layers'},
] as const

export const GROUP_ICON_COLOR_OPTIONS = [
  {id: 'violet', labelKey: 'group:icon:color:violet'},
  {id: 'green', labelKey: 'group:icon:color:green'},
  {id: 'blue', labelKey: 'group:icon:color:blue'},
  {id: 'pink', labelKey: 'group:icon:color:pink'},
  {id: 'amber', labelKey: 'group:icon:color:amber'},
  {id: 'orange', labelKey: 'group:icon:color:orange'},
  {id: 'cyan', labelKey: 'group:icon:color:cyan'},
] as const

export type GroupIconPresetName = (typeof GROUP_ICON_PRESET_OPTIONS)[number]['id']
export type GroupIconColorName = (typeof GROUP_ICON_COLOR_OPTIONS)[number]['id']

export type GroupIconPresetSelection = {
  icon: GroupIconPresetName
  color: GroupIconColorName
}

export const DEFAULT_GROUP_ICON_PRESET: GroupIconPresetSelection = {
  icon: 'folder',
  color: 'violet',
}

const ICON_SOURCES: Record<GroupIconPresetName, string> = {
  folder: folderSvg,
  briefcase: briefcaseSvg,
  home: homeSvg,
  shield: shieldSvg,
  star: starSvg,
  globe: globeSvg,
  code: codeSvg,
  layers: layersSvg,
}

function requireThemeColor(value: string, token: string): string {
  if (!value) {
    throw new Error(`Missing theme color token: ${token}`)
  }
  return value
}

function readPresetBackground(color: GroupIconColorName, styles: CSSStyleDeclaration): string {
  switch (color) {
    case 'violet':
      return styles.getPropertyValue('--cv-color-accent').trim()
    case 'green':
      return styles.getPropertyValue('--cv-color-success').trim()
    case 'blue':
      return styles.getPropertyValue('--cv-color-group-icon-blue').trim()
    case 'pink':
      return styles.getPropertyValue('--cv-color-group-icon-pink').trim()
    case 'amber':
      return styles.getPropertyValue('--cv-color-warning').trim()
    case 'orange':
      return styles.getPropertyValue('--cv-color-group-icon-orange').trim()
    case 'cyan':
      return styles.getPropertyValue('--cv-color-primary').trim()
  }
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function extractSvgBody(source: string): string {
  return source.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i)?.[1]?.trim() ?? ''
}

function buildPresetSvg(selection: GroupIconPresetSelection): string {
  const iconBody = extractSvgBody(ICON_SOURCES[selection.icon])
  if (!iconBody) {
    throw new Error(`Unknown group icon preset: ${selection.icon}`)
  }

  const styles = getComputedStyle(document.documentElement)
  const background = escapeXmlAttribute(
    requireThemeColor(readPresetBackground(selection.color, styles), `group icon ${selection.color}`),
  )
  const foreground = escapeXmlAttribute(
    requireThemeColor(
      styles.getPropertyValue('--cv-color-accent-contrast').trim(),
      '--cv-color-accent-contrast',
    ),
  )

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <!-- @license lucide-static v0.562.0 - ISC -->
  <rect width="128" height="128" rx="32" fill="${background}" />
  <g transform="translate(22 22) scale(3.5)" fill="none" stroke="${foreground}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${iconBody}
  </g>
</svg>`
}

export const groupPresetIconService = {
  async upload(selection: GroupIconPresetSelection): Promise<string> {
    const file = new File([buildPresetSvg(selection)], `group-${selection.icon}-${selection.color}.svg`, {
      type: 'image/svg+xml',
    })
    return pmIconStore.uploadIcon(file)
  },
}
