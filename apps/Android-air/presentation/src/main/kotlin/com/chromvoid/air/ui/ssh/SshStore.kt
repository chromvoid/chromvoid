package com.chromvoid.air.ui.ssh

import com.chromvoid.air.bridge.wire.PassmanagerSSHEditRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHExportRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHExportResponse
import com.chromvoid.air.bridge.wire.PassmanagerSSHImportRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHKeyCreateResponse
import com.chromvoid.air.bridge.wire.PassmanagerSSHKeygenRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHPageRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHPageResponse
import com.chromvoid.air.bridge.wire.SSHKeySummary

/**
 * The vault's SSH keys, as the SSH screens need them. Core generates, parses
 * and exports every key; this client never holds key material except the text
 * a person pastes or saves.
 */
public interface SshStore {
    public suspend fun sshPage(request: PassmanagerSSHPageRequest, generation: ULong): PassmanagerSSHPageResponse

    public suspend fun generateSsh(
        request: PassmanagerSSHKeygenRequest,
        generation: ULong,
    ): PassmanagerSSHKeyCreateResponse

    public suspend fun importSsh(
        request: PassmanagerSSHImportRequest,
        generation: ULong,
    ): PassmanagerSSHKeyCreateResponse

    public suspend fun exportSsh(request: PassmanagerSSHExportRequest, generation: ULong): PassmanagerSSHExportResponse

    public suspend fun editSsh(request: PassmanagerSSHEditRequest, generation: ULong): SSHKeySummary

    public suspend fun deleteSsh(id: String, generation: ULong)
}

/** The most text one key file may hold; larger files are refused before Core sees them. */
public const val SSH_KEY_FILE_LIMIT_BYTES: Int = 65_536
