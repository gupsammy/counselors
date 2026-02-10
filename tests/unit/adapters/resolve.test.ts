import { describe, expect, it } from 'vitest';
import { resolveAdapter } from '../../../src/adapters/index.js';
import type { ToolConfig } from '../../../src/types.js';

describe('resolveAdapter', () => {
  it('resolves compound codex ID to CodexAdapter', () => {
    const config: ToolConfig = {
      binary: '/usr/local/bin/codex',
      defaultModel: '5.3-xhigh',
      adapter: 'codex',
      readOnly: { level: 'none' },
      promptMode: 'argument',
      modelFlag: '-m',
    };

    const adapter = resolveAdapter('codex-5.3-xhigh', config);
    expect(adapter.id).toBe('codex');
  });

  it('resolves compound amp ID to AmpAdapter', () => {
    const config: ToolConfig = {
      binary: '/usr/local/bin/amp',
      defaultModel: 'smart',
      adapter: 'amp',
      readOnly: { level: 'enforced' },
      promptMode: 'stdin',
      modelFlag: '-m',
    };

    const adapter = resolveAdapter('amp-smart', config);
    expect(adapter.id).toBe('amp');
  });

  it('resolves compound gemini ID to GeminiAdapter', () => {
    const config: ToolConfig = {
      binary: '/usr/local/bin/gemini',
      defaultModel: '3-pro-preview',
      adapter: 'gemini',
      readOnly: { level: 'bestEffort' },
      promptMode: 'stdin',
      modelFlag: '-m',
    };

    const adapter = resolveAdapter('gemini-3-pro-preview', config);
    expect(adapter.id).toBe('gemini');
  });

  it('resolves plain built-in ID without adapter field', () => {
    const config: ToolConfig = {
      binary: '/usr/local/bin/claude',
      defaultModel: 'sonnet',
      readOnly: { level: 'enforced' },
      promptMode: 'argument',
      modelFlag: '--model',
    };

    const adapter = resolveAdapter('claude', config);
    expect(adapter.id).toBe('claude');
  });

  it('returns CustomAdapter for unknown adapter', () => {
    const config: ToolConfig = {
      binary: '/usr/local/bin/my-tool',
      defaultModel: 'default',
      readOnly: { level: 'none' },
      promptMode: 'argument',
      modelFlag: '--model',
      custom: true,
    };

    const adapter = resolveAdapter('my-custom-tool', config);
    expect(adapter.id).toBe('my-custom-tool');
  });
});
