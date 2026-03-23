package com.chromvoid.app

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.xmlpull.v1.XmlPullParser

@RunWith(AndroidJUnit4::class)
class ProviderManifestInstrumentationTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val packageName: String = context.packageName

    @Test
    fun application_usesChromVoidApplicationAndInitializesGraph() {
        val application = ApplicationProvider.getApplicationContext<Context>()

        assertTrue(application is ChromVoidApplication)
        assertNotNull((application as ChromVoidApplication).appGraph)
    }

    @Test
    fun credentialProviderService_isRegisteredWithExpectedBindingPermission() {
        assumePasskeyBucket()
        val serviceInfo =
            getServiceInfo(componentName("ChromVoidCredentialProviderService"))

        assertTrue(serviceInfo.exported)
        assertEquals(
            "android.permission.BIND_CREDENTIAL_PROVIDER_SERVICE",
            serviceInfo.permission,
        )
        assertNotNull(serviceInfo.metaData)
        assertTrue(serviceInfo.metaData.getInt("android.credentials.provider") != 0)
    }

    @Test
    fun passkeyActivities_arePresentAndNonExported() {
        assumePasskeyBucket()
        val getInfo = getActivityInfo(componentName("ChromVoidPasskeyGetActivity"))
        val createInfo = getActivityInfo(componentName("ChromVoidPasskeyCreateActivity"))

        assertFalse(getInfo.exported)
        assertFalse(createInfo.exported)
    }

    @Test
    fun passwordProviderActivities_arePresentAndNonExported() {
        assumePasskeyBucket()
        val getInfo = getActivityInfo(componentName("ChromVoidPasswordGetActivity"))
        val saveInfo = getActivityInfo(componentName("ChromVoidPasswordSaveActivity"))

        assertFalse(getInfo.exported)
        assertFalse(saveInfo.exported)
    }

    @Test
    fun autofillService_isRegisteredWithExpectedBindingPermissionAndSettingsActivity() {
        val serviceInfo =
            getServiceInfo(componentName("ChromVoidAutofillService"))

        assertTrue(serviceInfo.exported)
        assertEquals(
            "android.permission.BIND_AUTOFILL_SERVICE",
            serviceInfo.permission,
        )
        assertNotNull(serviceInfo.metaData)
        val xmlResId = serviceInfo.metaData.getInt("android.autofill")
        assertTrue(xmlResId != 0)
        assertEquals(
            "com.chromvoid.app.MainActivity",
            parseRootAttribute(xmlResId, "autofill-service", "settingsActivity"),
        )
        assertEquals(
            "true",
            parseRootAttribute(xmlResId, "autofill-service", "supportsInlineSuggestions"),
        )
    }

    @Test
    fun autofillAuthActivity_isPresentAndNonExported() {
        val info = getActivityInfo(componentName("ChromVoidAutofillAuthActivity"))

        assertFalse(info.exported)
    }

    @Test
    fun debugAutofillProbeActivity_isPresentAndNonExported() {
        val info = getActivityInfo(componentName("AutofillProbeActivity"))

        assertFalse(info.exported)
    }

    @Test
    fun autofillServiceXml_declaresChromeCompatibilityPackages() {
        val serviceInfo =
            getServiceInfo(componentName("ChromVoidAutofillService"))
        val xmlResId = serviceInfo.metaData.getInt("android.autofill")

        assertEquals(
            linkedMapOf(
                "com.android.chrome" to "711900039",
                "com.chrome.beta" to "711900039",
                "com.chrome.dev" to "711900039",
                "com.chrome.canary" to "711900039",
                "org.mozilla.firefox" to "9223372036854775807",
                "org.mozilla.firefox_beta" to "9223372036854775807",
                "org.mozilla.fenix" to "9223372036854775807",
            ),
            parseCompatibilityPackages(xmlResId),
        )
    }

    @Test
    fun credentialProviderXml_advertisesPasswordAndPublicKeyCapabilities() {
        assumePasskeyBucket()
        val serviceInfo =
            getServiceInfo(componentName("ChromVoidCredentialProviderService"))
        val xmlResId = serviceInfo.metaData.getInt("android.credentials.provider")

        assertEquals(
            listOf(
                "android.credentials.TYPE_PASSWORD_CREDENTIAL",
                "android.credentials.TYPE_PUBLIC_KEY_CREDENTIAL",
            ),
            parseCapabilityNames(xmlResId),
        )
    }

    private fun packageManager(): PackageManager = context.packageManager

    private fun parseRootAttribute(
        xmlResId: Int,
        expectedRootTag: String,
        attributeName: String,
    ): String? {
        context.resources.getXml(xmlResId).use { parser ->
            while (parser.next() != XmlPullParser.END_DOCUMENT) {
                if (parser.eventType == XmlPullParser.START_TAG && parser.name == expectedRootTag) {
                    return parser.getAttributeValue(
                        "http://schemas.android.com/apk/res/android",
                        attributeName,
                    )
                }
            }
        }
        return null
    }

    private fun parseCapabilityNames(xmlResId: Int): List<String> {
        val names = mutableListOf<String>()
        context.resources.getXml(xmlResId).use { parser ->
            while (parser.next() != XmlPullParser.END_DOCUMENT) {
                if (parser.eventType == XmlPullParser.START_TAG && parser.name == "capability") {
                    val name =
                        parser.getAttributeValue(null, "name")
                            ?: parser.getAttributeValue(
                                "http://schemas.android.com/apk/res/android",
                                "name",
                            )
                    if (!name.isNullOrBlank()) {
                        names += name
                    }
                }
            }
        }
        return names
    }

    private fun parseCompatibilityPackages(xmlResId: Int): LinkedHashMap<String, String> {
        val packages = linkedMapOf<String, String>()
        context.resources.getXml(xmlResId).use { parser ->
            while (parser.next() != XmlPullParser.END_DOCUMENT) {
                if (
                    parser.eventType == XmlPullParser.START_TAG
                    && parser.name == "compatibility-package"
                ) {
                    val name =
                        parser.getAttributeValue(
                            "http://schemas.android.com/apk/res/android",
                            "name",
                        )
                    val maxLongVersionCode =
                        parser.getAttributeValue(
                            "http://schemas.android.com/apk/res/android",
                            "maxLongVersionCode",
                        )
                    if (!name.isNullOrBlank() && !maxLongVersionCode.isNullOrBlank()) {
                        packages[name] = maxLongVersionCode
                    }
                }
            }
        }
        return LinkedHashMap(packages)
    }

    private fun assumePasskeyBucket() {
        assumeTrue(
            "Credential Provider manifest assertions require API 34+",
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE,
        )
    }

    private fun componentName(simpleName: String): ComponentName {
        return ComponentName(packageName, "$packageName.$simpleName")
    }

    @Suppress("DEPRECATION")
    private fun getServiceInfo(componentName: ComponentName) =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager().getServiceInfo(
                componentName,
                PackageManager.ComponentInfoFlags.of(PackageManager.GET_META_DATA.toLong()),
            )
        } else {
            packageManager().getServiceInfo(componentName, PackageManager.GET_META_DATA)
        }

    @Suppress("DEPRECATION")
    private fun getActivityInfo(componentName: ComponentName) =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager().getActivityInfo(
                componentName,
                PackageManager.ComponentInfoFlags.of(PackageManager.GET_META_DATA.toLong()),
            )
        } else {
            packageManager().getActivityInfo(componentName, PackageManager.GET_META_DATA)
        }
}
