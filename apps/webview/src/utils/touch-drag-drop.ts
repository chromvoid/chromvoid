/**
 * Touch Drag & Drop утилита для планшетных устройств
 * Расширяет стандартный HTML5 drag & drop для touch события
 */
import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

export interface TouchDragDropOptions {
  /** Задержка для long press (ms) */
  longPressDelay?: number
  /** Минимальное расстояние для начала drag (px) */
  dragThreshold?: number
  /** Включить haptic feedback (если поддерживается) */
  hapticFeedback?: boolean
  /** Только touch устройства */
  touchOnly?: boolean
}

export interface TouchDragEvent {
  type: 'start' | 'move' | 'end' | 'cancel'
  originalEvent: TouchEvent | PointerEvent
  clientX: number
  clientY: number
  target: Element
  data?: unknown
}

export type TouchDragHandler = (event: TouchDragEvent) => void

const defaultOptions: Required<TouchDragDropOptions> = {
  longPressDelay: 500,
  dragThreshold: 10,
  hapticFeedback: true,
  touchOnly: true,
}

// ============ Веб-компонент для визуального drag элемента ============

class TouchDragGhost extends XLitElement {
  static styles = [
    css`
      :host {
        position: fixed;
        z-index: 10000;
        pointer-events: none;
        transform: scale(1.05) rotate(5deg);
        opacity: 0.9;
        filter: drop-shadow(0 8px 16px var(--cv-alpha-black-35));
        contain: layout paint style;
        will-change: transform;
      }

      :host([hidden]) {
        display: none;
      }

      .content {
        display: contents;
      }
    `,
  ]

  private _left = 0
  private _top = 0

  setPosition(left: number, top: number) {
    this._left = left
    this._top = top
    this.style.left = `${left}px`
    this.style.top = `${top}px`
  }

  setContent(element: HTMLElement) {
    const clone = element.cloneNode(true) as HTMLElement
    // Убираем id чтобы не было дублирования
    clone.removeAttribute('id')
    this.shadowRoot?.querySelector('.content')?.replaceChildren(clone)
  }

  protected render() {
    return html`<div class="content"></div>`
  }
}

// Регистрируем компонент один раз
if (!customElements.get('touch-drag-ghost')) {
  customElements.define('touch-drag-ghost', TouchDragGhost)
}

// ============ Основной контроллер ============

export class TouchDragDropController {
  private element: HTMLElement
  private options: Required<TouchDragDropOptions>
  private isDragging = false
  private dragData: unknown = null
  private longPressTimer: number | null = null
  private startX = 0
  private startY = 0
  private currentX = 0
  private currentY = 0
  private ghostElement: TouchDragGhost | null = null
  private dropZones = new Set<HTMLElement>()
  private currentDropZone: HTMLElement | null = null

  private handlers: {
    onDragStart?: TouchDragHandler
    onDragMove?: TouchDragHandler
    onDragEnd?: TouchDragHandler
    onDragCancel?: TouchDragHandler
  } = {}

  constructor(element: HTMLElement, options: Partial<TouchDragDropOptions> = {}) {
    this.element = element
    this.options = {...defaultOptions, ...options}
    this.setupEventListeners()
  }

  on(event: 'start' | 'move' | 'end' | 'cancel', handler: TouchDragHandler) {
    const handlerMap = {
      start: 'onDragStart',
      move: 'onDragMove',
      end: 'onDragEnd',
      cancel: 'onDragCancel',
    } as const
    this.handlers[handlerMap[event]] = handler
  }

  setDragData(data: unknown) {
    this.dragData = data
  }

  addDropZone(element: HTMLElement) {
    this.dropZones.add(element)
    if (!element.style.position) {
      element.style.position = 'relative'
    }
  }

  removeDropZone(element: HTMLElement) {
    this.dropZones.delete(element)
  }

  destroy() {
    this.cleanup()
    this.element.removeEventListener('touchstart', this.handleTouchStart)
    this.element.removeEventListener('pointerdown', this.handlePointerDown)
  }

  private setupEventListeners() {
    // Используем touch events для touch устройств, pointer events для универсальности
    if (this.options.touchOnly && !('ontouchstart' in window)) {
      return
    }

    this.element.addEventListener('touchstart', this.handleTouchStart, {passive: false})
    this.element.addEventListener('pointerdown', this.handlePointerDown)
  }

  private handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return

    const touch = e.touches[0]
    if (!touch) return
    this.initDrag(touch.clientX, touch.clientY, e)
  }

  private handlePointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return

    this.initDrag(e.clientX, e.clientY, e)
  }

  private initDrag(clientX: number, clientY: number, originalEvent: TouchEvent | PointerEvent) {
    if (this.isDragging) return

    this.startX = clientX
    this.startY = clientY
    this.currentX = clientX
    this.currentY = clientY

    // Запускаем таймер long press
    this.longPressTimer = window.setTimeout(() => {
      this.startDrag(originalEvent)
    }, this.options.longPressDelay)

    // Слушаем движение и окончание
    document.addEventListener('touchmove', this.handleTouchMove, {passive: false})
    document.addEventListener('touchend', this.handleTouchEnd)
    document.addEventListener('pointermove', this.handlePointerMove)
    document.addEventListener('pointerup', this.handlePointerUp)
  }

  private handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 1) return

    const touch = e.touches[0]
    if (!touch) return
    this.updateDrag(touch.clientX, touch.clientY, e)
  }

  private handlePointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return

    this.updateDrag(e.clientX, e.clientY, e)
  }

  private updateDrag(clientX: number, clientY: number, originalEvent: TouchEvent | PointerEvent) {
    this.currentX = clientX
    this.currentY = clientY

    const deltaX = Math.abs(clientX - this.startX)
    const deltaY = Math.abs(clientY - this.startY)
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

    // Если двигаемся слишком много до long press, отменяем
    if (!this.isDragging && distance > this.options.dragThreshold && this.longPressTimer) {
      this.cancelDrag()
      return
    }

    if (this.isDragging) {
      originalEvent.preventDefault()
      this.moveGhostElement(clientX, clientY)
      this.updateDropZones(clientX, clientY)

      this.handlers.onDragMove?.({
        type: 'move',
        originalEvent,
        clientX,
        clientY,
        target: this.element,
        data: this.dragData,
      })
    }
  }

  private handleTouchEnd = (e: TouchEvent) => {
    this.endDrag(e)
  }

  private handlePointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      this.endDrag(e)
    }
  }

  private startDrag(originalEvent: TouchEvent | PointerEvent) {
    if (this.isDragging) return

    this.isDragging = true
    this.longPressTimer = null

    // Haptic feedback если поддерживается
    if (this.options.hapticFeedback && 'vibrate' in navigator) {
      navigator.vibrate(50)
    }

    // Создаем визуальный ghost элемент
    this.createGhostElement()

    this.handlers.onDragStart?.({
      type: 'start',
      originalEvent,
      clientX: this.currentX,
      clientY: this.currentY,
      target: this.element,
      data: this.dragData,
    })
  }

  private endDrag(originalEvent: TouchEvent | PointerEvent) {
    const wasDragging = this.isDragging

    this.cleanup()

    if (wasDragging) {
      // Проверяем drop на текущую зону
      if (this.currentDropZone) {
        this.currentDropZone.dispatchEvent(
          new CustomEvent('touch-drop', {
            detail: {
              data: this.dragData,
              clientX: this.currentX,
              clientY: this.currentY,
              source: this.element,
            },
          }),
        )
      }

      this.handlers.onDragEnd?.({
        type: 'end',
        originalEvent,
        clientX: this.currentX,
        clientY: this.currentY,
        target: this.element,
        data: this.dragData,
      })
    }
  }

  private cancelDrag() {
    const wasDragging = this.isDragging

    this.cleanup()

    if (wasDragging) {
      this.handlers.onDragCancel?.({
        type: 'cancel',
        originalEvent: new TouchEvent('touchcancel'),
        clientX: this.currentX,
        clientY: this.currentY,
        target: this.element,
        data: this.dragData,
      })
    }
  }

  private createGhostElement() {
    // Создаем веб-компонент для визуального drag
    this.ghostElement = document.createElement('touch-drag-ghost') as TouchDragGhost
    this.ghostElement.setContent(this.element)
    this.moveGhostElement(this.currentX, this.currentY)
    document.body.appendChild(this.ghostElement)
  }

  private moveGhostElement(clientX: number, clientY: number) {
    if (!this.ghostElement) return

    const rect = this.element.getBoundingClientRect()
    const offsetX = rect.width / 2
    const offsetY = rect.height / 2

    this.ghostElement.setPosition(clientX - offsetX, clientY - offsetY)
  }

  private updateDropZones(clientX: number, clientY: number) {
    const elementUnderPoint = document.elementFromPoint(clientX, clientY)
    let newDropZone: HTMLElement | null = null

    // Ищем ближайшую drop zone
    const zones = Array.from(this.dropZones)
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i]
      if (zone && zone.contains(elementUnderPoint)) {
        newDropZone = zone
        break
      }
    }

    // Обновляем состояние drop zones
    if (newDropZone !== this.currentDropZone) {
      if (this.currentDropZone) {
        this.currentDropZone.classList.remove('touch-drag-over')
        this.currentDropZone.dispatchEvent(new CustomEvent('touch-dragleave'))
      }

      if (newDropZone) {
        newDropZone.classList.add('touch-drag-over')
        newDropZone.dispatchEvent(
          new CustomEvent('touch-dragover', {
            detail: {data: this.dragData},
          }),
        )
      }

      this.currentDropZone = newDropZone
    }
  }

  private cleanup() {
    // Убираем таймер
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer)
      this.longPressTimer = null
    }

    // Убираем ghost element
    if (this.ghostElement) {
      this.ghostElement.remove()
      this.ghostElement = null
    }

    // Убираем drop zone состояния
    if (this.currentDropZone) {
      this.currentDropZone.classList.remove('touch-drag-over')
      this.currentDropZone = null
    }

    // Убираем event listeners
    document.removeEventListener('touchmove', this.handleTouchMove)
    document.removeEventListener('touchend', this.handleTouchEnd)
    document.removeEventListener('pointermove', this.handlePointerMove)
    document.removeEventListener('pointerup', this.handlePointerUp)

    this.isDragging = false
    this.dragData = null
  }
}

// Хелпер для быстрой настройки touch drag & drop
export function setupTouchDragDrop(
  element: HTMLElement,
  options: TouchDragDropOptions = {},
): TouchDragDropController {
  return new TouchDragDropController(element, options)
}

// Utility для определения touch устройств
export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}
