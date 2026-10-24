package com.chromvoid.app.shared

import android.app.Application
import android.content.Context

internal object AndroidRuntimeAccess {
    @Volatile
    private var applicationContext: Context? = null

    @Volatile
    private var appGraphProvider: (() -> AndroidAppGraph)? = null

    fun bind(
        application: Application,
        provider: () -> AndroidAppGraph,
    ) {
        applicationContext = application.applicationContext
        appGraphProvider = provider
    }

    fun unbind(application: Application) {
        if (applicationContext === application.applicationContext) {
            applicationContext = null
            appGraphProvider = null
        }
    }

    fun applicationContextOrNull(): Context? = applicationContext

    fun appGraphOrNull(): AndroidAppGraph? = appGraphProvider?.invoke()
}
