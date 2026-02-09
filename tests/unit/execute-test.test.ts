import { describe, expect, it, vi } from 'vitest';
import type { ToolAdapter, ToolConfig } from '../../src/types.js';

// Mock the execute function so executeTest doesn't spawn real processes
vi.mock('../../src/core/executor.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/core/executor.js')>();
  return {
    ...actual,
    execute: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: 'OK',
      stderr: '',
      timedOut: false,
      durationMs: 50,
    }),
  };
});

const { executeTest } = await import('../../src/core/executor.js');

const fakeAdapter: ToolAdapter = {
  id: 'test-adapter',
  displayName: 'Test Adapter',
  commands: ['test'],
  installUrl: 'https://example.com',
  readOnly: { level: 'none' },
  models: [{ id: 'model-1', name: 'Model 1' }],
  buildInvocation: (req) => ({
    cmd: 'echo',
    args: ['OK'],
    cwd: req.cwd,
  }),
};

const fakeToolConfig: ToolConfig = {
  binary: '/bin/echo',
  defaultModel: 'model-1',
  readOnly: { level: 'none' },
  promptMode: 'argument',
  modelFlag: '--model',
};

describe('executeTest', () => {
  it('uses toolName when provided', async () => {
    const result = await executeTest(
      fakeAdapter,
      fakeToolConfig,
      'my-custom-name',
    );
    expect(result.toolId).toBe('my-custom-name');
  });

  it('falls back to adapter.id when toolName is omitted', async () => {
    const result = await executeTest(fakeAdapter, fakeToolConfig);
    expect(result.toolId).toBe('test-adapter');
  });

  it('reports passed when output contains OK', async () => {
    const result = await executeTest(fakeAdapter, fakeToolConfig);
    expect(result.passed).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
