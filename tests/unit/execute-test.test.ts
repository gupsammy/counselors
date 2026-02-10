import { describe, expect, it } from 'vitest';
import { executeTest } from '../../src/core/executor.js';
import type { ToolAdapter, ToolConfig } from '../../src/types.js';

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
  readOnly: { level: 'none' },
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

  it('overrides stdin for stdin-based adapters', async () => {
    // `cat` echoes stdin — if executeTest overrides stdin with the test
    // prompt ("Reply with exactly: OK"), cat outputs it and the test passes.
    const catAdapter: ToolAdapter = {
      ...fakeAdapter,
      id: 'stdin-test',
      buildInvocation: (req) => ({
        cmd: 'cat',
        args: [],
        stdin: 'this-should-be-overridden',
        cwd: req.cwd,
      }),
    };

    const result = await executeTest(catAdapter, fakeToolConfig);
    expect(result.passed).toBe(true);
    expect(result.output).toContain('OK');
  });

  it('replaces last arg for argument-based adapters', async () => {
    // echo outputs its args — executeTest should replace the last arg
    // with the test prompt, so echo outputs it (containing "OK").
    const echoAdapter: ToolAdapter = {
      ...fakeAdapter,
      buildInvocation: (req) => ({
        cmd: 'echo',
        args: ['placeholder-to-be-replaced'],
        cwd: req.cwd,
      }),
    };

    const result = await executeTest(echoAdapter, fakeToolConfig);
    expect(result.passed).toBe(true);
    expect(result.output).toContain('Reply with exactly: OK');
  });

  it('passes extraFlags from toolConfig to adapter', async () => {
    const configWithFlags: ToolConfig = {
      ...fakeToolConfig,
      extraFlags: ['--model', 'opus'],
    };

    let capturedReq: any;
    const spyAdapter: ToolAdapter = {
      ...fakeAdapter,
      buildInvocation: (req) => {
        capturedReq = req;
        return { cmd: 'echo', args: ['OK'], cwd: req.cwd };
      },
    };

    await executeTest(spyAdapter, configWithFlags);
    expect(capturedReq.extraFlags).toEqual(['--model', 'opus']);
  });
});
