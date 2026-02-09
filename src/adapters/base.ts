import type {
  ExecResult,
  Invocation,
  ReadOnlyLevel,
  RunRequest,
  ToolAdapter,
  ToolReport,
} from '../types.js';

export abstract class BaseAdapter implements ToolAdapter {
  abstract id: string;
  abstract displayName: string;
  abstract commands: string[];
  abstract installUrl: string;
  abstract readOnly: { level: ReadOnlyLevel };
  abstract models: { id: string; name: string; recommended?: boolean }[];

  abstract buildInvocation(req: RunRequest): Invocation;

  parseResult(result: ExecResult): Partial<ToolReport> {
    return {
      status: result.timedOut
        ? 'timeout'
        : result.exitCode === 0
          ? 'success'
          : 'error',
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      wordCount: result.stdout.split(/\s+/).filter(Boolean).length,
    };
  }
}
