import type { Command } from 'commander';
import { VERSION } from '../constants.js';
import { detectInstallation, performUpgrade } from '../core/upgrade.js';
import { error, info, success, warn } from '../ui/logger.js';

const METHOD_LABEL: Record<string, string> = {
  homebrew: 'Homebrew',
  npm: 'npm (global)',
  standalone: 'Standalone binary',
  unknown: 'Unknown',
};

export function registerUpgradeCommand(program: Command): void {
  program
    .command('upgrade')
    .description('Detect install method and upgrade counselors when possible')
    .option('--check', 'Only show install method/version details')
    .action(async (opts: { check?: boolean }) => {
      const detection = detectInstallation();

      info('');
      info(
        `Install method: ${METHOD_LABEL[detection.method] ?? detection.method}`,
      );
      info(`Running version: ${VERSION}`);
      if (detection.installedVersion) {
        info(`Installed version: ${detection.installedVersion}`);
      }
      if (detection.binaryPath) {
        info(`Binary path: ${detection.binaryPath}`);
      }
      info('');

      if (opts.check) return;

      if (detection.method === 'unknown') {
        error(
          'Could not detect a supported install method for automatic upgrades.',
        );
        warn('Try one of:');
        warn('  brew upgrade counselors');
        warn('  npm install -g counselors@latest');
        process.exitCode = 1;
        return;
      }

      info(`Upgrading via ${METHOD_LABEL[detection.method]}...`);
      const result = await performUpgrade(detection);
      if (!result.ok) {
        error(result.message);
        process.exitCode = 1;
        return;
      }

      success(result.message);

      const refreshed = detectInstallation();
      if (refreshed.installedVersion) {
        info(`Detected version after upgrade: ${refreshed.installedVersion}`);
      } else {
        warn('Upgrade completed. Re-run "counselors --version" to verify.');
      }
    });
}
