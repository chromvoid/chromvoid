package com.chromvoid.air.ui.files

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Where the Files settings are kept: app preferences, never vault data. */
public interface FilePreferenceStore {
    public var showHidden: Boolean

    /** On by default, as on iOS. */
    public var confirmDeletion: Boolean

    /** The vault folder new note images go into; [FileSettings.DEFAULT_ATTACHMENT_FOLDER] until chosen. */
    public var attachmentFolder: String
}

/**
 * The Files settings, as iOS has them: whether folders show hidden items by
 * default, whether a delete asks first, and where images inserted into notes
 * go. They are presentation choices; Core stays the authority for what a
 * folder holds and what may change.
 */
public class FileSettings(private val store: FilePreferenceStore) {
    public data class State(val showHidden: Boolean, val confirmDeletion: Boolean, val attachmentFolder: String)

    private val mutableState = MutableStateFlow(State(store.showHidden, store.confirmDeletion, store.attachmentFolder))
    public val state: StateFlow<State> = mutableState.asStateFlow()

    public fun setShowHidden(value: Boolean) {
        if (mutableState.value.showHidden == value) return
        store.showHidden = value
        mutableState.value = mutableState.value.copy(showHidden = value)
    }

    public fun setConfirmDeletion(value: Boolean) {
        if (mutableState.value.confirmDeletion == value) return
        store.confirmDeletion = value
        mutableState.value = mutableState.value.copy(confirmDeletion = value)
    }

    public fun setAttachmentFolder(path: String) {
        if (mutableState.value.attachmentFolder == path) return
        store.attachmentFolder = path
        mutableState.value = mutableState.value.copy(attachmentFolder = path)
    }

    public companion object {
        public const val DEFAULT_ATTACHMENT_FOLDER: String = "/attachments"
    }
}
