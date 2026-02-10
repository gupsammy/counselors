import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AMP_DEEP_SETTINGS_FILE,
  AMP_SETTINGS_FILE,
  CONFIG_DIR,
} from '../constants.js';

export function copyAmpSettings(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const assetsDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'assets',
  );
  const bundledSettings = resolve(assetsDir, 'amp-readonly-settings.json');
  if (existsSync(bundledSettings)) {
    copyFileSync(bundledSettings, AMP_SETTINGS_FILE);
  }
  const bundledDeepSettings = resolve(assetsDir, 'amp-deep-settings.json');
  if (existsSync(bundledDeepSettings)) {
    copyFileSync(bundledDeepSettings, AMP_DEEP_SETTINGS_FILE);
  }
}
