import { describe, expect, it } from 'vitest';
import {
  detectInstallMethod,
  getStandaloneAssetName,
  parseBrewVersion,
  parseNpmLsVersion,
} from '../../src/core/upgrade.js';

describe('parseBrewVersion', () => {
  it('parses version from brew list output', () => {
    expect(parseBrewVersion('counselors 0.3.4')).toBe('0.3.4');
  });

  it('returns null for empty output', () => {
    expect(parseBrewVersion('')).toBeNull();
  });
});

describe('parseNpmLsVersion', () => {
  it('parses version from npm ls json', () => {
    const output = JSON.stringify({
      dependencies: {
        counselors: { version: '0.3.4' },
      },
    });
    expect(parseNpmLsVersion(output)).toBe('0.3.4');
  });

  it('returns null for malformed json', () => {
    expect(parseNpmLsVersion('not-json')).toBeNull();
  });
});

describe('detectInstallMethod', () => {
  it('prefers homebrew when binary resolves into Cellar', () => {
    const method = detectInstallMethod({
      binaryPath: '/usr/local/bin/counselors',
      resolvedBinaryPath:
        '/usr/local/Cellar/counselors/0.3.4/libexec/bin/counselors',
      brewVersion: '0.3.4',
      npmVersion: '0.3.4',
      npmPrefix: '/usr/local',
      homeDir: '/Users/tester',
    });
    expect(method).toBe('homebrew');
  });

  it('detects npm global install from npm prefix bin path', () => {
    const npmPrefix =
      process.platform === 'win32'
        ? 'C:\\Users\\tester\\AppData\\Roaming\\npm'
        : '/Users/tester/.nvm/versions/node/v22.0.0';
    const binaryPath =
      process.platform === 'win32'
        ? 'C:\\Users\\tester\\AppData\\Roaming\\npm\\counselors.cmd'
        : '/Users/tester/.nvm/versions/node/v22.0.0/bin/counselors';

    const method = detectInstallMethod({
      binaryPath,
      resolvedBinaryPath: binaryPath,
      brewVersion: null,
      npmVersion: '0.3.4',
      npmPrefix,
      homeDir: '/Users/tester',
    });
    expect(method).toBe('npm');
  });

  it('detects standalone install in ~/.local/bin', () => {
    const method = detectInstallMethod({
      binaryPath: '/Users/tester/.local/bin/counselors',
      resolvedBinaryPath: '/Users/tester/.local/bin/counselors',
      brewVersion: null,
      npmVersion: null,
      npmPrefix: null,
      homeDir: '/Users/tester',
    });
    expect(method).toBe('standalone');
  });
});

describe('getStandaloneAssetName', () => {
  it('maps supported targets', () => {
    expect(getStandaloneAssetName('darwin', 'arm64')).toBe(
      'counselors-darwin-arm64',
    );
    expect(getStandaloneAssetName('linux', 'x64')).toBe('counselors-linux-x64');
  });

  it('returns null for unsupported targets', () => {
    expect(getStandaloneAssetName('win32', 'x64')).toBeNull();
    expect(getStandaloneAssetName('linux', 'arm')).toBeNull();
  });
});
