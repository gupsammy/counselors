import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunManifest, ToolReport } from '../types.js';

/**
 * Generate a heuristic summary of run results (v1 — no LLM).
 */
export function synthesize(manifest: RunManifest, outputDir: string): string {
  const parts: string[] = [
    '# Run Summary',
    '',
    `**Prompt:** ${manifest.prompt.slice(0, 100)}${manifest.prompt.length > 100 ? '...' : ''}`,
    `**Tools:** ${manifest.tools.map((t) => t.toolId).join(', ')}`,
    `**Policy:** read-only=${manifest.readOnlyPolicy}`,
    '',
  ];

  // Per-tool summaries
  parts.push('## Results', '');

  for (const report of manifest.tools) {
    const icon =
      report.status === 'success'
        ? '✓'
        : report.status === 'timeout'
          ? '⏱'
          : '✗';
    const duration = (report.durationMs / 1000).toFixed(1);
    parts.push(`### ${icon} ${report.toolId} (${report.model})`);
    parts.push('');
    parts.push(`- Status: ${report.status}`);
    parts.push(`- Duration: ${duration}s`);
    parts.push(`- Word count: ${report.wordCount}`);

    if (report.cost) {
      parts.push(
        `- Cost: $${report.cost.cost_usd.toFixed(2)} (${report.cost.source})`,
      );
    }

    if (report.status === 'error' && report.error) {
      parts.push(`- Error: ${report.error}`);
    }

    // Extract headings from report file
    if (report.status === 'success') {
      const headings = extractHeadings(outputDir, report);
      if (headings.length > 0) {
        parts.push('- Key sections:');
        for (const h of headings) {
          parts.push(`  - ${h}`);
        }
      }
    }

    parts.push('');
  }

  // Cost table (if any tools have cost info)
  const costsAvailable = manifest.tools.filter((t) => t.cost);
  if (costsAvailable.length > 0) {
    parts.push('## Cost Summary', '');
    parts.push('| Tool | Cost | Source | Remaining |');
    parts.push('|------|------|--------|-----------|');
    for (const t of costsAvailable) {
      const c = t.cost!;
      parts.push(
        `| ${t.toolId} | $${c.cost_usd.toFixed(2)} | ${c.source} | $${c.source === 'credits' ? c.credits_remaining_usd.toFixed(2) : c.free_remaining_usd.toFixed(2)} |`,
      );
    }
    parts.push('');
  }

  return parts.join('\n');
}

function extractHeadings(outputDir: string, report: ToolReport): string[] {
  const filePath = join(outputDir, `${report.toolId}.md`);
  if (!existsSync(filePath)) return [];

  try {
    const content = readFileSync(filePath, 'utf-8');
    const headings: string[] = [];
    for (const line of content.split('\n')) {
      const match = line.match(/^#{1,3}\s+(.+)/);
      if (match) {
        headings.push(match[1].trim());
        if (headings.length >= 10) break;
      }
    }
    return headings;
  } catch {
    return [];
  }
}
