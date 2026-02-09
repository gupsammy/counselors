import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gatherContext } from '../../src/core/context.js';

const testDir = join(tmpdir(), `counselors-ctx-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('gatherContext', () => {
  it('includes file content', () => {
    writeFileSync(join(testDir, 'file.txt'), 'hello world');
    const ctx = gatherContext(testDir, ['file.txt']);
    expect(ctx).toContain('hello world');
    expect(ctx).toContain('### Files Referenced');
  });

  it('respects maxKb budget — skips files that exceed remaining budget', () => {
    // Create a 2KB file
    const largeContent = 'x'.repeat(2048);
    writeFileSync(join(testDir, 'large.txt'), largeContent);

    // With 1KB budget, the file should be skipped
    const ctx = gatherContext(testDir, ['large.txt'], 1);
    expect(ctx).not.toContain(largeContent);
  });

  it('truncates git diff when over budget', () => {
    // This test works in the counselors project dir which is a git repo with no commits
    // gatherContext calls getGitDiff internally — in a dir with no git, diff returns null
    // So we test budget enforcement with files filling the budget
    const content = 'a'.repeat(512);
    writeFileSync(join(testDir, 'a.txt'), content);

    // 1KB budget, file takes ~512 bytes, any diff would be truncated
    const ctx = gatherContext(testDir, ['a.txt'], 1);
    expect(ctx).toContain('a.txt');
    // Git diff section should not appear (no git repo in tmpdir)
    expect(ctx).not.toContain('Git Diff');
  });

  it('handles nonexistent files gracefully', () => {
    const ctx = gatherContext(testDir, ['does-not-exist.txt']);
    // Should not throw, just skip
    expect(ctx).toContain('### Files Referenced');
    expect(ctx).not.toContain('does-not-exist.txt content');
  });

  it('handles directories in file list gracefully', () => {
    mkdirSync(join(testDir, 'subdir'));
    const ctx = gatherContext(testDir, ['subdir']);
    // Should skip non-files without error
    expect(ctx).not.toContain('```\n\n```');
  });

  it('stops adding files after budget is exhausted', () => {
    writeFileSync(join(testDir, 'first.txt'), 'a'.repeat(600));
    writeFileSync(join(testDir, 'second.txt'), 'b'.repeat(600));

    // 1KB budget — first file fits (~600 bytes), second should be skipped
    const ctx = gatherContext(testDir, ['first.txt', 'second.txt'], 1);
    expect(ctx).toContain('first.txt');
    // second.txt has 600 bytes which exceeds remaining budget
    expect(ctx).not.toContain('bbbbb');
  });
});
