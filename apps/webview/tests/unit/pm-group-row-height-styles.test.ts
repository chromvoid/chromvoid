import {describe, expect, it} from 'vitest'

import {
  pmEntryListItemBaseStyles,
  pmEntryListItemDesktopStyles,
  pmEntryListItemMobileStyles,
} from '../../src/features/passmanager/components/card/entry-list-item/styles'
import {pmGroupDesktopStyles} from '../../src/features/passmanager/components/group/group/group'
import {pmGroupMobileStyles} from '../../src/features/passmanager/components/group/group/group-mobile'
import {
  pmGroupCommonStyles,
  pmGroupListItemMobileStyles,
} from '../../src/features/passmanager/components/group/group/styles'
import {PMSearchMobile} from '../../src/features/passmanager/components/list/search-mobile'
import {PMOtpQuickViewMobile} from '../../src/features/passmanager/components/otp-quick-view'
import {otpQuickViewStyles} from '../../src/features/passmanager/components/otp-quick-view/otp-quick-view.styles'
import {pmSummaryRailStyles} from '../../src/features/passmanager/components/summary-rail'
import {pmMobileListRowStyles} from '../../src/features/passmanager/styles/mobile-list-row'
import {pmSharedStyles} from '../../src/features/passmanager/styles/shared'

function stylesToText(styles: unknown): string {
  if (Array.isArray(styles)) {
    return styles.map((style) => stylesToText(style)).join('\n')
  }

  if (typeof styles === 'object' && styles && 'cssText' in styles) {
    return String((styles as {cssText: string}).cssText)
  }

  return String(styles ?? '')
}

describe('desktop password row height styles', () => {
  it('defines a shared 48px row height token for desktop group rows', () => {
    const cssText = pmGroupDesktopStyles.cssText

    expect(cssText).toContain('--pm-desktop-list-row-height: 48px;')
    expect(cssText).toContain('grid-template-rows: min-content auto;')
    expect(cssText).toContain('block-size: var(--pm-desktop-list-row-height);')
    expect(cssText).toContain('block-size: calc(var(--pm-desktop-list-row-height) - 4px);')
    expect(cssText).not.toContain('group-header-row')
  })

  it('keeps group metrics as a summary rail host without changing row height tokens', () => {
    const cssText = pmGroupCommonStyles.cssText

    expect(cssText).toContain('.group-metrics-strip')
    expect(cssText).not.toContain('.group-metric {')
    expect(cssText).not.toContain('.group-metric-value')
    expect(cssText).toContain('.group-risk-dot')
    expect(cssText).toContain(".group-risk-dot[data-severity='warning']")
    expect(cssText).toContain(".group-risk-dot[data-severity='critical']")
  })

  it('defines the shared summary rail segmented style', () => {
    const cssText = pmSummaryRailStyles.cssText

    expect(cssText).toContain('.summary-rail')
    expect(cssText).toContain('inline-size: var(--pm-summary-rail-inline-size, auto);')
    expect(cssText).toContain('overflow-x: auto;')
    expect(cssText).toContain('box-sizing: border-box;')
    expect(cssText).toContain('scrollbar-width: none;')
    expect(cssText).toContain('.summary-rail::-webkit-scrollbar')
    expect(cssText).toContain('.summary-rail__chip + .summary-rail__chip::before')
    expect(cssText).toContain('font-family: var(--cv-font-family-code);')
    expect(cssText).toContain('text-transform: uppercase;')
    expect(cssText).toContain('font-variant-numeric: tabular-nums;')
  })

  it('lets desktop entry items fill the shared row height without adding a header rule', () => {
    const cssText = pmEntryListItemDesktopStyles.cssText

    expect(cssText).toContain('block-size: 100%;')
    expect(cssText).toContain('block-size: var(--pm-desktop-entry-row-inner-height, auto);')
    expect(cssText).toContain('min-block-size: var(--pm-desktop-entry-row-inner-height, 44px);')
  })

  it('keeps entry risk badge text on bright semantic colors', () => {
    const cssText = pmEntryListItemBaseStyles.map((style) => style.cssText).join('\n')

    expect(cssText).toContain('color: var(--cv-color-warning);')
    expect(cssText).toContain('color: var(--cv-color-danger);')
    expect(cssText).not.toContain('var(--cv-color-warning-text')
    expect(cssText).not.toContain('var(--cv-color-danger-text')
  })

  it('uses the same mobile row height token for group and entry rows', () => {
    const sharedCssText = pmMobileListRowStyles.cssText
    const entryCssText = pmEntryListItemMobileStyles.cssText
    const groupCssText = pmGroupListItemMobileStyles.cssText

    expect(sharedCssText).toContain('--pm-mobile-list-row-min-height: 60px;')
    expect(sharedCssText).toContain('--pm-mobile-list-row-padding-block: 8px;')
    expect(sharedCssText).toContain('--pm-mobile-list-row-padding-inline: 12px;')
    expect(sharedCssText).toContain('--pm-mobile-list-row-gap: 10px;')
    expect(sharedCssText).toContain('--pm-mobile-list-row-icon-size: 36px;')
    expect(sharedCssText).toContain('--pm-mobile-list-row-icon-radius: 9px;')
    expect(sharedCssText).toContain('min-block-size: var(--pm-mobile-list-row-min-height);')
    expect(entryCssText).not.toContain('min-block-size: 60px;')
    expect(entryCssText).toContain('--pm-mobile-list-row-min-height: 60px;')
    expect(entryCssText).toContain('gap: var(--pm-mobile-list-row-gap);')
    expect(entryCssText).toContain('width: var(--pm-mobile-list-row-icon-size);')
    expect(entryCssText).toContain('--pm-avatar-radius: var(--pm-mobile-list-row-icon-radius);')
    expect(groupCssText).toContain('--pm-mobile-list-row-min-height: 60px;')
    expect(groupCssText).toContain('gap: var(--pm-mobile-list-row-gap);')
    expect(groupCssText).toContain('inline-size: var(--pm-mobile-list-row-icon-size);')
    expect(groupCssText).toContain('border-radius: var(--pm-mobile-list-row-icon-radius);')
  })

  it('keeps idle Passmanager rows borderless with dividers and surfaced interaction states', () => {
    const mobileRowCssText = pmMobileListRowStyles.cssText
    const sharedCssText = stylesToText(pmSharedStyles)
    const desktopEntryCssText = pmEntryListItemDesktopStyles.cssText
    const desktopGroupCssText = pmGroupDesktopStyles.cssText

    expect(mobileRowCssText).toContain('background: transparent;')
    expect(mobileRowCssText).toContain('border: 1px solid transparent;')
    expect(mobileRowCssText).toContain('box-shadow: inset 0 -1px 0 var(--pm-mobile-list-row-divider);')
    expect(mobileRowCssText).toContain('.mobile-list-row-surface:hover,\n  .mobile-list-row-surface:focus-visible')
    expect(mobileRowCssText).toContain('box-shadow: none;')

    expect(sharedCssText).toContain('--pm-entry-row-background: transparent;')
    expect(sharedCssText).toContain('--pm-entry-row-border: transparent;')
    expect(sharedCssText).toContain(
      '--pm-entry-row-shadow: inset 0 -1px 0 var(--cv-color-border-soft);',
    )
    expect(desktopEntryCssText).toContain('box-shadow: var(--pm-entry-row-shadow, none);')
    expect(desktopEntryCssText).toContain('.list-item:hover')
    expect(desktopEntryCssText).toContain('box-shadow: none;')

    expect(desktopGroupCssText).toContain('border: 1px solid transparent;')
    expect(desktopGroupCssText).toContain('box-shadow: inset 0 -1px 0 var(--cv-color-border-soft);')
    expect(desktopGroupCssText).toContain('.group-row.active::before,\n  .group-row:focus-visible::before')
    expect(desktopGroupCssText).toContain('background: var(--cv-color-primary-surface);')
  })

  it('pins mobile entry badges and menu after removing the drag column', () => {
    const cssText = pmEntryListItemMobileStyles.cssText

    expect(cssText).not.toContain('.mobile-dnd-handle')
    expect(cssText).toContain('.entry-badges')
    expect(cssText).toContain('.entry-status-dots')
    expect(cssText).toContain('.entry-status-dot')
    expect(cssText).toContain('--pm-mobile-list-row-gap: 6px;')
    expect(cssText).toContain('grid-column: 3;')
    expect(cssText).toContain('max-inline-size: min(38cqw, 220px);')
    expect(cssText).toContain('min-block-size: 20px;')
    expect(cssText).toContain('padding-inline: 5px;')
    expect(cssText).toContain('data-badge-id')
    expect(cssText).toContain('.entry-menu-button')
    expect(cssText).toContain('grid-column: 4;')
    expect(cssText).toContain('justify-self: end;')
  })

  it('keeps mobile tag filter chips compact', () => {
    const cssText = stylesToText(PMSearchMobile.styles)

    expect(cssText).toContain('.sort-group-trigger')
    expect(cssText).toContain('flex: 0 0 42px;')
    expect(cssText).toContain('block-size: 42px;')
    expect(cssText).toContain('flex-basis: 40px;')
    expect(cssText).toContain('padding-block-start: 6px;')
    expect(cssText).toContain('gap: 5px;')
    expect(cssText).toContain('min-block-size: 34px;')
    expect(cssText).toContain('padding: 0 11px;')
    expect(cssText).toContain('padding-block-start: 5px;')
    expect(cssText).toContain('min-block-size: 32px;')
    expect(cssText).toContain('padding-inline: 10px;')
  })

  it('aligns the mobile group metrics rail with the search and row rhythm', () => {
    const cssText = pmGroupMobileStyles.cssText

    expect(cssText).toContain('inline-size: 100%;')
    expect(cssText).toContain('padding-top: 0;')
    expect(cssText).toContain('gap: 1px;')
    expect(cssText).toContain('padding: 2px 0;')
    expect(cssText).toContain('padding: 2px var(--cv-space-3) 1px;')
    expect(cssText).toContain('border-block-start: 1px solid var(--cv-color-border-soft);')
    expect(cssText).toContain('background: var(--cv-color-bg);')
    expect(cssText).toContain('.group-metrics-strip')
    expect(cssText).toContain('--pm-summary-rail-inline-size: 100%;')
    expect(cssText).not.toContain('.mobile-metrics-line')
    expect(cssText).not.toContain('.mobile-metrics-item')
    expect(cssText).not.toContain('.mobile-metrics-value')
    expect(cssText).not.toContain('grid-auto-flow: column;')
    expect(cssText).not.toContain('grid-auto-columns: minmax(0, 1fr);')
    expect(cssText).not.toContain('.mobile-search {\n    inline-size: calc')
    expect(cssText).not.toContain('compact-header')
    expect(cssText).not.toContain('header-entry-pill')
    expect(cssText).not.toContain('compact-header-icon')
  })

  it('aligns the OTP summary rail below the search using the credentials rail rhythm', () => {
    const cssText = stylesToText(otpQuickViewStyles)

    expect(cssText).toContain('.quick-view__header')
    expect(cssText).toContain('grid-template-columns: 1fr;')
    expect(cssText).toContain('.quick-view__summary-rail')
    expect(cssText).toContain('padding-inline: var(--pm-otp-quick-view-content-inset);')
    expect(cssText).toContain('--pm-summary-rail-inline-size: 100%;')
  })

  it('docks the OTP mobile summary rail above the mobile tab bar clearance', () => {
    const cssText = stylesToText(PMOtpQuickViewMobile.styles)

    expect(cssText).toContain('.quick-view__content')
    expect(cssText).toContain('overflow: auto;')
    expect(cssText).toContain('.quick-view__summary-rail')
    expect(cssText).toContain('padding: 6px var(--cv-space-3) 8px;')
    expect(cssText).toContain('border-block-start: 1px solid var(--cv-color-border-soft);')
    expect(cssText).toContain('background: var(--cv-color-bg);')
    expect(cssText).toContain('--pm-summary-rail-inline-size: 100%;')
  })
})
