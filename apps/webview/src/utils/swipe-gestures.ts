/**Swipe Gesture Utility for mobile interface
* Supports swipe in 4 directions with customizable parameters
*/

export type SwipeDirection = 'left' | 'right' | 'up' | 'down'

export interface SwipeOptions {
  /**Minimum distance for swipe registration (px)*/
  threshold?: number
  /**Maximum deviation perpendicular to direction (px)*/
  restraint?: number
  /**Maximum time for swipe gesture (MS)*/
  allowedTime?: number
  /**Only touch devices*/
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
    // Support for touch and pointer events
    const hasTouch = 'ontouchstart' in window
    const hasPointer = 'onpointerdown' in window

    if (hasTouch && (!this.options.touchOnly || !hasPointer)) {
      // Touch events (priority for touch devices)
      this.element.addEventListener('touchstart', this.handleStart.bind(this), {passive: true})
      this.element.addEventListener('touchend', this.handleEnd.bind(this), {passive: true})
    } else if (hasPointer && !this.options.touchOnly) {
      // Pointer events (mouse support + touch)
      this.element.addEventListener('pointerdown', this.handleStart.bind(this))
      this.element.addEventListener('pointerup', this.handleEnd.bind(this))
      this.element.addEventListener('pointercancel', this.handleCancel.bind(this))
    }
  }

  private handleStart(event: TouchEvent | PointerEvent) {
    const touch = this.getEventCoordinates(event)
    if (!touch) return

    // Touch devices only if specified
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

    // Checking time limits
    if (duration > this.options.allowedTime) return

    // Identifying the swipe direction
    let direction: SwipeDirection | null = null
    let distance = 0
    let restraintDistance = 0

    if (distanceX >= this.options.threshold || distanceY >= this.options.threshold) {
      if (distanceX > distanceY) {
        // Horizontal swipe
        direction = deltaX < 0 ? 'left' : 'right'
        distance = distanceX
        restraintDistance = distanceY
      } else {
        // Vertical swipe
        direction = deltaY < 0 ? 'up' : 'down'
        distance = distanceY
        restraintDistance = distanceX
      }
    }

    // Checking the Rejection Limits
    if (!direction || restraintDistance > this.options.restraint) return

    // Create an event facility
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

  /*** Adds a handler for a specific swipe direction
*/
  on(direction: SwipeDirection, handler: SwipeHandler): void {
    if (!this.handlers.has(direction)) {
      this.handlers.set(direction, [])
    }
    this.handlers.get(direction)!.push(handler)
  }

  /*** Remove the handler for a specific direction
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

  /*** Adds handlers for multiple directions
*/
  onMultiple(directions: SwipeDirection[], handler: SwipeHandler): void {
    directions.forEach((direction) => this.on(direction, handler))
  }

  /*** Clears all handlers
*/
  clear(): void {
    this.handlers.clear()
  }

  /*** Destroys the instance and removes all handlers
*/
  destroy(): void {
    this.clear()
    // Delete event listeners (you need to save links to bound functions)
    // For simplicity, we do not implement a full cleaning in the basic version.
  }
}

/**Helper to quickly create swipe gestures
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

/**Helper for swipe navigation (left/right)
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

/**Checks support for touch gestures on the device
*/
export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

/*** Checks the mobile device for the characteristics of the screen
*/
export function isMobileDevice(): boolean {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches
}
