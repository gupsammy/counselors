import type { Command } from 'commander';
import {
  loadConfig,
  renameToolInConfig,
  saveConfig,
} from '../../core/config.js';
import { error, success } from '../../ui/logger.js';

const SAFE_ID_RE = /^[a-zA-Z0-9._-]+$/;

export function registerRenameCommand(program: Command): void {
  program
    .command('rename <old> <new>')
    .description('Rename a configured tool')
    .action(async (oldId: string, newId: string) => {
      const config = loadConfig();

      if (!config.tools[oldId]) {
        error(`Tool "${oldId}" is not configured.`);
        process.exitCode = 1;
        return;
      }

      if (config.tools[newId]) {
        error(`Tool "${newId}" already exists.`);
        process.exitCode = 1;
        return;
      }

      if (!SAFE_ID_RE.test(newId)) {
        error(
          `Invalid tool name "${newId}". Use only letters, numbers, dots, hyphens, and underscores.`,
        );
        process.exitCode = 1;
        return;
      }

      const updated = renameToolInConfig(config, oldId, newId);
      saveConfig(updated);
      success(`Renamed "${oldId}" → "${newId}".`);
    });
}
