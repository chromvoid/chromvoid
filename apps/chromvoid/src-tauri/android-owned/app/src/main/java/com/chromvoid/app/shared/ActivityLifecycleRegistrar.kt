package com.chromvoid.app.shared

import android.app.Activity
import android.app.Application
import android.os.Bundle
import androidx.fragment.app.FragmentActivity
import com.chromvoid.app.ChromVoidPasswordSaveActivity
import com.chromvoid.app.MainActivity

internal interface ActivityLifecycleRegistrar {
    fun register()
}

internal class DefaultActivityLifecycleRegistrar(
    private val application: Application,
    private val appGraph: () -> AndroidAppGraph,
) : ActivityLifecycleRegistrar, Application.ActivityLifecycleCallbacks {
    @Volatile
    private var registered = false

    override fun register() {
        if (registered) {
            return
        }
        synchronized(this) {
            if (registered) {
                return
            }
            application.registerActivityLifecycleCallbacks(this)
            registered = true
        }
    }

    override fun onActivityCreated(
        activity: Activity,
        savedInstanceState: Bundle?,
    ) {
        attachPasswordSaveActivity(activity)
    }

    override fun onActivityStarted(activity: Activity) {
        attachPasswordSaveActivity(activity)
    }

    override fun onActivityResumed(activity: Activity) {
        if (activity is MainActivity) {
            appGraph().appGateActivityRegistry.attach(activity)
        }
    }

    override fun onActivityPaused(activity: Activity) {
        if (activity is FragmentActivity) {
            appGraph().appGateActivityRegistry.detach(activity)
        }
    }

    override fun onActivityStopped(activity: Activity) = Unit

    override fun onActivitySaveInstanceState(
        activity: Activity,
        outState: Bundle,
    ) = Unit

    override fun onActivityDestroyed(activity: Activity) {
        if (activity is FragmentActivity) {
            appGraph().appGateActivityRegistry.detach(activity)
        }
        if (activity is ChromVoidPasswordSaveActivity) {
            appGraph().passwordSaveActivityRegistry.detach(activity)
        }
    }

    private fun attachPasswordSaveActivity(activity: Activity) {
        if (activity is ChromVoidPasswordSaveActivity) {
            appGraph().passwordSaveActivityRegistry.attach(activity)
        }
    }
}
