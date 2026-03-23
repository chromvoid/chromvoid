import {XLitElement} from '@statx/lit'

import {css, html} from 'lit'

import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {openCommandPalette} from 'root/shared/services/command-palette'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {sharedStyles} from 'root/shared/ui/shared-styles'
import {moon, sun} from 'root/features/media/components/icons'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

export class NavigationRail extends XLitElement {
  static define() {
    if (!customElements.get('navigation-rail')) {
      customElements.define('navigation-rail', this as unknown as CustomElementConstructor)
    }
  }

  private isExpanded = false

  static styles = [
    sharedStyles,
    css`
      :host {
        position: relative;
        display: flex;
        flex-direction: column;
        block-size: 100%;
        inline-size: var(--nav-rail-width, 72px);
        background: var(--surface-base, #000);
        border-inline-end: 1px solid var(--border-subtle, var(--cv-alpha-white-6));
        overflow: hidden;
        contain: content;
        container-type: inline-size;
        transition: inline-size var(--cv-duration-normal, 250ms)
          var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1));
      }

      :host([expanded]) {
        inline-size: var(--nav-rail-width-expanded, 240px);
      }

      .brand {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-4, 16px);
        min-block-size: 64px;
      }

      .brand-icon {
        inline-size: 40px;
        block-size: 40px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--cv-radius-lg, 12px);
        background: var(--accent-muted, color-mix(in oklch, var(--cv-color-accent) 15%, transparent));
        color: var(--accent, #ff7a00);
        cursor: pointer;

        cv-icon {
          font-size: 20px;
        }
      }

      .brand-text {
        font-family: var(--cv-font-family-display, 'Satoshi', system-ui);
        font-weight: var(--weight-bold, 700);
        letter-spacing: var(--tracking-tight, -0.02em);
        color: var(--text-primary, #fff);
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transform: translateX(-8px);
        transition:
          opacity var(--cv-duration-fast, 150ms) var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1)),
          transform var(--cv-duration-fast, 150ms) var(--ease-out-quart),
          visibility 0s linear var(--cv-duration-fast, 150ms);
      }

      :host([expanded]) .brand-text {
        opacity: 1;
        visibility: visible;
        transform: translateX(0);
        transition:
          opacity var(--cv-duration-fast, 150ms) var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1)),
          transform var(--cv-duration-fast, 150ms) var(--ease-out-quart),
          visibility 0s linear 0s;
      }

      .nav {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 4px);
        padding-inline: var(--space-3, 12px);
      }

      .spacer {
        flex: 1;
      }

      .divider {
        margin: var(--space-3, 12px) var(--space-3, 12px);
        block-size: 1px;
        background: var(--border-subtle, var(--cv-alpha-white-6));
      }

      .item {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        min-block-size: 44px;
        border-radius: var(--cv-radius-md, 8px);
        border: none;
        background: transparent;
        color: var(--text-secondary, var(--cv-alpha-white-70));
        cursor: pointer;
        text-align: start;
        font-family: var(--cv-font-family-body, 'Inter', system-ui);
        font-size: var(--text-small, 0.8125rem);
        font-weight: var(--weight-medium, 500);
        transition:
          background-color var(--cv-duration-fast, 150ms) var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1)),
          color var(--cv-duration-fast, 150ms) var(--ease-out-quart);

        cv-icon {
          flex-shrink: 0;
          font-size: 20px;
        }

        .label {
          flex: 1;
          opacity: 0;
          transform: translateX(-8px);
          transition:
            opacity var(--cv-duration-fast, 150ms) var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1)),
            transform var(--cv-duration-fast, 150ms) var(--ease-out-quart);
          white-space: nowrap;
        }

        .hint {
          opacity: 0;
          font-family: var(--cv-font-family-code, 'JetBrains Mono', monospace);
          font-size: var(--text-micro, 0.6875rem);
          color: var(--text-quaternary, var(--cv-alpha-white-30));
          padding: 3px 8px;
          border-radius: var(--cv-radius-sm, 4px);
          background: var(--surface-muted, #1a1a1a);
          transition: opacity var(--cv-duration-fast, 150ms) var(--ease-out-quart);
        }

        &:hover {
          background: var(--hover-overlay, var(--cv-alpha-white-4));
          color: var(--text-primary, #fff);
        }

        &:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 2px var(--surface-base),
            0 0 0 4px var(--accent, #ff7a00);
        }

        &.active {
          background: var(--accent-muted, color-mix(in oklch, var(--cv-color-accent) 15%, transparent));
          color: var(--accent, #ff7a00);
        }

        &.danger {
          &:hover {
            background: var(--error-muted, color-mix(in oklch, var(--error, #ff4757) 15%, transparent));
            color: var(--error, #ff4757);
          }
        }
      }

      :host([expanded]) .item .label {
        opacity: 1;
        transform: translateX(0);
      }

      :host([expanded]) .item .hint {
        opacity: 1;
      }

      .theme-toggle {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        min-block-size: 44px;
        border-radius: var(--cv-radius-md, 8px);
        border: none;
        background: transparent;
        color: var(--text-secondary, var(--cv-alpha-white-70));
        cursor: pointer;
        text-align: start;
        font-family: var(--cv-font-family-body, 'Inter', system-ui);
        font-size: var(--text-small, 0.8125rem);
        font-weight: var(--weight-medium, 500);
        transition:
          background-color var(--cv-duration-fast, 150ms) var(--ease-out-quart),
          color var(--cv-duration-fast, 150ms) var(--ease-out-quart);

        .theme-icon {
          flex-shrink: 0;
          inline-size: 20px;
          block-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          svg {
            fill: currentColor;
          }
        }

        .label {
          flex: 1;
          opacity: 0;
          transform: translateX(-8px);
          transition:
            opacity var(--cv-duration-fast, 150ms) var(--ease-out-quart),
            transform var(--cv-duration-fast, 150ms) var(--ease-out-quart);
          white-space: nowrap;
        }

        &:hover {
          background: var(--hover-overlay, var(--cv-alpha-white-4));
          color: var(--text-primary, #fff);
        }
      }

      :host([expanded]) .theme-toggle .label {
        opacity: 1;
        transform: translateX(0);
      }

      @media (hover: none) and (pointer: coarse) {
        :host {
          inline-size: var(--nav-rail-width-expanded, 240px);
        }

        .brand-text {
          opacity: 1;
          visibility: visible;
          transform: translateX(0);
        }

        .item .label,
        .item .hint,
        .theme-toggle .label {
          opacity: 1;
          transform: translateX(0);
        }
      }
    `,
  ]

  connectedCallback(): void {
    super.connectedCallback()
  }

  private toggleExpanded = () => {
    this.isExpanded = !this.isExpanded
    if (this.isExpanded) {
      this.setAttribute('expanded', '')
    } else {
      this.removeAttribute('expanded')
    }
    this.requestUpdate()
  }

  private closeSidebarOnMobile = () => {
    const {store} = getAppContext()
    if (store.layoutMode() === 'mobile' && store.sidebarOpen()) {
      store.setSidebarOpen(false)
    }
  }

  private toggleTheme = () => {
    getAppContext().store.switchTheme()
    this.closeSidebarOnMobile()
  }

  private onSettings = () => {
    navigationModel.navigateToSurface('settings')
    this.closeSidebarOnMobile()
  }

  private openCommandPalette = () => {
    openCommandPalette({mode: 'all', source: 'rail'})
    this.closeSidebarOnMobile()
  }

  private onFiles = () => {
    navigationModel.navigateToSurface('files')
    this.closeSidebarOnMobile()
  }

  private onPasswords = () => {
    navigationModel.navigateToSurface('passwords')
    this.closeSidebarOnMobile()
  }

  private onStorage = () => {
    if (!getRuntimeCapabilities().supports_volume) return
    navigationModel.navigateToSurface('remote-storage')
    this.closeSidebarOnMobile()
  }

  private onRemote = () => {
    const caps = getRuntimeCapabilities()
    if (!caps.supports_usb_remote && !caps.supports_network_remote) return
    navigationModel.navigateToSurface('remote')
    this.closeSidebarOnMobile()
  }

  private onExtensions = () => {
    if (!getRuntimeCapabilities().supports_gateway) return
    navigationModel.navigateToSurface('gateway')
    this.closeSidebarOnMobile()
  }

  private onNetworkPair = () => {
    if (!getRuntimeCapabilities().supports_network_remote) return
    navigationModel.navigateToSurface('network-pair')
    this.closeSidebarOnMobile()
  }

  private onLock = () => {
    this.closeSidebarOnMobile()
    if (!isTauriRuntime()) return

    void (async () => {
      try {
        const res = await tauriInvoke<RpcResult<unknown>>('rpc_dispatch', {
          args: {
            v: 1,
            command: 'vault:lock',
            data: {},
          },
        })
        if (!isOk(res)) {
          throw new Error(res.error)
        }
        getAppContext().store.pushNotification('success', i18n('notification:vault-locked' as any))
        getAppContext().store.setSelectedItems([])
      } catch (e) {
        getAppContext().store.pushNotification(
          'error',
          e instanceof Error ? e.message : i18n('error:lock-failed' as any),
        )
      }
    })()
  }

  protected render() {
    const {store} = getAppContext()
    const caps = getRuntimeCapabilities()
    const surface = navigationModel.snapshot().surface
    const isPasswords = surface === 'passwords'
    const isStorage = surface === 'remote-storage'
    const isRemote = surface === 'remote'
    const isExtensions = surface === 'gateway'
    const isSettings = surface === 'settings'
    const isNetworkPair = surface === 'network-pair'
    const isFiles = surface === 'files'
    const theme = store.theme()

    return html`
      <div class="brand">
        <div
          class="brand-icon"
          @click=${this.toggleExpanded}
          title=${i18n(
            this.isExpanded ? ('navigation:collapse-sidebar' as any) : ('navigation:expand-sidebar' as any),
          )}
          aria-label=${i18n(
            this.isExpanded ? ('navigation:collapse-sidebar' as any) : ('navigation:expand-sidebar' as any),
          )}
          role="button"
          tabindex="0"
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              this.toggleExpanded()
            }
          }}
        >
          <cv-icon name="shield"></cv-icon>
        </div>
        <div class="brand-text">ChromVoid</div>
      </div>

      <nav class="nav" aria-label=${i18n('navigation:main' as any)}>
        <button class="item ${isFiles ? 'active' : ''}" @click=${this.onFiles} aria-current=${isFiles}>
          <cv-icon name="folder"></cv-icon>
          <span class="label">${i18n('navigation:files' as any)}</span>
        </button>
        <button
          class="item ${isPasswords ? 'active' : ''}"
          @click=${this.onPasswords}
          aria-current=${isPasswords}
        >
          <cv-icon name="key"></cv-icon>
          <span class="label">${i18n('navigation:passwords' as any)}</span>
        </button>
      </nav>

      <div class="spacer"></div>
      <div class="divider"></div>

      <nav class="nav" aria-label=${i18n('navigation:actions' as any)}>
        <button class="item" @click=${this.openCommandPalette}>
          <cv-icon name="search"></cv-icon>
          <span class="label">${i18n('navigation:command-palette' as any)}</span>
          <span class="hint">⌘K</span>
        </button>

        <button class="theme-toggle" @click=${this.toggleTheme} title=${i18n('theme:toggle' as any)}>
          <span class="theme-icon">${theme === 'light' ? sun : moon}</span>
          <span class="label"
            >${theme === 'light'
              ? i18n('theme:mode:light' as any)
              : theme === 'dark'
                ? i18n('theme:mode:dark' as any)
                : i18n('theme:mode:system' as any)}</span
          >
        </button>

        ${caps.supports_volume
          ? html`
              <button class="item ${isStorage ? 'active' : ''}" @click=${this.onStorage}>
                <cv-icon name="hard-drive"></cv-icon>
                <span class="label">${i18n('navigation:storage' as any)}</span>
              </button>
            `
          : ''}
        ${caps.supports_usb_remote || caps.supports_network_remote
          ? html`
              <button class="item ${isRemote ? 'active' : ''}" @click=${this.onRemote}>
                <cv-icon name="usb"></cv-icon>
                <span class="label">${i18n('navigation:remote' as any)}</span>
              </button>
            `
          : ''}
        ${caps.supports_gateway
          ? html`
              <button class="item ${isExtensions ? 'active' : ''}" @click=${this.onExtensions}>
                <cv-icon name="puzzle"></cv-icon>
                <span class="label">${i18n('navigation:extensions' as any)}</span>
              </button>
            `
          : ''}
        ${caps.supports_network_remote
          ? html`
              <button class="item ${isNetworkPair ? 'active' : ''}" @click=${this.onNetworkPair}>
                <cv-icon name="wifi"></cv-icon>
                <span class="label">${i18n('navigation:network-pair' as any)}</span>
              </button>
            `
          : ''}

        <button class="item ${isSettings ? 'active' : ''}" @click=${this.onSettings}>
          <cv-icon name="settings"></cv-icon>
          <span class="label">${i18n('navigation:settings' as any)}</span>
        </button>

        <button class="item danger" @click=${this.onLock}>
          <cv-icon name="lock"></cv-icon>
          <span class="label">${i18n('navigation:lock' as any)}</span>
          <span class="hint">⌘L</span>
        </button>
      </nav>
    `
  }
}
