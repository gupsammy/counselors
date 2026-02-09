import type { ToolReport } from '../types.js';

const SPINNER_FRAMES = ['◐', '◓', '◑', '◒'];
const TICK_INTERVAL = 200;
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

type ToolStatus = 'pending' | 'running' | 'done';

interface ToolState {
  toolId: string;
  model: string;
  status: ToolStatus;
  startedAt?: number;
  report?: ToolReport;
}

export class ProgressDisplay {
  private tools: Map<string, ToolState>;
  private order: string[];
  private outputDir: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private lineCount = 0;
  private isTTY: boolean;

  constructor(tools: { toolId: string; model: string }[], outputDir: string) {
    this.isTTY = Boolean(process.stderr.isTTY);
    this.outputDir = outputDir;
    this.tools = new Map();
    this.order = [];
    for (const t of tools) {
      this.tools.set(t.toolId, { toolId: t.toolId, model: t.model, status: 'pending' });
      this.order.push(t.toolId);
    }

    if (this.isTTY) {
      this.render();
      this.timer = setInterval(() => {
        this.frame++;
        this.render();
      }, TICK_INTERVAL);
    } else {
      process.stderr.write(`  Output: ${this.outputDir}\n`);
    }
  }

  start(toolId: string): void {
    const tool = this.tools.get(toolId);
    if (!tool) return;
    tool.status = 'running';
    tool.startedAt = Date.now();

    if (!this.isTTY) {
      process.stderr.write(`  ▸ ${toolId} (${tool.model}) started\n`);
    }
  }

  complete(toolId: string, report: ToolReport): void {
    const tool = this.tools.get(toolId);
    if (!tool) return;
    tool.status = 'done';
    tool.report = report;

    if (!this.isTTY) {
      const duration = (report.durationMs / 1000).toFixed(1);
      const icon = report.status === 'success' ? '✓' : report.status === 'timeout' ? '⏱' : '✗';
      process.stderr.write(`  ${icon} ${toolId} (${tool.model}) done  ${duration}s  ${report.wordCount.toLocaleString()} words\n`);
      if (report.status !== 'success' && report.error) {
        process.stderr.write(`    └ ${report.error.split('\n')[0].slice(0, 120)}\n`);
      }
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.isTTY) {
      this.render();
    }
  }

  private render(): void {
    const lines: string[] = [];
    lines.push(`  ${DIM}Output: ${this.outputDir}${RESET}`);
    for (const id of this.order) {
      const tool = this.tools.get(id)!;
      lines.push(this.formatLine(tool));
      if (tool.status === 'done' && tool.report?.status !== 'success' && tool.report?.error) {
        const msg = tool.report.error.split('\n')[0].slice(0, 120);
        lines.push(`    ${RED}└ ${msg}${RESET}`);
      }
    }

    // Move cursor up to overwrite previous output
    if (this.lineCount > 0) {
      process.stderr.write(`\x1b[${this.lineCount}A`);
    }

    for (const line of lines) {
      process.stderr.write(`\x1b[K${line}\n`);
    }

    this.lineCount = lines.length;
  }

  private formatLine(tool: ToolState): string {
    const label = `${tool.toolId} (${tool.model})`;

    switch (tool.status) {
      case 'pending': {
        const pad = ' '.repeat(Math.max(0, 40 - label.length));
        return `  ⏳ ${label}${pad}pending`;
      }
      case 'running': {
        const spinner = SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length];
        const elapsed = tool.startedAt ? ((Date.now() - tool.startedAt) / 1000).toFixed(1) : '0.0';
        const pad = ' '.repeat(Math.max(0, 40 - label.length));
        return `  ${spinner} ${label}${pad}running  ${elapsed.padStart(6)}s`;
      }
      case 'done': {
        const r = tool.report!;
        const icon = r.status === 'success' ? '✓' : r.status === 'timeout' ? '⏱' : '✗';
        const duration = (r.durationMs / 1000).toFixed(1);
        const pad = ' '.repeat(Math.max(0, 40 - label.length));
        return `  ${icon} ${label}${pad}done    ${duration.padStart(6)}s  ${r.wordCount.toLocaleString()} words`;
      }
    }
  }
}
