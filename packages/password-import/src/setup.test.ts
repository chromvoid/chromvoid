import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('Password Import Package Setup', () => {
  const pkgJsonPath = join(__dirname, '../package.json');
  const tsconfigPath = join(__dirname, '../tsconfig.json');

  it('package.json should exist', () => {
    expect(existsSync(pkgJsonPath)).toBe(true);
  });

  it('package.json should have correct name', () => {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    expect(pkgJson.name).toBe('@chromvoid/password-import');
  });

  it('package.json should have correct type', () => {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    expect(pkgJson.type).toBe('module');
  });

  it('package.json should have correct main entry', () => {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    expect(pkgJson.main).toBe('./src/index.ts');
  });

  it('tsconfig.json should exist', () => {
    expect(existsSync(tsconfigPath)).toBe(true);
  });

  it('src directory structure should exist', () => {
    expect(existsSync(join(__dirname, 'index.ts'))).toBe(true);
    expect(existsSync(join(__dirname, 'types.ts'))).toBe(true);
    expect(existsSync(join(__dirname, 'parsers'))).toBe(true);
    expect(existsSync(join(__dirname, 'ui'))).toBe(true);
  });
});
