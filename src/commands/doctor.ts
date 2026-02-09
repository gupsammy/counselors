import { existsSync } from 'node:fs';
import type { Command } from 'commander';
import { getAdapter, isBuiltInTool } from '../adapters/index.js';
import { AMP_SETTINGS_FILE, CONFIG_FILE } from '../constants.js';
import { loadConfig } from '../core/config.js';
import { findBinary, getBinaryVersion } from '../core/discovery.js';
import type { DoctorCheck } from '../types.js';
import { info } from '../ui/logger.js';
import { formatDoctorResults } from '../ui/output.js';

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check tool configuration and health')
    .action(async () => {
      const checks: DoctorCheck[] = [];

      // Check config file
      if (existsSync(CONFIG_FILE)) {
        checks.push({
          name: 'Config file',
          status: 'pass',
          message: CONFIG_FILE,
        });
      } else {
        checks.push({
          name: 'Config file',
          status: 'warn',
          message: 'Not found. Run "counselors init" to create one.',
        });
      }

      let config;
      try {
        config = loadConfig();
      } catch (e) {
        checks.push({
          name: 'Config parse',
          status: 'fail',
          message: `Invalid config: ${e}`,
        });
        info(formatDoctorResults(checks));
        process.exitCode = 1;
        return;
      }

      const toolIds = Object.keys(config.tools);
      if (toolIds.length === 0) {
        checks.push({
          name: 'Tools configured',
          status: 'warn',
          message: 'No tools configured. Run "counselors init".',
        });
      }

      // Check each configured tool
      for (const id of toolIds) {
        const toolConfig = config.tools[id];

        // Binary exists + executable
        const binaryPath = findBinary(toolConfig.binary);
        if (binaryPath) {
          checks.push({
            name: `${id}: binary`,
            status: 'pass',
            message: binaryPath,
          });
        } else {
          checks.push({
            name: `${id}: binary`,
            status: 'fail',
            message: `"${toolConfig.binary}" not found in PATH`,
          });
          continue;
        }

        // Version check
        const version = getBinaryVersion(binaryPath);
        if (version) {
          checks.push({
            name: `${id}: version`,
            status: 'pass',
            message: version,
          });
        } else {
          checks.push({
            name: `${id}: version`,
            status: 'warn',
            message: 'Could not determine version',
          });
        }

        // Read-only capability
        const adapter = isBuiltInTool(id)
          ? getAdapter(id)
          : getAdapter(id, toolConfig);
        checks.push({
          name: `${id}: read-only`,
          status:
            adapter.readOnly.level === 'enforced'
              ? 'pass'
              : adapter.readOnly.level === 'bestEffort'
                ? 'warn'
                : 'fail',
          message: adapter.readOnly.level,
        });
      }

      // Check amp settings file if amp is configured
      if (config.tools.amp) {
        if (existsSync(AMP_SETTINGS_FILE)) {
          checks.push({
            name: 'Amp settings file',
            status: 'pass',
            message: AMP_SETTINGS_FILE,
          });
        } else {
          checks.push({
            name: 'Amp settings file',
            status: 'warn',
            message: 'Not found. Amp read-only mode may not work.',
          });
        }
      }

      info(formatDoctorResults(checks));

      if (checks.some((c) => c.status === 'fail')) {
        process.exitCode = 1;
      }
    });
}
