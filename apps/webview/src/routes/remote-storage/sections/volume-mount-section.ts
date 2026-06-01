import {html, nothing} from 'lit'

import {isTauriRuntime} from 'root/core/runtime/runtime'
import {i18n} from 'root/i18n'

import type {RemoteStorageModel} from '../remote-storage.model'
import {renderRemoteStorageCallout} from '../render-callout'

export const renderVolumeMountSection = ({model}: {model: RemoteStorageModel}) => {
  const status = model.volume.status()
  const isDesktop = isTauriRuntime()
  const backends = model.volume.backends()
  const selected = model.volume.selectedBackend()
  const selectedInfo = backends.find((b) => b.id === selected)

  const webdavUrl =
    status.backend === 'webdav'
      ? (status.mountpoint ?? (status.webdav_port ? `http://127.0.0.1:${status.webdav_port}` : null))
      : null

  const displayMountpoint = status.mountpoint && status.backend !== 'webdav' ? status.mountpoint : null

  const stateLabel = (() => {
    switch (status.state) {
      case 'mounted':
        return i18n('remote-storage:volume-state-mounted')
      case 'mounting':
        return i18n('remote-storage:volume-state-mounting')
      case 'unmounting':
        return i18n('remote-storage:volume-state-unmounting')
      case 'driver_missing':
        return i18n('remote-storage:volume-state-driver-missing')
      case 'error':
        return i18n('remote-storage:volume-state-error')
      case 'unmounted':
      default:
        return i18n('remote-storage:volume-state-unmounted')
    }
  })()

  const canMount =
    isDesktop && status.state !== 'mounted' && status.state !== 'mounting' && selectedInfo?.available

  const isMounted = status.state === 'mounted'

  return html`
    <section class="card">
      <div class="card-header">
        <div class="card-header-main">
          <div class="card-icon ${isMounted ? 'card-icon-success' : 'card-icon-info'}">
            <cv-icon name="${isMounted ? 'hard-drive' : 'disc'}"></cv-icon>
          </div>
          <div class="card-title">
            <div class="name">${i18n('remote-storage:mounting-title')}</div>
            <div class="hint">${i18n('remote-storage:mounting-hint')}</div>
          </div>
        </div>
        ${isDesktop
          ? html`<span class="badge ${isMounted ? 'success' : ''}">${stateLabel}</span>`
          : html`<span class="badge">${i18n('remote-storage:desktop-only')}</span>`}
      </div>
      <div class="card-body">
        ${renderRemoteStorageCallout({
          variant: 'danger',
          icon: 'shield-alert',
          title: i18n('remote-storage:security-title'),
          text: i18n('remote-storage:security-text'),
        })}

        ${isDesktop && !isMounted
          ? html`
              <div class="field-group">
                <label class="field-label">${i18n('remote-storage:mount-method')}</label>
                <select
                  class="field-select"
                  .value=${selected ?? ''}
                  ?disabled=${backends.length === 0}
                  @change=${model.onBackendChange}
                >
                  ${backends.length === 0
                    ? html`<option disabled selected>${i18n('remote-storage:loading')}</option>`
                    : backends.map(
                        (backend) => html`
                          <option value=${backend.id} ?disabled=${!backend.available}>
                            ${backend.label}${!backend.available ? ` (${i18n('remote-storage:not-installed')})` : ''}
                          </option>
                        `,
                      )}
                </select>
              </div>
              ${selectedInfo && !selectedInfo.available
                ? html`
                    ${renderRemoteStorageCallout({
                      variant: 'warning',
                      icon: 'download',
                      title: i18n('remote-storage:driver-required'),
                      text: html`
                        ${i18n('remote-storage:driver-required')}
                        ${selectedInfo.install_url
                          ? html` <a
                              class="inline-link"
                              href=${selectedInfo.install_url}
                              target="_blank"
                              rel="noopener"
                            >
                              ${i18n('remote-storage:download-driver', {label: selectedInfo.label})}
                            </a>`
                          : nothing}
                      `,
                    })}
                  `
                : nothing}
            `
          : nothing}
        ${isDesktop && isMounted && webdavUrl
          ? html`
              ${renderRemoteStorageCallout({
                variant: 'info',
                icon: 'globe',
                title: i18n('remote-storage:webdav-title'),
                text: i18n('remote-storage:webdav-text'),
              })}
              <div class="path-display">
                <cv-icon name="link"></cv-icon>
                ${webdavUrl}
              </div>
              <ol class="steps-list">
                <li>${i18n('remote-storage:webdav-step-macos')}</li>
                <li>${i18n('remote-storage:webdav-step-windows')}</li>
              </ol>
            `
          : nothing}
        ${isDesktop && isMounted && status.backend === 'fuse' && displayMountpoint
          ? html`
              ${renderRemoteStorageCallout({
                variant: 'success',
                icon: 'folder-open',
                title: i18n('remote-storage:fuse-title'),
                text: i18n('remote-storage:fuse-text'),
              })}
              <div class="path-display">
                <cv-icon name="folder"></cv-icon>
                ${displayMountpoint}
              </div>
            `
          : nothing}
        ${status.error
          ? html`
              ${renderRemoteStorageCallout({
                variant: 'danger',
                icon: 'alert-triangle',
                title: i18n('remote-storage:mount-error'),
                text: status.error,
              })}
            `
          : nothing}

        <div class="actions-row">
          ${!isMounted
            ? html`
                <cv-guidance-anchor anchor-id="remote-storage.mount" surface="remote-storage" owner="remote-storage">
                  <cv-button variant="primary" ?disabled=${!canMount} @click=${model.onVolumeMount}>
                    <cv-icon name="play" slot="prefix"></cv-icon>
                    ${i18n('remote-storage:action-mount')}
                  </cv-button>
                </cv-guidance-anchor>
              `
            : html`
                <cv-button variant="default" @click=${model.onVolumeUnmount}>
                  <cv-icon name="square" slot="prefix"></cv-icon>
                  ${i18n('remote-storage:action-unmount')}
                </cv-button>
              `}
          <cv-button variant="default" ?disabled=${!isDesktop} @click=${model.onVolumeRefresh}>
            <cv-icon name="refresh-cw" slot="prefix"></cv-icon>
            ${i18n('button:refresh')}
          </cv-button>
          ${webdavUrl
            ? html`
                <cv-button variant="default" @click=${model.copyVolumeUrl}>
                  <cv-icon name="copy" slot="prefix"></cv-icon>
                  ${i18n('remote-storage:action-copy-url')}
                </cv-button>
              `
            : nothing}
        </div>
      </div>
    </section>
  `
}
