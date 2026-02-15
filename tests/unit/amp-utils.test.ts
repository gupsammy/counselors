import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockMkdirSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  };
});

import { copyAmpSettings } from '../../src/core/amp-utils.js';

describe('copyAmpSettings', () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
  });

  it('writes both readonly and deep settings files', () => {
    copyAmpSettings();

    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);

    const [firstDest, firstContent] = mockWriteFileSync.mock.calls[0];
    const [secondDest, secondContent] = mockWriteFileSync.mock.calls[1];
    expect(firstDest).toContain('amp-readonly-settings.json');
    expect(secondDest).toContain('amp-deep-settings.json');

    // Verify content is valid JSON
    expect(() => JSON.parse(firstContent)).not.toThrow();
    expect(() => JSON.parse(secondContent)).not.toThrow();
  });
});
