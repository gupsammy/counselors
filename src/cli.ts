import { Command } from 'commander';
import { registerAgentCommand } from './commands/agent.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerInitCommand } from './commands/init.js';
import { registerRunCommand } from './commands/run.js';
import { registerSkillCommand } from './commands/skill.js';
import { registerAddCommand } from './commands/tools/add.js';
import { registerDiscoverCommand } from './commands/tools/discover.js';
import { registerListCommand } from './commands/tools/list.js';
import { registerRemoveCommand } from './commands/tools/remove.js';
import { registerRenameCommand } from './commands/tools/rename.js';
import { registerTestCommand } from './commands/tools/test.js';

const program = new Command();

program
  .name('counselors')
  .description('Fan out prompts to multiple AI coding agents in parallel')
  .version('0.1.0');

// Top-level commands
registerRunCommand(program);
registerDoctorCommand(program);
registerInitCommand(program);
registerAgentCommand(program);
registerSkillCommand(program);

// Tools subcommand group
const tools = program
  .command('tools')
  .description('Manage AI tool configurations');

registerDiscoverCommand(tools);
registerAddCommand(tools);
registerRemoveCommand(tools);
registerRenameCommand(tools);
registerListCommand(tools);
registerTestCommand(tools);

// Top-level aliases
program
  .command('add [tool]')
  .description('Alias for "tools add"')
  .action(async (tool?: string) => {
    const args = tool ? ['add', tool] : ['add'];
    await tools.parseAsync(args, { from: 'user' });
  });

program
  .command('ls')
  .description('Alias for "tools list"')
  .option('-v, --verbose', 'Show full tool configuration including flags')
  .action(async (opts: { verbose?: boolean }) => {
    const args = ['list'];
    if (opts.verbose) args.push('--verbose');
    await tools.parseAsync(args, { from: 'user' });
  });

program.parseAsync(process.argv).catch((err: Error) => {
  process.stderr.write(`✗ ${err.message}\n`);
  process.exitCode = 1;
});
