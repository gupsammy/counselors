import { describe, it, expect } from 'vitest';
import { CodexAdapter } from '../../../src/adapters/codex.js';
import type { RunRequest } from '../../../src/types.js';

describe('CodexAdapter', () => {
  const adapter = new CodexAdapter();

  const baseRequest: RunRequest = {
    prompt: 'test prompt',
    promptFilePath: '/tmp/prompt.md',
    toolId: 'codex',
    model: 'gpt-5.3-codex',
    outputDir: '/tmp/out',
    readOnlyPolicy: 'enforced',
    timeout: 540,
    cwd: '/tmp',
  };

  it('has correct metadata', () => {
    expect(adapter.id).toBe('codex');
    expect(adapter.commands).toEqual(['codex']);
    expect(adapter.readOnly.level).toBe('enforced');
  });

  it('builds invocation with sandbox flag', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.cmd).toBe('codex');
    expect(inv.args).toContain('exec');
    expect(inv.args).toContain('-m');
    expect(inv.args).toContain('gpt-5.3-codex');
    expect(inv.args).toContain('--sandbox');
    expect(inv.args).toContain('read-only');
    expect(inv.args).toContain('-c');
    expect(inv.args).toContain('web_search=live');
    expect(inv.args).toContain('--skip-git-repo-check');
  });

  it('omits sandbox when policy is none', () => {
    const req = { ...baseRequest, readOnlyPolicy: 'none' as const };
    const inv = adapter.buildInvocation(req);
    expect(inv.args).not.toContain('--sandbox');
  });

  it('uses req.binary when provided', () => {
    const req = { ...baseRequest, binary: '/opt/bin/codex' };
    const inv = adapter.buildInvocation(req);
    expect(inv.cmd).toBe('/opt/bin/codex');
  });

  it('falls back to "codex" when req.binary is undefined', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.cmd).toBe('codex');
  });

  it('includes extraFlags in invocation', () => {
    const req = { ...baseRequest, extraFlags: ['-c', 'model_reasoning_effort=xhigh'] };
    const inv = adapter.buildInvocation(req);
    expect(inv.args).toContain('model_reasoning_effort=xhigh');
  });

  it('omits extraFlags when not provided', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.args.filter(a => a.includes('reasoning_effort'))).toHaveLength(0);
  });

  it('places extraFlags before the instruction', () => {
    const req = { ...baseRequest, extraFlags: ['-c', 'model_reasoning_effort=high'] };
    const inv = adapter.buildInvocation(req);
    const effortIdx = inv.args.indexOf('model_reasoning_effort=high');
    const instructionIdx = inv.args.findIndex(a => a.startsWith('Read the file'));
    expect(effortIdx).toBeLessThan(instructionIdx);
  });

  it('has three gpt-5.3-codex models with different reasoning efforts', () => {
    expect(adapter.models).toHaveLength(3);
    expect(adapter.models.map(m => m.compoundId)).toEqual(['codex-5.3-high', 'codex-5.3-xhigh', 'codex-5.3-medium']);
    expect(adapter.models.every(m => m.id === 'gpt-5.3-codex')).toBe(true);
  });

  it('only marks the first model as recommended', () => {
    expect(adapter.models[0].recommended).toBe(true);
    expect(adapter.models[1].recommended).toBeFalsy();
    expect(adapter.models[2].recommended).toBeFalsy();
  });

  it('each model has correct extraFlags for its reasoning effort', () => {
    expect(adapter.models[0].extraFlags).toContain('model_reasoning_effort=high');
    expect(adapter.models[1].extraFlags).toContain('model_reasoning_effort=xhigh');
    expect(adapter.models[2].extraFlags).toContain('model_reasoning_effort=medium');
  });
});
