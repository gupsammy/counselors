import type { Invocation, RunRequest } from '../types.js';
import { BaseAdapter } from './base.js';

export class ClaudeAdapter extends BaseAdapter {
  id = 'claude';
  displayName = 'Claude Code';
  commands = ['claude'];
  installUrl = 'https://docs.anthropic.com/en/docs/claude-code';
  readOnly = { level: 'enforced' as const };
  models = [
    { id: 'opus', name: 'Opus 4.6 — most capable', recommended: true },
    { id: 'sonnet', name: 'Sonnet 4.5 — fast and capable' },
    { id: 'haiku', name: 'Haiku 4.5 — fastest, most affordable' },
  ];

  buildInvocation(req: RunRequest): Invocation {
    const instruction = `Read the file at ${req.promptFilePath} and follow the instructions within it.`;
    const args = ['-p', '--model', req.model, '--output-format', 'text'];

    if (req.readOnlyPolicy !== 'none') {
      args.push(
        '--tools',
        'Read,Glob,Grep,WebFetch,WebSearch',
        '--allowedTools',
        'Read,Glob,Grep,WebFetch,WebSearch',
        '--strict-mcp-config',
      );
    }

    args.push(instruction);

    return { cmd: req.binary ?? 'claude', args, cwd: req.cwd };
  }
}
