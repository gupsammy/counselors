import { describe, expect, it } from 'vitest';
import { SAFE_ID_RE, sanitizeId } from '../../src/constants.js';

describe('sanitizeId', () => {
  it('passes through safe IDs unchanged', () => {
    expect(sanitizeId('claude-opus')).toBe('claude-opus');
    expect(sanitizeId('codex-5.3-xhigh')).toBe('codex-5.3-xhigh');
    expect(sanitizeId('my_tool.v2')).toBe('my_tool.v2');
  });

  it('replaces slashes with underscores', () => {
    expect(sanitizeId('tool/with/slashes')).toBe('tool_with_slashes');
  });

  it('replaces colons and special chars', () => {
    expect(sanitizeId('tool:model@version')).toBe('tool_model_version');
  });

  it('replaces spaces', () => {
    expect(sanitizeId('my tool')).toBe('my_tool');
  });

  it('handles empty string', () => {
    expect(sanitizeId('')).toBe('');
  });
});

describe('SAFE_ID_RE', () => {
  it('accepts valid tool names', () => {
    expect(SAFE_ID_RE.test('claude')).toBe(true);
    expect(SAFE_ID_RE.test('codex-5.3-xhigh')).toBe(true);
    expect(SAFE_ID_RE.test('my_tool.v2')).toBe(true);
    expect(SAFE_ID_RE.test('amp-smart')).toBe(true);
  });

  it('rejects names with slashes', () => {
    expect(SAFE_ID_RE.test('path/traversal')).toBe(false);
  });

  it('rejects names with spaces', () => {
    expect(SAFE_ID_RE.test('my tool')).toBe(false);
  });

  it('rejects names with colons or special chars', () => {
    expect(SAFE_ID_RE.test('tool:model')).toBe(false);
    expect(SAFE_ID_RE.test('tool@version')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(SAFE_ID_RE.test('')).toBe(false);
  });
});
