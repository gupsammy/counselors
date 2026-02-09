import type { Command } from 'commander';
import { resolveAdapter } from '../../adapters/index.js';
import { loadConfig } from '../../core/config.js';
import { info } from '../../ui/logger.js';
import { formatToolList } from '../../ui/output.js';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('List configured tools')
    .option('-v, --verbose', 'Show full tool configuration including flags')
    .action(async (opts: { verbose?: boolean }) => {
      const config = loadConfig();

      const tools = Object.entries(config.tools).map(([id, t]) => {
        const entry: { id: string; binary: string; args?: string[] } = {
          id,
          binary: t.binary,
        };

        if (opts.verbose) {
          const adapter = resolveAdapter(id, t);
          const inv = adapter.buildInvocation({
            prompt: '<prompt>',
            promptFilePath: '<prompt-file>',
            toolId: id,
            model: t.defaultModel,
            outputDir: '.',
            readOnlyPolicy: t.readOnly.level,
            timeout: t.timeout ?? config.defaults.timeout,
            cwd: process.cwd(),
            binary: t.binary,
            extraFlags: t.extraFlags,
          });
          entry.args = inv.args;
        }

        return entry;
      });

      info(formatToolList(tools, opts.verbose));
    });
}
