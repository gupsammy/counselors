import type { ToolReport } from '../types.js';

const SPINNER_FRAMES = ['◐', '◓', '◑', '◒'];
const TICK_INTERVAL = 200;
/** Interval for non-TTY heartbeat. Keeps outer agents from timing out during long tool runs. */
const HEARTBEAT_INTERVAL = 60_000;

const LABEL_COL_WIDTH = 40;

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

type ToolStatus = 'pending' | 'running' | 'done';

interface ToolState {
  toolId: string;
  status: ToolStatus;
  startedAt?: number;
  report?: ToolReport;
  pid?: number;
}

export class ProgressDisplay {
  private tools: Map<string, ToolState>;
  private order: string[];
  private outputDir: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private lineCount = 0;
  private isTTY: boolean;
  private hasShownInitialInfo = false;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatStart = 0;
  private currentRound: number | null = null;
  private totalRounds: number | null = null;

  constructor(toolIds: string[], outputDir: string) {
    this.isTTY = Boolean(process.stderr.isTTY);
    this.outputDir = outputDir;
    this.tools = new Map();
    this.order = [];
    for (const id of toolIds) {
      this.tools.set(id, {
        toolId: id,
        status: 'pending',
      });
      this.order.push(id);
    }

    if (this.isTTY) {
      this.render();
      this.timer = setInterval(() => {
        this.frame++;
        this.render();
      }, TICK_INTERVAL);
    } else {
      process.stderr.write(`  Output: ${this.outputDir}\n`);
      process.stderr.write(`  ℹ This may take more than 10 minutes\n`);
      process.stderr.write(`  PID: ${process.pid}\n`);
      this.hasShownInitialInfo = true;
    }
  }

  setRound(round: number, total: number): void {
    this.currentRound = round;
    this.totalRounds = total;
  }

  /** Reset tool states for a new round (keeps the same tool IDs). */
  resetTools(): void {
    for (const [id] of this.tools) {
      this.tools.set(id, { toolId: id, status: 'pending' });
    }
  }

  start(toolId: string, pid?: number): void {
    const tool = this.tools.get(toolId);
    if (!tool) return;
    tool.status = 'running';
    tool.startedAt = Date.now();
    tool.pid = pid;

    if (!this.isTTY) {
      const pidStr = pid ? `PID ${pid}  ` : '';
      process.stderr.write(`  ▸ ${pidStr}${toolId} started\n`);
      this.startHeartbeat();
    }
  }

  complete(toolId: string, report: ToolReport): void {
    const tool = this.tools.get(toolId);
    if (!tool) return;
    tool.status = 'done';
    tool.report = report;

    if (!this.isTTY) {
      const duration = (report.durationMs / 1000).toFixed(1);
      const icon =
        report.status === 'success'
          ? '✓'
          : report.status === 'timeout'
            ? '⏱'
            : '✗';
      process.stderr.write(
        `  ${icon} ${toolId} done  ${duration}s  ${report.wordCount.toLocaleString()} words\n`,
      );
      if (report.status !== 'success' && report.error) {
        process.stderr.write(
          `    └ ${report.error.split('\n')[0].slice(0, 120)}\n`,
        );
      }
    }
  }

  stop(): void {
    this.stopHeartbeat();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.isTTY) {
      this.render();
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval != null) return;
    this.heartbeatStart = Date.now();
    this.heartbeatInterval = setInterval(() => {
      const elapsed = formatDuration(Date.now() - this.heartbeatStart);
      const activePids = this.order
        .map((id) => this.tools.get(id)!)
        .filter((t) => t.status === 'running' && t.pid)
        .map((t) => t.pid);
      const pids =
        activePids.length > 0 ? ` (PIDs: ${activePids.join(', ')})` : '';
      process.stderr.write(`  heartbeat: ${elapsed} elapsed${pids}\n`);
    }, HEARTBEAT_INTERVAL);
    this.heartbeatInterval.unref();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval == null) return;
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }

  private render(): void {
    const lines: string[] = [];
    if (this.currentRound != null && this.totalRounds != null) {
      lines.push(`  Round ${this.currentRound}/${this.totalRounds}`);
    }
    lines.push(`  ${DIM}Output: ${this.outputDir}${RESET}`);
    if (!this.hasShownInitialInfo) {
      // Check if any tool has started (meaning we have real work underway)
      const anyStarted = this.order.some(
        (id) => this.tools.get(id)!.status !== 'pending',
      );
      if (anyStarted) {
        this.hasShownInitialInfo = true;
      }
    }
    if (this.hasShownInitialInfo) {
      lines.push(`  ℹ This may take more than 10 minutes`);
      lines.push(`  PID: ${process.pid}`);
    }
    for (const id of this.order) {
      const tool = this.tools.get(id)!;
      lines.push(this.formatLine(tool));
      if (
        tool.status === 'done' &&
        tool.report?.status !== 'success' &&
        tool.report?.error
      ) {
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
    const label = tool.toolId;

    switch (tool.status) {
      case 'pending': {
        const pad = ' '.repeat(Math.max(0, LABEL_COL_WIDTH - label.length));
        return `  ⏳ ${label}${pad}pending`;
      }
      case 'running': {
        const spinner = SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length];
        const elapsed = tool.startedAt
          ? ((Date.now() - tool.startedAt) / 1000).toFixed(1)
          : '0.0';
        const pidPrefix = tool.pid ? `PID ${tool.pid}  ` : '';
        const fullLabel = `${pidPrefix}${label}`;
        const pad = ' '.repeat(Math.max(0, LABEL_COL_WIDTH - fullLabel.length));
        return `  ${spinner} ${fullLabel}${pad}running  ${elapsed.padStart(6)}s`;
      }
      case 'done': {
        const report = tool.report!;
        const icon =
          report.status === 'success'
            ? '✓'
            : report.status === 'timeout'
              ? '⏱'
              : '✗';
        const duration = (report.durationMs / 1000).toFixed(1);
        const pad = ' '.repeat(Math.max(0, LABEL_COL_WIDTH - label.length));
        return `  ${icon} ${label}${pad}done    ${duration.padStart(6)}s  ${report.wordCount.toLocaleString()} words`;
      }
    }
  }
}
