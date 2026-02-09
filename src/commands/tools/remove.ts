import type { Command } from 'commander';
import { checkbox } from '@inquirer/prompts';
import { loadConfig, saveConfig, removeToolFromConfig } from '../../core/config.js';
import { confirmAction } from '../../ui/prompts.js';
import { success, error, info } from '../../ui/logger.js';

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove [tool]')
    .description('Remove a configured tool')
    .action(async (toolId?: string) => {
      const config = loadConfig();
      const toolIds = Object.keys(config.tools);

      if (toolIds.length === 0) {
        error('No tools configured.');
        process.exitCode = 1;
        return;
      }

      let toRemove: string[];

      if (toolId) {
        if (!config.tools[toolId]) {
          error(`Tool "${toolId}" is not configured.`);
          process.exitCode = 1;
          return;
        }
        toRemove = [toolId];
      } else {
        toRemove = await checkbox({
          message: 'Select tools to remove:',
          choices: toolIds.map(id => ({ name: `${id} (${config.tools[id].binary})`, value: id })),
        });

        if (toRemove.length === 0) {
          info('No tools selected.');
          return;
        }
      }

      const confirmed = await confirmAction(
        toRemove.length === 1
          ? `Remove "${toRemove[0]}" from config?`
          : `Remove ${toRemove.length} tools from config?`,
      );
      if (!confirmed) return;

      let updated = config;
      for (const id of toRemove) {
        updated = removeToolFromConfig(updated, id);
      }
      saveConfig(updated);
      success(`Removed ${toRemove.join(', ')}.`);
    });
}
