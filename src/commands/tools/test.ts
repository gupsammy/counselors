import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import { getAdapter, isBuiltInTool } from '../../adapters/index.js';
import { executeTest } from '../../core/executor.js';
import { formatTestResults, createSpinner } from '../../ui/output.js';
import { info, error } from '../../ui/logger.js';
import type { TestResult } from '../../types.js';

export function registerTestCommand(program: Command): void {
  program
    .command('test [tools...]')
    .description('Test configured tools with a "reply OK" prompt')
    .action(async (toolIds: string[]) => {
      const config = loadConfig();

      const idsToTest = toolIds.length > 0
        ? toolIds
        : Object.keys(config.tools);

      if (idsToTest.length === 0) {
        error('No tools configured. Run "counselors init" first.');
        process.exitCode = 1;
        return;
      }

      const results: TestResult[] = [];

      for (const id of idsToTest) {
        const toolConfig = config.tools[id];
        if (!toolConfig) {
          results.push({ toolId: id, passed: false, output: '', error: 'Not configured', durationMs: 0 });
          continue;
        }

        const spinner = createSpinner(`Testing ${id}...`).start();
        const adapter = isBuiltInTool(id) ? getAdapter(id) : getAdapter(id, toolConfig);
        const result = await executeTest(adapter, toolConfig, id);
        spinner.stop();

        results.push(result);
      }

      info(formatTestResults(results));

      if (results.some(r => !r.passed)) {
        process.exitCode = 1;
      }
    });
}
