# Second Opinion Request

## Question
I want to turn the "second-opinion" Claude Code skill into a standalone npm CLI tool called `counselors`. The tool should allow users to:
- Add AI coding tools (claude, codex, gemini, amp, and more)
- Configure tools with models, flags, and read-only settings
- Test tools to verify they work
- Remove tools
- Find the correct binaries on their system (auto-discovery)
- Suggest ways to run tools in "read-only" mode
- Dispatch multiple tools in parallel to get second opinions on code/architecture

Review the existing skill and the reference tool discovery system below, and propose a comprehensive plan for the npm CLI tool architecture.

## Context

### Existing Second-Opinion Skill

The skill lives at `~/.claude/skills/second-opinion/` and consists of:

#### SKILL.md (Orchestration Logic)
A 7-phase workflow orchestrated by Claude Code:
1. **Context Gathering** - Finds files, git diffs, related code
2. **Agent Selection** - Preflight check + user picker (multiSelect)
3. **Model Selection** - Per-agent model choice
4. **Prompt Assembly** - Generates slug, builds structured review prompt, creates output dir
5. **Dispatch** - Runs agents in parallel via bash (9-min timeout per agent)
6. **Synthesis** - Reads reports, checks stderr/stats, synthesizes findings
7. **Action** - Asks user what to fix, enters plan mode

#### run-agent.sh (Agent Executor)
```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077

# Takes: <agent> <prompt-file> <output-file> <model>
# Validates inputs, handles timeouts (540s), runs agent-specific CLI commands

# Agent-specific invocations:
# claude: claude -p --model $MODEL --output-format text --tools "Read,Glob,Grep,WebFetch,WebSearch" --allowedTools "Read,Glob,Grep,WebFetch,WebSearch" --strict-mcp-config "$INSTRUCTION"
# codex: codex exec -m $MODEL --sandbox read-only --enable web_search_request --skip-git-repo-check "$INSTRUCTION"
# gemini: gemini -m $MODEL --allowed-mcp-server-names '""' --allowed-tools "read_file,read_many_files,web_fetch" --output-format text "$INSTRUCTION"
# amp: pipes prompt via stdin, uses --settings-file for read-only tools, tracks cost via `amp usage` snapshots

# Each agent gets: "Read the file at $PROMPT_FILE and follow the instructions within it."
# Stderr captured to .stderr file
# Amp gets special cost tracking via usage snapshots → .stats JSON file
```

#### preflight.sh (CLI Availability Checker)
```bash
for cli in claude codex gemini amp; do
  command -v "$cli" >/dev/null 2>&1 && echo "$cli: installed" || echo "$cli: missing"
done
```

#### amp-readonly-settings.json
```json
{
  "amp.tools.enable": [
    "Read", "Grep", "glob", "finder", "librarian", "look_at",
    "oracle", "read_web_page", "read_mcp_resource", "read_thread",
    "find_thread", "web_search"
  ]
}
```

### Reference: Draftpad Desktop Tool Discovery System

A PHP/Laravel desktop app with sophisticated tool discovery. Key patterns to adapt:

#### CliToolChecker.php - Binary Discovery
- **Two-stage discovery**: Symfony ExecutableFinder first, then manual PATH scanning as fallback
- **Extended search paths** (platform-aware):
  - `~/.local/bin`, `/usr/local/bin`, `/opt/homebrew/bin` (standard)
  - `~/.npm-global/bin` (npm global)
  - `$NVM_BIN`, `~/.nvm/versions/node/X.X.X/bin` (nvm)
  - `$FNM_MULTISHELL_PATH/bin`, `~/.local/share/fnm/aliases/default/bin` (fnm)
  - `~/.opencode/bin` (tool-specific)
- **Custom path override**: Users can set custom paths in settings DB
- **Validation**: Checks file exists AND is executable
- **NVM/FNM support**: Resolves LTS aliases, scans multishell directories (5 most recent)

#### CliToolRegistry.php - Tool Registry
Pre-configured registry of 9 tools, each with:
```
{
  name: 'Human-readable name',
  commands: ['primary_cmd', 'fallback_cmd'],  // Multiple command aliases
  defaultFlags: ['--flag1', '--flag2', '{PROMPT}'],  // Pre-configured CLI args
  installUrl: 'https://...',  // Download link if not found
}
```

Supported tools: claude-opus, claude-sonnet, gemini-pro, gemini-flash, codex, codex-mini, opencode, vibe, aider

#### Key Patterns
- **Registry Pattern**: Central tool metadata with commands, flags, install URLs
- **Two-Stage Discovery**: Robust binary finding (finder + manual scan)
- **Search Path Hierarchy**: Platform-aware extended PATH search
- **Custom Override**: User-configurable paths
- **Tool Testing**: "Reply with exactly: OK" protocol with 30s timeout
- **{PROMPT} Placeholder**: Some tools use it in flags, others use stdin
- **Library → Phase → Execution**: Flexible tool assignment model

## Instructions
You are providing an independent second opinion. Be critical and thorough.
- Analyze the question in the context provided
- Propose a concrete architecture for the npm CLI tool
- Consider: project structure, commands, configuration format, tool discovery, read-only mode detection, testing protocol, parallel dispatch
- Identify risks, tradeoffs, and blind spots
- Suggest alternatives if you see better approaches
- Be direct and opinionated -- don't hedge
- Structure your response with clear headings
- Keep your response focused and actionable

Key design questions to address:
1. What should the CLI commands look like? (e.g., `counselors add`, `counselors test`, `counselors run`)
2. How should tool configuration be stored? (JSON? YAML? Where?)
3. How should binary discovery work in Node.js? (which, execa, custom PATH scanning?)
4. How should read-only mode be suggested/enforced per tool?
5. How should parallel dispatch work? (child_process, worker threads?)
6. Should it support plugins/custom tools beyond the built-in ones?
7. What's the right level of abstraction between the tool registry and the executor?
