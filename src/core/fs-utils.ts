import { renameSync, unlinkSync, writeFileSync } from 'node:fs';

/**
 * Atomically write a file by writing to a temp file and renaming.
 * Avoids symlink TOCTOU — renameSync is atomic on the same filesystem.
 */
export function safeWriteFile(
  path: string,
  content: string,
  options?: { mode?: number },
): void {
  const tmp = `${path}.tmp.${process.pid}`;
  try {
    writeFileSync(tmp, content, { encoding: 'utf-8', mode: options?.mode });
    renameSync(tmp, path);
  } catch (e) {
    // Clean up temp file on failure
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw e;
  }
}
