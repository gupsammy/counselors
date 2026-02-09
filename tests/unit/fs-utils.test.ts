import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { safeWriteFile } from '../../src/core/fs-utils.js';

const testDir = join(tmpdir(), `counselors-fs-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('safeWriteFile', () => {
  it('writes a file atomically', () => {
    const path = join(testDir, 'test.txt');
    safeWriteFile(path, 'hello world');
    expect(readFileSync(path, 'utf-8')).toBe('hello world');
  });

  it('overwrites existing files', () => {
    const path = join(testDir, 'overwrite.txt');
    safeWriteFile(path, 'first');
    safeWriteFile(path, 'second');
    expect(readFileSync(path, 'utf-8')).toBe('second');
  });

  it('does not leave temp files on success', () => {
    const path = join(testDir, 'clean.txt');
    safeWriteFile(path, 'content');
    const files = readdirSync(testDir);
    expect(files).toEqual(['clean.txt']);
  });

  it('overwrites symlinks atomically (rename replaces target)', () => {
    // Create a regular file and a symlink pointing to it
    const realFile = join(testDir, 'real.txt');
    const symlink = join(testDir, 'link.txt');
    safeWriteFile(realFile, 'original');
    symlinkSync(realFile, symlink);

    // Writing to the symlink path should replace the symlink with a regular file
    safeWriteFile(symlink, 'new content');
    // The content at the symlink path should be the new content
    expect(readFileSync(symlink, 'utf-8')).toBe('new content');
  });
});
