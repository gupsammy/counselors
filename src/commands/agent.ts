import type { Command } from 'commander';
import { info } from '../ui/logger.js';

export function registerAgentCommand(program: Command): void {
  program
    .command('agent')
    .description('Print setup and skill installation instructions')
    .action(async () => {
      const instructions = `# Counselors — Setup & Skill Installation

## 1. Install the CLI

\`\`\`bash
npm install -g counselors
\`\`\`

Requires Node 20+.

## 2. Configure tools

Auto-discover and configure all installed AI coding agents:

\`\`\`bash
counselors init --auto
\`\`\`

This detects installed agents (Claude, Codex, Gemini, Amp), configures them with recommended models, and writes your config to \`~/.config/counselors/config.json\`. The output is JSON listing what was configured.

You can also manage tools individually:

\`\`\`bash
counselors tools discover   # Find available agents
counselors tools add        # Add a tool (interactive)
counselors tools remove <id>  # Remove a tool
counselors tools rename <old> <new>  # Rename a tool
counselors ls               # List configured tools
counselors doctor           # Verify tools are working
\`\`\`

## 3. Install the skill

The \`/counselors\` skill lets AI coding agents invoke counselors directly via a slash command. To install it, save the skill template to the well-known location for your agent.

### Claude Code

\`\`\`bash
mkdir -p ~/.claude/skills/counselors
counselors skill > ~/.claude/skills/counselors/SKILL.md
\`\`\`

### Other agents

The skill location varies by agent system. Print the template with \`counselors skill\` and save it wherever your agent looks for slash commands or skills.

## 4. Verify

\`\`\`bash
counselors doctor
\`\`\`

Then use \`/counselors\` from your AI coding agent to fan out a prompt for parallel review.
`;

      info(instructions);
    });
}
