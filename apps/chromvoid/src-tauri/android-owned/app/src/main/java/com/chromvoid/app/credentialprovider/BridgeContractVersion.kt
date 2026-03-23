package com.chromvoid.app.credentialprovider

internal object BridgeContractVersion {
    const val CURRENT = 1
    const val VERSION_FIELD = "contract_version"
    const val PAYLOAD_FIELD = "payload"
    const val MISMATCH_ERROR_CODE = "CONTRACT_MISMATCH"
}
