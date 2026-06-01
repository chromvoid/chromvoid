#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const srcTauriDir = path.join(appRoot, 'src-tauri');
const iconsDir = path.join(srcTauriDir, 'icons');
const androidOwnedResDir = path.join(srcTauriDir, 'android-owned', 'app', 'src', 'main', 'res');
const androidResDir = path.join(srcTauriDir, 'gen', 'android', 'app', 'src', 'main', 'res');
const iosIconSetDir = path.join(
  srcTauriDir,
  'gen',
  'apple',
  'Assets.xcassets',
  'AppIcon.appiconset',
);

const sourceIcon = path.resolve(
  appRoot,
  process.env.ICON_SOURCE ?? path.join('src-tauri', 'icons', 'icon.source.png'),
);

const scales = {
  desktop: parseScale('ICON_SCALE_DESKTOP', 0.93),
  ios: parseScale('ICON_SCALE_IOS', 0.92),
  android: parseScale('ICON_SCALE_ANDROID', 0.67),
};
const androidLauncherBackground = '#030507';
const androidSplashLogoPath = path.join(
  androidOwnedResDir,
  'drawable-nodpi',
  'splash_logo.png',
);

function parseScale(envName, fallback) {
  const rawValue = process.env[envName];
  if (rawValue === undefined) return fallback;

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new Error(`Invalid ${envName}=${rawValue}. Expected a number in range (0, 1].`);
  }
  return parsed;
}

function run(command, args, cwd = appRoot) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    const stdout = result.stdout?.trim();
    const stderr = result.stderr?.trim();
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        stdout ? `stdout:\n${stdout}` : '',
        stderr ? `stderr:\n${stderr}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
  }
  return result.stdout;
}

function readSquareSize(imagePath) {
  const output = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', imagePath]);
  const widthMatch = output.match(/pixelWidth:\s*(\d+)/);
  const heightMatch = output.match(/pixelHeight:\s*(\d+)/);

  if (!widthMatch || !heightMatch) {
    throw new Error(`Unable to read image dimensions from ${imagePath}.`);
  }

  const width = Number(widthMatch[1]);
  const height = Number(heightMatch[1]);
  if (width !== height) {
    throw new Error(`Source icon must be square: ${imagePath} is ${width}x${height}.`);
  }
  return width;
}

async function buildScaledIcon(sourcePath, scale, label, workspaceDir, options = {}) {
  const baseSize = readSquareSize(sourcePath);
  const scaledSize = Math.max(1, Math.min(baseSize, Math.round(baseSize * scale)));
  const scaledPath = path.join(workspaceDir, `${label}.scaled.png`);
  const paddedPath = path.join(workspaceDir, `${label}.png`);

  run('sips', ['-z', `${scaledSize}`, `${scaledSize}`, sourcePath, '--out', scaledPath]);
  const padArgs = ['-p', `${baseSize}`, `${baseSize}`];
  if (options.padColor) {
    padArgs.push('--padColor', options.padColor);
  }
  padArgs.push(scaledPath, '--out', paddedPath);
  run('sips', padArgs);
  await fs.rm(scaledPath, { force: true });

  return paddedPath;
}

async function copyRootFiles(fromDir, toDir) {
  const entries = await fs.readdir(fromDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

  await Promise.all(
    files.map((fileName) => {
      return fs.copyFile(path.join(fromDir, fileName), path.join(toDir, fileName));
    }),
  );
}

async function copyIosIcons(fromDir, toDir) {
  const entries = await fs.readdir(fromDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => entry.name);

  await Promise.all(
    files.map((fileName) => {
      return fs.copyFile(path.join(fromDir, fileName), path.join(toDir, fileName));
    }),
  );
}

async function copyAndroidTree(fromDir, toDir) {
  await fs.rm(toDir, { recursive: true, force: true });
  await fs.cp(fromDir, toDir, { recursive: true });
}

async function writeAndroidLauncherBackground(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="ic_launcher_background">${androidLauncherBackground}</color>\n</resources>\n`,
  );
}

async function writeAndroidSplashLogo(sourcePath) {
  // Keep Android launch morph stable: the splash bitmap must share launcher foreground padding.
  await fs.mkdir(path.dirname(androidSplashLogoPath), { recursive: true });
  await fs.copyFile(sourcePath, androidSplashLogoPath);
}

async function syncAndroidLauncherResources(fromDir, toDir) {
  const entries = await fs.readdir(fromDir, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const fromPath = path.join(fromDir, entry.name);
      const toPath = path.join(toDir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'values') return;
        await fs.mkdir(toPath, { recursive: true });
        await syncAndroidLauncherResources(fromPath, toPath);
        return;
      }

      await fs.mkdir(path.dirname(toPath), { recursive: true });
      await fs.copyFile(fromPath, toPath);
    }),
  );
}

async function main() {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'chromvoid-icons-'));
  const tempDesktopOut = path.join(tempRoot, 'out-desktop');
  const tempIosOut = path.join(tempRoot, 'out-ios');
  const tempAndroidOut = path.join(tempRoot, 'out-android');

  await fs.mkdir(tempDesktopOut, { recursive: true });
  await fs.mkdir(tempIosOut, { recursive: true });
  await fs.mkdir(tempAndroidOut, { recursive: true });

  try {
    await fs.access(sourceIcon);

    const desktopIcon = await buildScaledIcon(sourceIcon, scales.desktop, 'desktop', tempRoot);
    const iosIcon = await buildScaledIcon(sourceIcon, scales.ios, 'ios', tempRoot, {
      padColor: '000000',
    });
    const androidIcon = await buildScaledIcon(sourceIcon, scales.android, 'android', tempRoot);

    run('npm', ['run', 'tauri', '--', 'icon', desktopIcon, '-o', tempDesktopOut], appRoot);
    run('npm', ['run', 'tauri', '--', 'icon', iosIcon, '-o', tempIosOut], appRoot);
    run('npm', ['run', 'tauri', '--', 'icon', androidIcon, '-o', tempAndroidOut], appRoot);

    await copyRootFiles(tempDesktopOut, iconsDir);
    await copyIosIcons(path.join(tempIosOut, 'ios'), iosIconSetDir);
    await copyAndroidTree(path.join(tempAndroidOut, 'android'), path.join(iconsDir, 'android'));
    await writeAndroidLauncherBackground(
      path.join(iconsDir, 'android', 'values', 'ic_launcher_background.xml'),
    );
    await writeAndroidSplashLogo(androidIcon);
    await fs.rm(path.join(androidResDir, 'values'), { recursive: true, force: true });
    await syncAndroidLauncherResources(path.join(tempAndroidOut, 'android'), androidResDir);

    const summary = [
      `source=${sourceIcon}`,
      `desktop=${scales.desktop}`,
      `ios=${scales.ios}`,
      `android=${scales.android}`,
      `androidSplash=${path.relative(appRoot, androidSplashLogoPath)}`,
    ].join(', ');

    console.log(`Icons regenerated successfully: ${summary}`);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
