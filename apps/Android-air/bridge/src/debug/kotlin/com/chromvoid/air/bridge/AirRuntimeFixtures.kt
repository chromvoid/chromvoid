package com.chromvoid.air.bridge

import android.content.Context
import com.chromvoid.air.ffi.AirNative
import com.chromvoid.air.ffi.openWalletHistoryTestRuntime
import com.chromvoid.air.ffi.openWalletSendTestRuntime
import com.chromvoid.air.ffi.preparePasskeyUiFixture
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The runtime over Core's offline wallet send fixture: real wallet
 * crypto and storage, a synthetic TON provider, never the network.
 * Rust refuses it outside a debug fixture build of the development
 * client.
 */
public suspend fun AirRuntimeClient.Companion.openWalletSendFixture(
    context: Context,
    dispatcher: CoroutineDispatcher = Dispatchers.IO,
): AirRuntimeClient = withContext(dispatcher) {
    AirNative.initialize(context)
    val root = context.filesDir.resolve(AirRuntimeClient.STORAGE_ROOT_NAME).absolutePath
    AirRuntimeClient(openWalletSendTestRuntime(BuildFingerprint.EXPECTED, root), dispatcher)
}

/**
 * Seeds synthetic passkeys through Core's own provider owner in a
 * separate seeding runtime, then closes it: the app then opens its
 * ordinary runtime on the same storage. The vault password is
 * [password]; the administrator is set up if missing.
 * Rust refuses it outside a debug fixture build of the development client.
 */
public suspend fun AirRuntimeClient.Companion.preparePasskeyFixture(
    context: Context,
    password: String,
    dispatcher: CoroutineDispatcher = Dispatchers.IO,
): Unit = withContext(dispatcher) {
    AirNative.initialize(context)
    val root = context.filesDir.resolve(AirRuntimeClient.STORAGE_ROOT_NAME).absolutePath
    preparePasskeyUiFixture(BuildFingerprint.EXPECTED, root, password)
}

/**
 * The runtime over Core's offline wallet history fixture: a synthetic
 * TON provider that answers a history and confirms its outgoing
 * transaction on refresh, never the network. Rust refuses it outside
 * a debug fixture build of the development client.
 */
public suspend fun AirRuntimeClient.Companion.openWalletHistoryFixture(
    context: Context,
    dispatcher: CoroutineDispatcher = Dispatchers.IO,
): AirRuntimeClient = withContext(dispatcher) {
    AirNative.initialize(context)
    val root = context.filesDir.resolve(AirRuntimeClient.STORAGE_ROOT_NAME).absolutePath
    AirRuntimeClient(openWalletHistoryTestRuntime(BuildFingerprint.EXPECTED, root), dispatcher)
}
