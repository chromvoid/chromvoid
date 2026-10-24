package com.chromvoid.air.ui.credentials

/** Answers every scan with [next]; counts how often it was asked. */
internal class FakeScanner(var next: OtpScanner.Result = OtpScanner.Result.Cancelled) : OtpScanner {
    var scans: Int = 0

    override suspend fun scan(): OtpScanner.Result {
        scans += 1
        return next
    }
}
