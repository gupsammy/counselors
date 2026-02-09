import { describe, it, expect } from 'vitest';
import { AmpAdapter, parseAmpUsage, computeAmpCost } from '../../../src/adapters/amp.js';
import type { RunRequest } from '../../../src/types.js';

describe('AmpAdapter', () => {
  const adapter = new AmpAdapter();

  const baseRequest: RunRequest = {
    prompt: 'test prompt',
    promptFilePath: '/tmp/prompt.md',
    toolId: 'amp',
    model: 'smart',
    outputDir: '/tmp/out',
    readOnlyPolicy: 'bestEffort',
    timeout: 540,
    cwd: '/tmp',
  };

  it('has correct metadata', () => {
    expect(adapter.id).toBe('amp');
    expect(adapter.readOnly.level).toBe('enforced');
  });

  it('uses stdin for prompt delivery', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.cmd).toBe('amp');
    expect(inv.stdin).toBeTruthy();
    expect(inv.stdin).toContain('test prompt');
    expect(inv.stdin).toContain('oracle tool');
    expect(inv.args).toContain('-m');
    expect(inv.args).toContain('smart');
    expect(inv.args).toContain('-x');
  });

  it('uses req.binary when provided', () => {
    const req = { ...baseRequest, binary: '/custom/path/amp' };
    const inv = adapter.buildInvocation(req);
    expect(inv.cmd).toBe('/custom/path/amp');
  });

  it('falls back to "amp" when req.binary is undefined', () => {
    const inv = adapter.buildInvocation(baseRequest);
    expect(inv.cmd).toBe('amp');
  });
});

describe('parseAmpUsage', () => {
  it('parses usage output', () => {
    const output = `
Usage for your account:
  Amp Free: $3.50/$10.00 remaining this month
  Individual credits: $25.00 remaining
`;
    const result = parseAmpUsage(output);
    expect(result.freeRemaining).toBe(3.5);
    expect(result.freeTotal).toBe(10);
    expect(result.creditsRemaining).toBe(25);
  });

  it('returns zeros for unparseable output', () => {
    const result = parseAmpUsage('something unexpected');
    expect(result.freeRemaining).toBe(0);
    expect(result.freeTotal).toBe(0);
    expect(result.creditsRemaining).toBe(0);
  });
});

describe('computeAmpCost', () => {
  it('computes cost from before/after snapshots', () => {
    const before = { freeRemaining: 5.00, freeTotal: 10, creditsRemaining: 25 };
    const after = { freeRemaining: 4.50, freeTotal: 10, creditsRemaining: 25 };
    const cost = computeAmpCost(before, after);
    expect(cost.cost_usd).toBe(0.5);
    expect(cost.free_used_usd).toBe(0.5);
    expect(cost.credits_used_usd).toBe(0);
    expect(cost.source).toBe('free');
  });

  it('detects credit usage', () => {
    const before = { freeRemaining: 0, freeTotal: 10, creditsRemaining: 25 };
    const after = { freeRemaining: 0, freeTotal: 10, creditsRemaining: 23.5 };
    const cost = computeAmpCost(before, after);
    expect(cost.cost_usd).toBe(1.5);
    expect(cost.credits_used_usd).toBe(1.5);
    expect(cost.source).toBe('credits');
  });

  it('handles no change', () => {
    const snapshot = { freeRemaining: 5, freeTotal: 10, creditsRemaining: 25 };
    const cost = computeAmpCost(snapshot, snapshot);
    expect(cost.cost_usd).toBe(0);
  });
});
