import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { VERSION_TIMEOUT } from '../constants.js';
import { findBinary, getBinaryVersion } from './discovery.js';

export type InstallMethod = 'homebrew' | 'npm' | 'standalone' | 'unknown';

export interface InstallDetection {
  method: InstallMethod;
  binaryPath: string | null;
  resolvedBinaryPath: string | null;
  installedVersion: string | null;
  brewVersion: string | null;
  npmVersion: string | null;
  npmPrefix: string | null;
  upgradeCommand: string | null;
}

export interface DetectInstallMethodInput {
  binaryPath: string | null;
  resolvedBinaryPath: string | null;
  brewVersion: string | null;
  npmVersion: string | null;
  npmPrefix: string | null;
  homeDir: string;
}

interface CaptureResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface RunResult {
  ok: boolean;
  exitCode: number;
  errorMessage?: string;
}

export interface UpgradeDeps {
  captureCommand?: (cmd: string, args: string[]) => CaptureResult;
  runCommand?: (cmd: string, args: string[]) => RunResult;
  findBinaryFn?: (command: string) => string | null;
  realpathFn?: (path: string) => string;
  homeDir?: string;
  fetchFn?: typeof fetch;
}

export interface UpgradeOutcome {
  ok: boolean;
  method: InstallMethod;
  message: string;
}

interface GithubReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

interface GithubLatestRelease {
  tag_name?: string;
  assets?: GithubReleaseAsset[];
}

export interface StandaloneUpgradeResult {
  version: string;
  tag: string;
  assetName: string;
  targetPath: string;
}

export function parseBrewVersion(output: string): string | null {
  const trimmed = output.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^counselors\s+([^\s]+)/m);
  return match?.[1] ?? null;
}

export function parseNpmLsVersion(output: string): string | null {
  if (!output.trim()) return null;
  try {
    const parsed = JSON.parse(output) as {
      dependencies?: Record<string, { version?: string }>;
    };
    const version = parsed.dependencies?.counselors?.version;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

export function getStandaloneAssetName(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | null {
  let os: string;
  if (platform === 'darwin') {
    os = 'darwin';
  } else if (platform === 'linux') {
    os = 'linux';
  } else {
    return null;
  }

  let normalizedArch: string;
  if (arch === 'x64') {
    normalizedArch = 'x64';
  } else if (arch === 'arm64') {
    normalizedArch = 'arm64';
  } else {
    return null;
  }

  return `counselors-${os}-${normalizedArch}`;
}

export function detectInstallMethod(
  input: DetectInstallMethodInput,
): InstallMethod {
  const binaryPath = normalizePath(input.binaryPath);
  const resolvedBinaryPath = normalizePath(input.resolvedBinaryPath);
  const npmPrefix = normalizePath(input.npmPrefix);
  const homeDir = normalizePath(input.homeDir) ?? input.homeDir;

  if (
    resolvedBinaryPath?.includes('/Cellar/counselors/') ||
    resolvedBinaryPath?.includes('/Homebrew/Cellar/counselors/')
  ) {
    return 'homebrew';
  }

  const npmCandidates = npmPrefix
    ? process.platform === 'win32'
      ? [normalizePath(join(npmPrefix, 'counselors.cmd'))]
      : [normalizePath(join(npmPrefix, 'bin', 'counselors'))]
    : [];
  if (
    binaryPath &&
    input.npmVersion &&
    npmCandidates.some((candidate) => candidate === binaryPath)
  ) {
    return 'npm';
  }

  if (resolvedBinaryPath?.includes('/node_modules/counselors/')) {
    return 'npm';
  }

  const localBinCandidates = [
    normalizePath(join(homeDir, '.local', 'bin', 'counselors')),
    normalizePath(join(homeDir, 'bin', 'counselors')),
  ].filter((p): p is string => Boolean(p));
  if (
    binaryPath &&
    localBinCandidates.some((candidate) => candidate === binaryPath)
  ) {
    return 'standalone';
  }

  if (input.brewVersion && !input.npmVersion) return 'homebrew';
  if (input.npmVersion && !input.brewVersion) return 'npm';
  if (binaryPath && !input.brewVersion && !input.npmVersion)
    return 'standalone';

  return 'unknown';
}

export function detectInstallation(deps: UpgradeDeps = {}): InstallDetection {
  const findBinaryFn = deps.findBinaryFn ?? findBinary;
  const captureCommand = deps.captureCommand ?? defaultCaptureCommand;
  const homeDir = deps.homeDir ?? homedir();
  const realpathFn = deps.realpathFn ?? realpathSync;

  const binaryPath = findBinaryFn('counselors');
  const resolvedBinaryPath = binaryPath
    ? safeRealPath(binaryPath, realpathFn)
    : null;

  const hasBrew = Boolean(findBinaryFn('brew'));
  const hasNpm = Boolean(findBinaryFn('npm'));

  const brewVersion = hasBrew
    ? parseBrewVersion(
        captureCommand('brew', ['list', '--versions', 'counselors']).stdout,
      )
    : null;

  const npmPrefix = hasNpm
    ? captureCommand('npm', ['prefix', '-g']).stdout.trim() || null
    : null;
  const npmVersion =
    hasNpm && npmPrefix ? readNpmGlobalVersion(npmPrefix) : null;

  const method = detectInstallMethod({
    binaryPath,
    resolvedBinaryPath,
    brewVersion,
    npmVersion,
    npmPrefix,
    homeDir,
  });

  let installedVersion: string | null = null;
  if (method === 'homebrew') {
    installedVersion = brewVersion;
  } else if (method === 'npm') {
    installedVersion = npmVersion;
  } else if (method === 'standalone' && binaryPath) {
    installedVersion = extractVersion(getBinaryVersion(binaryPath));
  }

  const upgradeCommand =
    method === 'homebrew'
      ? 'brew upgrade counselors'
      : method === 'npm'
        ? 'npm install -g counselors@latest'
        : method === 'standalone'
          ? 'counselors upgrade'
          : null;

  return {
    method,
    binaryPath,
    resolvedBinaryPath,
    installedVersion,
    brewVersion,
    npmVersion,
    npmPrefix,
    upgradeCommand,
  };
}

export async function performUpgrade(
  detection: InstallDetection,
  deps: UpgradeDeps = {},
): Promise<UpgradeOutcome> {
  const runCommand = deps.runCommand ?? defaultRunCommand;

  if (detection.method === 'homebrew') {
    return runManagerUpgrade(runCommand, 'homebrew', 'brew', [
      'upgrade',
      'counselors',
    ]);
  }

  if (detection.method === 'npm') {
    return runManagerUpgrade(runCommand, 'npm', 'npm', [
      'install',
      '-g',
      'counselors@latest',
    ]);
  }

  if (detection.method === 'standalone') {
    if (!detection.binaryPath) {
      return {
        ok: false,
        method: detection.method,
        message:
          'Standalone install detected, but counselors binary path was not found.',
      };
    }

    try {
      const result = await upgradeStandaloneBinary(detection.binaryPath, deps);
      return {
        ok: true,
        method: detection.method,
        message: `Upgraded standalone binary to ${result.version} (${result.assetName}).`,
      };
    } catch (e) {
      return {
        ok: false,
        method: detection.method,
        message:
          e instanceof Error
            ? e.message
            : 'Standalone upgrade failed for an unknown reason.',
      };
    }
  }

  return {
    ok: false,
    method: detection.method,
    message:
      'Could not detect a supported install method. Supported methods: Homebrew, npm global, standalone binary.',
  };
}

export async function upgradeStandaloneBinary(
  binaryPath: string,
  deps: UpgradeDeps = {},
): Promise<StandaloneUpgradeResult> {
  const fetchFn = deps.fetchFn ?? fetch;
  const assetName = getStandaloneAssetName();
  if (!assetName) {
    throw new Error(
      `Standalone upgrades are only supported on macOS and Linux x64/arm64. Current platform: ${process.platform}/${process.arch}.`,
    );
  }

  const latestUrl =
    'https://api.github.com/repos/aarondfrancis/counselors/releases/latest';
  const latestRes = await fetchFn(latestUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'counselors-cli',
    },
  });
  if (!latestRes.ok) {
    throw new Error(
      `Failed to fetch latest release metadata (${latestRes.status} ${latestRes.statusText}).`,
    );
  }

  const release = (await latestRes.json()) as GithubLatestRelease;
  const tag = release.tag_name;
  if (!tag || typeof tag !== 'string') {
    throw new Error('Latest release metadata did not include a valid tag.');
  }

  const asset =
    release.assets?.find(
      (a) =>
        a.name === assetName &&
        typeof a.browser_download_url === 'string' &&
        a.browser_download_url.length > 0,
    ) ?? null;
  const downloadUrl =
    asset?.browser_download_url ??
    `https://github.com/aarondfrancis/counselors/releases/download/${tag}/${assetName}`;

  const binaryRes = await fetchFn(downloadUrl, {
    headers: { 'User-Agent': 'counselors-cli' },
  });
  if (!binaryRes.ok) {
    throw new Error(
      `Failed to download ${assetName} (${binaryRes.status} ${binaryRes.statusText}).`,
    );
  }

  const bytes = Buffer.from(await binaryRes.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error('Downloaded binary was empty.');
  }

  const targetPath = resolveStandaloneTargetPath(binaryPath);
  const tempPath = `${targetPath}.tmp-${Date.now()}`;

  try {
    writeFileSync(tempPath, bytes, { mode: 0o755 });
    renameSync(tempPath, targetPath);
    chmodSync(targetPath, 0o755);
  } finally {
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  }

  return {
    version: stripLeadingV(tag),
    tag,
    assetName,
    targetPath,
  };
}

function runManagerUpgrade(
  runCommand: (cmd: string, args: string[]) => RunResult,
  method: InstallMethod,
  cmd: string,
  args: string[],
): UpgradeOutcome {
  const result = runCommand(cmd, args);
  if (result.ok) {
    return {
      ok: true,
      method,
      message: `Upgrade command completed: ${cmd} ${args.join(' ')}`,
    };
  }

  return {
    ok: false,
    method,
    message: `Upgrade command failed: ${cmd} ${args.join(' ')}${result.errorMessage ? ` (${result.errorMessage})` : ''}`,
  };
}

function resolveStandaloneTargetPath(binaryPath: string): string {
  try {
    const stat = lstatSync(binaryPath);
    if (stat.isSymbolicLink()) {
      return realpathSync(binaryPath);
    }
  } catch {
    // Fall through to original path
  }
  return binaryPath;
}

function extractVersion(value: string | null): string | null {
  if (!value) return null;
  const semverMatch = value.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/);
  if (semverMatch) return semverMatch[0];
  const firstToken = value.trim().split(/\s+/)[0];
  return firstToken || null;
}

function stripLeadingV(version: string): string {
  return version.startsWith('v') ? version.slice(1) : version;
}

function safeRealPath(
  path: string,
  realpathFn: (path: string) => string,
): string | null {
  try {
    return realpathFn(path);
  } catch {
    return path;
  }
}

function normalizePath(path: string | null): string | null {
  if (!path) return null;
  return resolve(path).replace(/\\/g, '/');
}

function defaultCaptureCommand(cmd: string, args: string[]): CaptureResult {
  try {
    const stdout = execFileSync(cmd, args, {
      timeout: VERSION_TIMEOUT,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    }).trim();
    return {
      ok: true,
      stdout,
      stderr: '',
      exitCode: 0,
    };
  } catch (error) {
    const stdout = toText((error as { stdout?: unknown }).stdout).trim();
    const stderr = toText((error as { stderr?: unknown }).stderr).trim();
    const exitCode =
      typeof (error as { status?: unknown }).status === 'number'
        ? ((error as { status?: number }).status ?? 1)
        : 1;
    return {
      ok: false,
      stdout,
      stderr,
      exitCode,
    };
  }
}

function defaultRunCommand(cmd: string, args: string[]): RunResult {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
  });
  if (result.error) {
    return {
      ok: false,
      exitCode: 1,
      errorMessage: result.error.message,
    };
  }
  const exitCode = result.status ?? 1;
  return {
    ok: exitCode === 0,
    exitCode,
  };
}

function readNpmGlobalVersion(npmPrefix: string): string | null {
  const packageJsonPaths =
    process.platform === 'win32'
      ? [join(npmPrefix, 'node_modules', 'counselors', 'package.json')]
      : [
          join(npmPrefix, 'lib', 'node_modules', 'counselors', 'package.json'),
          join(npmPrefix, 'node_modules', 'counselors', 'package.json'),
        ];

  for (const packageJsonPath of packageJsonPaths) {
    if (!existsSync(packageJsonPath)) continue;
    try {
      const raw = readFileSync(packageJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as { version?: string };
      if (typeof parsed.version === 'string') {
        return parsed.version;
      }
    } catch {
      // Keep checking other candidate paths.
    }
  }

  return null;
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf-8');
  return '';
}
