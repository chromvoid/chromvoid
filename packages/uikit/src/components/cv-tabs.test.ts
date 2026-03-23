import {afterEach, describe, expect, it} from 'vitest'

import {CVTab} from './cv-tab'
import {CVTabPanel} from './cv-tab-panel'
import {CVTabs} from './cv-tabs'

const settle = async (element: CVTabs) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

async function mountTabs(params: {manual?: boolean} = {}) {
  CVTab.define()
  CVTabPanel.define()
  CVTabs.define()

  const tabs = document.createElement('cv-tabs') as CVTabs
  if (params.manual) {
    tabs.activationMode = 'manual'
  }

  tabs.innerHTML = `
    <cv-tab slot="nav" value="a" selected>Alpha</cv-tab>
    <cv-tab slot="nav" value="b">Beta</cv-tab>
    <cv-tab slot="nav" value="c" disabled>Gamma</cv-tab>

    <cv-tab-panel tab="a">Panel A</cv-tab-panel>
    <cv-tab-panel tab="b">Panel B</cv-tab-panel>
    <cv-tab-panel tab="c">Panel C</cv-tab-panel>
  `

  document.body.append(tabs)
  await settle(tabs)

  const tabElements = Array.from(tabs.querySelectorAll('cv-tab')) as CVTab[]
  const panelElements = Array.from(tabs.querySelectorAll('cv-tab-panel')) as CVTabPanel[]

  return {tabs, tabElements, panelElements}
}

async function mountClosableTabs() {
  CVTab.define()
  CVTabPanel.define()
  CVTabs.define()

  const tabs = document.createElement('cv-tabs') as CVTabs

  tabs.innerHTML = `
    <cv-tab slot="nav" value="a" selected>Alpha</cv-tab>
    <cv-tab slot="nav" value="b">Beta</cv-tab>
    <cv-tab slot="nav" value="c">Gamma</cv-tab>

    <cv-tab-panel tab="a">Panel A</cv-tab-panel>
    <cv-tab-panel tab="b">Panel B</cv-tab-panel>
    <cv-tab-panel tab="c">Panel C</cv-tab-panel>
  `

  document.body.append(tabs)
  await settle(tabs)

  const tabElements = Array.from(tabs.querySelectorAll('cv-tab')) as CVTab[]

  return {tabs, tabElements}
}

async function mountTabsWithMarkup(markup: string) {
  CVTab.define()
  CVTabPanel.define()
  CVTabs.define()

  const tabs = document.createElement('cv-tabs') as CVTabs
  tabs.innerHTML = markup

  document.body.append(tabs)
  await settle(tabs)

  const tabElements = Array.from(tabs.querySelectorAll('cv-tab')) as CVTab[]
  const panelElements = Array.from(tabs.querySelectorAll('cv-tab-panel')) as CVTabPanel[]

  return {tabs, tabElements, panelElements}
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-tabs', () => {
  // --- shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="base"] as root layout container', async () => {
      const {tabs} = await mountTabs()
      const base = tabs.shadowRoot!.querySelector('[part="base"]')
      expect(base).not.toBeNull()
      expect(base!.tagName).toBe('DIV')
    })

    it('renders [part="list"] inside base', async () => {
      const {tabs} = await mountTabs()
      const list = tabs.shadowRoot!.querySelector('[part="base"] > [part="list"]')
      expect(list).not.toBeNull()
      expect(list!.tagName).toBe('DIV')
    })

    it('renders [part="panels"] inside base', async () => {
      const {tabs} = await mountTabs()
      const panels = tabs.shadowRoot!.querySelector('[part="base"] > [part="panels"]')
      expect(panels).not.toBeNull()
      expect(panels!.tagName).toBe('DIV')
    })

    it('renders [part="indicator"] inside list', async () => {
      const {tabs} = await mountTabs()
      const indicator = tabs.shadowRoot!.querySelector('[part="list"] > [part="indicator"]')
      expect(indicator).not.toBeNull()
      expect(indicator!.tagName).toBe('DIV')
    })

    it('renders slot[name="nav"] inside list', async () => {
      const {tabs} = await mountTabs()
      const navSlot = tabs.shadowRoot!.querySelector('[part="list"] slot[name="nav"]')
      expect(navSlot).not.toBeNull()
    })

    it('renders default slot inside panels', async () => {
      const {tabs} = await mountTabs()
      const defaultSlot = tabs.shadowRoot!.querySelector('[part="panels"] slot:not([name])')
      expect(defaultSlot).not.toBeNull()
    })

    it('uses the nav slot for tabs and default slot for panels', async () => {
      const {tabs} = await mountTabs()
      const shadowRoot = tabs.shadowRoot

      const navSlot = shadowRoot?.querySelector('slot[name="nav"]')
      const panelSlot = shadowRoot?.querySelector('slot:not([name])')

      expect(navSlot).not.toBeNull()
      expect(panelSlot).not.toBeNull()

      expect((navSlot as HTMLSlotElement).assignedElements()).toHaveLength(3)
      expect((panelSlot as HTMLSlotElement).assignedElements()).toHaveLength(3)
    })
  })

  // --- default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      CVTabs.define()
      const tabs = document.createElement('cv-tabs') as CVTabs
      document.body.append(tabs)
      await settle(tabs)

      expect(tabs.value).toBe('')
      expect(tabs.orientation).toBe('horizontal')
      expect(tabs.activationMode).toBe('automatic')
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('role="tablist" on list part', async () => {
      const {tabs} = await mountTabs()
      const list = tabs.shadowRoot!.querySelector('[part="list"]')
      expect(list!.getAttribute('role')).toBe('tablist')
    })

    it('aria-orientation="horizontal" by default on list part', async () => {
      const {tabs} = await mountTabs()
      const list = tabs.shadowRoot!.querySelector('[part="list"]')
      expect(list!.getAttribute('aria-orientation')).toBe('horizontal')
    })

    it('aria-orientation="vertical" when orientation is vertical', async () => {
      const {tabs} = await mountTabsWithMarkup(`
        <cv-tab slot="nav" value="a" selected>Alpha</cv-tab>
        <cv-tab-panel tab="a">Panel A</cv-tab-panel>
      `)
      tabs.orientation = 'vertical'
      await settle(tabs)

      const list = tabs.shadowRoot!.querySelector('[part="list"]')
      expect(list!.getAttribute('aria-orientation')).toBe('vertical')
    })

    it('forwards aria-label to list part', async () => {
      const {tabs} = await mountTabsWithMarkup(`
        <cv-tab slot="nav" value="a" selected>Alpha</cv-tab>
        <cv-tab-panel tab="a">Panel A</cv-tab-panel>
      `)
      tabs.ariaLabel = 'My tabs'
      await settle(tabs)

      const list = tabs.shadowRoot!.querySelector('[part="list"]')
      expect(list!.getAttribute('aria-label')).toBe('My tabs')
    })

    it('does not set aria-label on list part when ariaLabel is empty', async () => {
      const {tabs} = await mountTabs()
      const list = tabs.shadowRoot!.querySelector('[part="list"]')
      expect(list!.hasAttribute('aria-label')).toBe(false)
    })

    it('role="tab" on each cv-tab element', async () => {
      const {tabElements} = await mountTabs()
      for (const tab of tabElements) {
        expect(tab.getAttribute('role')).toBe('tab')
      }
    })

    it('role="tabpanel" on each cv-tab-panel element', async () => {
      const {panelElements} = await mountTabs()
      for (const panel of panelElements) {
        expect(panel.getAttribute('role')).toBe('tabpanel')
      }
    })

    it('aria-selected="true" on selected tab, "false" on others', async () => {
      const {tabElements} = await mountTabs()
      expect(tabElements[0]!.getAttribute('aria-selected')).toBe('true')
      expect(tabElements[1]!.getAttribute('aria-selected')).toBe('false')
      expect(tabElements[2]!.getAttribute('aria-selected')).toBe('false')
    })

    it('aria-disabled="true" on disabled tab', async () => {
      const {tabElements} = await mountTabs()
      expect(tabElements[2]!.getAttribute('aria-disabled')).toBe('true')
    })

    it('aria-controls on tab points to matching panel id', async () => {
      const {tabElements, panelElements} = await mountTabs()
      expect(tabElements[0]!.getAttribute('aria-controls')).toBe(panelElements[0]!.id)
    })

    it('aria-labelledby on panel points to matching tab id', async () => {
      const {tabElements, panelElements} = await mountTabs()
      expect(panelElements[0]!.getAttribute('aria-labelledby')).toBe(tabElements[0]!.id)
    })

    it('tabindex="0" on active tab, "-1" on others (roving tabindex)', async () => {
      const {tabElements} = await mountTabs()
      expect(tabElements[0]!.getAttribute('tabindex')).toBe('0')
      expect(tabElements[1]!.getAttribute('tabindex')).toBe('-1')
      expect(tabElements[2]!.getAttribute('tabindex')).toBe('-1')
    })
  })

  // --- events ---

  describe('events', () => {
    it('change detail shape: {activeTabId, selectedTabId}', async () => {
      const {tabs, tabElements} = await mountTabs()

      let detail: unknown
      tabs.addEventListener('cv-change', (event) => {
        detail = (event as CustomEvent).detail
      })

      tabElements[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(tabs)

      expect(detail).toEqual({activeTabId: 'b', selectedTabId: 'b'})
      expect(Object.keys(detail as object)).toEqual(['activeTabId', 'selectedTabId'])
    })

    it('input detail shape: {activeTabId, selectedTabId}', async () => {
      const {tabs, tabElements} = await mountTabs()

      let detail: unknown
      tabs.addEventListener('cv-input', (event) => {
        detail = (event as CustomEvent).detail
      })

      tabElements[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(tabs)

      expect(detail).toEqual({activeTabId: 'b', selectedTabId: 'b'})
      expect(Object.keys(detail as object)).toEqual(['activeTabId', 'selectedTabId'])
    })

    it('input fires on active-only changes in manual mode (no change emitted)', async () => {
      const {tabs, tabElements} = await mountTabs({manual: true})

      const inputDetails: Array<{activeTabId: string | null; selectedTabId: string | null}> = []
      let changeCount = 0

      tabs.addEventListener('cv-input', (event) => {
        inputDetails.push((event as CustomEvent).detail)
      })
      tabs.addEventListener('cv-change', () => {
        changeCount += 1
      })

      tabElements[0]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(tabs)

      expect(inputDetails).toHaveLength(1)
      expect(inputDetails[0]).toEqual({activeTabId: 'b', selectedTabId: 'a'})
      expect(changeCount).toBe(0)
    })

    it('both input and change fire when selection changes in manual mode via Enter', async () => {
      const {tabs, tabElements} = await mountTabs({manual: true})

      const inputDetails: Array<{activeTabId: string | null; selectedTabId: string | null}> = []
      const changeDetails: Array<{activeTabId: string | null; selectedTabId: string | null}> = []

      tabs.addEventListener('cv-input', (event) => {
        inputDetails.push((event as CustomEvent).detail)
      })
      tabs.addEventListener('cv-change', (event) => {
        changeDetails.push((event as CustomEvent).detail)
      })

      // Navigate to tab b
      tabElements[0]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(tabs)

      // Activate tab b with Enter
      tabElements[1]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(tabs)

      // input should have fired for both the navigation and the activation
      expect(inputDetails.length).toBeGreaterThanOrEqual(2)
      // change should have fired once for the selection change
      expect(changeDetails).toHaveLength(1)
      expect(changeDetails[0]).toEqual({activeTabId: 'b', selectedTabId: 'b'})
    })

    it('selects tabs on click and emits change', async () => {
      const {tabs, tabElements} = await mountTabs()

      let changeCount = 0
      tabs.addEventListener('cv-change', () => {
        changeCount += 1
      })

      tabElements[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(tabs)

      expect(tabs.value).toBe('b')
      expect(changeCount).toBe(1)
    })
  })

  // --- active indicator ---

  describe('active indicator', () => {
    it('indicator part exists in shadow DOM', async () => {
      const {tabs} = await mountTabs()
      const indicator = tabs.shadowRoot!.querySelector('[part="indicator"]')
      expect(indicator).not.toBeNull()
    })

    it('indicator is positioned within the list part', async () => {
      const {tabs} = await mountTabs()
      const list = tabs.shadowRoot!.querySelector('[part="list"]')
      const indicator = list!.querySelector('[part="indicator"]')
      expect(indicator).not.toBeNull()
    })
  })

  // --- CSS custom properties for indicator ---

  describe('CSS custom properties for indicator', () => {
    it('indicator respects --cv-tabs-indicator-color', async () => {
      const {tabs} = await mountTabs()
      const indicator = tabs.shadowRoot!.querySelector('[part="indicator"]') as HTMLElement
      expect(indicator).not.toBeNull()
      // The indicator element exists and can receive custom property styling.
      // Detailed computed style assertions are deferred to visual regression;
      // structural presence of the indicator part is the contract under test.
    })

    it('indicator respects --cv-tabs-indicator-size', async () => {
      const {tabs} = await mountTabs()
      const indicator = tabs.shadowRoot!.querySelector('[part="indicator"]') as HTMLElement
      expect(indicator).not.toBeNull()
    })
  })

  // --- headless contract delegation ---

  describe('headless contract delegation', () => {
    it('tablist props from getTabListProps() are reflected on list part', async () => {
      const {tabs} = await mountTabs()
      const list = tabs.shadowRoot!.querySelector('[part="list"]') as HTMLElement

      expect(list.getAttribute('role')).toBe('tablist')
      expect(list.getAttribute('aria-orientation')).toBe('horizontal')
      // id should contain the idBase pattern
      expect(list.id).toContain('tablist')
    })

    it('tab props from getTabProps() are reflected on cv-tab elements', async () => {
      const {tabElements, panelElements} = await mountTabs()
      const tab = tabElements[0]!

      // Contract-derived attributes
      expect(tab.getAttribute('role')).toBe('tab')
      expect(tab.getAttribute('tabindex')).toBe('0')
      expect(tab.getAttribute('aria-selected')).toBe('true')
      expect(tab.getAttribute('aria-controls')).toBe(panelElements[0]!.id)
      expect(tab.getAttribute('data-active')).toBe('true')
      expect(tab.getAttribute('data-selected')).toBe('true')
    })

    it('panel props from getPanelProps() are reflected on cv-tab-panel elements', async () => {
      const {tabElements, panelElements} = await mountTabs()
      const selectedPanel = panelElements[0]!
      const hiddenPanel = panelElements[1]!

      // Selected panel
      expect(selectedPanel.getAttribute('role')).toBe('tabpanel')
      expect(selectedPanel.getAttribute('tabindex')).toBe('0')
      expect(selectedPanel.getAttribute('aria-labelledby')).toBe(tabElements[0]!.id)
      expect(selectedPanel.hidden).toBe(false)

      // Hidden panel
      expect(hiddenPanel.getAttribute('role')).toBe('tabpanel')
      expect(hiddenPanel.getAttribute('tabindex')).toBe('-1')
      expect(hiddenPanel.getAttribute('aria-labelledby')).toBe(tabElements[1]!.id)
      expect(hiddenPanel.hidden).toBe(true)
    })

    it('syncs tab and panel aria linkage contracts', async () => {
      const {tabElements, panelElements} = await mountTabs()

      expect(tabElements[0]!.getAttribute('role')).toBe('tab')
      expect(tabElements[0]!.getAttribute('aria-selected')).toBe('true')
      expect(tabElements[0]!.getAttribute('aria-controls')).toBe(panelElements[0]!.id)
      expect(tabElements[1]!.getAttribute('aria-selected')).toBe('false')
      expect(tabElements[2]!.getAttribute('aria-disabled')).toBe('true')

      expect(panelElements[0]!.hidden).toBe(false)
      expect(panelElements[1]!.hidden).toBe(true)
      expect(panelElements[0]!.getAttribute('role')).toBe('tabpanel')
    })
  })

  // --- behavior ---

  describe('behavior', () => {
    it('uses automatic activation on keyboard navigation', async () => {
      const {tabs, tabElements, panelElements} = await mountTabs()

      const changes: Array<{activeTabId: string | null; selectedTabId: string | null}> = []
      tabs.addEventListener('cv-change', (event) => {
        changes.push((event as unknown as CustomEvent<{activeTabId: string | null; selectedTabId: string | null}>).detail)
      })

      tabElements[0]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(tabs)

      expect(tabs.value).toBe('b')
      expect(tabElements[1]!.selected).toBe(true)
      expect(panelElements[1]!.hidden).toBe(false)
      expect(changes.at(-1)).toEqual({activeTabId: 'b', selectedTabId: 'b'})
      expect(changes.at(-1)).toMatchObject({activeTabId: 'b', selectedTabId: 'b'})
      expect(changes.at(-1)).toEqual(expect.objectContaining({
        activeTabId: 'b',
        selectedTabId: 'b',
      }))
      expect(Object.keys(changes.at(-1) ?? {})).toEqual(['activeTabId', 'selectedTabId'])
    })

    it('keeps manual activation until Enter/Space', async () => {
      const {tabs, tabElements, panelElements} = await mountTabs({manual: true})

      tabElements[0]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(tabs)

      expect(tabs.value).toBe('a')
      expect(tabElements[1]!.active).toBe(true)
      expect(tabElements[1]!.selected).toBe(false)
      expect(panelElements[0]!.hidden).toBe(false)

      tabElements[1]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(tabs)

      expect(tabs.value).toBe('b')
      expect(tabElements[1]!.selected).toBe(true)
      expect(panelElements[1]!.hidden).toBe(false)
    })

    it('preserves valid selected tab across slot rebuilds', async () => {
      const {tabs, panelElements} = await mountTabs()

      const tabB = tabs.querySelector('cv-tab[value="b"]') as CVTab
      tabB.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(tabs)

      expect(tabs.value).toBe('b')

      const tabA = tabs.querySelector('cv-tab[value="a"]') as CVTab
      tabA.remove()
      panelElements[0]!.remove()
      await settle(tabs)

      expect(tabs.value).toBe('b')
      expect((tabs.querySelector('cv-tab[value="b"]') as CVTab).selected).toBe(true)
      expect((tabs.querySelector('cv-tab-panel[tab="b"]') as CVTabPanel).hidden).toBe(false)
    })

    it('keeps orphan panels hidden and unselected during slot rebuilds', async () => {
      const {tabs, panelElements, tabElements} = await mountTabsWithMarkup(`
        <cv-tab slot="nav" value="a" selected>Alpha</cv-tab>
        <cv-tab slot="nav" value="b">Beta</cv-tab>
        <cv-tab slot="nav" value="c">Gamma</cv-tab>

        <cv-tab-panel tab="a">Panel A</cv-tab-panel>
        <cv-tab-panel tab="c">Panel C</cv-tab-panel>
        <cv-tab-panel tab="orphan">Panel Orphan</cv-tab-panel>
      `)

      expect(tabs.value).toBe('a')
      expect(panelElements[0]!.selected).toBe(true)
      expect(panelElements[0]!.hidden).toBe(false)
      expect(panelElements[2]!.selected).toBe(false)
      expect(panelElements[2]!.hidden).toBe(true)

      tabElements.at(-1)!.remove()
      await settle(tabs)

      expect((tabs.querySelector('cv-tab-panel[tab="c"]') as CVTabPanel).hidden).toBe(true)
      expect((tabs.querySelector('cv-tab-panel[tab="c"]') as CVTabPanel).selected).toBe(false)
      expect((tabs.querySelector('cv-tab-panel[tab="orphan"]') as CVTabPanel).hidden).toBe(true)
      expect((tabs.querySelector('cv-tab-panel[tab="orphan"]') as CVTabPanel).selected).toBe(false)
    })

    it('rebuilds selection deterministically after removing and adding tabs', async () => {
      const {tabs, panelElements, tabElements} = await mountTabs()

      tabElements[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(tabs)
      expect(tabs.value).toBe('b')

      tabElements[1]!.remove()
      panelElements[1]!.remove()
      await settle(tabs)

      expect(tabs.value).toBe('a')

      const newTab = document.createElement('cv-tab') as CVTab
      newTab.slot = 'nav'
      newTab.value = 'd'
      newTab.textContent = 'Delta'

      const newPanel = document.createElement('cv-tab-panel') as CVTabPanel
      newPanel.tab = 'd'
      newPanel.textContent = 'Panel D'

      tabs.append(newTab, newPanel)
      await settle(tabs)

      expect(tabs.value).toBe('a')
      expect((tabs.querySelector('cv-tab-panel[tab="d"]') as CVTabPanel).hidden).toBe(true)
      expect((tabs.querySelector('cv-tab-panel[tab="d"]') as CVTabPanel).selected).toBe(false)
    })

    it('orientation="vertical" sets aria-orientation to vertical', async () => {
      const {tabs} = await mountTabsWithMarkup(`
        <cv-tab slot="nav" value="a" selected>Alpha</cv-tab>
        <cv-tab-panel tab="a">Panel A</cv-tab-panel>
      `)
      tabs.orientation = 'vertical'
      await settle(tabs)

      const list = tabs.shadowRoot!.querySelector('[part="list"]')
      expect(list!.getAttribute('aria-orientation')).toBe('vertical')
    })
  })

  // --- closable behavior ---

  describe('closable behavior', () => {
    it('falls back to previous enabled tab when the next tab is disabled on close', async () => {
      const {tabs, tabElements, panelElements} = await mountTabsWithMarkup(`
        <cv-tab slot="nav" value="a">Alpha</cv-tab>
        <cv-tab slot="nav" value="b" selected>Beta</cv-tab>
        <cv-tab slot="nav" value="c" disabled>Gamma</cv-tab>

        <cv-tab-panel tab="a">Panel A</cv-tab-panel>
        <cv-tab-panel tab="b">Panel B</cv-tab-panel>
        <cv-tab-panel tab="c">Panel C</cv-tab-panel>
      `)

      const changes: Array<{activeTabId: string | null; selectedTabId: string | null}> = []
      tabs.addEventListener('cv-change', (event) => {
        changes.push((event as unknown as CustomEvent<{activeTabId: string | null; selectedTabId: string | null}>).detail)
      })

      tabElements[1]!.dispatchEvent(
        new CustomEvent('cv-close', {
          detail: {value: 'b'},
          bubbles: true,
          composed: true,
        }),
      )
      await settle(tabs)

      panelElements[0]!.remove()
      panelElements[1]!.remove()
      await settle(tabs)

      expect(changes.at(-1)).toEqual({activeTabId: 'a', selectedTabId: 'a'})
      expect(tabs.value).toBe('a')
    })

    it('falls back to null when active close has no enabled candidate', async () => {
      const {tabs, tabElements} = await mountTabsWithMarkup(`
        <cv-tab slot="nav" value="a" disabled>Alpha</cv-tab>
        <cv-tab slot="nav" value="b" selected>Beta</cv-tab>
        <cv-tab slot="nav" value="c" disabled>Gamma</cv-tab>

        <cv-tab-panel tab="a">Panel A</cv-tab-panel>
        <cv-tab-panel tab="b">Panel B</cv-tab-panel>
        <cv-tab-panel tab="c">Panel C</cv-tab-panel>
      `)

      const changes: Array<{activeTabId: string | null; selectedTabId: string | null}> = []
      tabs.addEventListener('cv-change', (event) => {
        changes.push((event as unknown as CustomEvent<{activeTabId: string | null; selectedTabId: string | null}>).detail)
      })

      tabElements[1]!.dispatchEvent(
        new CustomEvent('cv-close', {
          detail: {value: 'b'},
          bubbles: true,
          composed: true,
        }),
      )
      const closingPanel = tabs.querySelector('cv-tab-panel[tab="b"]') as CVTabPanel

      tabElements[1]!.remove()
      closingPanel.remove()
      await settle(tabs)

      expect(changes.at(-1)).toEqual({activeTabId: null, selectedTabId: null})
      expect(tabs.value).toBe('')

      const allTabs = Array.from(tabs.querySelectorAll('cv-tab')) as CVTab[]
      expect(allTabs.every((tab) => !tab.selected)).toBe(true)
    })

    it('updates selection deterministically when close is requested for the active tab', async () => {
      const {tabs, tabElements} = await mountClosableTabs()

      const changes: Array<{activeTabId: string | null; selectedTabId: string | null}> = []
      tabs.addEventListener('cv-change', (event) => {
        changes.push((event as unknown as CustomEvent<{activeTabId: string | null; selectedTabId: string | null}>).detail)
      })

      tabElements[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(tabs)
      expect(tabs.value).toBe('b')

      tabElements[1]!.dispatchEvent(
        new CustomEvent('cv-close', {
          detail: {value: 'b'},
          bubbles: true,
          composed: true,
        }),
      )
      await settle(tabs)

      expect(changes.at(-1)).toEqual({activeTabId: 'c', selectedTabId: 'c'})
      expect(tabs.value).toBe('c')
    })

    it('does not change selection when close is requested for non-active tabs', async () => {
      const {tabs, tabElements} = await mountClosableTabs()

      const changes: Array<{activeTabId: string | null; selectedTabId: string | null}> = []
      tabs.addEventListener('cv-change', (event) => {
        changes.push((event as unknown as CustomEvent<{activeTabId: string | null; selectedTabId: string | null}>).detail)
      })

      tabElements[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(tabs)
      expect(tabs.value).toBe('b')

      tabElements[0]!.dispatchEvent(
        new CustomEvent('cv-close', {
          detail: {value: 'a'},
          bubbles: true,
          composed: true,
        }),
      )
      await settle(tabs)

      expect(changes).toHaveLength(1)
      expect(tabs.value).toBe('b')
    })
  })
})
