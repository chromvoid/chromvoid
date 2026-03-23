import {html, nothing} from 'lit'

import {isTauriRuntime} from 'root/core/runtime/runtime'

import type {RemoteStorageModel} from '../remote-storage.model'

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
        return 'Подключён'
      case 'mounting':
        return 'Подключение...'
      case 'unmounting':
        return 'Отключение...'
      case 'driver_missing':
        return 'Нет драйвера'
      case 'error':
        return 'Ошибка'
      case 'unmounted':
      default:
        return 'Отключён'
    }
  })()

  const canMount =
    isDesktop && status.state !== 'mounted' && status.state !== 'mounting' && selectedInfo?.available

  const isMounted = status.state === 'mounted'

  return html`
    <section class="card">
      <div class="card-header">
        <div class="card-header-main">
          <div
            class="card-icon"
            style="--card-icon-bg: color-mix(in oklch, ${isMounted
              ? 'var(--cv-color-success)'
              : 'var(--cv-color-info)'} 15%, var(--cv-color-surface)); --card-icon-color: ${isMounted
              ? 'var(--cv-color-success)'
              : 'var(--cv-color-info)'};"
          >
            <cv-icon name="${isMounted ? 'hard-drive' : 'disc'}"></cv-icon>
          </div>
          <div class="card-title">
            <div class="name">Монтирование тома</div>
            <div class="hint">Доступ к файлам через Finder/Explorer</div>
          </div>
        </div>
        ${isDesktop
          ? html`<span class="badge ${isMounted ? 'success' : ''}">${stateLabel}</span>`
          : html`<span class="badge">Только Desktop</span>`}
      </div>
      <div class="card-body">
        <div class="alert danger">
          <div class="alert-title">
            <cv-icon name="shield-alert"></cv-icon>
            Внимание: безопасность
          </div>
          <div class="alert-text">
            Примонтированный том — это расшифрованное представление данных, видимое другим приложениям.
            Используйте только в доверенной среде.
          </div>
        </div>

        ${isDesktop && !isMounted
          ? html`
              <div class="field-group">
                <label class="field-label">Способ подключения</label>
                <select
                  class="field-select"
                  .value=${selected ?? ''}
                  ?disabled=${backends.length === 0}
                  @change=${model.onBackendChange}
                >
                  ${backends.length === 0
                    ? html`<option disabled selected>Загрузка...</option>`
                    : backends.map(
                        (backend) => html`
                          <option value=${backend.id} ?disabled=${!backend.available}>
                            ${backend.label}${!backend.available ? ' (не установлен)' : ''}
                          </option>
                        `,
                      )}
                </select>
              </div>
              ${selectedInfo && !selectedInfo.available
                ? html`
                    <div class="alert">
                      <div class="alert-title">
                        <cv-icon name="download"></cv-icon>
                        Требуется установка драйвера
                      </div>
                      <div class="alert-text">
                        Для использования ${selectedInfo.label} необходимо установить драйвер.
                        ${selectedInfo.install_url
                          ? html` <a
                              href=${selectedInfo.install_url}
                              target="_blank"
                              rel="noopener"
                              style="color: var(--cv-color-brand); text-decoration: underline;"
                            >
                              Скачать ${selectedInfo.label} →
                            </a>`
                          : nothing}
                      </div>
                    </div>
                  `
                : nothing}
            `
          : nothing}
        ${isDesktop && isMounted && webdavUrl
          ? html`
              <div class="alert info">
                <div class="alert-title">
                  <cv-icon name="globe"></cv-icon>
                  WebDAV подключение
                </div>
                <div class="alert-text">Используйте этот URL для подключения в Finder или Explorer:</div>
              </div>
              <div class="path-display">
                <cv-icon name="link"></cv-icon>
                ${webdavUrl}
              </div>
              <ol class="steps-list">
                <li>macOS Finder: нажмите Cmd+K → вставьте URL → Подключить</li>
                <li>Windows Explorer: «Добавить сетевое расположение» → вставьте URL</li>
              </ol>
            `
          : nothing}
        ${isDesktop && isMounted && status.backend === 'fuse' && displayMountpoint
          ? html`
              <div class="alert success">
                <div class="alert-title">
                  <cv-icon name="folder-open"></cv-icon>
                  FUSE подключение активно
                </div>
                <div class="alert-text">Файлы доступны в:</div>
              </div>
              <div class="path-display">
                <cv-icon name="folder"></cv-icon>
                ${displayMountpoint}
              </div>
            `
          : nothing}
        ${status.error
          ? html`
              <div class="alert danger">
                <div class="alert-title">
                  <cv-icon name="alert-triangle"></cv-icon>
                  Ошибка монтирования
                </div>
                <div class="alert-text">${status.error}</div>
              </div>
            `
          : nothing}

        <div class="actions-row">
          ${!isMounted
            ? html`
                <cv-button variant="primary" ?disabled=${!canMount} @click=${model.onVolumeMount}>
                  <cv-icon name="play" slot="prefix"></cv-icon>
                  Подключить
                </cv-button>
              `
            : html`
                <cv-button variant="default" @click=${model.onVolumeUnmount}>
                  <cv-icon name="square" slot="prefix"></cv-icon>
                  Отключить
                </cv-button>
              `}
          <cv-button variant="default" ?disabled=${!isDesktop} @click=${model.onVolumeRefresh}>
            <cv-icon name="refresh-cw" slot="prefix"></cv-icon>
            Обновить
          </cv-button>
          ${webdavUrl
            ? html`
                <cv-button variant="default" @click=${model.copyVolumeUrl}>
                  <cv-icon name="copy" slot="prefix"></cv-icon>
                  Копировать URL
                </cv-button>
              `
            : nothing}
        </div>
      </div>
    </section>
  `
}
