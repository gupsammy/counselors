import type { Command } from 'commander';
import { loadConfig, saveConfig, removeToolFromConfig } from '../../core/config.js';
import { confirmAction } from '../../ui/prompts.js';
import { success, error } from '../../ui/logger.js';

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove <tool>')
    .description('Remove a configured tool')
    .action(async (toolId: string) => {
      const config = loadConfig();

      if (!config.tools[toolId]) {
        error(`Tool "${toolId}" is not configured.`);
        process.exitCode = 1;
        return;
      }

      const confirmed = await confirmAction(`Remove "${toolId}" from config?`);
      if (!confirmed) return;

      const updated = removeToolFromConfig(config, toolId);
      saveConfig(updated);
      success(`Removed "${toolId}" from config.`);
    });
}
