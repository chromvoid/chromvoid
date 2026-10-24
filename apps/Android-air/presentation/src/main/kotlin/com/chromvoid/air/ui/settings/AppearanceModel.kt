package com.chromvoid.air.ui.settings

import com.chromvoid.air.presentation.R
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Where the appearance choices are kept; they hold nothing from the vault. */
public interface AppearancePreferences {
    public var theme: String
    public var language: String
}

/**
 * The theme and the language, as on iOS. Both are the person's choice rather
 * than the system's when they set one, and both are stored outside the vault:
 * they are readable while it is locked and are not part of a backup.
 */
public class AppearanceModel(
    private val preferences: AppearancePreferences,
    /** Applying a language restarts the screens; the platform owns how. */
    private val onLanguageChanged: (Language) -> Unit = {},
) {
    public enum class Theme(public val stored: String, public val label: Int) {
        SYSTEM("system", R.string.appearance_system),
        LIGHT("light", R.string.appearance_light),
        DARK("dark", R.string.appearance_dark),
        ;

        public companion object {
            public fun of(stored: String?): Theme = entries.firstOrNull { it.stored == stored } ?: SYSTEM
        }
    }

    public enum class Language(public val stored: String, public val label: Int) {
        SYSTEM("system", R.string.appearance_system),
        ENGLISH("en", R.string.appearance_english),
        RUSSIAN("ru", R.string.appearance_russian),
        ;

        /** The BCP 47 tags the platform wants; the system choice is an empty list. */
        public val tags: String get() = if (this == SYSTEM) "" else stored

        public companion object {
            public fun of(stored: String?): Language = entries.firstOrNull { it.stored == stored } ?: SYSTEM
        }
    }

    public data class State(val theme: Theme, val language: Language)

    private val mutableState = MutableStateFlow(
        State(Theme.of(preferences.theme), Language.of(preferences.language)),
    )
    public val state: StateFlow<State> = mutableState.asStateFlow()

    public fun setTheme(theme: Theme) {
        if (mutableState.value.theme == theme) return
        preferences.theme = theme.stored
        mutableState.value = mutableState.value.copy(theme = theme)
    }

    public fun setLanguage(language: Language) {
        if (mutableState.value.language == language) return
        preferences.language = language.stored
        mutableState.value = mutableState.value.copy(language = language)
        onLanguageChanged(language)
    }
}
