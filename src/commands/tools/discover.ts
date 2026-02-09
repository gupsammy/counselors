import type { Command } from 'commander';
import { getAllBuiltInAdapters } from '../../adapters/index.js';
import { discoverTool } from '../../core/discovery.js';
import { formatDiscoveryResults, createSpinner } from '../../ui/output.js';
import { info } from '../../ui/logger.js';

export function registerDiscoverCommand(program: Command): void {
  program
    .command('discover')
    .description('Discover installed AI CLI tools')
    .action(async () => {
      const spinner = createSpinner('Scanning for AI CLI tools...').start();
      const adapters = getAllBuiltInAdapters();
      const results = [];

      for (const adapter of adapters) {
        const result = discoverTool(adapter.commands);
        results.push({
          ...result,
          toolId: adapter.id,
          displayName: adapter.displayName,
        });
      }

      spinner.stop();
      info(formatDiscoveryResults(results));
    });
}
