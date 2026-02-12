import { mkdirSync, writeFileSync } from 'node:fs';
import ampDeepSettings from '../../assets/amp-deep-settings.json';
import ampReadonlySettings from '../../assets/amp-readonly-settings.json';
import {
  AMP_DEEP_SETTINGS_FILE,
  AMP_SETTINGS_FILE,
  CONFIG_DIR,
  CONFIG_FILE_MODE,
} from '../constants.js';

export function copyAmpSettings(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(
    AMP_SETTINGS_FILE,
    `${JSON.stringify(ampReadonlySettings, null, 2)}\n`,
    { mode: CONFIG_FILE_MODE },
  );
  writeFileSync(
    AMP_DEEP_SETTINGS_FILE,
    `${JSON.stringify(ampDeepSettings, null, 2)}\n`,
    { mode: CONFIG_FILE_MODE },
  );
}
