import type {
  Invocation,
  ReadOnlyLevel,
  RunRequest,
  ToolConfig,
} from '../types.js';
import { BaseAdapter } from './base.js';

export class CustomAdapter extends BaseAdapter {
  id: string;
  displayName: string;
  commands: string[];
  installUrl = '';
  readOnly: { level: ReadOnlyLevel };
  models: { id: string; name: string; recommended?: boolean }[] = [];

  private config: ToolConfig;

  constructor(id: string, config: ToolConfig) {
    super();
    this.id = id;
    this.displayName = id;
    this.commands = [config.binary];
    this.readOnly = { level: config.readOnly.level };
    this.config = config;
  }

  buildInvocation(req: RunRequest): Invocation {
    const args: string[] = [];

    if (req.extraFlags) {
      args.push(...req.extraFlags);
    }

    // Add read-only flags if applicable
    if (req.readOnlyPolicy !== 'none' && this.config.readOnly.flags) {
      args.push(...this.config.readOnly.flags);
    }

    const cmd = req.binary ?? this.config.binary;

    if (this.config.stdin === true) {
      return { cmd, args, stdin: req.prompt, cwd: req.cwd };
    }

    const instruction = `Read the file at ${req.promptFilePath} and follow the instructions within it.`;
    args.push(instruction);

    return { cmd, args, cwd: req.cwd };
  }
}
