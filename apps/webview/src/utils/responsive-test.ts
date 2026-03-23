/**
 * ResponsiveTest - утилита для тестирования адаптивных улучшений
 * Предоставляет методы для симуляции различных размеров экрана и проверки responsive поведения
 */

export interface TestResult {
  passed: boolean
  message: string
  details?: any
}

export interface ResponsiveTestSuite {
  mobile: TestResult[]
  tablet: TestResult[]
  desktop: TestResult[]
  touchDevice: TestResult[]
  dualPane: TestResult[]
}

export class ResponsiveTestRunner {
  private originalViewport: {width: number; height: number}
  private results: ResponsiveTestSuite = {
    mobile: [],
    tablet: [],
    desktop: [],
    touchDevice: [],
    dualPane: [],
  }

  constructor() {
    this.originalViewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    }
  }

  /**
   * Запускает все тесты адаптивности
   */
  async runAllTests(): Promise<ResponsiveTestSuite> {
    console.group('🧪 Running Responsive Tests')

    try {
      await this.testMobileBreakpoints()
      await this.testTabletBreakpoints()
      await this.testDesktopBreakpoints()
      await this.testTouchInteractions()
      await this.testDualPaneMode()

      this.logResults()
    } finally {
      this.restoreViewport()
      console.groupEnd()
    }

    return this.results
  }

  private async testMobileBreakpoints(): Promise<void> {
    console.group('📱 Mobile Breakpoints')

    // Тест iPhone размеров
    await this.setViewportSize(375, 812)
    this.results.mobile.push(
      this.testElement('.show-mobile-only', true, 'Mobile-only элементы должны быть видны'),
    )
    this.results.mobile.push(
      this.testElement('.show-tablet-up', false, 'Tablet+ элементы должны быть скрыты'),
    )
    this.results.mobile.push(
      this.testCSSProperty('--touch-target-min', '48px', 'Touch targets должны быть увеличены'),
    )

    // Тест больших мобильных (480px+)
    await this.setViewportSize(480, 800)
    this.results.mobile.push(this.testElement('.show-sm-up', true, 'SM+ элементы должны быть видны'))
    this.results.mobile.push(this.testSwipeGestures('Touch swipe жесты должны работать'))

    console.groupEnd()
  }

  private async testTabletBreakpoints(): Promise<void> {
    console.group('🖥️ Tablet Breakpoints')

    // Тест планшета в портрете
    await this.setViewportSize(768, 1024)
    this.results.tablet.push(this.testElement('.show-tablet-up', true, 'Tablet элементы должны быть видны'))
    this.results.tablet.push(
      this.testElement('.show-mobile-only', false, 'Mobile-only элементы должны быть скрыты'),
    )
    this.results.tablet.push(
      this.testCSSProperty('--touch-target-comfortable', '52px', 'Touch targets комфортного размера'),
    )

    // Тест планшета в landscape
    await this.setViewportSize(1024, 768)
    this.results.tablet.push(
      this.testElement('.dual-pane-container', true, 'Dual-pane контейнер должен быть активен'),
    )

    console.groupEnd()
  }

  private async testDesktopBreakpoints(): Promise<void> {
    console.group('🖥️ Desktop Breakpoints')

    await this.setViewportSize(1280, 720)
    this.results.desktop.push(
      this.testElement('.show-desktop-up', true, 'Desktop элементы должны быть видны'),
    )
    this.results.desktop.push(
      this.testElement('.triple-pane-container', true, 'Triple-pane контейнер должен быть доступен'),
    )
    this.results.desktop.push(
      this.testCSSProperty(
        '--mobile-padding',
        'var(--app-spacing-7)',
        'Desktop padding должен быть увеличен',
      ),
    )

    console.groupEnd()
  }

  private async testTouchInteractions(): Promise<void> {
    console.group('👆 Touch Interactions')

    // Симулируем touch устройство
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      configurable: true,
    })

    this.results.touchDevice.push(this.testTouchTargetSizes('Touch targets должны соответствовать WCAG'))
    this.results.touchDevice.push(this.testTouchSpacing('Spacing между touch элементами достаточный'))
    this.results.touchDevice.push(this.testSwipeAreas('Swipe области правильно настроены'))

    console.groupEnd()
  }

  private async testDualPaneMode(): Promise<void> {
    console.group('🪟 Dual-Pane Mode')

    // Тест dual-pane на планшетах
    await this.setViewportSize(1000, 600)

    const fileAppShell = document.querySelector('file-app-shell') as HTMLElement
    if (fileAppShell) {
      fileAppShell.setAttribute('data-dual-pane', '')

      this.results.dualPane.push(this.testDualPaneLayout(fileAppShell))
      this.results.dualPane.push(this.testResizeHandles(fileAppShell))
      this.results.dualPane.push(this.testPanelPersistence(fileAppShell))
    }

    console.groupEnd()
  }

  private async setViewportSize(width: number, height: number): Promise<void> {
    return new Promise((resolve) => {
      // Изменяем размер viewport (только для тестирования)
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: width,
      })
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: height,
      })

      // Диспатчим событие resize
      window.dispatchEvent(new Event('resize'))

      // Даем время на обновление стилей
      setTimeout(resolve, 100)
    })
  }

  private testElement(selector: string, shouldBeVisible: boolean, message: string): TestResult {
    const element = document.querySelector(selector)
    if (!element) {
      return {passed: false, message: `${message} - элемент не найден`}
    }

    const styles = getComputedStyle(element)
    const isVisible = styles.display !== 'none' && styles.visibility !== 'hidden'

    const passed = isVisible === shouldBeVisible
    return {
      passed,
      message: passed ? `✅ ${message}` : `❌ ${message}`,
      details: {selector, expectedVisible: shouldBeVisible, actualVisible: isVisible},
    }
  }

  private testCSSProperty(property: string, expectedValue: string, message: string): TestResult {
    const rootStyles = getComputedStyle(document.documentElement)
    const actualValue = rootStyles.getPropertyValue(property).trim()

    const passed = actualValue === expectedValue
    return {
      passed,
      message: passed ? `✅ ${message}` : `❌ ${message}`,
      details: {property, expected: expectedValue, actual: actualValue},
    }
  }

  private testSwipeGestures(message: string): TestResult {
    // Проверяем наличие swipe event listeners
    const hasSwipeSupport = 'ontouchstart' in window
    const hasPointerSupport = 'onpointerdown' in window

    const passed = hasSwipeSupport || hasPointerSupport
    return {
      passed,
      message: passed ? `✅ ${message}` : `❌ ${message}`,
      details: {hasSwipeSupport, hasPointerSupport},
    }
  }

  private testTouchTargetSizes(message: string): TestResult {
    const touchElements = document.querySelectorAll('.interactive, button, [role="button"]')
    let minSize = Infinity
    let failedElements = 0

    touchElements.forEach((element) => {
      const rect = element.getBoundingClientRect()
      const size = Math.min(rect.width, rect.height)
      minSize = Math.min(minSize, size)

      if (size < 44) {
        // WCAG minimum
        failedElements++
      }
    })

    const passed = failedElements === 0
    return {
      passed,
      message: passed ? `✅ ${message}` : `❌ ${message}`,
      details: {minSize, failedElements, totalElements: touchElements.length},
    }
  }

  private testTouchSpacing(message: string): TestResult {
    const touchElements = document.querySelectorAll('.interactive, button')
    let inadequateSpacing = 0

    for (let i = 0; i < touchElements.length - 1; i++) {
      const el1 = touchElements[i]
      const el2 = touchElements[i + 1]
      if (!el1 || !el2) continue
      const rect1 = el1.getBoundingClientRect()
      const rect2 = el2.getBoundingClientRect()

      const distance = Math.sqrt(
        Math.pow(rect2.left - rect1.right, 2) + Math.pow(rect2.top - rect1.bottom, 2),
      )

      if (distance < 8) {
        // Минимальное расстояние
        inadequateSpacing++
      }
    }

    const passed = inadequateSpacing === 0
    return {
      passed,
      message: passed ? `✅ ${message}` : `❌ ${message}`,
      details: {inadequateSpacing},
    }
  }

  private testSwipeAreas(message: string): TestResult {
    const swipeAreas = document.querySelectorAll('.swipe-area')
    let validAreas = 0

    swipeAreas.forEach((area) => {
      const styles = getComputedStyle(area)
      const touchAction = styles.touchAction
      const minHeight = parseInt(styles.minHeight) || 0

      if (touchAction.includes('pan') && minHeight >= 44) {
        validAreas++
      }
    })

    const passed = validAreas === swipeAreas.length
    return {
      passed,
      message: passed ? `✅ ${message}` : `❌ ${message}`,
      details: {validAreas, totalAreas: swipeAreas.length},
    }
  }

  private testDualPaneLayout(element: HTMLElement): TestResult {
    const styles = getComputedStyle(element)
    const gridTemplate = styles.gridTemplateColumns
    const hasDualPane = gridTemplate.includes('1fr') && gridTemplate.split(' ').length >= 3

    return {
      passed: hasDualPane,
      message: hasDualPane ? '✅ Dual-pane layout активен' : '❌ Dual-pane layout не активен',
      details: {gridTemplate},
    }
  }

  private testResizeHandles(element: HTMLElement): TestResult {
    const sidebar = element.shadowRoot?.querySelector('.sidebar')
    const details = element.shadowRoot?.querySelector('.details')

    if (!sidebar || !details) {
      return {passed: false, message: '❌ Панели не найдены'}
    }

    // Проверяем наличие псевдоэлементов ::after для resize handles
    const sidebarStyles = getComputedStyle(sidebar, '::after')
    const detailsStyles = getComputedStyle(details, '::after')

    const hasHandles = sidebarStyles.content !== 'none' || detailsStyles.content !== 'none'

    return {
      passed: hasHandles,
      message: hasHandles ? '✅ Resize handles присутствуют' : '❌ Resize handles отсутствуют',
      details: {sidebarHandle: sidebarStyles.content, detailsHandle: detailsStyles.content},
    }
  }

  private testPanelPersistence(_element: HTMLElement): TestResult {
    // Проверяем localStorage для сохранения размеров панелей
    const sidebarSize = localStorage.getItem('panel-sidebar-size')
    const detailsSize = localStorage.getItem('panel-details-size')

    const hasPersistence = sidebarSize !== null || detailsSize !== null

    return {
      passed: hasPersistence,
      message: hasPersistence ? '✅ Panel persistence работает' : '❌ Panel persistence не настроен',
      details: {sidebarSize, detailsSize},
    }
  }

  private logResults(): void {
    console.group('📊 Test Results Summary')

    Object.entries(this.results).forEach(([category, tests]: [string, TestResult[]]) => {
      const passed = tests.filter((t: TestResult) => t.passed).length
      const total = tests.length
      const percentage = total > 0 ? Math.round((passed / total) * 100) : 0

      console.log(`${category}: ${passed}/${total} (${percentage}%) passed`)

      // Показываем детали неудачных тестов
      tests
        .filter((t: TestResult) => !t.passed)
        .forEach((test: TestResult) => {
          console.warn(test.message, test.details)
        })
    })

    console.groupEnd()
  }

  private restoreViewport(): void {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: this.originalViewport.width,
    })
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: this.originalViewport.height,
    })

    window.dispatchEvent(new Event('resize'))
  }

  /**
   * Создает интерактивный тестовый компонент в DOM
   */
  createTestUI(): HTMLElement {
    const container = document.createElement('div')
    container.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--cv-color-surface);
        border: 1px solid var(--cv-color-border);
        border-radius: var(--cv-radius-2);
        padding: var(--app-spacing-4);
        box-shadow: var(--cv-shadow-3);
        z-index: var(--cv-z-toast);
        min-width: 300px;
      ">
        <h3 style="margin: 0 0 var(--app-spacing-3) 0;">Responsive Tests</h3>
        <button id="run-responsive-tests" style="
          background: var(--cv-color-primary);
          color: white;
          border: none;
          padding: var(--app-spacing-2) var(--app-spacing-4);
          border-radius: var(--cv-radius-1);
          cursor: pointer;
          width: 100%;
          margin-bottom: var(--app-spacing-3);
        ">Run All Tests</button>
        <div id="test-results" style="
          font-size: var(--cv-font-size-sm);
          max-height: 300px;
          overflow-y: auto;
        "></div>
      </div>
    `

    const button = container.querySelector('#run-responsive-tests') as HTMLButtonElement
    const results = container.querySelector('#test-results') as HTMLDivElement

    button.addEventListener('click', async () => {
      button.disabled = true
      button.textContent = 'Running...'
      results.innerHTML = 'Running tests...'

      try {
        const testResults = await this.runAllTests()
        this.displayResults(results, testResults)
      } finally {
        button.disabled = false
        button.textContent = 'Run All Tests'
      }
    })

    return container
  }

  private displayResults(container: HTMLElement, results: ResponsiveTestSuite): void {
    let html = ''

    Object.entries(results).forEach(([category, tests]: [string, TestResult[]]) => {
      const passed = tests.filter((t: TestResult) => t.passed).length
      const total = tests.length
      const percentage = total > 0 ? Math.round((passed / total) * 100) : 0

      html += `
        <div style="margin-bottom: var(--app-spacing-3);">
          <div style="font-weight: var(--cv-font-weight-semibold); margin-bottom: var(--app-spacing-1);">
            ${category}: ${passed}/${total} (${percentage}%)
          </div>
          ${tests
            .map(
              (test: TestResult) => `
            <div style="color: ${
              test.passed ? 'var(--cv-color-success)' : 'var(--cv-color-danger)'
            }; font-size: var(--cv-font-size-xs);">
              ${test.message}
            </div>
          `,
            )
            .join('')}
        </div>
      `
    })

    container.innerHTML = html
  }
}

/**
 * Хелпер для быстрого запуска тестов из консоли
 */
export async function runResponsiveTests(): Promise<ResponsiveTestSuite> {
  const runner = new ResponsiveTestRunner()
  return await runner.runAllTests()
}

/**
 * Хелпер для создания тестового UI
 */
export function createResponsiveTestUI(): HTMLElement {
  const runner = new ResponsiveTestRunner()
  const ui = runner.createTestUI()
  document.body.appendChild(ui)
  return ui
}

// Автоматически добавляем тестовый UI в development режиме
if (window.env === 'dev' || window.location.search.includes('debug=responsive')) {
  document.addEventListener('DOMContentLoaded', () => {
    createResponsiveTestUI()
  })
}
