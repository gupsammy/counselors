# counselors

Fan out prompts to multiple AI coding agents in parallel.

`counselors` dispatches the same prompt to Claude, Codex, Gemini, Amp, or custom tools simultaneously, collects their responses, and writes everything to a structured output directory.

No MCP servers, no API keys, no complex configuration. It just calls your locally installed CLI tools.

## Agentic quickstart

Already inside an AI coding agent? Paste this prompt:

```
Install counselors globally with `npm install -g counselors`, then run `counselors agent` and follow the instructions it prints.
```

That's it. Your agent will install the CLI, configure available tools, and set up the `/counselors` slash command.

**How it works:**

1. You invoke the Counselors skill with a prompt
2. Your agent gathers context from the codebase
3. Your agent asks which other agents you want to consult
4. Counselors fans out to those agents in parallel for independent research
5. Each agent writes a structured markdown report
6. Your main agent synthesizes and presents the results

## Quickstart

```bash
npm install -g counselors

# Discover installed AI CLIs and create a config
counselors init

# Send a prompt to all configured tools
counselors run "Explain the authentication flow in this codebase"

# Send to specific tools only
counselors run -t claude,codex "Review this error handling"
```

## Supported tools

| Tool | Adapter | Read-Only | Install |
|------|---------|-----------|---------|
| Claude Code | `claude` | enforced | [docs](https://docs.anthropic.com/en/docs/claude-code) |
| OpenAI Codex | `codex` | enforced | [github](https://github.com/openai/codex) |
| Gemini CLI | `gemini` | bestEffort | [github](https://github.com/google-gemini/gemini-cli) |
| Amp CLI | `amp` | enforced | [ampcode.com](https://ampcode.com) |
| Custom | user-defined | configurable | — |

## Commands

### `run [prompt]`

Dispatch a prompt to configured tools in parallel.

```bash
counselors run "Your prompt here"
counselors run -f prompt.md              # Use a prompt file
echo "prompt" | counselors run           # Read from stdin
counselors run --dry-run "Show plan"     # Preview without executing
```

| Flag | Description |
|------|-------------|
| `-f, --file <path>` | Use a prompt file (no wrapping) |
| `-t, --tools <list>` | Comma-separated tool IDs |
| `--context <paths>` | Gather context from paths (comma-separated, or `.` for git diff) |
| `--read-only <level>` | `strict`, `best-effort`, `off` (defaults to config `readOnly`) |
| `--dry-run` | Show what would run without executing |
| `--json` | Output manifest as JSON |
| `-o, --output-dir <dir>` | Base output directory |

### `init`

Interactive setup wizard. Discovers installed AI CLIs, lets you pick tools and models, runs validation tests.

```bash
counselors init          # Interactive
counselors init --auto   # Non-interactive: discover tools, use defaults, output JSON
```

### `doctor`

Check configuration health — verifies config file, tool binaries, versions, and read-only capabilities.

```bash
counselors doctor
```

### `tools`

Manage configured tools.

| Command | Description |
|---------|-------------|
| `tools discover` | Find installed AI CLIs on your system |
| `tools add [tool]` | Add a built-in or custom tool |
| `tools remove [tool]` | Remove tool(s) — interactive if no argument |
| `tools rename <old> <new>` | Rename a tool ID |
| `tools list` / `ls` | List configured tools (`-v` for full config) |
| `tools test [tools...]` | Test tools with a quick "reply OK" prompt |

### `agent`

Print setup and skill installation instructions.

### `skill`

Print a `/counselors` slash-command template for use inside Claude Code or other agents.

## Configuration

### Global config

`~/.config/counselors/config.json` (respects `XDG_CONFIG_HOME`)

```jsonc
{
  "version": 1,
  "defaults": {
    "timeout": 540,
    "outputDir": "./agents/counselors",
    "readOnly": "bestEffort",
    "maxContextKb": 50,
    "maxParallel": 4
  },
  "tools": {
    "claude": {
      "binary": "/usr/local/bin/claude",
      "adapter": "claude",
      "readOnly": { "level": "enforced" },
      "extraFlags": ["--model", "opus"]
    }
  }
}
```

### Project config

Place a `.counselors.json` in your project root to override `defaults` per-project. Project configs cannot add or modify `tools` (security boundary).

```jsonc
{
  "defaults": {
    "outputDir": "./ai-output",
    "readOnly": "enforced"
  }
}
```

## Read-only modes

| Level | Behavior |
|-------|----------|
| `enforced` | Tool is sandboxed to read-only operations |
| `bestEffort` | Tool is asked to avoid writes but may not guarantee it |
| `none` | Tool has full read/write access |

The `--read-only` flag on `run` controls the policy: `strict` only dispatches to tools with `enforced` support, `best-effort` uses whatever each tool supports, `off` disables read-only flags entirely. When omitted, falls back to the `readOnly` setting in your config defaults (which defaults to `bestEffort`).

## Output structure

Each run creates a timestamped directory:

```
./agents/counselors/{slug}/
  prompt.md              # The dispatched prompt
  run.json               # Manifest with status, timing, costs
  summary.md             # Synthesized summary
  {tool-id}.md           # Each tool's response
  {tool-id}.stderr       # Each tool's stderr
```

## Skill / slash command

Install `/counselors` as a skill in Claude Code or other agents:

```bash
# Print the skill template
counselors skill

# Print full agent setup instructions
counselors agent
```

The skill template provides a multi-phase workflow: gather context, select agents, assemble prompt, dispatch via `counselors run`, read results, and synthesize a combined answer.

## Security

- **Environment allowlisting**: Child processes only receive allowlisted environment variables (PATH, HOME, API keys, proxy settings, etc.) — no full `process.env` leak.
- **Atomic config writes**: Config files are written atomically via temp+rename with `0o600` permissions.
- **Tool name validation**: Tool IDs are validated against `[a-zA-Z0-9._-]` to prevent path traversal.
- **No shell execution**: All child processes use `execFile`/`spawn` without `shell: true`.
- **Project config isolation**: `.counselors.json` can only override `defaults`, never inject `tools`.

## Development

```bash
npm install
npm run build        # tsup → dist/cli.js
npm run test         # vitest (unit + integration)
npm run typecheck    # tsc --noEmit
npm run lint         # biome check
```

Requires Node 20+. TypeScript with ESM, built with tsup, tested with vitest, linted with biome.

## Known issues

- **Amp `deep` model uses Bash to read files.** The `deep` model (GPT-5.2 Codex) reads files via `Bash` rather than the `Read` tool. Because `Bash` is a write-capable tool, we cannot guarantee that deep mode will not modify files. A mandatory read-only instruction is injected into the prompt, but this is a best-effort safeguard. For safety-critical tasks, prefer `amp-smart`.

## License

MIT
