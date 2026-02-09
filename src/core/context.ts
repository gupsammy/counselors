import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_MAX_CONTEXT_KB } from '../constants.js';
import { debug } from '../ui/logger.js';

/**
 * Gather context from git diff and specified files.
 */
export function gatherContext(
  cwd: string,
  paths: string[],
  maxKb: number = DEFAULT_MAX_CONTEXT_KB,
): string {
  const parts: string[] = [];
  let totalBytes = 0;
  const maxBytes = maxKb * 1024;

  // Read specified files first (user-requested content gets priority)
  if (paths.length > 0) {
    parts.push('### Files Referenced', '');

    for (const p of paths) {
      if (totalBytes >= maxBytes) {
        debug(`Context limit reached (${maxKb}KB), skipping remaining files`);
        break;
      }

      const fullPath = resolve(cwd, p);
      try {
        const stat = statSync(fullPath);
        if (!stat.isFile()) continue;
        if (stat.size > maxBytes - totalBytes) {
          debug(`Skipping ${p} — too large (${stat.size} bytes)`);
          continue;
        }

        const content = readFileSync(fullPath, 'utf-8');
        parts.push(`#### ${p}`, '', '```', content, '```', '');
        totalBytes += Buffer.byteLength(content);
      } catch {
        debug(`Could not read ${p}`);
      }
    }
  }

  // Git diff (staged + unstaged) — added after files, truncated if over budget
  if (totalBytes < maxBytes) {
    const diff = getGitDiff(cwd);
    if (diff) {
      const diffBytes = Buffer.byteLength(diff);
      if (totalBytes + diffBytes <= maxBytes) {
        parts.push(
          '### Recent Changes (Git Diff)',
          '',
          '```diff',
          diff,
          '```',
          '',
        );
        totalBytes += diffBytes;
      } else {
        const remaining = maxBytes - totalBytes;
        const truncated = diff.slice(0, remaining);
        parts.push(
          '### Recent Changes (Git Diff) [truncated]',
          '',
          '```diff',
          truncated,
          '```',
          '',
        );
        totalBytes = maxBytes;
      }
    }
  }

  return parts.join('\n');
}

function getGitDiff(cwd: string): string | null {
  try {
    const staged = execSync('git diff --staged', {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const unstaged = execSync('git diff', {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const parts = [];
    if (staged) parts.push(staged);
    if (unstaged) parts.push(unstaged);
    return parts.length > 0 ? parts.join('\n') : null;
  } catch {
    return null;
  }
}
