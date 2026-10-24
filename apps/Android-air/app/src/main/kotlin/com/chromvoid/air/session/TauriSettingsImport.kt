package com.chromvoid.air.session

import android.content.Context
import android.content.SharedPreferences
import com.chromvoid.air.ui.files.FileSettings
import com.chromvoid.air.ui.settings.AutoLockTimeout
import java.io.File
import java.nio.ByteBuffer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/** Imports only app preferences, before any session or vault work starts. */
internal object TauriSettingsImport {
    fun importIfPresent(context: Context) {
        if (context.packageName != "com.chromvoid.app") return
        val source = File(context.dataDir, "session_settings.json")
        val archived = File(context.dataDir, "session_settings.json.imported")
        val progress = context.getSharedPreferences("air-tauri-settings-import", Context.MODE_PRIVATE)
        if (archived.exists()) return
        // Tauri wrote session_settings.json only after a settings change. Its storage root, the root
        // override or Air's adoption journal still mark an update from Tauri when the file is absent.
        val fromTauri = source.exists() ||
            TAURI_MARKERS.any { File(context.dataDir, it).exists() }
        if (!fromTauri) return
        if (progress.getBoolean("attempted", false)) {
            // Complete a rename interrupted after preferences were committed, without importing again.
            if (source.exists()) source.renameTo(archived)
            return
        }

        val settings = if (!source.exists()) null else try {
            // Match serde_json::from_slice: malformed UTF-8 invalidates the whole file.
            parse(Charsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(source.readBytes())).toString())
        } catch (_: Exception) {
            null
        }
        // Tauri ran on its own defaults when the file was missing, unreadable or invalid; keep
        // what the person had rather than Air's fresh-install defaults.
        if (!store(context, settings ?: TAURI_DEFAULTS)) return

        // Remember completion even if the filesystem refuses the rename, so an unreadable
        // or invalid legacy file cannot be tried again on every process start.
        if (progress.edit().putBoolean("attempted", true).commit() && source.exists()) source.renameTo(archived)
    }

    private val TAURI_MARKERS = listOf("storage", "storage.json", "air-adoption.json")

    /** Tauri's `SessionSettings::default()`; lock_on_sleep=true locked on leaving the app. */
    private val TAURI_DEFAULTS = LegacySettings(
        autoLockSeconds = 0uL,
        lockOnLeave = true,
        keepScreenAwake = false,
        lockNotification = true,
        confirmDeletion = true,
        showHidden = false,
        attachmentFolder = FileSettings.DEFAULT_ATTACHMENT_FOLDER,
    )

    private fun store(context: Context, settings: LegacySettings): Boolean {
        val session = context.getSharedPreferences("air-session", Context.MODE_PRIVATE)
        val sessionEditor = session.edit()
        if (!session.contains("auto-lock-seconds")) {
            sessionEditor.putLong("auto-lock-seconds", nearestAutoLock(settings.autoLockSeconds))
        }
        sessionEditor.putBooleanIfAbsent(session, "lock-on-leave", settings.lockOnLeave)
        sessionEditor.putBooleanIfAbsent(session, "keep-screen-awake", settings.keepScreenAwake)
        sessionEditor.putBooleanIfAbsent(session, "lock-notification", settings.lockNotification)
        if (!sessionEditor.commit()) return false

        val files = context.getSharedPreferences("air-files", Context.MODE_PRIVATE)
        val filesEditor = files.edit()
        filesEditor.putBooleanIfAbsent(files, "confirm-deletion", settings.confirmDeletion)
        filesEditor.putBooleanIfAbsent(files, "show-hidden", settings.showHidden)
        if (!files.contains("attachment-folder")) {
            filesEditor.putString("attachment-folder", attachmentFolder(settings.attachmentFolder))
        }
        if (!filesEditor.commit()) return false

        val presence = context.getSharedPreferences("air-presence", Context.MODE_PRIVATE)
        // Air's PresenceGate enables only after a successful system authentication. There is
        // no Keystore enrollment, but that confirmation cannot happen during startup import.
        // Keep the imported gate off; the person can enable it safely in Settings afterwards.
        return presence.edit().putBooleanIfAbsent(presence, "enabled", false).commit()
    }

    private fun SharedPreferences.Editor.putBooleanIfAbsent(
        preferences: SharedPreferences,
        key: String,
        value: Boolean,
    ): SharedPreferences.Editor = apply {
        if (!preferences.contains(key)) putBoolean(key, value)
    }

    private fun parse(text: String): LegacySettings {
        val fields = Json.parseToJsonElement(text) as? JsonObject ?: error("Expected settings object")

        fun JsonObject.primitive(key: String): JsonPrimitive =
            this[key] as? JsonPrimitive ?: error("Expected primitive setting")

        fun JsonObject.boolean(key: String, default: Boolean? = null): Boolean {
            if (key !in this) return default ?: error("Missing required setting")
            val value = primitive(key)
            require(!value.isString)
            return value.booleanOrNull ?: error("Expected boolean setting")
        }

        val timeout = fields.primitive("auto_lock_timeout_secs")
        require(!timeout.isString)
        require(timeout.content.matches(Regex("0|[1-9][0-9]*")))
        val seconds = timeout.content.toULongOrNull() ?: error("Expected unsigned timeout")
        val lockOnSleep = fields.boolean("lock_on_sleep")
        // Known discarded fields still take part in Tauri's all-or-nothing deserialization.
        listOf(
            "require_biometric_app_gate",
            "auto_mount_after_unlock",
            "auto_start_ssh_agent_after_unlock",
        ).forEach { fields.boolean(it, false) }
        fields.boolean("android_quick_lock_tile_enabled", true)
        return LegacySettings(
            autoLockSeconds = seconds,
            // Tauri Android locked on leaving the app when either flag was set (mobile_notify_background),
            // and its single switch showed and wrote both. lock_on_sleep defaults to true there.
            lockOnLeave = fields.boolean("lock_on_mobile_background", false) || lockOnSleep,
            keepScreenAwake = fields.boolean("keep_screen_awake_when_unlocked", false),
            lockNotification = fields.boolean("android_vault_status_notification_enabled", true),
            confirmDeletion = fields.boolean("confirm_file_deletion", true),
            showHidden = fields.boolean("show_hidden_files", false),
            attachmentFolder = if ("markdown_attachment_folder_path" in fields) {
                fields.primitive("markdown_attachment_folder_path").also {
                    require(it.isString)
                }.content
            } else {
                FileSettings.DEFAULT_ATTACHMENT_FOLDER
            },
        )
    }

    private fun nearestAutoLock(seconds: ULong): Long {
        // Tauri's 0 means Never. Positive timeouts use the nearest finite Air option,
        // never the 0 sentinel; an equal distance chooses the shorter, safer timeout.
        if (seconds == 0uL) return AutoLockTimeout.NEVER.seconds
        return AutoLockTimeout.entries.filter { it != AutoLockTimeout.NEVER }.minWith(
            compareBy<AutoLockTimeout> {
                val option = it.seconds.toULong()
                if (seconds >= option) seconds - option else option - seconds
            }.thenBy { it.seconds },
        ).seconds
    }

    private fun attachmentFolder(value: String): String {
        // Apply the attachment request's lexical constraints without opening a vault.
        // Folder existence and access remain the runtime's authority when it is used.
        val path = value.trim()
        val parts = path.split('/').filter { it.isNotEmpty() }
        return if (
            !path.startsWith('/') || '\\' in path || path.any { it.isISOControl() } ||
            parts.isEmpty() || parts.any { it == "." || it == ".." }
        ) {
            FileSettings.DEFAULT_ATTACHMENT_FOLDER
        } else {
            "/" + parts.joinToString("/")
        }
    }

    private data class LegacySettings(
        val autoLockSeconds: ULong,
        val lockOnLeave: Boolean,
        val keepScreenAwake: Boolean,
        val lockNotification: Boolean,
        val confirmDeletion: Boolean,
        val showHidden: Boolean,
        val attachmentFolder: String,
    )
}
