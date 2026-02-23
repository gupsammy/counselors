import { describe, expect, it } from 'vitest';
import { getPresetNames, resolvePreset } from '../../src/presets/index.js';

describe('resolvePreset', () => {
  it('returns the bug-hunt preset', () => {
    const preset = resolvePreset('bug-hunt');
    expect(preset.name).toBe('bug-hunt');
    expect(preset.description).toContain('bugs');
    expect(preset.defaultRounds).toBe(3);
    expect(preset.defaultReadOnly).toBe('enforced');
  });

  it('throws for unknown preset with available names', () => {
    expect(() => resolvePreset('nonexistent')).toThrow(
      'Unknown preset "nonexistent"',
    );
    expect(() => resolvePreset('nonexistent')).toThrow('bug-hunt');
  });

  it('throws for empty string', () => {
    expect(() => resolvePreset('')).toThrow('Unknown preset ""');
  });
});

describe('getPresetNames', () => {
  it('returns array containing bug-hunt', () => {
    const names = getPresetNames();
    expect(names).toContain('bug-hunt');
  });

  it('returns non-empty array', () => {
    expect(getPresetNames().length).toBeGreaterThan(0);
  });
});
