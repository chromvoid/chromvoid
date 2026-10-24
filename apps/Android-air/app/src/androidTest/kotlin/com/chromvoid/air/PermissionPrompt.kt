package com.chromvoid.air

import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import java.util.regex.Pattern

/**
 * The buttons of the system's permission prompt, for the tests that meet it. Its package is the
 * platform's permission controller, which Google's images rename; the button ids are the same on
 * all of them.
 */
internal object PermissionPrompt {
    /** Allow, preferring "only this time" and "while using the app" where the system offers them. */
    val allow: List<BySelector> = listOf(
        "permission_allow_one_time_button",
        "permission_allow_foreground_only_button",
        "permission_allow_button",
    ).map(::button)

    val deny: BySelector = button("permission_deny_button")

    private fun button(id: String): BySelector =
        By.res(Pattern.compile("com\\.(google\\.)?android\\.permissioncontroller:id/${Pattern.quote(id)}"))
}
