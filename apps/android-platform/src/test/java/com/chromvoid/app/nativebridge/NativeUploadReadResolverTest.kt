package com.chromvoid.app.nativebridge

import android.Manifest
import android.app.Application
import android.content.Context
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class NativeUploadReadResolverTest {
    @Test
    fun mediaLocationPermissionIsRequestedOnlyForImagesWithoutGrant() {
        val context = ApplicationProvider.getApplicationContext<Context>()

        assertTrue(
            NativeUploadReadResolver.shouldRequestMediaLocationPermissionForTests(
                context,
                "photo.jpg",
                "image/jpeg",
            ),
        )
        assertFalse(
            NativeUploadReadResolver.shouldRequestMediaLocationPermissionForTests(
                context,
                "report.pdf",
                "application/pdf",
            ),
        )
    }

    @Test
    fun mediaLocationPermissionIsSkippedWhenAlreadyGranted() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        shadowOf(context).grantPermissions(Manifest.permission.ACCESS_MEDIA_LOCATION)

        assertFalse(
            NativeUploadReadResolver.shouldRequestMediaLocationPermissionForTests(
                context,
                "photo.jpg",
                "image/jpeg",
            ),
        )
    }

    @Test
    fun imageWithoutPermissionMarksOriginalAccessMissing() {
        val context = ApplicationProvider.getApplicationContext<Context>()

        val provenance = NativeUploadReadResolver.uploadReadProvenanceForTests(
            context = context,
            name = "photo.jpg",
            mimeType = "image/jpeg",
            uri = "content://com.chromvoid.test/photo",
            requireOriginalStatus = "not_attempted_permission_missing",
            originalStreamUsed = false,
            regularStreamFallback = true,
        )

        assertTrue(provenance.imageCandidate)
        assertEquals("denied", provenance.permissionStatus)
        assertEquals("not_attempted_permission_missing", provenance.requireOriginalStatus)
        assertFalse(provenance.originalStreamUsed)
        assertTrue(provenance.regularStreamFallback)
        assertEquals("content", provenance.uriScheme)
        assertEquals("com.chromvoid.test", provenance.uriAuthority)
    }

    @Test
    fun imageWithPermissionMarksOriginalAccessAttemptedAndUsed() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        shadowOf(context).grantPermissions(Manifest.permission.ACCESS_MEDIA_LOCATION)

        val provenance = NativeUploadReadResolver.uploadReadProvenanceForTests(
            context = context,
            name = "photo.heic",
            mimeType = "image/heic",
            uri = "content://com.chromvoid.test/photo",
            requireOriginalStatus = "attempted_used",
            originalStreamUsed = true,
            regularStreamFallback = false,
        )

        assertTrue(provenance.imageCandidate)
        assertEquals("granted", provenance.permissionStatus)
        assertEquals("attempted_used", provenance.requireOriginalStatus)
        assertTrue(provenance.originalStreamUsed)
        assertFalse(provenance.regularStreamFallback)
    }

    @Test
    fun nonImageMarksOriginalAccessNotApplicable() {
        val context = ApplicationProvider.getApplicationContext<Context>()

        val provenance = NativeUploadReadResolver.uploadReadProvenanceForTests(
            context = context,
            name = "report.pdf",
            mimeType = "application/pdf",
            uri = "content://com.chromvoid.test/report",
            requireOriginalStatus = "not_applicable",
            originalStreamUsed = false,
            regularStreamFallback = false,
        )

        assertFalse(provenance.imageCandidate)
        assertEquals("not_required", provenance.permissionStatus)
        assertEquals("not_applicable", provenance.requireOriginalStatus)
        assertFalse(provenance.originalStreamUsed)
        assertFalse(provenance.regularStreamFallback)
    }

    @Test
    fun fallbackWhenOriginalUriCannotBeOpenedIsExplicit() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        shadowOf(context).grantPermissions(Manifest.permission.ACCESS_MEDIA_LOCATION)

        val provenance = NativeUploadReadResolver.uploadReadProvenanceForTests(
            context = context,
            name = "photo.jpg",
            mimeType = "image/jpeg",
            uri = "content://com.chromvoid.test/photo",
            requireOriginalStatus = "attempted_open_original_failed",
            originalStreamUsed = false,
            regularStreamFallback = true,
        )

        assertTrue(provenance.imageCandidate)
        assertEquals("granted", provenance.permissionStatus)
        assertEquals("attempted_open_original_failed", provenance.requireOriginalStatus)
        assertFalse(provenance.originalStreamUsed)
        assertTrue(provenance.regularStreamFallback)
    }

    @Test
    fun mediaDocumentUriWithPermissionUsesMediaStoreOriginalUri() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        shadowOf(context).grantPermissions(Manifest.permission.ACCESS_MEDIA_LOCATION)

        val result = NativeUploadReadResolver.originalMediaUriForTests(
            context = context,
            uri = "content://com.android.providers.media.documents/document/image%3A42",
            imageCandidate = true,
            permissionStatus = "granted",
        )

        assertTrue(result.shouldOpenOriginal)
        assertTrue(result.uri.startsWith("content://media/"))
        assertTrue(result.uri.contains("/images/media/42"))
    }
}
