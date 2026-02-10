import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolReport } from '../../src/types.js';

// Capture stderr writes
let stderrOutput: string;
const originalWrite = process.stderr.write;

beforeEach(() => {
  stderrOutput = '';
  // Force non-TTY so we get simple line output (no ANSI cursor movement)
  Object.defineProperty(process.stderr, 'isTTY', {
    value: false,
    configurable: true,
  });
  process.stderr.write = vi.fn((chunk: any) => {
    stderrOutput += typeof chunk === 'string' ? chunk : chunk.toString();
    return true;
  }) as any;
});

afterEach(() => {
  process.stderr.write = originalWrite;
  Object.defineProperty(process.stderr, 'isTTY', {
    value: originalWrite ? true : undefined,
    configurable: true,
  });
});

// Dynamic import to pick up the mocked isTTY
async function loadProgressDisplay() {
  // Clear module cache to re-evaluate with current isTTY
  const mod = await import('../../src/ui/progress.js');
  return mod.ProgressDisplay;
}

function makeReport(overrides: Partial<ToolReport> = {}): ToolReport {
  return {
    toolId: 'test-tool',
    status: 'success',
    exitCode: 0,
    durationMs: 5000,
    wordCount: 100,
    outputFile: '/tmp/test.md',
    stderrFile: '/tmp/test.stderr',
    ...overrides,
  };
}

describe('ProgressDisplay (non-TTY)', () => {
  it('prints output dir on construction', async () => {
    const ProgressDisplay = await loadProgressDisplay();
    const display = new ProgressDisplay(['claude'], '/tmp/output');
    display.stop();
    expect(stderrOutput).toContain('Output: /tmp/output');
  });

  it('prints started message', async () => {
    const ProgressDisplay = await loadProgressDisplay();
    const display = new ProgressDisplay(['claude'], '/tmp/output');
    display.start('claude');
    display.stop();
    expect(stderrOutput).toContain('claude started');
  });

  it('prints completed message with duration and word count', async () => {
    const ProgressDisplay = await loadProgressDisplay();
    const display = new ProgressDisplay(['claude'], '/tmp/output');
    display.start('claude');
    display.complete(
      'claude',
      makeReport({
        toolId: 'claude',
        durationMs: 12300,
        wordCount: 500,
      }),
    );
    display.stop();
    expect(stderrOutput).toContain('✓ claude done');
    expect(stderrOutput).toContain('12.3s');
    expect(stderrOutput).toContain('500 words');
  });

  it('prints error line for failed tools', async () => {
    const ProgressDisplay = await loadProgressDisplay();
    const display = new ProgressDisplay(['gemini'], '/tmp/output');
    display.start('gemini');
    display.complete(
      'gemini',
      makeReport({
        toolId: 'gemini',
        status: 'error',
        exitCode: 1,
        error: 'TypeError: Cannot read properties\nsome second line',
      }),
    );
    display.stop();
    expect(stderrOutput).toContain('✗ gemini done');
    expect(stderrOutput).toContain('└ TypeError: Cannot read properties');
    // Should only include first line of error
    expect(stderrOutput).not.toContain('some second line');
  });

  it('prints timeout icon for timed-out tools', async () => {
    const ProgressDisplay = await loadProgressDisplay();
    const display = new ProgressDisplay(['slow'], '/tmp/output');
    display.start('slow');
    display.complete('slow', makeReport({ toolId: 'slow', status: 'timeout' }));
    display.stop();
    expect(stderrOutput).toContain('⏱ slow done');
  });

  it('ignores unknown tool IDs', async () => {
    const ProgressDisplay = await loadProgressDisplay();
    const display = new ProgressDisplay(['claude'], '/tmp/output');
    // Should not throw
    display.start('nonexistent');
    display.complete('nonexistent', makeReport());
    display.stop();
  });

  it('handles multiple tools', async () => {
    const ProgressDisplay = await loadProgressDisplay();
    const display = new ProgressDisplay(['claude', 'codex'], '/tmp/output');
    display.start('claude');
    display.start('codex');
    display.complete('claude', makeReport({ toolId: 'claude' }));
    display.complete('codex', makeReport({ toolId: 'codex' }));
    display.stop();
    expect(stderrOutput).toContain('claude started');
    expect(stderrOutput).toContain('codex started');
    expect(stderrOutput).toContain('✓ claude done');
    expect(stderrOutput).toContain('✓ codex done');
  });
});
