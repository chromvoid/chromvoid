package com.chromvoid.app.autofill

import android.content.ComponentName
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.AutofillTestUtils
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AutofillRequestContextFactoryTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun fromSnapshot_keepsSharedSnapshotContract_forServiceAndAuthBuilders() {
        val activityComponent = ComponentName("org.mozilla.firefox", "org.mozilla.fenix.App")
        val focusedId = AutofillTestUtils.newAutofillId(context)
        val previousFocusedId = AutofillTestUtils.newAutofillId(context)
        val usernameId = AutofillTestUtils.newAutofillId(context)
        val passwordId = AutofillTestUtils.newAutofillId(context)
        val otpId = AutofillTestUtils.newAutofillId(context)
        val snapshot =
            AutofillStructureSnapshot(
                webDomain = "github.com",
                usernameFieldIds = listOf(usernameId),
                passwordFieldIds = listOf(passwordId),
                otpCandidates =
                    listOf(
                        AutofillOtpCandidate(
                            autofillId = otpId,
                            parentPath = "root/form/otp",
                            order = 0,
                            visible = true,
                            fillable = true,
                            focused = true,
                        ),
                    ),
                focusedFieldCandidates =
                    listOf(
                        AutofillFocusedFieldCandidate(
                            autofillId = focusedId,
                            parentPath = "root/form",
                            order = 0,
                            visible = true,
                            fillable = true,
                            focused = true,
                        ),
                    ),
                pageHintBlobs = listOf("enter your one-time code"),
            )

        val serviceLike =
            AutofillRequestContextFactory.fromSnapshot(
                requestId = 42,
                snapshot = snapshot,
                activityComponent = activityComponent,
                compatMode = true,
                focusedId = focusedId,
                previousFocusedIds = listOf(previousFocusedId),
            )
        val authLike =
            AutofillRequestContextFactory.fromSnapshot(
                requestId = 0,
                snapshot = snapshot,
                activityComponent = activityComponent,
                compatMode = true,
                focusedId = focusedId,
                previousFocusedIds = emptyList(),
                fallbackDomain = "github.com",
            )

        assertEquals("github.com", serviceLike.context.normalizedDomain)
        assertEquals(serviceLike.context.normalizedDomain, authLike.context.normalizedDomain)
        assertEquals(serviceLike.context.activityComponent, authLike.context.activityComponent)
        assertEquals(serviceLike.context.compatMode, authLike.context.compatMode)
        assertEquals(serviceLike.context.usernameFieldIds, authLike.context.usernameFieldIds)
        assertEquals(serviceLike.context.passwordFieldIds, authLike.context.passwordFieldIds)
        assertEquals(serviceLike.context.otpCandidates, authLike.context.otpCandidates)
        assertEquals(serviceLike.context.focusedFieldCandidates, authLike.context.focusedFieldCandidates)
        assertEquals(serviceLike.context.pageHintBlobs, authLike.context.pageHintBlobs)
        assertEquals(listOf(previousFocusedId), serviceLike.context.previousFocusedIds)
        assertTrue(authLike.context.previousFocusedIds.isEmpty())
    }

    @Test
    fun fromSnapshot_usesFallbackDomain_whenSnapshotDomainIsMissing() {
        val focusedId = AutofillTestUtils.newAutofillId(context)
        val snapshot =
            AutofillStructureSnapshot(
                webDomain = null,
                usernameFieldIds = emptyList(),
                passwordFieldIds = emptyList(),
                otpCandidates = emptyList(),
                focusedFieldCandidates = emptyList(),
                pageHintBlobs = emptyList(),
            )

        val built =
            AutofillRequestContextFactory.fromSnapshot(
                requestId = 0,
                snapshot = snapshot,
                activityComponent = null,
                compatMode = true,
                focusedId = focusedId,
                previousFocusedIds = emptyList(),
                fallbackDomain = "github.com",
            )

        assertEquals("github.com", built.context.normalizedDomain)
        assertEquals(focusedId, built.context.focusedId)
    }
}
