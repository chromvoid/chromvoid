package com.chromvoid.air.ui.credentials

/**
 * The camera, as the codes screen needs it: scan one QR code and say what
 * happened. The application implements it over the shared platform scanner.
 */
public interface OtpScanner {
    public sealed interface Result {
        /** The raw text of the code, for Core to parse. */
        public data class Scanned(val text: String) : Result

        public data object Cancelled : Result

        public data object PermissionDenied : Result

        public data object Unavailable : Result
    }

    public suspend fun scan(): Result
}
