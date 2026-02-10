import { describe, expect, it } from 'vitest';
import { ClaudeAdapter } from '../../../src/adapters/claude.js';
import type { RunRequest } from '../../../src/types.js';

describe('ClaudeAdapter', () => {
  const adapter = new ClaudeAdapter();

  const baseRequest: RunRequest = {
    prompt: 'test prompt',
    promptFilePath: '/tmp/prompt.md',
    toolId: 'claude',
    outputDir: '/tmp/out',
    readOnlyPolicy: 'enforced',
    timeout: 540,
    cwd: '/tmp',
    extraFlags: ['--model', 'opus'],
  };

  it('has correct metadata', () => {
    expect(adapter.id).toBe('claude');
    expect(adapter.commands).toEqual(['claude']);
    expect(adapter.readOnly.level).toBe('enforced');
  });

  it('builds invocation with read-only flags', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.cmd).toBe('claude');
    expect(inv.args).toContain('-p');
    expect(inv.args).toContain('--model');
    expect(inv.args).toContain('opus');
    expect(inv.args).toContain('--output-format');
    expect(inv.args).toContain('--allowedTools');
    expect(inv.args).toContain('--strict-mcp-config');
    expect(inv.cwd).toBe('/tmp');
  });

  it('omits read-only flags when policy is none', () => {
    const req = { ...baseRequest, readOnlyPolicy: 'none' as const };
    const inv = adapter.buildInvocation(req);
    expect(inv.args).not.toContain('--allowedTools');
    expect(inv.args).not.toContain('--strict-mcp-config');
  });

  it('includes instruction referencing prompt file', () => {
    const inv = adapter.buildInvocation(baseRequest);
    const lastArg = inv.args[inv.args.length - 1];
    expect(lastArg).toContain('/tmp/prompt.md');
    expect(lastArg).toContain('Read the file');
  });

  it('uses req.binary when provided', () => {
    const req = { ...baseRequest, binary: '/home/user/.volta/bin/claude' };
    const inv = adapter.buildInvocation(req);
    expect(inv.cmd).toBe('/home/user/.volta/bin/claude');
  });

  it('falls back to "claude" when req.binary is undefined', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.cmd).toBe('claude');
  });
});
