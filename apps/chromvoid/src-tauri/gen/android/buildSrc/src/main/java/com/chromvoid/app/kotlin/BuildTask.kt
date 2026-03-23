import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val executable = """npm""";
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
                        project.logger.info("Tauri CLI fallback executable $fallback failed", fallbackException)
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

        project.exec {
            workingDir(File(project.projectDir, rootDirRel))
            executable(executable)
            args(args)
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
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

    private fun resolveProjectRoot(): File {
        val relative = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        return File(project.projectDir, relative)
    }

    private fun resolveNdkHome(): File {
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

        val androidHome =
            sequenceOf(
                System.getenv("ANDROID_HOME"),
                System.getenv("ANDROID_SDK_ROOT"),
            )
                .firstOrNull { !it.isNullOrBlank() }
                ?.let(::File)
                ?: throw GradleException("ANDROID_HOME or ANDROID_SDK_ROOT must be set")

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
        val toolchainBin = File(ndkHome, "toolchains/llvm/prebuilt/darwin-x86_64/bin")
        val linker = File(toolchainBin, spec.linkerName)
        val ar = File(toolchainBin, "llvm-ar")
        if (!linker.isFile) {
            throw GradleException("Android linker not found at ${linker.path}")
        }
        if (!ar.isFile) {
            throw GradleException("Android llvm-ar not found at ${ar.path}")
        }

        val cargoArgs = mutableListOf(
            "build",
            "--manifest-path",
            "Cargo.toml",
            "--target",
            spec.rustTarget,
            "--no-default-features",
            "--features",
            "android",
        )
        if (release) {
            cargoArgs += "--release"
        }

        project.logger.lifecycle(
            "Tauri android-studio-script unavailable for $spec; falling back to direct cargo build"
        )

        project.exec {
            workingDir(root)
            executable("cargo")
            args(cargoArgs)
            environment("ANDROID_HOME", System.getenv("ANDROID_HOME") ?: System.getenv("ANDROID_SDK_ROOT") ?: "")
            environment("ANDROID_SDK_ROOT", System.getenv("ANDROID_SDK_ROOT") ?: System.getenv("ANDROID_HOME") ?: "")
            environment("NDK_HOME", ndkHome.path)
            environment("CARGO_TARGET_${spec.envTarget}_LINKER", linker.path)
            environment("CARGO_TARGET_${spec.envTarget}_AR", ar.path)
            environment("CC_${spec.ccEnvTarget}", linker.path)
            environment("AR_${spec.ccEnvTarget}", ar.path)
        }.assertNormalExitValue()

        val profile = if (release) "release" else "debug"
        val sourceLib = File(root, "target/${spec.rustTarget}/$profile/libchromvoid_lib.so")
        if (!sourceLib.isFile) {
            throw GradleException("Expected Rust library not found at ${sourceLib.path}")
        }

        val destinationDir = File(project.projectDir, "src/main/jniLibs/${spec.abi}")
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
