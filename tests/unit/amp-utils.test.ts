import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockMkdirSync = vi.fn();
const mockCopyFileSync = vi.fn();
const mockExistsSync = vi.fn(() => true);

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
    copyFileSync: (...args: unknown[]) => mockCopyFileSync(...args),
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
  };
});

import { copyAmpSettings } from '../../src/core/amp-utils.js';

describe('copyAmpSettings', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockCopyFileSync.mockReset();
    mockExistsSync.mockReset();
  });

  it('copies both readonly and deep settings files', () => {
    mockExistsSync.mockReturnValue(true);
    copyAmpSettings();

    // Should copy two files: readonly + deep
    expect(mockCopyFileSync).toHaveBeenCalledTimes(2);

    const [firstSrc] = mockCopyFileSync.mock.calls[0];
    const [secondSrc] = mockCopyFileSync.mock.calls[1];
    expect(firstSrc).toContain('amp-readonly-settings.json');
    expect(secondSrc).toContain('amp-deep-settings.json');
  });

  it('skips copy when bundled file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    copyAmpSettings();

    expect(mockCopyFileSync).not.toHaveBeenCalled();
  });
});
