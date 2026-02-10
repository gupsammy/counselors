import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { synthesize } from '../../src/core/synthesis.js';
import type { RunManifest } from '../../src/types.js';

describe('synthesis', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = join(tmpdir(), `counselors-synthesis-test-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('reads output file using sanitized tool ID', () => {
    // Dispatcher writes files with sanitized IDs
    const sanitizedName = 'codex-5.3-xhigh';
    writeFileSync(
      join(outputDir, `${sanitizedName}.md`),
      '# Overview\n\nSome content\n\n## Details\n\nMore content\n',
    );

    const manifest: RunManifest = {
      timestamp: new Date().toISOString(),
      slug: 'test',
      prompt: 'test prompt',
      promptSource: 'inline',
      readOnlyPolicy: 'bestEffort',
      tools: [
        {
          toolId: 'codex-5.3-xhigh',
          model: '5.3-xhigh',
          status: 'success',
          exitCode: 0,
          durationMs: 1000,
          wordCount: 10,
          outputFile: join(outputDir, `${sanitizedName}.md`),
          stderrFile: join(outputDir, `${sanitizedName}.stderr`),
        },
      ],
    };

    const summary = synthesize(manifest, outputDir);
    expect(summary).toContain('Overview');
    expect(summary).toContain('Details');
  });

  it('handles tool IDs with special characters via sanitization', () => {
    // A toolId with chars that get replaced by sanitizeId
    const toolId = 'tool/with:special@chars';
    const sanitizedName = 'tool_with_special_chars';
    writeFileSync(
      join(outputDir, `${sanitizedName}.md`),
      '# Found It\n\nContent here\n',
    );

    const manifest: RunManifest = {
      timestamp: new Date().toISOString(),
      slug: 'test',
      prompt: 'test prompt',
      promptSource: 'inline',
      readOnlyPolicy: 'bestEffort',
      tools: [
        {
          toolId,
          model: 'default',
          status: 'success',
          exitCode: 0,
          durationMs: 500,
          wordCount: 5,
          outputFile: join(outputDir, `${sanitizedName}.md`),
          stderrFile: join(outputDir, `${sanitizedName}.stderr`),
        },
      ],
    };

    const summary = synthesize(manifest, outputDir);
    expect(summary).toContain('Found It');
  });
});
