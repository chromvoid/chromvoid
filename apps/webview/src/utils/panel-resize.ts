/**
 * PanelResizeController - обеспечивает изменение размеров панелей в dual-pane режиме
 * Поддерживает как touch, так и mouse взаимодействие для планшетов и десктопов
 */

export interface ResizeOptions {
  /** Минимальная ширина панели в пикселях */
  minSize?: number
  /** Максимальная ширина панели в пикселях */
  maxSize?: number
  /** Только touch устройства */
  touchOnly?: boolean
  /** Включить haptic feedback */
  hapticFeedback?: boolean
}

export interface ResizeEvent {
  panel: 'sidebar' | 'details'
  newSize: number
  percentage: number
  originalEvent: TouchEvent | PointerEvent | MouseEvent
}

export type ResizeHandler = (event: ResizeEvent) => void

const defaultOptions: Required<ResizeOptions> = {
  minSize: 200,
  maxSize: 600,
  touchOnly: false,
  hapticFeedback: true,
}

export class PanelResizeController {
  private container: HTMLElement
  private sidebar: HTMLElement | null = null
  private details: HTMLElement | null = null
  private options: Required<ResizeOptions>
  private isResizing = false
  private currentPanel: 'sidebar' | 'details' | null = null
  private startX = 0
  private startSize = 0
  private handlers: {
    onResizeStart?: ResizeHandler
    onResize?: ResizeHandler
    onResizeEnd?: ResizeHandler
  } = {}

  constructor(container: HTMLElement, options: Partial<ResizeOptions> = {}) {
    this.container = container
    this.options = {...defaultOptions, ...options}
    this.init()
  }

  private init() {
    // Находим панели внутри контейнера
    this.sidebar = (this.container.shadowRoot?.querySelector('.sidebar') as HTMLElement) || null
    this.details = (this.container.shadowRoot?.querySelector('.details') as HTMLElement) || null

    if (!this.sidebar || !this.details) {
      console.warn('PanelResizeController: sidebar or details panel not found')
      return
    }

    this.setupResizeHandles()
  }

  private setupResizeHandles() {
    // Только в dual-pane режиме на планшетах
    if (window.innerWidth < 800 || window.innerWidth > 1200) return

    // Добавляем event listeners для resize handles
    this.container.addEventListener('pointerdown', this.handlePointerDown.bind(this))
    this.container.addEventListener('touchstart', this.handleTouchStart.bind(this), {passive: false})
    this.container.addEventListener('mousedown', this.handleMouseDown.bind(this))

    document.addEventListener('pointermove', this.handlePointerMove.bind(this))
    document.addEventListener('touchmove', this.handleTouchMove.bind(this), {passive: false})
    document.addEventListener('mousemove', this.handleMouseMove.bind(this))

    document.addEventListener('pointerup', this.handlePointerUp.bind(this))
    document.addEventListener('touchend', this.handleTouchEnd.bind(this))
    document.addEventListener('mouseup', this.handleMouseUp.bind(this))
  }

  private handlePointerDown(e: PointerEvent) {
    if (this.options.touchOnly && e.pointerType !== 'touch') return
    this.startResize(e, e.clientX)
  }

  private handleTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    if (!touch) return
    this.startResize(e, touch.clientX)
    e.preventDefault() // Предотвращаем scroll
  }

  private handleMouseDown(e: MouseEvent) {
    if (this.options.touchOnly) return
    this.startResize(e, e.clientX)
  }

  private startResize(originalEvent: TouchEvent | PointerEvent | MouseEvent, clientX: number) {
    const target = originalEvent.target as HTMLElement

    // Проверяем что клик был по resize handle
    if (!target?.closest?.('::after') && !this.isResizeHandle(target)) return

    // Определяем какую панель ресайзим
    if (target.closest('.sidebar')) {
      this.currentPanel = 'sidebar'
      this.startSize = this.sidebar?.offsetWidth || 0
    } else if (target.closest('.details')) {
      this.currentPanel = 'details'
      this.startSize = this.details?.offsetWidth || 0
    } else {
      return
    }

    this.isResizing = true
    this.startX = clientX

    // Добавляем visual feedback
    this.container.style.setProperty('--resizing', '1')
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    // Haptic feedback
    if (this.options.hapticFeedback && 'vibrate' in navigator) {
      navigator.vibrate(50)
    }

    // Уведомляем о начале resize
    this.handlers.onResizeStart?.({
      panel: this.currentPanel,
      newSize: this.startSize,
      percentage: this.getSizePercentage(this.startSize),
      originalEvent,
    })

    originalEvent.preventDefault()
  }

  private handlePointerMove(e: PointerEvent) {
    if (!this.isResizing) return
    this.updateResize(e.clientX, e)
  }

  private handleTouchMove(e: TouchEvent) {
    if (!this.isResizing || e.touches.length !== 1) return
    const touch = e.touches[0]
    if (!touch) return
    this.updateResize(touch.clientX, e)
    e.preventDefault()
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.isResizing) return
    this.updateResize(e.clientX, e)
  }

  private updateResize(clientX: number, originalEvent: TouchEvent | PointerEvent | MouseEvent) {
    if (!this.currentPanel || !this.isResizing) return

    const deltaX = clientX - this.startX
    let newSize = this.startSize

    if (this.currentPanel === 'sidebar') {
      newSize = this.startSize + deltaX
    } else {
      newSize = this.startSize - deltaX // Для details инвертируем направление
    }

    // Применяем ограничения
    newSize = Math.max(this.options.minSize, Math.min(this.options.maxSize, newSize))

    // Обновляем размер панели
    this.setPanelSize(this.currentPanel, newSize)

    // Уведомляем о изменении
    this.handlers.onResize?.({
      panel: this.currentPanel,
      newSize,
      percentage: this.getSizePercentage(newSize),
      originalEvent,
    })
  }

  private handlePointerUp(e: PointerEvent) {
    this.endResize(e)
  }

  private handleTouchEnd(e: TouchEvent) {
    this.endResize(e)
  }

  private handleMouseUp(e: MouseEvent) {
    this.endResize(e)
  }

  private endResize(originalEvent: TouchEvent | PointerEvent | MouseEvent) {
    if (!this.isResizing) return

    const panel = this.currentPanel
    const finalSize = this.getCurrentPanelSize(panel!)

    // Убираем visual feedback
    this.container.style.removeProperty('--resizing')
    document.body.style.cursor = ''
    document.body.style.userSelect = ''

    // Сохраняем размер в localStorage для следующей сессии
    if (panel) {
      localStorage.setItem(`panel-${panel}-size`, finalSize.toString())
    }

    // Уведомляем о завершении
    this.handlers.onResizeEnd?.({
      panel: panel!,
      newSize: finalSize,
      percentage: this.getSizePercentage(finalSize),
      originalEvent,
    })

    this.isResizing = false
    this.currentPanel = null
  }

  private isResizeHandle(element: HTMLElement): boolean {
    // Проверяем является ли элемент resize handle
    const rect = element.getBoundingClientRect()
    const siblingRect = this.sidebar?.getBoundingClientRect()
    const detailsRect = this.details?.getBoundingClientRect()

    if (siblingRect && Math.abs(rect.left - siblingRect.right) < 20) {
      return true
    }
    if (detailsRect && Math.abs(rect.right - detailsRect.left) < 20) {
      return true
    }

    return false
  }

  private setPanelSize(panel: 'sidebar' | 'details', size: number) {
    const element = panel === 'sidebar' ? this.sidebar : this.details
    if (!element) return

    // Обновляем CSS custom property для grid-template-columns
    const containerWidth = this.container.offsetWidth
    const percentage = (size / containerWidth) * 100

    if (panel === 'sidebar') {
      this.container.style.setProperty('--sidebar-width', `${size}px`)
    } else {
      this.container.style.setProperty('--details-width', `${size}px`)
    }
  }

  private getCurrentPanelSize(panel: 'sidebar' | 'details'): number {
    const element = panel === 'sidebar' ? this.sidebar : this.details
    return element?.offsetWidth || 0
  }

  private getSizePercentage(size: number): number {
    const containerWidth = this.container.offsetWidth
    return (size / containerWidth) * 100
  }

  // Public API методы
  on(event: 'start' | 'resize' | 'end', handler: ResizeHandler) {
    if (event === 'start') this.handlers.onResizeStart = handler
    if (event === 'resize') this.handlers.onResize = handler
    if (event === 'end') this.handlers.onResizeEnd = handler
  }

  off(event: 'start' | 'resize' | 'end') {
    if (event === 'start') this.handlers.onResizeStart = undefined
    if (event === 'resize') this.handlers.onResize = undefined
    if (event === 'end') this.handlers.onResizeEnd = undefined
  }

  /**
   * Устанавливает размер панели программно
   */
  setPanelSizeTo(panel: 'sidebar' | 'details', size: number) {
    this.setPanelSize(panel, Math.max(this.options.minSize, Math.min(this.options.maxSize, size)))
  }

  /**
   * Восстанавливает размеры панелей из localStorage
   */
  restorePanelSizes() {
    const sidebarSize = localStorage.getItem('panel-sidebar-size')
    const detailsSize = localStorage.getItem('panel-details-size')

    if (sidebarSize) {
      this.setPanelSize('sidebar', parseInt(sidebarSize, 10))
    }
    if (detailsSize) {
      this.setPanelSize('details', parseInt(detailsSize, 10))
    }
  }

  /**
   * Очищает все event listeners
   */
  destroy() {
    // Удаляем все event listeners
    // В базовой версии не храним ссылки на bound функции для простоты
    this.handlers = {}
  }
}

/**
 * Хелпер для быстрой настройки resize функциональности
 */
export function setupPanelResize(container: HTMLElement, options: ResizeOptions = {}): PanelResizeController {
  return new PanelResizeController(container, options)
}

/**
 * Проверяет поддерживает ли устройство dual-pane режим
 */
export function supportsDualPane(): boolean {
  return window.innerWidth >= 800 && window.innerWidth <= 1200
}
