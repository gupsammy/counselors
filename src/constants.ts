import { homedir } from 'node:os';
import { join } from 'node:path';

// ── XDG config ──

const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
export const CONFIG_DIR = join(xdgConfig, 'counselors');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export const AMP_SETTINGS_FILE = join(CONFIG_DIR, 'amp-readonly-settings.json');
export const AMP_DEEP_SETTINGS_FILE = join(
  CONFIG_DIR,
  'amp-deep-settings.json',
);

// ── Default output ──

export const DEFAULT_OUTPUT_DIR = './agents/counselors';

// ── Timeouts (seconds) ──

export const DEFAULT_TIMEOUT = 540;
export const KILL_GRACE_PERIOD = 15_000; // ms
export const TEST_TIMEOUT = 30_000; // ms
export const DISCOVERY_TIMEOUT = 5_000; // ms
export const VERSION_TIMEOUT = 10_000; // ms

// ── Concurrency ──

export const DEFAULT_MAX_PARALLEL = 4;

// ── Context ──

export const DEFAULT_MAX_CONTEXT_KB = 50;

// ── Extended binary search paths ──

export function getExtendedSearchPaths(): string[] {
  const home = homedir();
  const paths: string[] = [
    join(home, '.local', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    join(home, '.npm-global', 'bin'),
    join(home, '.volta', 'bin'),
    join(home, '.bun', 'bin'),
  ];

  // NVM
  const nvmBin = process.env.NVM_BIN;
  if (nvmBin) paths.push(nvmBin);

  // FNM
  const fnmMultishell = process.env.FNM_MULTISHELL_PATH;
  if (fnmMultishell) paths.push(join(fnmMultishell, 'bin'));

  return paths;
}

// ── Model validation ──

export const MODEL_PATTERN = /^[a-zA-Z0-9._:\-/]+$/;

// ── Slug generation ──

export const MAX_SLUG_LENGTH = 40;

// ── File permissions ──

export const CONFIG_FILE_MODE = 0o600;

// ── Safe ID patterns ──

/** Sanitize a tool ID for safe use in filenames. */
export function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Regex for validating tool names (letters, numbers, dots, hyphens, underscores). */
export const SAFE_ID_RE = /^[a-zA-Z0-9._-]+$/;

/** Strip control characters from a path to prevent prompt injection.
 *  Preserves tab (0x09) but removes 0x00-0x08 and 0x0A-0x1F. */
export function sanitizePath(p: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — we need to match and strip control chars
  return p.replace(/[\x00-\x08\x0A-\x1F]/g, '');
}

// ── Version ──

declare const __VERSION__: string;
export const VERSION =
  typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0-dev';
