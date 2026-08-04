import {captureSnapshot, writeJson} from '../helpers/artifacts.mjs'
import {hideAndroidKeyboard, waitForAndroidKeyboard} from '../helpers/keyboard.mjs'

async function tapCssPoint(driver, {x, y}, pointerId) {
  await driver.performActions([
    {
      type: 'pointer',
      id: pointerId,
      parameters: {pointerType: 'touch'},
      actions: [
        {type: 'pointerMove', duration: 0, x: Math.round(x), y: Math.round(y)},
        {type: 'pointerDown', button: 0},
        {type: 'pause', duration: 80},
        {type: 'pointerUp', button: 0},
      ],
    },
  ])
  await driver.releaseActions()
}

async function createMarkdownNote(driver, noteName) {
  await driver.execute((name) => {
    window.dialogService.showCreateMarkdownNoteDialog = async () => name
  }, noteName)

  const overflowTriggerCenter = await driver.execute(() => {
    const toolbar = deepFind(document, 'mobile-top-toolbar')
    const menu = toolbar?.shadowRoot?.querySelector('cv-menu-button.overflow-menu')
    return centerOf(menu?.shadowRoot?.querySelector('[part="trigger"]'))

    function deepFind(root, selector) {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const inner = deepFind(element.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }

    function centerOf(element) {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}
    }
  })
  if (!overflowTriggerCenter) {
    throw new Error('Files toolbar overflow trigger is unavailable')
  }

  await tapCssPoint(driver, overflowTriggerCenter, 'open-files-overflow')
  await driver.waitUntil(
    async () => {
      return await driver.execute(() => {
        const toolbar = deepFind(document, 'mobile-top-toolbar')
        return Boolean(toolbar?.shadowRoot?.querySelector('cv-menu-button.overflow-menu')?.open)

        function deepFind(root, selector) {
          const found = root.querySelector(selector)
          if (found) return found
          for (const element of root.querySelectorAll('*')) {
            if (element.shadowRoot) {
              const inner = deepFind(element.shadowRoot, selector)
              if (inner) return inner
            }
          }
          return null
        }
      })
    },
    {
      timeout: 10_000,
      timeoutMsg: 'Files toolbar overflow did not open',
      interval: 250,
    },
  )

  const overflowActionCenter = await driver.execute(() => {
    const toolbar = deepFind(document, 'mobile-top-toolbar')
    const fallbackItem = toolbar?.shadowRoot
      ?.querySelector('cv-menu-button.overflow-menu')
      ?.querySelector('cv-menu-item[value="create-note"]')
    const item = document.querySelector(
      '[data-cv-menu-button-portal] cv-menu-item[value="create-note"]',
    ) ?? fallbackItem
    return centerOf(item)

    function deepFind(root, selector) {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const inner = deepFind(element.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }

    function centerOf(element) {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}
    }
  })
  if (!overflowActionCenter) {
    throw new Error('Create Markdown note overflow action is unavailable')
  }
  await tapCssPoint(driver, overflowActionCenter, 'create-markdown-note')

  await driver.waitUntil(
    async () => {
      return await driver.execute(() => {
        const preview = deepFind(document, 'markdown-preview')
        return Boolean(preview?.shadowRoot?.querySelector('markdown-source-editor'))

        function deepFind(root, selector) {
          const found = root.querySelector(selector)
          if (found) return found
          for (const element of root.querySelectorAll('*')) {
            if (element.shadowRoot) {
              const inner = deepFind(element.shadowRoot, selector)
              if (inner) return inner
            }
          }
          return null
        }
      })
    },
    {
      timeout: 20_000,
      timeoutMsg: 'Created Markdown note did not open in edit mode',
      interval: 250,
    },
  )
}

async function setEditorSource(driver, source) {
  await driver.execute((value) => {
    const preview = deepFind(document, 'markdown-preview')
    const editor = preview?.shadowRoot?.querySelector('markdown-source-editor')
    if (!editor) throw new Error('Markdown source editor is unavailable')
    editor.value = value
    editor.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))

    function deepFind(root, selector) {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const inner = deepFind(element.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  }, source)
}

async function readEditorTargetCenter(driver, selector) {
  return await driver.execute((targetSelector) => {
    const preview = deepFind(document, 'markdown-preview')
    const editor = preview?.shadowRoot?.querySelector('markdown-source-editor')
    const target = targetSelector === '.cm-content'
      ? editor?.shadowRoot?.querySelector(targetSelector)
      : preview?.shadowRoot?.querySelector(targetSelector)
    if (!target) return null
    const rect = target.getBoundingClientRect()
    const lineHeight = Number.parseFloat(getComputedStyle(target).lineHeight)
    return {
      x: rect.left + Math.min(32, Math.max(1, rect.width / 2)),
      y: targetSelector === '.cm-content'
        ? rect.top + Math.min(Number.isFinite(lineHeight) ? lineHeight / 2 : 12, rect.height / 2)
        : rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
    }

    function deepFind(root, selector) {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const inner = deepFind(element.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  }, selector)
}

async function setEditorSelection(driver, selectionStart, selectionEnd) {
  await driver.execute(
    ({start, end}) => {
      const preview = deepFind(document, 'markdown-preview')
      const editor = preview?.shadowRoot?.querySelector('markdown-source-editor')
      if (!editor) throw new Error('Markdown source editor is unavailable')
      editor.setSelectionRange(start, end)

      function deepFind(root, selector) {
        const found = root.querySelector(selector)
        if (found) return found
        for (const element of root.querySelectorAll('*')) {
          if (element.shadowRoot) {
            const inner = deepFind(element.shadowRoot, selector)
            if (inner) return inner
          }
        }
        return null
      }
    },
    {start: selectionStart, end: selectionEnd},
  )
}

async function readEditorState(driver) {
  return await driver.execute(() => {
    const preview = deepFind(document, 'markdown-preview')
    const editor = preview?.shadowRoot?.querySelector('markdown-source-editor')
    const content = editor?.shadowRoot?.querySelector('.cm-content')
    const selection = editor?.getSelection?.() ?? null
    const rootStyles = getComputedStyle(document.documentElement)
    return {
      editorFocused: Boolean(editor && content && editor.shadowRoot?.activeElement === content),
      keyboardExpanded: document.documentElement.hasAttribute('data-mobile-keyboard-expanded'),
      keyboardInset: rootStyles
        .getPropertyValue('--app-runtime-keyboard-native-inset-block-end')
        .trim(),
      selection,
      source: editor?.value ?? null,
    }

    function deepFind(root, selector) {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const inner = deepFind(element.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

async function focusEditorEndAndScrollToBottom(driver) {
  await driver.execute(() => {
    const preview = deepFind(document, 'markdown-preview')
    const editor = preview?.shadowRoot?.querySelector('markdown-source-editor')
    const scroller = editor?.shadowRoot?.querySelector('.cm-scroller')
    if (!editor || !scroller) {
      throw new Error('Markdown source editor is unavailable')
    }

    editor.focusAt(editor.value.length)
    scroller.scrollTop = scroller.scrollHeight

    function deepFind(root, selector) {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const inner = deepFind(element.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  })
}

async function readEditorKeyboardClearanceState(driver) {
  return await driver.execute(() => {
    const preview = deepFind(document, 'markdown-preview')
    const previewRoot = preview?.shadowRoot
    const content = previewRoot?.querySelector('.content')
    const editor = previewRoot?.querySelector('markdown-source-editor')
    const quickBar = previewRoot?.querySelector('.editor-quick-bar')
    const editorRoot = editor?.shadowRoot
    const editorContent = editorRoot?.querySelector('.cm-content')
    const scroller = editorRoot?.querySelector('.cm-scroller')
    const documentScroller = document.scrollingElement
    if (!content || !editor || !quickBar || !editorContent || !scroller || !documentScroller) {
      return null
    }

    const rootElement = document.documentElement
    const rootStyles = getComputedStyle(rootElement)
    const renderedLines = editorContent.querySelectorAll('.cm-line')
    const lastLine = renderedLines.item(renderedLines.length - 1)
    const caret = editorRoot.querySelector('.cm-cursor-primary, .cm-cursor')
    const scrollerRect = rectOf(scroller)
    const quickBarRect = rectOf(quickBar)
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const layoutHeight = rootElement.clientHeight || window.innerHeight
    const keyboardInset = parsePx(
      rootStyles.getPropertyValue('--app-runtime-keyboard-native-inset-block-end'),
    )

    return {
      body: readScrollState(document.body),
      caret: caret ? rectOf(caret) : null,
      content: rectOf(content),
      contentClearance: parsePx(getComputedStyle(editorContent).paddingBlockEnd),
      document: readScrollState(documentScroller),
      editorFocused: editorRoot.activeElement === editorContent,
      keyboardExpanded: rootElement.hasAttribute('data-mobile-keyboard-expanded'),
      keyboardInset,
      lastLine: lastLine
        ? {
            ...rectOf(lastLine),
            text: lastLine.textContent ?? '',
          }
        : null,
      quickBar: quickBarRect,
      root: readScrollState(rootElement),
      scroller: {
        ...scrollerRect,
        clientHeight: scroller.clientHeight,
        maxScroll,
        scrollAtBottom: Math.abs(scroller.scrollTop - maxScroll) <= 1,
        scrollHeight: scroller.scrollHeight,
        scrollTop: scroller.scrollTop,
      },
      selection: editor.getSelection?.() ?? null,
      sourceLength: editor.value.length,
      viewport: {
        height: layoutHeight,
        keyboardTop: layoutHeight - keyboardInset,
      },
    }

    function deepFind(root, selector) {
      const found = root.querySelector(selector)
      if (found) return found
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          const inner = deepFind(element.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }

    function parsePx(value) {
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : 0
    }

    function readScrollState(element) {
      return {
        clientHeight: element.clientHeight,
        maxScroll: Math.max(0, element.scrollHeight - element.clientHeight),
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
      }
    }

    function rectOf(element) {
      const rect = element.getBoundingClientRect()
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      }
    }
  })
}

async function tapQuickAction(driver, label, pointerId) {
  const center = await readEditorTargetCenter(
    driver,
    `.editor-quick-bar [aria-label="${label}"]`,
  )
  if (!center) {
    throw new Error(`Markdown quick action "${label}" is unavailable`)
  }
  await tapCssPoint(driver, center, pointerId)
}

export async function runMarkdownToolbarKeyboardSmoke({driver, artifactRoot}) {
  const noteName = `android-markdown-toolbar-${Date.now()}`
  await createMarkdownNote(driver, noteName)
  await setEditorSource(driver, 'Keyboard toolbar check')
  await captureSnapshot(driver, artifactRoot, '20-markdown-toolbar-keyboard-before-focus')

  const editorCenter = await readEditorTargetCenter(driver, '.cm-content')
  if (!editorCenter) {
    throw new Error('Markdown editor content is unavailable')
  }
  await tapCssPoint(driver, editorCenter, 'focus-markdown-editor')
  await waitForAndroidKeyboard(driver, true, {timeout: 20_000})

  await setEditorSelection(driver, 0, 'Keyboard'.length)
  await tapQuickAction(driver, 'Bold', 'markdown-bold-keyboard-open')
  await driver.waitUntil(
    async () => (await readEditorState(driver)).source === '**Keyboard** toolbar check',
    {
      timeout: 10_000,
      timeoutMsg: 'Bold quick action did not update the Markdown source',
      interval: 250,
    },
  )

  const keyboardOpenState = await readEditorState(driver)
  await writeJson(artifactRoot, 'markdown-toolbar-keyboard-open.json', keyboardOpenState)
  await captureSnapshot(driver, artifactRoot, '21-markdown-toolbar-keyboard-open')
  if (!keyboardOpenState.keyboardExpanded || !keyboardOpenState.editorFocused) {
    throw new Error(
      `Toolbar action changed the open keyboard state: ${JSON.stringify(keyboardOpenState)}`,
    )
  }
  if (keyboardOpenState.selection?.selectionStart !== 12 || keyboardOpenState.selection?.selectionEnd !== 12) {
    throw new Error(`Bold quick action left an unexpected caret: ${JSON.stringify(keyboardOpenState)}`)
  }

  await hideAndroidKeyboard(driver)
  const toolbarStart = keyboardOpenState.source.indexOf('toolbar')
  await setEditorSelection(driver, toolbarStart, toolbarStart + 'toolbar'.length)
  await tapQuickAction(driver, 'Italic', 'markdown-italic-keyboard-hidden')
  await driver.waitUntil(
    async () => (await readEditorState(driver)).source === '**Keyboard** *toolbar* check',
    {
      timeout: 10_000,
      timeoutMsg: 'Italic quick action did not update the Markdown source',
      interval: 250,
    },
  )

  const keyboardHiddenState = await readEditorState(driver)
  await writeJson(artifactRoot, 'markdown-toolbar-keyboard-hidden.json', keyboardHiddenState)
  await captureSnapshot(driver, artifactRoot, '22-markdown-toolbar-keyboard-hidden')
  if (keyboardHiddenState.keyboardExpanded) {
    throw new Error(
      `Toolbar action reopened the hidden keyboard: ${JSON.stringify(keyboardHiddenState)}`,
    )
  }
  if (keyboardHiddenState.selection?.selectionStart !== 22 || keyboardHiddenState.selection?.selectionEnd !== 22) {
    throw new Error(`Italic quick action left an unexpected caret: ${JSON.stringify(keyboardHiddenState)}`)
  }

  const longMarkdown = Array.from(
    {length: 120},
    (_, index) => `Keyboard clearance line ${String(index + 1).padStart(3, '0')} ${noteName}`,
  ).join('\n')
  const expectedLastLine = `Keyboard clearance line 120 ${noteName}`
  await setEditorSource(driver, longMarkdown)

  const longEditorCenter = await readEditorTargetCenter(driver, '.cm-content')
  if (!longEditorCenter) {
    throw new Error('Long Markdown editor content is unavailable')
  }
  await tapCssPoint(driver, longEditorCenter, 'focus-long-markdown-editor')
  await waitForAndroidKeyboard(driver, true, {timeout: 20_000})

  await driver.waitUntil(
    async () => {
      await focusEditorEndAndScrollToBottom(driver)
      const state = await readEditorKeyboardClearanceState(driver)
      return Boolean(
        state?.keyboardExpanded &&
        state.editorFocused &&
        state.keyboardInset > 0 &&
        state.scroller.scrollAtBottom &&
        state.contentClearance <= 1 &&
        state.lastLine?.text === expectedLastLine &&
        state.caret,
      )
    },
    {
      timeout: 20_000,
      timeoutMsg: 'Long Markdown note did not settle at the end above the open keyboard',
      interval: 250,
    },
  )

  const longKeyboardOpenState = await readEditorKeyboardClearanceState(driver)
  await writeJson(artifactRoot, 'markdown-toolbar-long-note-keyboard-open.json', longKeyboardOpenState)
  await captureSnapshot(driver, artifactRoot, '23-markdown-toolbar-long-note-keyboard-open')
  if (
    !longKeyboardOpenState ||
    !longKeyboardOpenState.keyboardExpanded ||
    !longKeyboardOpenState.editorFocused ||
    longKeyboardOpenState.keyboardInset <= 0 ||
    !longKeyboardOpenState.scroller.scrollAtBottom ||
    longKeyboardOpenState.contentClearance > 1 ||
    longKeyboardOpenState.lastLine?.text !== expectedLastLine ||
    longKeyboardOpenState.scroller.bottom >= longKeyboardOpenState.quickBar.top ||
    longKeyboardOpenState.lastLine.bottom > longKeyboardOpenState.quickBar.top + 1 ||
    !longKeyboardOpenState.caret ||
    longKeyboardOpenState.caret.bottom > longKeyboardOpenState.quickBar.top + 1 ||
    longKeyboardOpenState.quickBar.bottom > longKeyboardOpenState.viewport.keyboardTop + 1 ||
    longKeyboardOpenState.document.maxScroll > 1 ||
    Math.abs(longKeyboardOpenState.document.scrollTop) > 1 ||
    longKeyboardOpenState.root.maxScroll > 1 ||
    Math.abs(longKeyboardOpenState.root.scrollTop) > 1 ||
    longKeyboardOpenState.body.maxScroll > 1 ||
    Math.abs(longKeyboardOpenState.body.scrollTop) > 1
  ) {
    throw new Error(
      `Long Markdown note is not clear of the open keyboard toolbar: ${JSON.stringify(longKeyboardOpenState)}`,
    )
  }

  await hideAndroidKeyboard(driver)
  await driver.waitUntil(
    async () => {
      const state = await readEditorKeyboardClearanceState(driver)
      return Boolean(
        state &&
        !state.keyboardExpanded &&
        state.scroller.scrollAtBottom &&
        state.contentClearance <= 1 &&
        state.lastLine?.text === expectedLastLine,
      )
    },
    {
      timeout: 15_000,
      timeoutMsg: 'Long Markdown editor viewport did not settle after closing the keyboard',
      interval: 250,
    },
  )

  const longKeyboardClosedState = await readEditorKeyboardClearanceState(driver)
  await writeJson(artifactRoot, 'markdown-toolbar-long-note-keyboard-closed.json', longKeyboardClosedState)
  await captureSnapshot(driver, artifactRoot, '24-markdown-toolbar-long-note-keyboard-closed')
  if (
    !longKeyboardClosedState ||
    longKeyboardClosedState.keyboardExpanded ||
    !longKeyboardClosedState.scroller.scrollAtBottom ||
    longKeyboardClosedState.contentClearance > 1 ||
    longKeyboardClosedState.lastLine?.text !== expectedLastLine ||
    longKeyboardClosedState.lastLine.bottom > longKeyboardClosedState.quickBar.top + 1 ||
    longKeyboardClosedState.document.maxScroll > 1 ||
    Math.abs(longKeyboardClosedState.document.scrollTop) > 1 ||
    longKeyboardClosedState.root.maxScroll > 1 ||
    Math.abs(longKeyboardClosedState.root.scrollTop) > 1 ||
    longKeyboardClosedState.body.maxScroll > 1 ||
    Math.abs(longKeyboardClosedState.body.scrollTop) > 1 ||
    Math.abs(longKeyboardClosedState.content.top - longKeyboardOpenState.content.top) > 1 ||
    Math.abs(longKeyboardClosedState.scroller.top - longKeyboardOpenState.scroller.top) > 1 ||
    longKeyboardClosedState.scroller.bottom < longKeyboardOpenState.scroller.bottom
  ) {
    throw new Error(
      `Long Markdown editor viewport was not stable after closing the keyboard: ${JSON.stringify({
        closed: longKeyboardClosedState,
        open: longKeyboardOpenState,
      })}`,
    )
  }
}
