The claude.md is empty — this is where I need to write my response. The prompt.md asks me to act as an independent second opinion reviewer and propose a comprehensive plan for the `counselors` npm CLI tool. Let me provide my analysis.

---

# Second Opinion: `counselors` npm CLI Architecture

## Executive Summary

The existing skill is a well-structured Claude Code orchestration wrapper — bash scripts coordinated by SKILL.md. Turning this into a standalone npm CLI is the right move: it decouples from Claude Code, becomes distributable, and lets non-Claude users benefit. Here's my proposed architecture.

---

## 1. CLI Commands

```
counselors init                    # Interactive setup — discovers tools, writes config
counselors add <tool>              # Add a tool (claude, codex, gemini, amp, or custom)
counselors remove <tool>           # Remove a configured tool
counselors test [tool...]          # Verify tools work (default: all configured)
counselors list                    # Show configured tools + status
counselors run "<prompt>"          # Dispatch all configured tools in parallel
counselors run -t claude,codex "<prompt>"  # Dispatch specific tools
counselors run -f prompt.md        # Read prompt from file
counselors run --context .         # Auto-gather git diff + relevant files
counselors doctor                  # Full system check: binaries, versions, auth
```

**Opinionated call: Don't use subcommand groups like `counselors tool add`.** The tool count is small enough that flat commands are clearer. `add`, `remove`, `test`, `list` are unambiguous.

The `run` command is the star. It should:
- Accept prompt via argument, `--file`, or stdin (pipe-friendly)
- Optionally gather context (git diff, file contents) with `--context`
- Run selected tools in parallel
- Stream output in real-time (tool-by-tool, labeled)
- Write reports to `./agents/second-opinions/<slug>/`
- Print a synthesis at the end

---

## 2. Configuration Format & Location

**Use JSON at `~/.config/counselors/config.json`.** Rationale:
- JSON is native to Node.js — no parser dependency
- `~/.config/` follows XDG conventions (with `$XDG_CONFIG_HOME` support)
- YAML adds a dependency and a class of parse errors for no real benefit here
- TOML is non-standard in the Node ecosystem

```json
{
  "version": 1,
  "tools": {
    "claude": {
      "binary": "/opt/homebrew/bin/claude",
      "defaultModel": "opus",
      "models": {
        "opus": "claude-opus-4-6",
        "sonnet": "claude-sonnet-4-5-20250929",
        "haiku": "claude-haiku-4-5-20251001"
      },
      "readOnlyFlags": [
        "--tools", "Read,Glob,Grep,WebFetch,WebSearch",
        "--allowedTools", "Read,Glob,Grep,WebFetch,WebSearch",
        "--strict-mcp-config"
      ],
      "execFlags": ["-p", "--output-format", "text"],
      "promptMode": "argument"
    },
    "codex": {
      "binary": "/usr/local/bin/codex",
      "defaultModel": "gpt-5.3-codex",
      "models": { ... },
      "readOnlyFlags": ["--sandbox", "read-only"],
      "execFlags": ["exec", "--skip-git-repo-check", "--enable", "web_search_request"],
      "promptMode": "argument"
    },
    "amp": {
      "binary": "/usr/local/bin/amp",
      "defaultModel": "smart",
      "models": { ... },
      "readOnlyFlags": ["--settings-file", "${configDir}/amp-readonly-settings.json"],
      "execFlags": ["-x"],
      "promptMode": "stdin"
    }
  },
  "defaults": {
    "timeout": 540,
    "outputDir": "./agents/second-opinions",
    "maxContextKb": 50
  }
}
```

**Key design decisions:**
- Store the resolved binary path, not just the command name. This avoids PATH issues at runtime.
- `promptMode: "argument" | "stdin" | "file"` — tools accept prompts differently. Amp uses stdin, Claude/Codex/Gemini take an argument.
- `readOnlyFlags` are separate from `execFlags` so users can see exactly what enforces read-only.
- `${configDir}` gets expanded at runtime for files like `amp-readonly-settings.json`.
- Per-project overrides via `.counselorsrc` in the project root (optional, merged with global config).

---

## 3. Binary Discovery

**Use `which` via `child_process.execSync` first, then custom PATH scanning as fallback.** Don't use the `which` npm package — it's unmaintained. Don't use `execa` just for discovery — it's overkill.

```
Discovery pipeline:
1. process.env.PATH lookup (execSync('which <binary>'))
2. Extended path scan (platform-aware):
   - ~/.local/bin
   - /usr/local/bin
   - /opt/homebrew/bin (macOS ARM)
   - ~/.npm-global/bin
   - NVM: $NVM_BIN, ~/.nvm/versions/node/*/bin
   - FNM: $FNM_MULTISHELL_PATH/bin, ~/.local/share/fnm/aliases/default/bin
   - Volta: ~/.volta/bin
   - Bun: ~/.bun/bin
3. User-configured custom path (from config)
```

**Validation**: Check `fs.accessSync(path, fs.constants.X_OK)` — file exists AND is executable.

**Don't try to be clever with version detection.** Just find the binary and run `<tool> --version` during `counselors test`. Version parsing is fragile and changes per tool.

---

## 4. Read-Only Mode

This is the trickiest part because every tool enforces it differently:

| Tool | Read-Only Mechanism | Confidence |
|------|---------------------|------------|
| Claude | `--allowedTools` whitelist + `--strict-mcp-config` | High — hard enforcement |
| Codex | `--sandbox read-only` | High — filesystem sandbox |
| Gemini | `--allowed-tools` whitelist | Medium — tool-level, not FS-level |
| Amp | `--settings-file` with tool whitelist | Medium — tool-level |

**My recommendation:** Don't try to enforce read-only at the `counselors` level. Instead:

1. **Ship sensible defaults** per tool in the built-in registry (the flags above).
2. **Display the read-only strategy** during `counselors add` and `counselors list` so users understand what's happening.
3. **Add a `--unsafe` flag** to `counselors run` that strips read-only flags, for users who explicitly want write access.
4. **Document the trust model** clearly: "Read-only enforcement depends on each tool's implementation. Claude and Codex have strong sandboxing. Gemini and Amp use tool whitelists that the model could theoretically bypass."

Don't promise what you can't enforce.

---

## 5. Parallel Dispatch

**Use `child_process.spawn` with `Promise.allSettled`.** Not worker threads — these are I/O-bound child processes, not CPU-bound tasks.

```typescript
async function dispatch(tools: Tool[], promptFile: string): Promise<Result[]> {
  const promises = tools.map(tool => runTool(tool, promptFile));
  return Promise.allSettled(promises);
}

function runTool(tool: Tool, promptFile: string): Promise<Result> {
  return new Promise((resolve, reject) => {
    const args = buildArgs(tool, promptFile);
    const child = spawn(tool.binary, args, {
      timeout: tool.timeout * 1000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Collect stdout, stderr, handle exit
  });
}
```

**Real-time streaming**: Use a multiplexed output format during dispatch:

```
[claude] ████████░░ running (45s)
[codex]  ██████████ done (38s) — 2.1k words
[gemini] ████░░░░░░ running (22s)
```

Use a library like `ora` or `cli-spinners` for the progress display, but fall back to plain text when stdout isn't a TTY (for piping/CI use).

---

## 6. Plugin/Custom Tool Support

**Yes, support custom tools from day one.** The architecture already accommodates it if you separate the registry from the executor:

```
counselors add custom \
  --name "aider" \
  --binary "aider" \
  --exec-flags "--message,{PROMPT}" \
  --prompt-mode "argument" \
  --read-only-flags "--no-auto-commits,--dry-run"
```

The `{PROMPT}` placeholder (borrowed from the Draftpad reference) gets replaced at runtime with either the prompt string or a file path.

**Custom tools go in the same config.json** — no separate plugin system. This keeps it simple. If a tool needs more complex setup (like Amp's settings file), users can point to their own config files in the flags.

---

## 7. Project Structure

```
counselors/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # CLI entry point (commander/yargs)
│   ├── commands/
│   │   ├── init.ts
│   │   ├── add.ts
│   │   ├── remove.ts
│   │   ├── test.ts
│   │   ├── list.ts
│   │   ├── run.ts
│   │   └── doctor.ts
│   ├── core/
│   │   ├── config.ts          # Config loading, saving, merging
│   │   ├── discovery.ts       # Binary discovery pipeline
│   │   ├── executor.ts        # Spawn + timeout + output collection
│   │   ├── dispatcher.ts      # Parallel orchestration
│   │   ├── context.ts         # Git diff + file gathering
│   │   └── synthesizer.ts     # Report synthesis (for `run`)
│   ├── registry/
│   │   ├── index.ts           # Built-in tool definitions
│   │   ├── claude.ts
│   │   ├── codex.ts
│   │   ├── gemini.ts
│   │   └── amp.ts
│   ├── ui/
│   │   ├── prompts.ts         # Interactive prompts (inquirer/prompts)
│   │   └── output.ts          # Formatted output, spinners, tables
│   └── types.ts               # Shared types
├── assets/
│   └── amp-readonly-settings.json
├── tests/
└── README.md
```

**CLI framework: Use `commander`.** It's the standard for Node CLIs, well-maintained, and doesn't require a build step. Avoid `oclif` — it's heavy for this use case. Avoid `yargs` — its API is clunky.

**Interactive prompts: Use `@inquirer/prompts`.** It supports multi-select, confirmation, and has a modern API.

**Build: TypeScript compiled with `tsup` or `tsx`.** Ship compiled JS in the npm package. Use a shebang in the entry point.

---

## 8. Risks & Blind Spots

### Risk: CLI Tool Instability
These AI CLI tools are all young and their flags change frequently. Gemini CLI has changed its flag syntax multiple times. **Mitigation:** Pin tool configurations to tested versions and document compatibility. Add a `counselors doctor` command that validates flag compatibility.

### Risk: Authentication Gaps
Each tool has its own auth story (API keys, OAuth, etc.). `counselors test` should detect auth failures distinctly from binary-not-found failures. Don't try to manage auth — just detect and report problems clearly.

### Risk: Output Format Variability
Each tool outputs differently. Claude with `--output-format text` is clean. Codex may include ANSI codes. Amp streams structured output. **Mitigation:** Strip ANSI codes from captured output. Normalize markdown headers. Don't try to parse structured output — treat everything as text.

### Risk: The Synthesis Problem
The existing skill uses Claude Code itself to synthesize reports. A standalone CLI can't do this without an API key. **Options:**
1. **No built-in synthesis** — just present the reports side-by-side. Users read them.
2. **Optional synthesis** — if the user has a Claude/OpenAI API key configured, use it to synthesize. Otherwise, skip.
3. **Use one of the configured tools** — pipe all reports back through one tool for synthesis.

**I'd go with option 1 for v1, option 2 for v2.** Don't block launch on synthesis.

### Blind Spot: Windows Support
The existing skill is bash-only. Node.js gives you cross-platform for free, but the binary discovery paths are Unix-centric. You'll need Windows-specific paths (`%APPDATA%`, `%LOCALAPPDATA%`, etc.) and potentially different flag syntax for some tools.

### Blind Spot: Rate Limiting / Costs
Running 4 tools in parallel on a complex prompt could cost $5-20+ depending on models chosen. Consider adding a `--dry-run` flag that shows what would be dispatched without actually running it, and estimating cost where possible.

### Blind Spot: Prompt File Lifecycle
The current skill writes prompts to `./agents/second-opinions/<slug>/`. That's great for reproducibility but clutters the project. Consider `--clean` to remove after synthesis, or defaulting to a temp directory with `--save` to keep.

---

## 9. What I'd Do Differently From the Existing Skill

1. **Drop the SKILL.md orchestration model.** The whole 7-phase workflow is Claude Code-specific. The CLI should be imperative: gather context → dispatch → report.

2. **Don't require interactive model selection for every run.** Set defaults in config, override with `--model`. The interactive flow is good for `counselors init` and `counselors add`, not for `counselors run`.

3. **Make context gathering opt-in, not automatic.** The skill auto-gathers git diffs and related files. The CLI should do this only with `--context` or `--context .`. Users may want to provide their own prompt without the tool guessing.

4. **Support stdin piping.** `git diff | counselors run --stdin "Review this diff"` should work. This makes it composable with other tools.

5. **JSON output mode.** `counselors run --json` for programmatic consumption. Essential for CI integration.

---

## 10. Implementation Priority

**Phase 1 (MVP):**
- `init`, `add`, `remove`, `list`, `test`
- Config file management
- Binary discovery
- Built-in registry for claude, codex, gemini, amp

**Phase 2 (Core Value):**
- `run` with parallel dispatch
- Context gathering (`--context`)
- Real-time progress display
- Report output to files

**Phase 3 (Polish):**
- `doctor` command
- Custom tool support
- `--json` output mode
- Optional synthesis via API
- stdin piping

---

This is a clean extraction from a Claude Code skill into a standalone tool. The main architectural risk is over-engineering the registry/executor abstraction — keep it simple. Each tool is different enough that a clean `switch` statement in the executor is better than a plugin framework. Build the abstraction after you have 6+ tools, not before.
