import {describe, expect, it} from 'vitest'
import {createCarousel} from '../carousel'
import {createFeed} from '../feed'
import {createTreegrid} from '../treegrid'
import {createWindowSplitter} from '../window-splitter'
import {expectAriaLinkage, expectRoleAndAria, runKeyboardSequence} from './apg-contract-harness'

describe('APG contracts regression', () => {
  it('treegrid keeps role and keyboard navigation contract', () => {
    const treegrid = createTreegrid({
      idBase: 'apg-treegrid',
      rows: [{id: 'r1'}, {id: 'r2'}],
      columns: [{id: 'c1'}, {id: 'c2'}],
      initialActiveCellId: {rowId: 'r1', colId: 'c1'},
    })

    expectRoleAndAria(treegrid.contracts.getTreegridProps(), 'treegrid', {
      'aria-rowcount': 2,
      'aria-colcount': 2,
    })

    runKeyboardSequence(treegrid.actions.handleKeyDown, ['ArrowDown', 'ArrowRight'])
    expect(treegrid.state.activeCellId()).toEqual({rowId: 'r2', colId: 'c2'})
  })

  it('feed keeps role/position semantics and keyboard paging contract', () => {
    const feed = createFeed({
      idBase: 'apg-feed',
      articles: [{id: 'a1'}, {id: 'a2'}, {id: 'a3'}],
      initialActiveArticleId: 'a1',
    })

    expectRoleAndAria(feed.contracts.getFeedProps(), 'feed', {'aria-busy': 'false'})
    expectRoleAndAria(feed.contracts.getArticleProps('a2'), 'article', {
      'aria-posinset': 2,
      'aria-setsize': -1,
    })

    runKeyboardSequence(feed.actions.handleKeyDown, ['PageDown', 'PageDown'])
    expect(feed.state.activeArticleId()).toBe('a3')
  })

  it('carousel keeps APG role semantics and control linkage', () => {
    const carousel = createCarousel({
      idBase: 'apg-carousel',
      slides: [{id: 's1'}, {id: 's2'}, {id: 's3'}],
    })

    const root = carousel.contracts.getRootProps()
    expectRoleAndAria(root, 'region', {'aria-roledescription': 'carousel'})

    const nextButton = carousel.contracts.getNextButtonProps()
    const slideGroup = carousel.contracts.getSlideGroupProps()
    expectAriaLinkage(nextButton, 'aria-controls', slideGroup)

    runKeyboardSequence(carousel.actions.handleKeyDown, ['ArrowRight'])
    expect(carousel.state.activeSlideIndex()).toBe(1)
  })

  it('window splitter keeps separator contract and keyboard resizing', () => {
    const splitter = createWindowSplitter({
      idBase: 'apg-splitter',
      min: 0,
      max: 100,
      position: 40,
      step: 10,
      primaryPaneId: 'left-pane',
      secondaryPaneId: 'right-pane',
    })

    const splitterProps = splitter.contracts.getSplitterProps()
    expectRoleAndAria(splitterProps, 'separator', {
      'aria-valuenow': '40',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-orientation': 'horizontal',
    })
    expect(splitterProps['aria-controls']).toBe('left-pane right-pane')

    runKeyboardSequence(splitter.actions.handleKeyDown, ['ArrowRight', 'End'])
    expect(splitter.state.position()).toBe(100)
  })
})
