import { writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { warn } from '../ui/logger.js';

/**
 * Atomically write a file by writing to a temp file and renaming.
 * Avoids symlink TOCTOU — renameSync is atomic on the same filesystem.
 */
export function safeWriteFile(path: string, content: string): void {
  const tmp = `${path}.tmp.${process.pid}`;
  try {
    writeFileSync(tmp, content, 'utf-8');
    renameSync(tmp, path);
  } catch (e) {
    // Clean up temp file on failure
    try { unlinkSync(tmp); } catch { /* ignore */ }
    warn(`Failed to write ${path}: ${e}`);
  }
}
