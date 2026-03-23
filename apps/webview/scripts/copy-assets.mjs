#!/usr/bin/env node

import { cp } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

async function copyAssets() {
  try {
    console.log('Копирование статических файлов...')
    
    const distDir = join(root, 'dist')
    
    // Копируем assets
    if (existsSync(join(root, 'src/assets'))) {
      await cp(
        join(root, 'src/assets'),
        join(distDir, 'assets'),
        { recursive: true, force: true }
      )
      console.log('✓ Assets скопированы')
    }
    
    // Копируем oeminit
    if (existsSync(join(root, 'src/oeminit'))) {
      await cp(
        join(root, 'src/oeminit'),
        join(distDir, 'oeminit'),
        { recursive: true, force: true }
      )
      console.log('✓ OEM Init скопирован')
    }
    
    console.log('Все статические файлы скопированы успешно!')
    
  } catch (error) {
    console.error('Ошибка при копировании файлов:', error)
    process.exit(1)
  }
}

copyAssets()
