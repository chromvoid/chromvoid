import fs from 'node:fs'
import path from 'node:path'

export function assertConfiguredExternalBuildStorageAvailable(configuredPaths, platform = process.platform) {
  if (platform !== 'darwin') {
    return
  }

  for (const configuredPath of configuredPaths) {
    let stat
    try {
      stat = fs.lstatSync(configuredPath)
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue
      }
      throw error
    }

    if (!stat.isSymbolicLink()) {
      continue
    }

    const linkTarget = fs.readlinkSync(configuredPath)
    const targetPath = path.resolve(path.dirname(configuredPath), linkTarget)
    const volumeRoot = resolveMacosVolumeRoot(targetPath)
    if (!volumeRoot) {
      continue
    }

    try {
      fs.statSync(targetPath)
    } catch (error) {
      throw new Error(
        `External build volume "${path.basename(volumeRoot)}" is unavailable. ` +
          `${configuredPath} points to ${targetPath}. ` +
          'Reconnect the drive or cable, check the symlink target, and rerun the command.',
        {cause: error},
      )
    }
  }
}

export function resolveMacosVolumeRoot(targetPath) {
  const parts = path.resolve(targetPath).split(path.sep)
  return parts[1] === 'Volumes' && parts[2] ? path.join(path.sep, parts[1], parts[2]) : null
}
