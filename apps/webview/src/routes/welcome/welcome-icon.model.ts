import {createBrandMarkController, type BrandMarkController} from '@project/brand-mark'
import {atom, wrap} from '@reatom/core'
import {
  getStartupSplashSurface,
  isStartupSplashReleased,
  STARTUP_SPLASH_RELEASED_EVENT,
} from 'root/app/bootstrap/startup-splash'

export type WelcomeIconAnimationState = 'idle' | 'active' | 'finishing' | 'opened'

// A route model can be recreated after locking; the cold-start appearance belongs to the process.
let appearancePlayed = false

export class WelcomeIconModel {
  readonly state = atom<WelcomeIconAnimationState>('idle', 'welcome.icon.state')

  private root: ParentNode | null = null
  private controller: BrandMarkController | null = null
  private renderedState: WelcomeIconAnimationState | null = null
  private startupReady = false
  private startupSplashReleasedHandler: (() => void) | null = null

  idle(): void {
    this.state.set('idle')
    this.syncState()
  }

  active(): void {
    this.startDerivation()
  }

  startDerivation(): void {
    this.state.set('active')
    this.syncState()
  }

  async finishDerivation(): Promise<void> {
    this.state.set('finishing')
    this.renderedState = 'finishing'
    await wrap(this.controller?.finishDerivation() ?? Promise.resolve())
  }

  opened(): void {
    this.state.set('opened')
    this.syncState()
  }

  mount(root: ParentNode): void {
    if (this.root !== root) {
      this.unmount()
      const svg = root.querySelector<SVGSVGElement>('.welcome-icon svg')
      if (!svg) return
      this.root = root
      this.controller = createBrandMarkController(svg)
    }

    if (!this.controller) return
    if (!isStartupSplashReleased()) {
      this.waitForStartupSplashRelease()
      return
    }

    this.startAfterStartupSplash()
  }

  unmount(): void {
    this.teardownStartupSplashReleased()
    this.controller?.destroy()
    this.controller = null
    this.root = null
    this.renderedState = null
    this.startupReady = false
  }

  private waitForStartupSplashRelease(): void {
    if (this.startupSplashReleasedHandler) return

    if (!appearancePlayed && getStartupSplashSurface() !== 'native-bridge') {
      this.controller?.prepareAppearance()
    }
    this.startupSplashReleasedHandler = wrap(() => {
      this.startupSplashReleasedHandler = null
      this.startAfterStartupSplash()
    })
    document.addEventListener(STARTUP_SPLASH_RELEASED_EVENT, this.startupSplashReleasedHandler, {
      once: true,
    })
  }

  private startAfterStartupSplash(): void {
    this.teardownStartupSplashReleased()
    if (!this.controller) return

    if (!this.startupReady) {
      this.startupReady = true
      if (appearancePlayed) {
        this.controller.returnToLock()
      } else {
        appearancePlayed = true
        if (getStartupSplashSurface() !== 'native-bridge') {
          this.controller.appearance()
        }
      }
      this.renderedState = 'idle'
    }

    this.syncState()
  }

  private syncState(): void {
    if (!this.controller || !this.startupReady) return
    const state = this.state()
    if (state === this.renderedState) return

    this.renderedState = state
    if (state === 'active') this.controller.startDerivation()
    else if (state === 'opened') this.controller.opened()
    else if (state === 'idle') this.controller.idle()
  }

  private teardownStartupSplashReleased(): void {
    if (!this.startupSplashReleasedHandler) return

    document.removeEventListener(STARTUP_SPLASH_RELEASED_EVENT, this.startupSplashReleasedHandler)
    this.startupSplashReleasedHandler = null
  }
}
