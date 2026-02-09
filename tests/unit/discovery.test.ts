import { describe, it, expect } from 'vitest';
import { findBinary } from '../../src/core/discovery.js';

describe('findBinary', () => {
  it('finds node binary', () => {
    const path = findBinary('node');
    expect(path).toBeTruthy();
    expect(path).toContain('node');
  });

  it('returns null for nonexistent binary', () => {
    const path = findBinary('totally-nonexistent-binary-xyz-123');
    expect(path).toBeNull();
  });

  it('finds npm binary', () => {
    const path = findBinary('npm');
    expect(path).toBeTruthy();
  });
});
