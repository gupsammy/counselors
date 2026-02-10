import { describe, expect, it } from 'vitest';
import { CustomAdapter } from '../../../src/adapters/custom.js';
import type { RunRequest, ToolConfig } from '../../../src/types.js';

const baseConfig: ToolConfig = {
  binary: '/usr/local/bin/my-tool',
  readOnly: { level: 'bestEffort' },
  custom: true,
};

const baseReq: RunRequest = {
  prompt: 'test prompt',
  promptFilePath: '/tmp/prompt.md',
  toolId: 'my-tool',
  outputDir: '/tmp/out',
  readOnlyPolicy: 'none',
  timeout: 60,
  cwd: '/workspace',
};

describe('CustomAdapter', () => {
  it('uses resolved binary from req.binary', () => {
    const adapter = new CustomAdapter('my-tool', baseConfig);
    const inv = adapter.buildInvocation({
      ...baseReq,
      binary: '/resolved/path/my-tool',
    });
    expect(inv.cmd).toBe('/resolved/path/my-tool');
  });

  it('falls back to config binary when req.binary is absent', () => {
    const adapter = new CustomAdapter('my-tool', baseConfig);
    const inv = adapter.buildInvocation(baseReq);
    expect(inv.cmd).toBe('/usr/local/bin/my-tool');
  });

  it('adds extraFlags from request', () => {
    const adapter = new CustomAdapter('my-tool', baseConfig);
    const inv = adapter.buildInvocation({
      ...baseReq,
      extraFlags: ['--verbose', '--format=json'],
    });
    expect(inv.args).toContain('--verbose');
    expect(inv.args).toContain('--format=json');
  });

  it('adds read-only flags when policy is not none', () => {
    const config: ToolConfig = {
      ...baseConfig,
      readOnly: { level: 'enforced', flags: ['--ro', '--safe'] },
    };
    const adapter = new CustomAdapter('my-tool', config);
    const inv = adapter.buildInvocation({
      ...baseReq,
      readOnlyPolicy: 'enforced',
    });
    expect(inv.args).toContain('--ro');
    expect(inv.args).toContain('--safe');
  });

  it('uses stdin mode when configured', () => {
    const config: ToolConfig = { ...baseConfig, stdin: true };
    const adapter = new CustomAdapter('my-tool', config);
    const inv = adapter.buildInvocation(baseReq);
    expect(inv.stdin).toBe('test prompt');
    // Should not contain the instruction as an arg
    expect(inv.args.join(' ')).not.toContain('Read the file at');
  });

  it('uses argument mode by default', () => {
    const adapter = new CustomAdapter('my-tool', baseConfig);
    const inv = adapter.buildInvocation(baseReq);
    expect(inv.stdin).toBeUndefined();
    expect(inv.args.join(' ')).toContain('Read the file at');
  });
});
