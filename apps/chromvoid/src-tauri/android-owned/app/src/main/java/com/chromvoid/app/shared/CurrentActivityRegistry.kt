package com.chromvoid.app.shared

import java.lang.ref.WeakReference

internal class CurrentActivityRegistry<T : Any> {
    @Volatile
    private var currentRef: WeakReference<T>? = null

    fun attach(activity: T) {
        currentRef = WeakReference(activity)
    }

    fun detach(activity: T) {
        if (currentRef?.get() === activity) {
            currentRef = null
        }
    }

    fun current(): T? = currentRef?.get()
}
