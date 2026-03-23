import {state} from '@statx/core'
import type {State} from '@statx/core'

import {DEFAULT_SECRET_REVEAL_MS} from '@project/passmanager'

export class SecretFieldController<T> {
  readonly isVisible: State<boolean>
  readonly isLoading: State<boolean>
  readonly value: State<T>

  private hideTimer: number | undefined
  private readonly defaultValue: T
  private readonly autoHideMs: number

  constructor(defaultValue: T, autoHideMs: number = DEFAULT_SECRET_REVEAL_MS) {
    this.defaultValue = defaultValue
    this.autoHideMs = autoHideMs
    this.isVisible = state(false)
    this.isLoading = state(false)
    this.value = state(defaultValue)
  }

  /**
   * Показывает секрет и запускает таймер автоскрытия
   */
  async show(loader: () => Promise<T>): Promise<void> {
    this.clearTimer()
    this.isVisible.set(true)
    this.isLoading.set(true)
    const loaded = await loader()
    this.value.set(loaded)
    this.isLoading.set(false)
    if (this.autoHideMs > 0) this.startAutoHideTimer()
  }

  /**
   * Скрывает секрет и сбрасывает значение
   */
  hide(): void {
    this.clearTimer()
    this.isVisible.set(false)
    this.isLoading.set(false)
    this.value.set(this.defaultValue)
  }

  /**
   * Переключает видимость секрета
   */
  async toggle(loader: () => Promise<T>): Promise<void> {
    if (this.isVisible()) {
      this.hide()
    } else {
      await this.show(loader)
    }
  }

  /**
   * Очищает таймер и ресурсы
   */
  dispose(): void {
    this.clearTimer()
  }

  private clearTimer(): void {
    if (this.hideTimer !== undefined) {
      window.clearTimeout(this.hideTimer)
      this.hideTimer = undefined
    }
  }

  private startAutoHideTimer(): void {
    this.hideTimer = window.setTimeout(() => this.hide(), this.autoHideMs)
  }
}
