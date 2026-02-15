import { existsSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export type CleanupCandidate = {
  name: string;
  path: string;
  mtimeMs: number;
};

const MS = 1;
const SECOND = 1000 * MS;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Parse a human-friendly duration into milliseconds.
 *
 * Supported:
 * - "1d", "12h", "30m", "45s", "500ms", "2w"
 * - A bare integer (e.g. "7") is interpreted as days for convenience.
 */
export function parseDurationMs(input: string): number {
  const raw = input.trim();
  if (!raw) throw new Error('Duration cannot be empty.');

  if (/^\d+$/.test(raw)) {
    const days = Number(raw);
    if (!Number.isFinite(days) || days < 0) {
      throw new Error(`Invalid duration "${input}".`);
    }
    return days * DAY;
  }

  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/i.exec(raw);
  if (!m) {
    throw new Error(
      `Invalid duration "${input}". Use e.g. "1d", "12h", "30m", "45s".`,
    );
  }

  const value = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid duration "${input}".`);
  }

  const multipliers: Record<string, number> = {
    ms: MS,
    s: SECOND,
    m: MINUTE,
    h: HOUR,
    d: DAY,
    w: WEEK,
  };

  const mult = multipliers[unit];
  if (!mult) throw new Error(`Invalid duration unit in "${input}".`);
  return value * mult;
}

export function scanCleanupCandidates(
  baseDir: string,
  cutoffMs: number,
): {
  baseExists: boolean;
  candidates: CleanupCandidate[];
  skippedSymlinks: string[];
} {
  if (!existsSync(baseDir)) {
    return { baseExists: false, candidates: [], skippedSymlinks: [] };
  }

  const skippedSymlinks: string[] = [];
  const candidates: CleanupCandidate[] = [];

  for (const name of readdirSync(baseDir)) {
    const fullPath = join(baseDir, name);
    let st: ReturnType<typeof lstatSync>;
    try {
      st = lstatSync(fullPath);
    } catch {
      continue;
    }

    if (st.isSymbolicLink()) {
      skippedSymlinks.push(name);
      continue;
    }

    if (!st.isDirectory()) continue;

    if (st.mtimeMs < cutoffMs) {
      candidates.push({ name, path: fullPath, mtimeMs: st.mtimeMs });
    }
  }

  candidates.sort((a, b) => a.mtimeMs - b.mtimeMs);
  return { baseExists: true, candidates, skippedSymlinks };
}

export function deleteCleanupCandidates(candidates: CleanupCandidate[]): {
  deleted: string[];
  failed: { path: string; error: string }[];
} {
  const deleted: string[] = [];
  const failed: { path: string; error: string }[] = [];

  for (const c of candidates) {
    try {
      rmSync(c.path, { recursive: true, force: true });
      deleted.push(c.path);
    } catch (e) {
      failed.push({
        path: c.path,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { deleted, failed };
}
