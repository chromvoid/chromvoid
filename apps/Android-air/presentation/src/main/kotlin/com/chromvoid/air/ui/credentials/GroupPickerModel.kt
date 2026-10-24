package com.chromvoid.air.ui.credentials

import androidx.compose.foundation.text.input.TextFieldState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Browsing the group tree to choose where a record goes. It walks one level
 * at a time with the same reads the catalog uses, and chooses nothing until
 * the user does.
 */
public class GroupPickerModel(
    start: String,
    private val store: CredentialStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
) {
    public enum class Issue { DENIED, NAME_TAKEN, STALE, FAILED }

    /** The group the record is in now; it carries the tick. */
    public val current: String = start.ifEmpty { GroupsModel.ROOT }

    private val mutableLevel = MutableStateFlow(level(start))

    /** The level being browsed; its path is what "choose" picks. */
    public val level: StateFlow<GroupsModel> = mutableLevel.asStateFlow()

    private val mutableIssue = MutableStateFlow<Issue?>(null)
    public val issue: StateFlow<Issue?> = mutableIssue.asStateFlow()

    public data class NewGroup(val input: TextFieldState = TextFieldState(), val submitted: Boolean = false) {
        public val name: String get() = input.text.toString()
        public val invalid: Boolean get() = submitted && name.isBlank()
    }

    private val mutableNewGroup = MutableStateFlow<NewGroup?>(null)
    public val newGroup: StateFlow<NewGroup?> = mutableNewGroup.asStateFlow()

    public fun beginNewGroup() {
        if (!mutableBusy.value) mutableNewGroup.value = NewGroup()
    }

    public fun cancelNewGroup() {
        mutableNewGroup.value = null
    }

    /** Only a draft destination: Core validates and creates it when the record is saved. */
    public fun chooseNewGroup(): String? {
        val draft = mutableNewGroup.value ?: return null
        val name = draft.name.trim()
        if (name.isEmpty()) {
            mutableNewGroup.value = draft.copy(submitted = true)
            return null
        }
        return GroupsModel.childPath(mutableLevel.value.parent, name)
    }

    private val mutableBusy = MutableStateFlow(false)
    public val busy: StateFlow<Boolean> = mutableBusy.asStateFlow()

    public fun open(path: String) {
        cancelNewGroup()
        mutableLevel.value.close()
        mutableLevel.value = level(path)
    }

    /** One level up; the vault root has none. */
    public fun up() {
        val current = mutableLevel.value.parent
        if (current == GroupsModel.ROOT) return
        open(current.substringBeforeLast('/').ifEmpty { GroupsModel.ROOT })
    }

    internal fun working(busy: Boolean) {
        mutableBusy.value = busy
        if (busy) mutableIssue.value = null
    }

    internal fun refuse(issue: Issue) {
        mutableBusy.value = false
        mutableIssue.value = issue
    }

    public fun close() {
        cancelNewGroup()
        mutableLevel.value.close()
    }

    private fun level(path: String): GroupsModel =
        GroupsModel(path.ifEmpty { GroupsModel.ROOT }, store, generation, scope)
}
