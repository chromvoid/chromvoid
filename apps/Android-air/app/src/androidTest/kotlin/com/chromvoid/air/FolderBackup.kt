package com.chromvoid.air

import com.chromvoid.air.ui.maintenance.BackupDestination
import com.chromvoid.air.ui.maintenance.RestoreArtifact
import com.chromvoid.air.ui.maintenance.RestoreSource
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException

/**
 * A backup folder in the app's own storage, for the device tests: the system
 * picker is the one part of the route a test cannot drive, so these stand in
 * for the folder it returns. What reaches Core is the same.
 */
internal class FolderBackupDestination(private val folder: File) : BackupDestination {
    override val label: String get() = folder.name

    override suspend fun writeArtifact(name: String, next: suspend () -> ByteArray) {
        folder.mkdirs()
        File(folder, name).outputStream().use { output ->
            while (true) {
                val chunk = next()
                if (chunk.isEmpty()) break
                output.write(chunk)
            }
        }
    }

    override suspend fun discard() {
        folder.deleteRecursively()
    }
}

internal class FolderRestoreSource(private val folder: File) : RestoreSource {
    private var streams: List<FileInputStream?> = emptyList()

    override val label: String get() = folder.name

    override suspend fun open(artifacts: List<RestoreArtifact>): Long {
        close()
        streams = artifacts.map { artifact ->
            val file = File(folder, artifact.name)
            when {
                file.isFile -> file.inputStream()
                artifact.required -> throw FileNotFoundException(artifact.name)
                else -> null
            }
        }
        return artifacts.sumOf { File(folder, it.name).takeIf(File::isFile)?.length() ?: 0L }
    }

    override suspend fun read(artifact: Int, maximum: Int): ByteArray? {
        val stream = streams[artifact] ?: return null
        val buffer = ByteArray(maximum)
        val count = stream.read(buffer).coerceAtLeast(0)
        return buffer.copyOf(count)
    }

    override suspend fun close() {
        streams.forEach { it?.close() }
        streams = emptyList()
    }
}
