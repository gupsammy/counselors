import { BaseAdapter } from './base.js';
import type { RunRequest, Invocation } from '../types.js';

export class GeminiAdapter extends BaseAdapter {
  id = 'gemini';
  displayName = 'Gemini CLI';
  commands = ['gemini'];
  installUrl = 'https://github.com/google-gemini/gemini-cli';
  readOnly = { level: 'bestEffort' as const };
  models = [
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview — latest', recommended: true },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro — stable GA' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview — fast' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash — fast GA' },
  ];

  buildInvocation(req: RunRequest): Invocation {
    const args = ['-p', '', '-m', req.model];

    if (req.readOnlyPolicy !== 'none') {
      args.push(
        '--extensions', '',
        '--allowed-tools',
        'read_file', 'list_directory', 'search_file_content',
        'glob', 'google_web_search', 'codebase_investigator',
      );
    }

    args.push('--output-format', 'text');

    return { cmd: req.binary ?? 'gemini', args, stdin: req.prompt, cwd: req.cwd };
  }
}
