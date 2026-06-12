import java.io.File
import java.security.MessageDigest
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import javax.inject.Inject
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.file.FileCollection
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputFiles
import org.gradle.api.tasks.OutputFile
import org.gradle.api.tasks.PathSensitive
import org.gradle.api.tasks.PathSensitivity
import org.gradle.api.tasks.TaskAction
import org.gradle.process.ExecOperations

const val LICENSE_PUBLIC_KEY_ENV = "CHROMVOID_LICENSE_PUBLIC_KEY_ED25519_2026_01"
const val LICENSE_PUBLIC_KEY_FILE = ".license-public-key"
const val SKIP_FRESH_TAURI_PREBUILD_PROPERTY = "chromvoidSkipFreshTauriPrebuild"
const val PRODUCTION_WEBVIEW_DEV_PROPERTY = "chromvoidProductionWebviewDev"

abstract class BuildTask @Inject constructor(
    private val execOperations: ExecOperations,
) : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var projectDirPath: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null
    @get:Input
    val licensePublicKey: String
        get() = readLicensePublicKey()
    @get:Input
    val productionWebviewDev: Boolean
        get() = shouldUseProductionWebviewDev()
    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    val rustInputFiles: FileCollection
        get() {
            val root = resolveProjectRoot()
            val workspaceRoot = File(root, "../../..").canonicalFile
            return project.files(
                project.fileTree(root).matching {
                    include("Cargo.toml")
                    include("Cargo.lock")
                    include("build.rs")
                    include("src/**/*.rs")
                    include("capabilities/**")
                    include("permissions/**")
                    include("tauri*.conf.json")
                    exclude("target/**")
                    exclude("gen/**")
                },
                project.fileTree(File(workspaceRoot, "apps/webview/dist")).matching {
                    include("**/*")
                    exclude(".chromvoid-build-cache.json")
                },
                project.fileTree(File(workspaceRoot, "crates/core")).matching {
                    include("Cargo.toml")
                    include("build.rs")
                    include("src/**/*.rs")
                },
                project.fileTree(File(workspaceRoot, "crates/protocol")).matching {
                    include("Cargo.toml")
                    include("src/**/*.rs")
                },
            )
        }
    @get:OutputFile
    val outputLibrary: File
        get() {
            val release = release ?: throw GradleException("release cannot be null")
            val target = target ?: throw GradleException("target cannot be null")
            val spec = targetSpec(target)
            val profile = if (release) "release" else "debug"
            return File(resolveProjectRoot(), "target/${spec.rustTarget}/$profile/libchromvoid_lib.so")
        }

    @TaskAction
    fun assemble() {
        if (release == true) {
            requireLicensePublicKeyForRelease()
        }

        if (shouldUseProductionWebviewDev()) {
            fallbackCargoBuild()
            return
        }

        if (shouldSkipFreshTauriPrebuild() && isOutputFreshFromTauriPrebuild()) {
            logger.lifecycle("Skipping $this because ${outputLibrary.path} is already newer than Android Rust inputs")
            return
        }

        val executable = """bun""";
        try {
            runTauriCli(executable)
        } catch (e: Exception) {
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                // Try different Windows-specific extensions
                val fallbacks = listOf(
                    "$executable.exe",
                    "$executable.cmd",
                    "$executable.bat",
                )
                
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException: Exception) {
                        logger.info("Tauri CLI fallback executable $fallback failed", fallbackException)
                    }
                }
                try {
                    fallbackCargoBuild()
                    return
                } catch (fallbackException: Exception) {
                    throw GradleException(
                        "Failed to build Android Rust library via tauri CLI and cargo fallback",
                        fallbackException,
                    )
                }
            }
            try {
                fallbackCargoBuild()
            } catch (fallbackException: Exception) {
                throw GradleException(
                    "Failed to build Android Rust library via tauri CLI and cargo fallback",
                    fallbackException,
                )
            }
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("run", "--", "tauri", "android", "android-studio-script");
        val projectDir = projectDir()
        val androidHome = resolveAndroidHome()
        val ndkHome = resolveNdkHome(androidHome)
        val spec = targetSpec(target)
        val toolchain = resolveToolchain(ndkHome, spec)
        logLicensePublicKeySource()

        execOperations.exec {
            workingDir(File(projectDir, rootDirRel))
            executable(executable)
            environment("ANDROID_HOME", androidHome.path)
            environment("ANDROID_SDK_ROOT", androidHome.path)
            environment("NDK_HOME", ndkHome.path)
            environment("CARGO_TARGET_${spec.envTarget}_LINKER", toolchain.linker.path)
            environment("CARGO_TARGET_${spec.envTarget}_AR", toolchain.ar.path)
            environment("CC_${spec.ccEnvTarget}", toolchain.linker.path)
            environment("AR_${spec.ccEnvTarget}", toolchain.ar.path)
            environment(LICENSE_PUBLIC_KEY_ENV, licensePublicKey)
            args(args)
            if (logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }

    override fun toString(): String {
        return "BuildTask(target=$target, release=$release)"
    }

    private fun projectDir(): File {
        return File(projectDirPath ?: throw GradleException("projectDirPath cannot be null"))
    }

    private fun readLicensePublicKey(): String {
        val fileValue = File(projectDir().parentFile, LICENSE_PUBLIC_KEY_FILE)
            .takeIf { it.isFile }
            ?.readText()
            ?.trim()
            .orEmpty()
        if (fileValue.isNotEmpty()) {
            return fileValue
        }
        return System.getenv(LICENSE_PUBLIC_KEY_ENV)?.trim().orEmpty()
    }

    private fun licensePublicKeyFile(): File {
        return File(projectDir().parentFile, LICENSE_PUBLIC_KEY_FILE)
    }

    private fun requireLicensePublicKeyForRelease() {
        val value = licensePublicKey
        if (value.isEmpty()) {
            throw GradleException(
                "Missing $LICENSE_PUBLIC_KEY_ENV for Android release Rust build"
            )
        }

        val bytes = try {
            decodeBase64OrBase64Url(value)
        } catch (error: IllegalArgumentException) {
            throw GradleException("$LICENSE_PUBLIC_KEY_ENV must be base64/base64url encoded", error)
        }

        if (bytes.size != 32) {
            throw GradleException(
                "$LICENSE_PUBLIC_KEY_ENV must decode to a 32-byte Ed25519 public key, got ${bytes.size} bytes"
            )
        }
    }

    private fun decodeBase64OrBase64Url(value: String): ByteArray {
        val normalized = value.replace('-', '+').replace('_', '/')
        val padding = (4 - (normalized.length % 4)) % 4
        return java.util.Base64.getDecoder().decode(normalized.padEnd(normalized.length + padding, '='))
    }

    private fun nativeLibraryContainsLicensePublicKey(file: File): Boolean {
        val key = licensePublicKey.toByteArray(Charsets.UTF_8)
        if (key.isEmpty() || !file.isFile) {
            return false
        }
        return byteArrayContains(file.readBytes(), key)
    }

    private fun byteArrayContains(haystack: ByteArray, needle: ByteArray): Boolean {
        if (needle.isEmpty() || haystack.size < needle.size) {
            return false
        }
        outer@ for (start in 0..(haystack.size - needle.size)) {
            for (index in needle.indices) {
                if (haystack[start + index] != needle[index]) {
                    continue@outer
                }
            }
            return true
        }
        return false
    }

    private fun shouldSkipFreshTauriPrebuild(): Boolean {
        return project.findProperty(SKIP_FRESH_TAURI_PREBUILD_PROPERTY)?.toString() == "true"
    }

    private fun shouldUseProductionWebviewDev(): Boolean {
        return release != true && project.findProperty(PRODUCTION_WEBVIEW_DEV_PROPERTY)?.toString() == "true"
    }

    private fun isOutputFreshFromTauriPrebuild(): Boolean {
        val output = outputLibrary
        if (!output.isFile) {
            return false
        }

        val target = target ?: throw GradleException("target cannot be null")
        val spec = targetSpec(target)
        val jniLib = File(projectDir(), "src/main/jniLibs/${spec.abi}/${output.name}")
        if (!jniLib.exists()) {
            return false
        }

        val newestInputModified = rustInputFiles.files
            .asSequence()
            .filter { it.isFile }
            .map { it.lastModified() }
            .maxOrNull() ?: 0L
        val licenseModified = licensePublicKeyFile()
            .takeIf { it.isFile }
            ?.lastModified() ?: 0L
        val newestRelevantInputModified = maxOf(newestInputModified, licenseModified)

        if (licensePublicKey.isNotEmpty() &&
            (!nativeLibraryContainsLicensePublicKey(output) || !nativeLibraryContainsLicensePublicKey(jniLib))
        ) {
            return false
        }

        return output.lastModified() >= newestRelevantInputModified &&
            jniLib.lastModified() >= newestRelevantInputModified
    }

    private fun logLicensePublicKeySource() {
        val value = licensePublicKey
        if (value.isEmpty()) {
            logger.lifecycle("License public key not configured for Android Rust build")
            return
        }

        val source = if (licensePublicKeyFile().isFile) {
            licensePublicKeyFile().path
        } else {
            LICENSE_PUBLIC_KEY_ENV
        }
        logger.lifecycle(
            "Using license public key from $source (decoded_sha256=${decodedSha256Prefix(value)})"
        )
    }

    private fun decodedSha256Prefix(value: String): String {
        return try {
            val bytes = java.util.Base64.getUrlDecoder().decode(value)
            MessageDigest.getInstance("SHA-256")
                .digest(bytes)
                .joinToString("") { "%02x".format(it) }
                .take(16)
        } catch (_: IllegalArgumentException) {
            "invalid-base64url"
        }
    }

    private fun resolveProjectRoot(): File {
        val relative = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        return File(projectDir(), relative)
    }

    private fun resolveAndroidHome(): File {
        val configured =
            sequenceOf(
                System.getenv("ANDROID_HOME"),
                System.getenv("ANDROID_SDK_ROOT"),
            )
                .firstOrNull { !it.isNullOrBlank() }
                ?.let(::File)
        if (configured != null && configured.isDirectory) {
            return configured
        }

        val macOsDefault = File(System.getProperty("user.home"), "Library/Android/Sdk")
        if (macOsDefault.isDirectory) {
            return macOsDefault
        }

        throw GradleException("ANDROID_HOME or ANDROID_SDK_ROOT must be set")
    }

    private fun resolveNdkHome(androidHome: File = resolveAndroidHome()): File {
        val configured =
            sequenceOf(
                System.getenv("NDK_HOME"),
                System.getenv("ANDROID_NDK_HOME"),
                System.getenv("ANDROID_NDK_ROOT"),
            )
                .firstOrNull { !it.isNullOrBlank() }
                ?.let(::File)
        if (configured != null && configured.isDirectory) {
            return configured
        }

        val ndkRoot = File(androidHome, "ndk")
        val candidates =
            ndkRoot.listFiles()
                ?.filter { it.isDirectory }
                ?.sortedByDescending { it.name }
                .orEmpty()
        return candidates.firstOrNull()
            ?: throw GradleException("Android NDK not found under ${ndkRoot.path}")
    }

    private fun fallbackCargoBuild() {
        val root = resolveProjectRoot()
        val ndkHome = resolveNdkHome()
        val release = release ?: throw GradleException("release cannot be null")
        val spec = targetSpec(target ?: throw GradleException("target cannot be null"))
        val toolchain = resolveToolchain(ndkHome, spec)

        val cargoFeatures = mutableListOf("android")
        if (release || shouldUseProductionWebviewDev()) {
            cargoFeatures += "tauri/custom-protocol"
        }
        val cargoFeaturesArg = cargoFeatures.joinToString(",")

        val cargoArgs = mutableListOf(
            "build",
            "--manifest-path",
            "Cargo.toml",
            "--target",
            spec.rustTarget,
            "--no-default-features",
            "--features",
            cargoFeaturesArg,
        )
        if (release) {
            cargoArgs += "--release"
        }

        logger.lifecycle(
            "Building Android Rust library for $spec via direct cargo build with features $cargoFeaturesArg"
        )

        execOperations.exec {
            workingDir(root)
            executable("cargo")
            args(cargoArgs)
            environment("ANDROID_HOME", System.getenv("ANDROID_HOME") ?: System.getenv("ANDROID_SDK_ROOT") ?: "")
            environment("ANDROID_SDK_ROOT", System.getenv("ANDROID_SDK_ROOT") ?: System.getenv("ANDROID_HOME") ?: "")
            environment("NDK_HOME", ndkHome.path)
            environment("CARGO_TARGET_${spec.envTarget}_LINKER", toolchain.linker.path)
            environment("CARGO_TARGET_${spec.envTarget}_AR", toolchain.ar.path)
            environment("CC_${spec.ccEnvTarget}", toolchain.linker.path)
            environment("AR_${spec.ccEnvTarget}", toolchain.ar.path)
            environment(LICENSE_PUBLIC_KEY_ENV, licensePublicKey)
        }.assertNormalExitValue()

        val profile = if (release) "release" else "debug"
        val sourceLib = File(root, "target/${spec.rustTarget}/$profile/libchromvoid_lib.so")
        if (!sourceLib.isFile) {
            throw GradleException("Expected Rust library not found at ${sourceLib.path}")
        }

        val destinationDir = File(projectDir(), "src/main/jniLibs/${spec.abi}")
        destinationDir.mkdirs()
        val destinationLib = File(destinationDir, sourceLib.name)
        Files.copy(
            sourceLib.toPath(),
            destinationLib.toPath(),
            StandardCopyOption.REPLACE_EXISTING,
        )
    }

    data class TargetSpec(
        val rustTarget: String,
        val abi: String,
        val linkerName: String,
    ) {
        val envTarget: String = rustTarget.replace('-', '_').uppercase()
        val ccEnvTarget: String = rustTarget.replace('-', '_')

        override fun toString(): String = rustTarget
    }

    data class AndroidToolchain(
        val linker: File,
        val ar: File,
    )

    private fun resolveToolchain(ndkHome: File, spec: TargetSpec): AndroidToolchain {
        val hostTag = when {
            Os.isFamily(Os.FAMILY_MAC) -> "darwin-x86_64"
            Os.isFamily(Os.FAMILY_UNIX) -> "linux-x86_64"
            Os.isFamily(Os.FAMILY_WINDOWS) -> "windows-x86_64"
            else -> throw GradleException("Unsupported NDK host OS: ${System.getProperty("os.name")}")
        }
        val toolchainBin = File(ndkHome, "toolchains/llvm/prebuilt/$hostTag/bin")
        val linker = File(toolchainBin, spec.linkerName)
        val ar = File(toolchainBin, "llvm-ar")
        if (!linker.isFile) {
            throw GradleException("Android linker not found at ${linker.path}")
        }
        if (!ar.isFile) {
            throw GradleException("Android llvm-ar not found at ${ar.path}")
        }
        return AndroidToolchain(linker, ar)
    }

    private fun targetSpec(target: String): TargetSpec {
        return when (target) {
            "aarch64" -> TargetSpec("aarch64-linux-android", "arm64-v8a", "aarch64-linux-android28-clang")
            "armv7" -> TargetSpec("armv7-linux-androideabi", "armeabi-v7a", "armv7a-linux-androideabi28-clang")
            "i686" -> TargetSpec("i686-linux-android", "x86", "i686-linux-android28-clang")
            "x86_64" -> TargetSpec("x86_64-linux-android", "x86_64", "x86_64-linux-android28-clang")
            else -> throw GradleException("Unsupported Android Rust target: $target")
        }
    }
}
