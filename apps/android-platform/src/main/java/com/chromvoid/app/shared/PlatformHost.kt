package com.chromvoid.app.shared

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager

/**
 * How the shared platform module sends the user back into the app.
 *
 * A notification, a tile or a provider activity needs an entry point, but the
 * module must not name any application's: the two ChromVoid Android clients
 * have different ones. By default it asks the package manager for whatever the
 * host declares as its launcher, which is the same answer the launcher gives.
 * A host with a more specific intent installs a factory instead.
 *
 * When neither is available the surface still works; it simply offers no way
 * back in, rather than crashing.
 */
object PlatformHost {
    fun interface LaunchIntentFactory {
        fun create(context: Context): Intent
    }

    @Volatile
    private var launchIntentFactory: LaunchIntentFactory? = null

    @JvmStatic
    fun installLaunchIntentFactory(factory: LaunchIntentFactory) {
        launchIntentFactory = factory
    }

    /**
     * The manifest key a host uses to name its entry point.
     *
     * A declared component is what the callers actually need: an explicit
     * intent delivers its extras to a running instance, while the package
     * launcher intent carries `ACTION_MAIN` and is treated as a fresh launch,
     * which drops them.
     */
    const val MAIN_ACTIVITY_META_DATA: String = "com.chromvoid.platform.mainActivity"

    @JvmStatic
    fun launchIntent(context: Context): Intent? {
        val application = context.applicationContext
        launchIntentFactory?.let { return it.create(application) }
        declaredMainActivity(application)?.let { component ->
            return Intent().setClassName(application, component)
        }
        return application.packageManager.getLaunchIntentForPackage(application.packageName)
    }

    private fun declaredMainActivity(application: Context): String? =
        try {
            application.packageManager
                .getApplicationInfo(application.packageName, PackageManager.GET_META_DATA)
                .metaData
                ?.getString(MAIN_ACTIVITY_META_DATA)
                ?.takeIf { it.isNotBlank() }
        } catch (error: PackageManager.NameNotFoundException) {
            null
        }

    /**
     * Makes the platform graph available to a host whose `Application` is not
     * `ChromVoidApplication`. Core resolves `KeystoreBridge` by JNI name, and
     * that bridge reads the pepper store from this graph; without it the first
     * vault setup or unlock fails with the keystore unavailable.
     *
     * The graph is the same one the other client uses - same pepper store, same
     * key alias - and is built on first use, so installing it costs nothing
     * until Core asks. Call it from `Application.onCreate`, before any runtime
     * is opened.
     */
    @JvmStatic
    fun install(application: Application) {
        val graph by lazy { DefaultAndroidAppGraph(application) }
        AndroidRuntimeAccess.bind(application) { graph }
    }

    @JvmStatic
    fun hasLaunchIntentFactory(): Boolean = launchIntentFactory != null

    /** Locks the vault from outside the app: the status notification's action, the tile. */
    fun interface QuickLock {
        fun lock(source: String)
    }

    @Volatile
    private var quickLock: QuickLock? = null

    @JvmStatic
    fun installQuickLock(lock: QuickLock) {
        quickLock = lock
    }

    internal fun quickLock(): QuickLock? = quickLock

    /** Takes a login the system asked to save, named by its token in the provider runtime. */
    fun interface PasswordSaveReceiver {
        fun receive(context: Context, token: String)
    }

    @Volatile
    private var passwordSaveReceiver: PasswordSaveReceiver? = null

    /**
     * Names the host's own inbox for logins the system asked to save. The autofill service
     * hands each one there in-process, so the review never depends on an activity start the
     * system may refuse from the background. A host that installs none gets the save
     * activity, which hands the review to its entry point.
     */
    @JvmStatic
    fun installPasswordSaveReceiver(receiver: PasswordSaveReceiver) {
        passwordSaveReceiver = receiver
    }

    internal fun passwordSaveReceiver(): PasswordSaveReceiver? = passwordSaveReceiver

    @Volatile
    private var providerUnlockFactory: LaunchIntentFactory? = null

    /**
     * Names the host's screen that opens the vault for another app's request - a fill, a
     * Credential Manager sign-in or a passkey to create. It opens the vault, then answers
     * with [ProviderUnlock.result]. A host that installs none leaves a locked vault's
     * requests to fail with an explanation.
     */
    @JvmStatic
    fun installProviderUnlock(factory: LaunchIntentFactory) {
        providerUnlockFactory = factory
    }

    @JvmStatic
    fun providerUnlockIntent(context: Context): Intent? = providerUnlockFactory?.create(context.applicationContext)

    /** Test seam: a host is process-wide, so a test must be able to reset it. */
    @JvmStatic
    fun clearForTests() {
        launchIntentFactory = null
        providerUnlockFactory = null
        passwordSaveReceiver = null
        quickLock = null
    }
}

/**
 * Marks the activity a host treats as its main surface.
 *
 * Lifecycle tracking needs to know which activity that is without knowing its
 * class, so each host tags its own.
 */
interface HostMainActivity

/** True when [activity] is the host's main surface. */
fun isHostMainActivity(activity: Activity): Boolean = activity is HostMainActivity
