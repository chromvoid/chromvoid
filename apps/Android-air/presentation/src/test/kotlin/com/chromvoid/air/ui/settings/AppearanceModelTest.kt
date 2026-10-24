package com.chromvoid.air.ui.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

public class AppearanceModelTest {
    private class Preferences(override var theme: String = "", override var language: String = "") :
        AppearancePreferences

    @Test
    public fun `nothing stored means the system's own choice`() {
        val model = AppearanceModel(Preferences())

        assertEquals(AppearanceModel.Theme.SYSTEM, model.state.value.theme)
        assertEquals(AppearanceModel.Language.SYSTEM, model.state.value.language)
        assertEquals("the system language is not a tag", "", AppearanceModel.Language.SYSTEM.tags)
    }

    @Test
    public fun `a stored choice is read back, and an unknown one falls back to the system`() {
        assertEquals(AppearanceModel.Theme.DARK, AppearanceModel(Preferences(theme = "dark")).state.value.theme)
        assertEquals(
            AppearanceModel.Language.RUSSIAN,
            AppearanceModel(Preferences(language = "ru")).state.value.language,
        )
        assertEquals(AppearanceModel.Theme.SYSTEM, AppearanceModel(Preferences(theme = "sepia")).state.value.theme)
    }

    @Test
    public fun `a change is stored, and the language restarts the screens once`() {
        val preferences = Preferences()
        val restarts = mutableListOf<AppearanceModel.Language>()
        val model = AppearanceModel(preferences) { restarts += it }

        model.setTheme(AppearanceModel.Theme.LIGHT)
        assertEquals("light", preferences.theme)
        assertTrue("the theme needs no restart", restarts.isEmpty())

        model.setLanguage(AppearanceModel.Language.ENGLISH)
        assertEquals("en", preferences.language)
        assertEquals(listOf(AppearanceModel.Language.ENGLISH), restarts)

        // Choosing what is already chosen changes nothing and restarts nothing.
        model.setLanguage(AppearanceModel.Language.ENGLISH)
        assertEquals(1, restarts.size)
    }
}
