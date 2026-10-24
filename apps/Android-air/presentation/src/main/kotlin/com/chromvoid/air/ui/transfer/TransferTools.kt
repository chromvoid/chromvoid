package com.chromvoid.air.ui.transfer

import com.chromvoid.air.ui.credentials.CredentialClipboard
import kotlinx.coroutines.CoroutineScope

/** Which transfer the vault's tools menu opened. */
public enum class TransferMode { IMPORT, EXPORT, CLEAR }

/** The import, export and clear of one open transfer page; closed with it. */
public class TransferTools(
    public val mode: TransferMode,
    store: CredentialTransferStore,
    generation: ULong,
    scope: CoroutineScope,
    clipboard: CredentialClipboard,
) {
    public val import: CredentialImportModel = CredentialImportModel(store, generation, scope)
    public val export: CredentialExportModel = CredentialExportModel(store, generation, scope)
    public val clear: CredentialClearModel = CredentialClearModel(store, generation, scope, clipboard)

    public fun close() {
        import.close()
        export.close()
        clear.close()
    }
}
