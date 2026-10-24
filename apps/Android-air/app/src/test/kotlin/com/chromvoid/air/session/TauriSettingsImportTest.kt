package com.chromvoid.air.session

import android.app.Application
import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import androidx.test.core.app.ApplicationProvider
import java.io.File
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
public class TauriSettingsImportTest {
    @get:Rule
    public val temporary: TemporaryFolder = TemporaryFolder()

    private val application: Application = ApplicationProvider.getApplicationContext()
    private lateinit var context: Context
    private val source: File get() = File(context.dataDir, "session_settings.json")
    private val archived: File get() = File(context.dataDir, "session_settings.json.imported")

    @Before
    public fun prepare() {
        val dataDirectory = temporary.newFolder("data")
        context = object : ContextWrapper(application) {
            override fun getPackageName(): String = "com.chromvoid.app"
            override fun getDataDir(): File = dataDirectory
        }
        clearPreferences()
    }

    @Test
    public fun `full Tauri file imports supported settings before stored flows are constructed`() {
        source.writeText(
            """
            {
              "auto_lock_timeout_secs": 300,
              "lock_on_sleep": false,
              "lock_on_mobile_background": true,
              "require_biometric_app_gate": false,
              "auto_mount_after_unlock": true,
              "auto_start_ssh_agent_after_unlock": true,
              "keep_screen_awake_when_unlocked": true,
              "android_vault_status_notification_enabled": false,
              "android_quick_lock_tile_enabled": false,
              "confirm_file_deletion": false,
              "show_hidden_files": true,
              "markdown_attachment_folder_path": "/notes/images"
            }
            """.trimIndent(),
        )

        TauriSettingsImport.importIfPresent(context)

        val session = StoredSessionPreferences(context)
        val files = StoredFilePreferences(context)
        assertEquals(300L, session.autoLockSeconds)
        assertTrue(session.lockOnLeave)
        assertFalse(session.lockOnScreenOff)
        assertTrue(session.keepScreenAwake)
        assertFalse(session.lockNotification)
        assertFalse(session.lockNotificationChoice.value)
        assertFalse(files.confirmDeletion)
        assertTrue(files.showHidden)
        assertEquals("/notes/images", files.attachmentFolder)
        assertFalse(StoredPresencePreference(context).enabled)
        assertEquals(4, preferences("air-session").all.size)
        assertFalse(preferences("air-session").contains("lock-on-screen-off"))
        assertEquals(3, preferences("air-files").all.size)
        assertEquals(1, preferences("air-presence").all.size)
        assertFalse(source.exists())
        assertTrue(archived.isFile)
    }

    @Test
    public fun `optional fields receive Tauri defaults`() {
        source.writeText(settings("60"))

        TauriSettingsImport.importIfPresent(context)

        val session = StoredSessionPreferences(context)
        val files = StoredFilePreferences(context)
        assertEquals(60L, session.autoLockSeconds)
        // settings() carries Tauri's required lock_on_sleep=true, which locked on leaving the app.
        assertTrue(session.lockOnLeave)
        assertFalse(session.keepScreenAwake)
        assertTrue(session.lockNotification)
        assertFalse(StoredPresencePreference(context).enabled)
        assertTrue(files.confirmDeletion)
        assertFalse(files.showHidden)
        assertEquals("/attachments", files.attachmentFolder)
        assertTrue(archived.isFile)
    }

    @Test
    public fun `invalid files fall back to Tauri defaults and are archived`() {
        val invalid = listOf(
            "{",
            "[]",
            "{}",
            """{"auto_lock_timeout_secs":60}""",
            """{"lock_on_sleep":true}""",
            settings("-1"),
            settings("+1"),
            settings("01"),
            settings("1.5"),
            settings("1e2"),
            settings("\"60\""),
            settings("18446744073709551616"),
            settings("60", "\"lock_on_mobile_background\": null"),
            settings("60", "\"keep_screen_awake_when_unlocked\": \"true\""),
            settings("60", "\"require_biometric_app_gate\": 1"),
            settings("60", "\"auto_mount_after_unlock\": \"false\""),
            settings("60", "\"auto_start_ssh_agent_after_unlock\": null"),
            settings("60", "\"android_quick_lock_tile_enabled\": []"),
            settings("60", "\"markdown_attachment_folder_path\": false"),
            """{"auto_lock_timeout_secs":60,"lock_on_sleep":"true"}""",
        )
        invalid.forEach { text ->
            clearPreferences()
            archived.delete()
            source.writeText(text)

            TauriSettingsImport.importIfPresent(context)

            assertTauriDefaults()
            assertFalse(text, source.exists())
            assertEquals(text, archived.readText())
        }
    }

    @Test
    public fun `valid unknown JSON fields do not prevent settings import`() {
        source.writeText(
            settings(
                "300",
                """
                "unknown":{"array":[null,true,false,-1,1.5,2e3,"quoted"],"nested":{}},
                "markdown_attachment_folder_path":"/images/attachments"
                """.trimIndent(),
            ),
        )

        TauriSettingsImport.importIfPresent(context)

        assertEquals(300L, StoredSessionPreferences(context).autoLockSeconds)
        assertTrue(StoredSessionPreferences(context).lockNotification)
        assertEquals("/images/attachments", StoredFilePreferences(context).attachmentFolder)
        assertFalse(source.exists())
        assertTrue(archived.isFile)
    }

    @Test
    public fun `read errors fall back to Tauri defaults and are archived`() {
        assertTrue(source.mkdir())

        TauriSettingsImport.importIfPresent(context)

        assertTauriDefaults()
        assertFalse(source.exists())
        assertTrue(archived.isDirectory)
    }

    @Test
    public fun `invalid UTF8 is rejected rather than importing replacement characters`() {
        val valid = settings("60", "\"markdown_attachment_folder_path\": \"/images\"").toByteArray()
        val invalid = valid.sliceArray(0 until valid.size - 2) + byteArrayOf(0xff.toByte()) +
            valid.sliceArray(valid.size - 2 until valid.size)
        source.writeBytes(invalid)

        TauriSettingsImport.importIfPresent(context)

        assertTauriDefaults()
        assertFalse(source.exists())
        assertArrayEquals(invalid, archived.readBytes())
    }

    @Test
    public fun `a fresh install without Tauri data leaves all Air preferences unset`() {
        TauriSettingsImport.importIfPresent(context)

        assertProductPreferencesEmpty()
        assertFalse(source.exists())
        assertFalse(archived.exists())
    }

    @Test
    public fun `an update from Tauri without a settings file keeps Tauri defaults`() {
        listOf("storage", "storage.json", "air-adoption.json").forEach { marker ->
            clearPreferences()
            val path = File(context.dataDir, marker)
            if (marker == "storage") path.mkdirs() else path.writeText("{}")

            TauriSettingsImport.importIfPresent(context)

            assertTauriDefaults()
            assertFalse(archived.exists())
            path.deleteRecursively()
        }
    }

    @Test
    public fun `restart does not import again or overwrite a later Air choice`() {
        source.writeText(settings("60"))
        TauriSettingsImport.importIfPresent(context)
        preferences("air-session").edit().putLong("auto-lock-seconds", 900L).commit()

        TauriSettingsImport.importIfPresent(context)

        assertEquals(900L, StoredSessionPreferences(context).autoLockSeconds)
        assertFalse(source.exists())
        assertEquals(settings("60"), archived.readText())
    }

    @Test
    public fun `an already attempted import finishes archiving without importing again`() {
        source.writeText("invalid")
        TauriSettingsImport.importIfPresent(context)
        archived.delete()
        source.writeText(settings("3600"))

        TauriSettingsImport.importIfPresent(context)

        // The first, invalid file already imported Tauri's defaults; the second file is only archived.
        assertTauriDefaults()
        assertFalse(source.exists())
        assertEquals(settings("3600"), archived.readText())
    }

    @Test
    public fun `every existing Air preference is preserved`() {
        preferences("air-session").edit()
            .putLong("auto-lock-seconds", 900L)
            .putBoolean("lock-on-leave", true)
            .putBoolean("keep-screen-awake", true)
            .putBoolean("lock-notification", false)
            .commit()
        preferences("air-files").edit()
            .putBoolean("confirm-deletion", false)
            .putBoolean("show-hidden", true)
            .putString("attachment-folder", "/chosen")
            .commit()
        preferences("air-presence").edit().putBoolean("enabled", true).commit()
        source.writeText(settings("60"))
        val before = productPreferenceNames.associateWith { preferences(it).all.toMap() }

        TauriSettingsImport.importIfPresent(context)

        productPreferenceNames.forEach { name -> assertEquals(before[name], preferences(name).all) }
        assertTrue(archived.isFile)
    }

    @Test
    public fun `missing Air settings are imported alongside existing ones`() {
        preferences("air-session").edit().putLong("auto-lock-seconds", 900L).commit()
        preferences("air-files").edit().putBoolean("show-hidden", true).commit()
        source.writeText(settings("60"))

        TauriSettingsImport.importIfPresent(context)

        assertEquals(900L, StoredSessionPreferences(context).autoLockSeconds)
        assertTrue(StoredSessionPreferences(context).lockNotification)
        assertTrue(StoredFilePreferences(context).showHidden)
        assertTrue(StoredFilePreferences(context).confirmDeletion)
        assertEquals("/attachments", StoredFilePreferences(context).attachmentFolder)
    }

    @Test
    public fun `development and fixture identities do not read or archive Tauri settings`() {
        source.writeText(settings("60"))
        listOf("com.chromvoid.air.dev", "com.chromvoid.app.debug", "com.chromvoid.air.fixture").forEach { identity ->
            val isolated = object : ContextWrapper(context) {
                override fun getPackageName(): String = identity
            }

            TauriSettingsImport.importIfPresent(isolated)

            assertProductPreferencesEmpty()
            assertTrue(source.isFile)
            assertFalse(archived.exists())
            assertTrue(preferences("air-tauri-settings-import").all.isEmpty())
        }
    }

    @Test
    public fun `auto lock uses nearest finite option with shorter ties and preserves never`() {
        val cases = mapOf(
            "0" to 0L,
            "1" to 60L,
            "60" to 60L,
            "180" to 60L,
            "181" to 300L,
            "599" to 300L,
            "600" to 300L,
            "601" to 900L,
            "1350" to 900L,
            "1351" to 1800L,
            "2700" to 1800L,
            "2701" to 3600L,
            "3600" to 3600L,
            "18446744073709551615" to 3600L,
        )
        cases.forEach { (legacy, expected) ->
            clearPreferences()
            archived.delete()
            source.writeText(settings(legacy))

            TauriSettingsImport.importIfPresent(context)

            assertEquals(legacy, expected, StoredSessionPreferences(context).autoLockSeconds)
        }
    }

    @Test
    public fun `legacy presence requirement stays off until the Air confirmation flow`() {
        source.writeText(settings("60", "\"require_biometric_app_gate\": true"))

        TauriSettingsImport.importIfPresent(context)

        assertFalse(StoredPresencePreference(context).enabled)
        assertTrue(preferences("air-presence").contains("enabled"))
        assertTrue(archived.isFile)
    }

    @Test
    public fun `invalid attachment destinations fall back without discarding other valid settings`() {
        val invalid = listOf("", "relative", "/", "///", "/images/..", "/./images", "/images\\old", "/a\u0000b")
        invalid.forEach { path ->
            clearPreferences()
            archived.delete()
            val escaped = path.replace("\\", "\\\\").replace("\u0000", "\\u0000")
            source.writeText(settings("300", "\"markdown_attachment_folder_path\": \"$escaped\""))

            TauriSettingsImport.importIfPresent(context)

            assertEquals(path, "/attachments", StoredFilePreferences(context).attachmentFolder)
            assertEquals(path, 300L, StoredSessionPreferences(context).autoLockSeconds)
        }
    }

    @Test
    public fun `attachment destinations normalize as the Air attachment request does`() {
        source.writeText(settings("60", "\"markdown_attachment_folder_path\": \" /notes//images/ \""))

        TauriSettingsImport.importIfPresent(context)

        assertEquals("/notes/images", StoredFilePreferences(context).attachmentFolder)
    }

    @Test
    public fun `settings import never reads or changes a vault`() {
        val legacyVault = File(context.dataDir, "storage").apply { mkdir() }
        val legacyContents = File(legacyVault, "sentinel").apply { writeText("legacy vault") }
        val airVault = File(context.dataDir, "files/ChromVoidAir").apply { mkdirs() }
        val airContents = File(airVault, "sentinel").apply { writeText("new vault") }
        source.writeText(settings("300"))

        TauriSettingsImport.importIfPresent(context)

        assertEquals("legacy vault", legacyContents.readText())
        assertEquals("new vault", airContents.readText())
        assertEquals(300L, StoredSessionPreferences(context).autoLockSeconds)
        assertTrue(archived.isFile)
    }

    @Test
    public fun `lock on leave follows the effective Tauri Android behaviour`() {
        // Tauri's defaults (lock_on_sleep true, lock_on_mobile_background false) locked on leaving the app.
        source.writeText(settings("300"))
        TauriSettingsImport.importIfPresent(context)
        assertTrue(StoredSessionPreferences(context).lockOnLeave)

        clearPreferences()
        archived.delete()
        source.writeText("""{"auto_lock_timeout_secs":300,"lock_on_sleep":false,"lock_on_mobile_background":false}""")
        TauriSettingsImport.importIfPresent(context)
        assertFalse(StoredSessionPreferences(context).lockOnLeave)
    }

    private fun settings(seconds: String, optional: String = ""): String =
        """{"auto_lock_timeout_secs":$seconds,"lock_on_sleep":true${if (optional.isEmpty()) "" else ",$optional"}}"""

    private fun preferences(name: String): SharedPreferences = context.getSharedPreferences(name, Context.MODE_PRIVATE)

    private fun assertTauriDefaults() {
        val session = StoredSessionPreferences(context)
        val files = StoredFilePreferences(context)
        assertEquals(0L, session.autoLockSeconds)
        assertTrue(session.lockOnLeave)
        assertFalse(session.keepScreenAwake)
        assertTrue(session.lockNotification)
        assertTrue(files.confirmDeletion)
        assertFalse(files.showHidden)
        assertEquals("/attachments", files.attachmentFolder)
        assertFalse(StoredPresencePreference(context).enabled)
    }

    private fun assertProductPreferencesEmpty() {
        productPreferenceNames.forEach { name -> assertTrue(name, preferences(name).all.isEmpty()) }
    }

    private fun clearPreferences() {
        (productPreferenceNames + "air-tauri-settings-import").forEach { name ->
            preferences(name).edit().clear().commit()
        }
    }

    private companion object {
        val productPreferenceNames = listOf("air-session", "air-files", "air-presence")
    }
}
