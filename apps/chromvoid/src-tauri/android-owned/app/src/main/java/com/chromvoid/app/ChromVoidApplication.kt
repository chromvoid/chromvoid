package com.chromvoid.app

import android.app.Application
import android.content.Context
import com.chromvoid.app.shared.AndroidAppGraph
import com.chromvoid.app.shared.AndroidRuntimeAccess
import com.chromvoid.app.shared.DefaultActivityLifecycleRegistrar
import com.chromvoid.app.shared.DefaultAndroidAppGraph

class ChromVoidApplication : Application() {
    private val lifecycleRegistrar by lazy { DefaultActivityLifecycleRegistrar(this) { appGraph } }

    @Volatile
    private var graphOverride: AndroidAppGraph? = null

    @Volatile
    private var graphCache: AndroidAppGraph? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        AndroidRuntimeAccess.bind(this) { appGraph }
        lifecycleRegistrar.register()
    }

    override fun onTerminate() {
        if (instance === this) {
            instance = null
        }
        AndroidRuntimeAccess.unbind(this)
        super.onTerminate()
    }

    internal val appGraph: AndroidAppGraph
        get() {
            graphOverride?.let { return it }
            graphCache?.let { return it }

            return synchronized(this) {
                graphOverride ?: graphCache ?: DefaultAndroidAppGraph(applicationContext).also {
                    graphCache = it
                }
            }
        }

    internal fun setAppGraphForTests(graph: AndroidAppGraph?) {
        graphOverride = graph
        if (graph == null) {
            graphCache = null
        }
    }

    companion object {
        @Volatile
        private var instance: ChromVoidApplication? = null

        internal fun appGraphOrNull(): AndroidAppGraph? = instance?.appGraph

        internal fun applicationContextOrNull(): Context? = instance?.applicationContext
    }
}

internal fun Context.androidAppGraph(): AndroidAppGraph {
    return applicationContext.let { context ->
        context as? ChromVoidApplication
            ?: error("Application context must be ChromVoidApplication")
    }.appGraph
}
