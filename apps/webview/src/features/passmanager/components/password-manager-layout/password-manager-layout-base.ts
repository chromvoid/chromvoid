import {html, ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {nothing, type PropertyValues} from 'lit'
import {i18n} from '@project/passmanager/i18n'
import {mobileKeyboardOccluding} from 'root/app/bootstrap/mobile-keyboard/keyboard-occlusion.model'
import {pmCredentialsIconPreloadModel} from '../../models/pm-credentials-icon-preload.model'
import {
  isPassmanagerMotionSnapshotSafe,
  pmMotionModel,
  type PassmanagerMotionIntent,
} from '../../models/pm-motion.model'
import {elementScopedViewTransitionCoordinator, prefersReducedMotion} from 'root/utils/view-transitions'
import {
  PasswordManagerLayoutModel,
  type PMGlobalShortcutAction,
  type PMSearchElement,
} from './password-manager-layout.model'

export type SearchElement = PMSearchElement

export abstract class PMLayoutBase extends ReatomLitElement implements EventListenerObject {
  protected readonly model: PasswordManagerLayoutModel
  private unregisterMotionPresenter?: () => void
  private liveMotionTimer = 0

  constructor(model = new PasswordManagerLayoutModel()) {
    super()
    this.model = model
  }

  protected abstract getSearchElement(): SearchElement | null

  protected get extendedComponentLayout(): 'desktop' | 'mobile' {
    return 'desktop'
  }

  protected handleExtraKeys(_event: KeyboardEvent, _shortcutBlocked: boolean): boolean {
    return false
  }

  protected onCreateEntry() {
    this.model.createEntry()
  }

  protected onCreateGroup() {
    this.model.createGroup()
  }

  protected onExportClick() {
    this.model.exportEntries()
  }

  protected onFullCleanClick() {
    this.model.fullClean()
  }

  protected onImportClick() {
    this.model.importEntries()
  }

  protected handleImportComplete(event: Event) {
    event.stopPropagation()
    this.model.handleImportComplete(event)
  }

  protected handleImportClose(event?: Event) {
    event?.stopPropagation()
    this.model.handleImportClose()
  }

  protected renderImportDialog() {
    return html`
      <pm-import-dialog
        class="card"
        @import-complete=${this.handleImportComplete}
        @import-close=${this.handleImportClose}
      ></pm-import-dialog>
    `
  }

  protected renderSessionUnavailable(pending = false) {
    return this.renderUnavailable({pending, onRetry: this.handleRetrySessionLoad})
  }

  protected renderExtendedComponentsUnavailable() {
    return this.renderUnavailable({onRetry: this.handleRetryExtendedComponents})
  }

  private renderUnavailable({pending, onRetry}: {pending?: boolean; onRetry: () => void}) {
    return html`
      <cv-empty-state
        class="session-unavailable"
        icon="shield-alert"
        headline=${i18n('credentials:unavailable:title' as never)}
        description=${i18n('credentials:unavailable:description' as never)}
        role="status"
        aria-busy=${pending === undefined ? nothing : String(pending)}
      >
        <button
          slot="actions"
          class="session-retry"
          type="button"
          ?disabled=${pending === true}
          @click=${onRetry}
        >
          ${i18n(
            pending
              ? ('credentials:unavailable:retrying' as never)
              : ('credentials:unavailable:retry' as never),
          )}
        </button>
      </cv-empty-state>
    `
  }

  protected handleRetrySessionLoad() {
    this.model.retrySessionLoad()
  }

  protected handleRetryExtendedComponents() {
    this.model.retryExtendedComponents(this.extendedComponentLayout)
  }

  protected override updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties)
    this.model.requestExtendedComponents(this.extendedComponentLayout)
  }

  protected async onGlobalKeyDown(event: KeyboardEvent): Promise<void> {
    const shortcutBlocked = this.model.isShortcutBlocked(event)
    if (this.handleExtraKeys(event, shortcutBlocked)) {
      return
    }

    const action = this.model.resolveGlobalShortcut(event, shortcutBlocked)
    if (action === 'none') {
      return
    }

    await this.handleGlobalShortcut(event, action)
  }

  protected async handleGlobalShortcut(
    event: KeyboardEvent,
    action: Exclude<PMGlobalShortcutAction, 'none'>,
  ): Promise<void> {
    switch (action) {
      case 'create-entry':
        event.preventDefault()
        this.onCreateEntry()
        return
      case 'focus-search':
        event.preventDefault()
        this.focusSearch()
        return
      case 'clear-search':
        this.clearSearch()
        return
      case 'go-back':
        event.preventDefault()
        this.model.goBackFromCurrent()
        return
      case 'open-first-search-result':
        event.preventDefault()
        this.model.openFirstSearchResult()
        return
      case 'copy-password':
        event.preventDefault()
        await this.model.copyCurrentPassword()
        return
    }
  }

  protected focusSearch() {
    const search = this.getSearchElement()
    if (search?.focusInput) {
      search.focusInput()
      return
    }
  }

  protected clearSearch() {
    const search = this.getSearchElement()
    if (!search) {
      return
    }

    search.clear?.()
    const active = this.shadowRoot?.activeElement as HTMLElement | undefined
    active?.blur?.()
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.unregisterMotionPresenter = pmMotionModel.registerPresenter(({intent, commit}) =>
      this.presentPassmanagerCommit(intent, commit),
    )
    window.addEventListener('keydown', this, {capture: true})
    this.addEventListener('import-complete', this)
    this.addEventListener('import-close', this)
  }

  override disconnectedCallback(): void {
    this.unregisterMotionPresenter?.()
    this.unregisterMotionPresenter = undefined
    window.clearTimeout(this.liveMotionTimer)
    window.removeEventListener('keydown', this, {capture: true})
    this.removeEventListener('import-complete', this)
    this.removeEventListener('import-close', this)
    super.disconnectedCallback()
  }

  private async presentPassmanagerCommit(
    intent: Exclude<PassmanagerMotionIntent, {kind: 'none'}>,
    commit: () => void,
  ): Promise<void> {
    await pmCredentialsIconPreloadModel.prepareIntent(intent)
    const scope = this.renderRoot.querySelector<HTMLElement>('.pm-content')
    const keyboardOccluding = this.extendedComponentLayout === 'mobile' && mobileKeyboardOccluding()
    const snapshotSafe = isPassmanagerMotionSnapshotSafe(intent)

    this.prepareMotionScope(scope, intent)
    const result = await elementScopedViewTransitionCoordinator.run({
      scope,
      enabled: snapshotSafe && !keyboardOccluding,
      types: [`pm-${intent.reason}`, `pm-${intent.direction}`],
      update: commit,
      settle: async () => {
        await this.updateComplete
      },
    })

    const shouldRunLiveFallback =
      result.state.startsWith('skipped-') &&
      result.state !== 'skipped-reduced-motion' &&
      result.state !== 'skipped-hidden' &&
      !keyboardOccluding &&
      !prefersReducedMotion()
    if (shouldRunLiveFallback && scope) {
      await this.runLiveMotion(scope)
    }
    this.clearMotionScope(scope)
  }

  private prepareMotionScope(
    scope: HTMLElement | null,
    intent: Exclude<PassmanagerMotionIntent, {kind: 'none'}>,
  ): void {
    if (!scope) return
    delete scope.dataset['pmMotionLive']
    scope.dataset['pmMotionDirection'] = intent.direction
    scope.dataset['pmMotionReason'] = intent.reason
  }

  private runLiveMotion(scope: HTMLElement): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        window.clearTimeout(this.liveMotionTimer)
        scope.removeEventListener('animationend', handleAnimationEnd)
        resolve()
      }
      const handleAnimationEnd = (event: AnimationEvent) => {
        if (!(event.target instanceof Element) || event.target.parentElement !== scope) return
        finish()
      }

      requestAnimationFrame(() => {
        if (!scope.isConnected) {
          finish()
          return
        }
        scope.addEventListener('animationend', handleAnimationEnd)
        scope.dataset['pmMotionLive'] = 'true'
        this.liveMotionTimer = window.setTimeout(finish, 500)
      })
    })
  }

  private clearMotionScope(scope: HTMLElement | null): void {
    if (!scope) return
    delete scope.dataset['pmMotionLive']
    delete scope.dataset['pmMotionDirection']
    delete scope.dataset['pmMotionReason']
  }

  handleEvent(event: Event): void {
    switch (event.type) {
      case 'keydown':
        void this.onGlobalKeyDown(event as KeyboardEvent)
        return
      case 'import-complete':
        this.handleImportComplete(event)
        return
      case 'import-close':
        this.handleImportClose(event)
        return
      default:
        return
    }
  }
}
